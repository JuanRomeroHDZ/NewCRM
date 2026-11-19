import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { ApiError, normalizeTransportError } from '../../lib/apiErrors';
import { API_BASE, api } from '../../lib/api';
import { CoreUser, ReportCollaborationBootstrap, ReportCollaborationResource, ReportDocumentStatus } from '../../types';
import {
  clearEncryptedCollaborationStates,
  loadEncryptedCollaborationStates,
  saveEncryptedCollaborationState,
} from './encryptedReportCollaboration';
import { applyExcalidrawElementFields } from './reportCanvasCollaboration.mjs';

const REMOTE_ORIGIN = Symbol('report-collaboration-remote');
const REMOTE_AWARENESS_ORIGIN = Symbol('report-collaboration-awareness');
const PERSON_COLORS = ['#0F766E', '#2563EB', '#B45309', '#7C3AED', '#BE123C', '#475569'];

export interface DocumentSeed {
  title: string;
  status: ReportDocumentStatus;
  source: string;
  prospect_id?: string | null;
  project_id?: string | null;
  engagement_id?: string | null;
}

export interface CanvasSeed {
  title: string;
  scene_json: string;
  element_count: number;
  linked_document_id?: string | null;
}

export interface ReportCollaborationSession {
  doc: Y.Doc;
  awareness: Awareness;
  text: Y.Text;
  metadata: Y.Map<unknown>;
  elements: Y.Map<Y.Map<unknown>>;
  files: Y.Map<unknown>;
  appState: Y.Map<unknown>;
}

export interface ReportPresentUser {
  id: string;
  name: string;
  color: string;
  clientId: string;
  pointer?: { x: number; y: number; tool: 'pointer' | 'laser' };
  button?: 'up' | 'down';
  selectedElementIds?: Record<string, boolean>;
}

interface TrustedPresenceIdentity {
  id: string;
  name: string;
}

export interface UseReportCollaborationOptions {
  resourceType: ReportCollaborationResource;
  resourceId: string | null;
  initialContent: DocumentSeed | CanvasSeed | null;
  recoveryKey: CryptoKey | null;
  operator: CoreUser | null | undefined;
  getContent: (doc: Y.Doc) => Record<string, unknown>;
  enabled?: boolean;
}

export type CollaborationStatus = 'idle' | 'connecting' | 'connected' | 'offline' | 'error';

export interface ReportCollaborationController {
  session: ReportCollaborationSession | null;
  status: CollaborationStatus;
  error: string | null;
  permission: ReportCollaborationBootstrap['permission'] | null;
  canEdit: boolean;
  hasLocalRecovery: boolean;
  revision: number;
  lastSavedAt: string | null;
  isDirty: boolean;
  presentUsers: ReportPresentUser[];
  checkpoint: (createRevision?: boolean, reason?: 'manual' | 'review') => Promise<void>;
  setPresenceField: (field: string, value: unknown) => void;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function parseScene(sceneJson: string): { elements: Record<string, unknown>[]; files: Record<string, unknown>; appState: Record<string, unknown> } {
  try {
    const scene = JSON.parse(sceneJson) as Record<string, unknown>;
    return {
      elements: Array.isArray(scene.elements) ? scene.elements as Record<string, unknown>[] : [],
      files: scene.files && typeof scene.files === 'object' ? scene.files as Record<string, unknown> : {},
      appState: scene.appState && typeof scene.appState === 'object' ? scene.appState as Record<string, unknown> : {},
    };
  } catch {
    return { elements: [], files: {}, appState: {} };
  }
}

function seedDocument(doc: Y.Doc, type: ReportCollaborationResource, content: DocumentSeed | CanvasSeed): void {
  const metadata = doc.getMap<unknown>('metadata');
  if (type === 'document') {
    const seed = content as DocumentSeed;
    const text = doc.getText('typst-source');
    doc.transact(() => {
      if (text.length === 0 && seed.source) text.insert(0, seed.source);
      if (!metadata.has('title')) metadata.set('title', seed.title);
      if (!metadata.has('status')) metadata.set('status', seed.status);
      if (!metadata.has('prospect_id')) metadata.set('prospect_id', seed.prospect_id || null);
      if (!metadata.has('project_id')) metadata.set('project_id', seed.project_id || null);
      if (!metadata.has('engagement_id')) metadata.set('engagement_id', seed.engagement_id || null);
    }, REMOTE_ORIGIN);
    return;
  }

  const canvasSeed = content as CanvasSeed;
  const scene = parseScene(canvasSeed.scene_json);
  const elements = doc.getMap<Y.Map<unknown>>('elements');
  const files = doc.getMap<unknown>('files');
  const appState = doc.getMap<unknown>('app-state');
  doc.transact(() => {
    if (!metadata.has('title')) metadata.set('title', canvasSeed.title);
    if (!metadata.has('linked_document_id')) metadata.set('linked_document_id', canvasSeed.linked_document_id || null);
    for (const element of scene.elements) {
      const id = element.id;
      if (typeof id !== 'string' || elements.has(id)) continue;
      const fields = new Y.Map<unknown>();
      elements.set(id, fields);
      applyExcalidrawElementFields(fields, element);
    }
    for (const [id, file] of Object.entries(scene.files)) if (!files.has(id)) files.set(id, file);
    for (const [key, value] of Object.entries(scene.appState)) {
      if (!appState.has(key) && ['viewBackgroundColor', 'gridSize', 'gridModeEnabled', 'theme'].includes(key)) {
        appState.set(key, value);
      }
    }
  }, REMOTE_ORIGIN);
}

function websocketUrl(): string {
  const target = new URL(`${API_BASE}/reports/collaboration/ws`, window.location.href);
  target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
  return target.toString();
}

function identityColor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return PERSON_COLORS[hash % PERSON_COLORS.length];
}

function readPresentUsers(
  awareness: Awareness,
  currentUserId: string,
  trustedIdentities: Map<string, TrustedPresenceIdentity>,
): ReportPresentUser[] {
  return Array.from(awareness.getStates().entries()).flatMap(([clientId, state]) => {
    const user = state.user as { id?: string; name?: string } | undefined;
    const trusted = trustedIdentities.get(String(clientId));
    const identity = trusted || (user?.id === currentUserId ? { id: user.id, name: user.name || 'Tú' } : null);
    if (!identity || identity.id === currentUserId) return [];
    const pointer = state.pointer as ReportPresentUser['pointer'] | undefined;
    const selected = state.selectedElementIds;
    return [{
      id: identity.id,
      name: identity.name,
      color: identityColor(identity.id),
      clientId: String(clientId),
      ...(pointer && typeof pointer.x === 'number' && typeof pointer.y === 'number' ? { pointer } : {}),
      ...(state.button === 'up' || state.button === 'down' ? { button: state.button } : {}),
      ...(selected && typeof selected === 'object' ? { selectedElementIds: selected as Record<string, boolean> } : {}),
    }];
  });
}

export function describeReportSync(
  controller: ReportCollaborationController,
  saving = false,
  dirty = controller.isDirty,
): string {
  if (controller.error) return controller.error;
  if (controller.status === 'offline') return controller.session
    ? 'Sin conexión. Reconectando con el servidor…'
    : 'No se pudo abrir la conexión de edición. Reintentando…';
  if (controller.status === 'error') return 'No se pudo abrir la colaboración.';
  if (saving || controller.status !== 'connected') return 'Sincronizando…';
  if (!controller.canEdit) return 'Solo lectura';
  return dirty ? 'Cambios pendientes' : 'Sincronizado';
}

export function useReportCollaboration(options: UseReportCollaborationOptions): ReportCollaborationController {
  const { resourceType, resourceId, initialContent, recoveryKey, operator, getContent, enabled = true } = options;
  const [session, setSession] = useState<ReportCollaborationSession | null>(null);
  const [status, setStatus] = useState<CollaborationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [permission, setPermission] = useState<ReportCollaborationBootstrap['permission'] | null>(null);
  const [revision, setRevision] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [presentUsers, setPresentUsers] = useState<ReportPresentUser[]>([]);

  const sessionRef = useRef<ReportCollaborationSession | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resourceGenerationRef = useRef<number | null>(null);
  const lastReceivedSeqRef = useRef(0);
  const trustedPresenceIdentitiesRef = useRef(new Map<string, TrustedPresenceIdentity>());
  const dirtyCounterRef = useRef(0);
  const localUpdatesRef = useRef<Uint8Array[]>([]);
  const updateFlushTimerRef = useRef<number | null>(null);
  const cacheTimerRef = useRef<number | null>(null);
  const checkpointTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const checkpointQueueRef = useRef<Promise<void>>(Promise.resolve());
  const checkpointCurrentRef = useRef<() => Promise<void>>(async () => undefined);
  const canEditRef = useRef(canEdit);
  const getContentRef = useRef(getContent);
  const initialContentRef = useRef(initialContent);
  const hasSyncedRef = useRef(false);

  getContentRef.current = getContent;
  initialContentRef.current = initialContent;
  canEditRef.current = canEdit;

  const checkpoint = useCallback((createRevision = false, reason: 'manual' | 'review' = 'manual') => {
    const run = async () => {
      const activeSession = sessionRef.current;
      if (!activeSession || resourceGenerationRef.current === null) return;
      if (!navigator.onLine) throw new Error('Sin conexión. Mantén el editor abierto hasta que pueda sincronizarse.');
      if (!canEdit) throw new Error('Tu permiso es de solo lectura.');
      const startingCounter = dirtyCounterRef.current;
      setError(null);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const state = toBase64(Y.encodeStateAsUpdate(activeSession.doc));
        const content = getContentRef.current(activeSession.doc);
        try {
          const result = await api.checkpointReportCollaboration(resourceType, resourceId!, {
            state,
            content,
            through_seq: lastReceivedSeqRef.current,
            generation: resourceGenerationRef.current,
            create_revision: createRevision,
            revision_reason: reason,
          });
          setLastSavedAt(result.saved_at);
          if (dirtyCounterRef.current === startingCounter) setIsDirty(false);
          else setIsDirty(true);
          return;
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 409 && attempt < 7) {
            await new Promise((resolve) => window.setTimeout(resolve, 200 + attempt * 100));
            continue;
          }
          const normalized = normalizeTransportError(cause);
          setError(normalized.message);
          throw normalized;
        }
      }
      throw new Error('Hay cambios concurrentes que aún no se han sincronizado. Espera un momento y vuelve a guardar.');
    };
    const queued = checkpointQueueRef.current.then(run, run);
    checkpointQueueRef.current = queued.catch(() => undefined);
    return queued;
  }, [canEdit, resourceId, resourceType]);

  checkpointCurrentRef.current = async () => {
    await checkpoint(false, 'manual');
  };

  const setPresenceField = useCallback((field: string, value: unknown) => {
    sessionRef.current?.awareness.setLocalStateField(field, value);
  }, []);

  useEffect(() => {
    if (!enabled || !resourceId || !initialContent || !operator?.id) {
      sessionRef.current = null;
      setSession(null);
      setPermission(null);
      setCanEdit(false);
      setStatus('idle');
      setError(null);
      return;
    }

    let disposed = false;
    let workingDoc: Y.Doc | null = null;
    let awareness: Awareness | null = null;
    let eventHandler: ((update: Uint8Array, origin: unknown) => void) | null = null;
    let awarenessHandler: ((change: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => void) | null = null;
    let resourceGeneration: number | null = null;
    let presenceFlushTimer: number | null = null;
    const resourceKey = `${resourceType}:${resourceId}`;
    sessionRef.current = null;
    setSession(null);
    setPermission(null);
    setCanEdit(false);
    setIsDirty(false);
    setLastSavedAt(null);
    setPresentUsers([]);
    trustedPresenceIdentitiesRef.current = new Map();
    resourceGenerationRef.current = null;
    lastReceivedSeqRef.current = 0;
    localUpdatesRef.current = [];
    setStatus('connecting');
    setError(null);
    hasSyncedRef.current = false;
    reconnectAttemptRef.current = 0;

    const clearTimers = () => {
      if (updateFlushTimerRef.current !== null) window.clearTimeout(updateFlushTimerRef.current);
      if (cacheTimerRef.current !== null) window.clearTimeout(cacheTimerRef.current);
      if (checkpointTimerRef.current !== null) window.clearTimeout(checkpointTimerRef.current);
      if (heartbeatTimerRef.current !== null) window.clearInterval(heartbeatTimerRef.current);
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      if (presenceFlushTimer !== null) window.clearTimeout(presenceFlushTimer);
      updateFlushTimerRef.current = null;
      cacheTimerRef.current = null;
      checkpointTimerRef.current = null;
      heartbeatTimerRef.current = null;
      reconnectTimerRef.current = null;
    };

    const scheduleLocalCache = () => {
      if (!recoveryKey || !workingDoc || cacheTimerRef.current !== null) return;
      cacheTimerRef.current = window.setTimeout(() => {
        cacheTimerRef.current = null;
        if (!workingDoc || disposed) return;
        void saveEncryptedCollaborationState(
          recoveryKey,
          resourceKey,
          resourceGeneration ?? 1,
          Y.encodeStateAsUpdate(workingDoc),
        ).catch(() => setError('No se pudo guardar la copia local cifrada. Mantén la pestaña abierta hasta confirmar la sincronización.'));
      }, 1000);
    };

    const sendJson = (payload: Record<string, unknown>) => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
    };

    const flushLocalUpdates = () => {
      updateFlushTimerRef.current = null;
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN || !hasSyncedRef.current || !localUpdatesRef.current.length) return;
      const queued = localUpdatesRef.current;
      localUpdatesRef.current = [];
      const update = Y.mergeUpdates(queued);
      sendJson({
        type: 'update',
        update_id: crypto.randomUUID(),
        generation: resourceGeneration,
        update: toBase64(update),
      });
    };

    const enqueueLocalUpdate = (update: Uint8Array) => {
      localUpdatesRef.current.push(update);
      if (updateFlushTimerRef.current === null) {
        updateFlushTimerRef.current = window.setTimeout(flushLocalUpdates, 75);
      }
    };

    const installSession = (doc: Y.Doc) => {
      const state = {
        doc,
        awareness: new Awareness(doc),
        text: doc.getText('typst-source'),
        metadata: doc.getMap<unknown>('metadata'),
        elements: doc.getMap<Y.Map<unknown>>('elements'),
        files: doc.getMap<unknown>('files'),
        appState: doc.getMap<unknown>('app-state'),
      } satisfies ReportCollaborationSession;
      state.awareness.setLocalStateField('user', {
        id: operator.id,
        name: operator.full_name || operator.username,
        color: identityColor(operator.id),
        colorLight: `${identityColor(operator.id)}33`,
      });
      workingDoc = doc;
      awareness = state.awareness;
      sessionRef.current = state;
      setSession(state);
      eventHandler = (update, origin) => {
        if (disposed) return;
        dirtyCounterRef.current += 1;
        setRevision((value) => value + 1);
        if (origin === REMOTE_ORIGIN) {
          if (canEditRef.current) {
            setIsDirty(true);
            scheduleLocalCache();
          }
          return;
        }
        setIsDirty(true);
        scheduleLocalCache();
        enqueueLocalUpdate(update);
      };
      doc.on('update', eventHandler);
      awarenessHandler = (change, origin) => {
        if (origin === REMOTE_AWARENESS_ORIGIN || disposed) return;
        const clients = [...change.added, ...change.updated, ...change.removed];
        if (!clients.length) return;
        const socket = socketRef.current;
        if (socket?.readyState === WebSocket.OPEN && hasSyncedRef.current && presenceFlushTimer === null) {
          presenceFlushTimer = window.setTimeout(() => {
            presenceFlushTimer = null;
            if (disposed || !hasSyncedRef.current || socketRef.current?.readyState !== WebSocket.OPEN) return;
            const updateBytes = encodeAwarenessUpdate(state.awareness, [doc.clientID]);
            sendJson({ type: 'awareness', client_id: String(doc.clientID), update: toBase64(updateBytes) });
          }, 100);
        }
      };
      state.awareness.on('update', awarenessHandler);
    };

    let firstSync = true;
    let reconnectBlocked = false;
    let currentSocket: WebSocket | null = null;

    const connect = async () => {
      if (disposed) return;
      try {
        const ticket = await api.issueReportCollaborationTicket(resourceType, resourceId);
        if (disposed) return;
        const socket = new WebSocket(websocketUrl(), ['lessso-collab', `lessso-collab.${ticket.ticket}`]);
        currentSocket = socket;
        socketRef.current = socket;
        socket.onopen = () => {
          reconnectAttemptRef.current = 0;
          if (hasSyncedRef.current) {
            const awarenessState = awareness?.getLocalState();
            if (awarenessState) {
              const update = encodeAwarenessUpdate(awareness!, [workingDoc!.clientID]);
              sendJson({ type: 'awareness', client_id: String(workingDoc!.clientID), update: toBase64(update) });
            }
          }
          if (heartbeatTimerRef.current !== null) window.clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = window.setInterval(() => {
            sendJson({ type: 'ping' });
            const localState = awareness?.getLocalState();
            if (localState && workingDoc) {
              const update = encodeAwarenessUpdate(awareness!, [workingDoc.clientID]);
              sendJson({ type: 'awareness', client_id: String(workingDoc.clientID), update: toBase64(update) });
            }
          }, 12_000);
        };
        socket.onmessage = async (event) => {
          let message: Record<string, unknown>;
          try { message = JSON.parse(String(event.data)) as Record<string, unknown>; }
          catch { return; }
          if (message.type === 'sync') {
            const sync = message as unknown as ReportCollaborationBootstrap;
            if (resourceGeneration !== null && sync.generation !== resourceGeneration) {
              await clearEncryptedCollaborationStates(resourceKey).catch(() => undefined);
              window.location.reload();
              return;
            }
            resourceGeneration = sync.generation;
            resourceGenerationRef.current = sync.generation;
            const serverDoc = new Y.Doc();
            Y.applyUpdate(serverDoc, fromBase64(sync.state), REMOTE_ORIGIN);
            for (const item of sync.updates) Y.applyUpdate(serverDoc, fromBase64(item.update), REMOTE_ORIGIN);
            if (!workingDoc) {
              workingDoc = new Y.Doc();
              seedDocument(workingDoc, resourceType, initialContentRef.current!);
              Y.applyUpdate(workingDoc, fromBase64(sync.state), REMOTE_ORIGIN);
              for (const item of sync.updates) Y.applyUpdate(workingDoc, fromBase64(item.update), REMOTE_ORIGIN);
            } else {
              Y.applyUpdate(workingDoc, fromBase64(sync.state), REMOTE_ORIGIN);
              for (const item of sync.updates) Y.applyUpdate(workingDoc, fromBase64(item.update), REMOTE_ORIGIN);
            }
            const serverVector = Y.encodeStateVector(serverDoc);
            lastReceivedSeqRef.current = Math.max(sync.latest_seq, sync.checkpoint_seq);
            if (firstSync) {
              const localCopies = recoveryKey ? await loadEncryptedCollaborationStates(recoveryKey, resourceKey).catch(() => {
                setError('No se pudo abrir una copia colaborativa cifrada de este navegador. Los cambios del servidor siguen disponibles.');
                return [];
              }) : [];
              if (disposed || currentSocket !== socket || socket.readyState !== WebSocket.OPEN) {
                serverDoc.destroy();
                return;
              }
              const matchingCopies = localCopies.filter((copy) => copy.generation === sync.generation);
              if (localCopies.length && matchingCopies.length !== localCopies.length) {
                await clearEncryptedCollaborationStates(resourceKey).catch(() => undefined);
              } else {
                for (const copy of matchingCopies) Y.applyUpdate(workingDoc!, copy.state, REMOTE_ORIGIN);
              }
              firstSync = false;
              installSession(workingDoc!);
            }
            const missedLocalState = Y.encodeStateAsUpdate(workingDoc!, serverVector);
            serverDoc.destroy();
            localUpdatesRef.current = [];
            hasSyncedRef.current = true;
            if (missedLocalState.length > 2) {
              sendJson({
                type: 'update',
                update_id: crypto.randomUUID(),
                generation: resourceGeneration,
                update: toBase64(missedLocalState),
              });
            }
            setPermission(sync.permission);
            setCanEdit(sync.permission === 'owner' || sync.permission === 'editor');
            setStatus('connected');
            setError(null);
            setRevision((value) => value + 1);
            if (sync.latest_seq > sync.checkpoint_seq && (sync.permission === 'owner' || sync.permission === 'editor')) {
              setIsDirty(true);
              scheduleLocalCache();
            }
            if (missedLocalState.length > 2) {
              setIsDirty(true);
              scheduleLocalCache();
            }
            setPresentUsers(awareness ? readPresentUsers(awareness, operator.id, trustedPresenceIdentitiesRef.current) : []);
            if (awareness && workingDoc) {
              const update = encodeAwarenessUpdate(awareness, [workingDoc.clientID]);
              sendJson({ type: 'awareness', client_id: String(workingDoc.clientID), update: toBase64(update) });
            }
          } else if (message.type === 'update' && workingDoc) {
            if (typeof message.update === 'string') {
              try { Y.applyUpdate(workingDoc, fromBase64(message.update), REMOTE_ORIGIN); } catch { /* malformed server frame */ }
            }
            if (typeof message.seq === 'number') {
              lastReceivedSeqRef.current = Math.max(lastReceivedSeqRef.current, message.seq);
            }
          } else if (message.type === 'presence' && awareness && Array.isArray(message.clients)) {
            const identities = new Map<string, TrustedPresenceIdentity>();
            for (const client of message.clients as Array<{ client_id?: string; user_id?: string; display_name?: string; update?: string }>) {
              if (typeof client.client_id === 'string' && typeof client.user_id === 'string') {
                identities.set(client.client_id, { id: client.user_id, name: client.display_name || 'Colaborador' });
              }
              if (!client.update) continue;
              try { applyAwarenessUpdate(awareness, fromBase64(client.update), REMOTE_AWARENESS_ORIGIN); }
              catch { /* ignore expired or malformed presence */ }
            }
            trustedPresenceIdentitiesRef.current = identities;
            setPresentUsers(readPresentUsers(awareness, operator.id, identities));
          } else if (message.type === 'reset') {
            await clearEncryptedCollaborationStates(resourceKey).catch(() => undefined);
            window.location.reload();
          } else if (message.type === 'auth_expired') {
            reconnectBlocked = true;
            setStatus('error');
            setError('La sesión venció. Vuelve a iniciar sesión para seguir colaborando.');
            setCanEdit(false);
            setPermission(null);
          } else if (message.type === 'error' && typeof message.detail === 'string') {
            setError(message.detail);
          }
        };
        socket.onerror = () => {
          if (!disposed) setStatus('offline');
        };
        socket.onclose = (event) => {
          if (disposed) return;
          hasSyncedRef.current = false;
          if (heartbeatTimerRef.current !== null) window.clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = null;
          setPresentUsers([]);
          if (reconnectBlocked || event.code === 4403) {
            reconnectBlocked = true;
            setStatus('error');
            setCanEdit(false);
            setPermission(null);
            setError((current) => current || (event.code === 4403
              ? event.reason.includes('Origen')
                ? 'El servidor rechazó el origen de esta conexión. Abre LESSSO desde la URL HTTPS configurada.'
                : 'Se retiró tu acceso a este reporte. Pide a la persona propietaria que lo comparta de nuevo.'
              : 'La sesión venció. Vuelve a iniciar sesión para seguir colaborando.'));
            return;
          }
          if (!recoveryKey) setCanEdit(false);
          setStatus('offline');
          const delay = Math.min(15_000, 500 * (2 ** Math.min(reconnectAttemptRef.current, 5)));
          reconnectAttemptRef.current += 1;
          reconnectTimerRef.current = window.setTimeout(() => void connect(), delay);
        };
      } catch (cause) {
        if (disposed) return;
        const normalized = normalizeTransportError(cause);
        setError(normalized.message);
        if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403 || cause.status === 404)) {
          reconnectBlocked = true;
          setStatus('error');
          setCanEdit(false);
          setPermission(null);
          return;
        }
        setStatus('offline');
        const delay = Math.min(15_000, 500 * (2 ** Math.min(reconnectAttemptRef.current, 5)));
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(() => void connect(), delay);
      }
    };

    const bootstrap = async () => {
      const seedDoc = new Y.Doc();
      seedDocument(seedDoc, resourceType, initialContent);
      const result = await api.bootstrapReportCollaboration(
        resourceType,
        resourceId,
        toBase64(Y.encodeStateAsUpdate(seedDoc)),
      );
      if (disposed) { seedDoc.destroy(); return; }
      resourceGeneration = result.generation;
      resourceGenerationRef.current = result.generation;
      const doc = new Y.Doc();
      Y.applyUpdate(doc, fromBase64(result.state), REMOTE_ORIGIN);
      for (const item of result.updates) Y.applyUpdate(doc, fromBase64(item.update), REMOTE_ORIGIN);
      lastReceivedSeqRef.current = Math.max(result.latest_seq, result.checkpoint_seq);
      workingDoc = doc;
      seedDoc.destroy();
      await connect();
    };

    void bootstrap().catch((cause) => {
      if (disposed) return;
      const normalized = normalizeTransportError(cause);
      setStatus('error');
      setError(normalized.message);
    });

    return () => {
      disposed = true;
      if (workingDoc && recoveryKey) {
        void saveEncryptedCollaborationState(
          recoveryKey,
          resourceKey,
          resourceGeneration ?? 1,
          Y.encodeStateAsUpdate(workingDoc),
        ).catch(() => undefined);
      }
      clearTimers();
      const activeSocket = currentSocket || socketRef.current;
      if (activeSocket && activeSocket.readyState < WebSocket.CLOSING) activeSocket.close(1000, 'El editor se cerró.');
      socketRef.current = null;
      hasSyncedRef.current = false;
      if (workingDoc && eventHandler) workingDoc.off('update', eventHandler);
      if (awareness && awarenessHandler) awareness.off('update', awarenessHandler);
      awareness?.destroy();
      workingDoc?.destroy();
      sessionRef.current = null;
      setSession(null);
    };
  }, [enabled, operator?.full_name, operator?.id, operator?.username, recoveryKey, resourceId, resourceType]);

  useEffect(() => {
    if (!isDirty || status !== 'connected') return;
    if (checkpointTimerRef.current !== null) window.clearTimeout(checkpointTimerRef.current);
    checkpointTimerRef.current = window.setTimeout(() => {
      checkpointTimerRef.current = null;
      void checkpointCurrentRef.current().catch(() => undefined);
    }, 1800);
    return () => {
      if (checkpointTimerRef.current !== null) window.clearTimeout(checkpointTimerRef.current);
    };
  }, [canEdit, isDirty, revision, status]);

  return { session, status, error, permission, canEdit, hasLocalRecovery: !!recoveryKey, revision, lastSavedAt, isDirty, presentUsers, checkpoint, setPresenceField };
}
