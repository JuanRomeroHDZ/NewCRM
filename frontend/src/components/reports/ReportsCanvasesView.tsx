import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CaptureUpdateAction, Excalidraw, exportToCanvas } from '@excalidraw/excalidraw';
import type { AppState, BinaryFiles, Collaborator, ExcalidrawImperativeAPI, SocketId } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import '@excalidraw/excalidraw/index.css';
import './excalidraw-obsidian.css';
import * as Y from 'yjs';

if (typeof window !== 'undefined') {
  (window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/';
}
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  Menu,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
  PenTool,
  Plus,
  Save,
  Search,
  Trash2,
  Users,
  MessageSquarePlus,
} from 'lucide-react';
import { api } from '../../lib/api';
import { ApiError } from '../../lib/apiErrors';
import { formatApiDateTime } from '../../lib/dates';
import { useVault } from '../../context/VaultContext';
import { ReportCanvasDetail, ReportCanvasSummary, ReportDocumentSummary } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { ReportLoadingSkeleton } from './ReportLoadingSkeleton';
import { ReportCollaborationPanel } from './ReportCollaborationPanel';
import { describeReportSync, useReportCollaboration, ReportCollaborationSession } from './useReportCollaboration';
import { applyExcalidrawElementFields, elementFieldsToPlainObject } from './reportCanvasCollaboration.mjs';

interface ParsedExcalidrawScene {
  elements?: readonly ExcalidrawElement[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

function collaborativeCanvasScene(
  elementsMap: Y.Map<Y.Map<unknown>>,
  filesMap: Y.Map<unknown>,
  appStateMap: Y.Map<unknown>,
) {
  const ordered = Array.from(elementsMap.entries()).map(([id, fields]) => ({
    id,
    index: typeof fields.get('index') === 'string' ? fields.get('index') as string : '',
    element: elementFieldsToPlainObject(fields) as unknown as ExcalidrawElement,
  }));
  ordered.sort((left, right) => left.index.localeCompare(right.index) || left.id.localeCompare(right.id));
  const elements = ordered.map((item) => item.element);
  const appState = appStateMap.toJSON() as Record<string, unknown>;
  const files = filesMap.toJSON() as Record<string, unknown>;
  return {
    elements,
    appState: {
      viewBackgroundColor: typeof appState.viewBackgroundColor === 'string' ? appState.viewBackgroundColor : '#080A0A',
      ...(typeof appState.gridSize === 'number' ? { gridSize: appState.gridSize } : {}),
      gridModeEnabled: appState.gridModeEnabled === true,
      theme: 'dark',
    },
    files,
  };
}

function sceneElementSignature(elements: readonly ExcalidrawElement[]) {
  return JSON.stringify(elements.map((element) => [element.id, element.index, element.version, element.versionNonce, element.isDeleted, 'text' in element ? element.text : null]));
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseCanvasScene(raw: string): ParsedExcalidrawScene {
  if (!raw || raw.trim() === '' || raw.trim() === '{}') {
    return {
      elements: [],
      appState: { viewBackgroundColor: '#080A0A', theme: 'dark' },
      files: {},
    };
  }
  try {
    const parsed = JSON.parse(raw) as ParsedExcalidrawScene;
    return {
      elements: Array.isArray(parsed.elements) ? parsed.elements : [],
      appState: {
        ...(parsed.appState || {}),
        viewBackgroundColor:
          typeof parsed.appState?.viewBackgroundColor === 'string'
            ? parsed.appState.viewBackgroundColor
            : '#080A0A',
        theme: 'dark',
      },
      files: parsed.files && typeof parsed.files === 'object' ? parsed.files : {},
    };
  } catch {
    return {
      elements: [],
      appState: { viewBackgroundColor: '#080A0A', theme: 'dark' },
      files: {},
    };
  }
}

// Keep the existing SVG snapshot field and canvas:// references compatible.
async function createReportSnapshot(sceneJson: string): Promise<string> {
  const scene = parseCanvasScene(sceneJson);
  const elements = (scene.elements || []).filter((element) => !element.isDeleted);
  if (!elements.length) return '';
  const canvas = await exportToCanvas({
    elements: elements as never,
    appState: { ...scene.appState, exportWithDarkMode: true, exportBackground: true },
    files: (scene.files || {}) as never,
    getDimensions: (width: number, height: number) => {
      const scale = Math.min(2, 2400 / Math.max(width, height));
      return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
    },
  });
  const image = canvas.toDataURL('image/png');
  if (!image.startsWith('data:image/png;base64,')) throw new Error('No se pudo generar la imagen del lienzo.');
  const { width, height } = canvas;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="${image}"/></svg>`;
}

function sceneSignature(raw: string): string {
  const scene = parseCanvasScene(raw);
  return JSON.stringify([
    scene.elements?.filter((element) => !element.isDeleted)
      .map(({ id, index, version, versionNonce, ...rest }) => [id, index, version, versionNonce, 'text' in rest ? rest.text : null]),
    scene.appState?.viewBackgroundColor,
    scene.appState?.gridModeEnabled ? scene.appState.gridSize : null,
    Object.entries(scene.files || {}).sort(([left], [right]) => left.localeCompare(right)).map(([id, rawFile]) => {
      const file = rawFile && typeof rawFile === 'object' ? rawFile as Record<string, unknown> : {};
      const dataUrl = typeof file.dataURL === 'string' ? file.dataURL : '';
      return [id, file.mimeType, dataUrl.length];
    }),
  ]);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export const ReportsCanvasesView: React.FC = () => {
  const { isUnlocked, draftRecoveryKey, operator, openUnlockModal, showToast, confirm, prompt } = useVault();

  const [canvases, setCanvases] = useState<ReportCanvasSummary[]>([]);
  const [documents, setDocuments] = useState<ReportDocumentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCanvas, setActiveCanvas] = useState<ReportCanvasDetail | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [linkedDocumentId, setLinkedDocumentId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCollaborationOpen, setIsCollaborationOpen] = useState(false);
  const [collaborationAnchor, setCollaborationAnchor] = useState<string | null>(null);

  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailLoadAttempt, setDetailLoadAttempt] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [sceneDirty, setSceneDirty] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionTriggerRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);
  useEffect(() => {
    if (!actionsOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !actionsRef.current?.contains(event.target)) setActionsOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [actionsOpen]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const savedSceneSignature = useMemo(() => sceneSignature(activeCanvas?.scene_json || "{}"), [activeCanvas?.scene_json]);
  const latestSceneRef = useRef<{ json: string; elementCount: number } | null>(null);
  const canvasApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const lastSnapshotSceneSignatureRef = useRef<string | null>(null);
  const snapshotQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastSelectionRef = useRef('[]');

  const getCollaborativeCanvasContent = useCallback((doc: Y.Doc) => {
    const metadata = doc.getMap<unknown>('metadata');
    const scene = collaborativeCanvasScene(
      doc.getMap<Y.Map<unknown>>('elements'),
      doc.getMap<unknown>('files'),
      doc.getMap<unknown>('app-state'),
    );
    return {
      title: String(metadata.get('title') ?? activeCanvas?.title ?? ''),
      scene_json: JSON.stringify(scene),
      element_count: scene.elements.filter((element) => !element.isDeleted).length,
      linked_document_id: (metadata.get('linked_document_id') as string | null | undefined) ?? null,
    };
  }, [activeCanvas?.title]);
  const collaboration = useReportCollaboration({
    resourceType: 'canvas',
    resourceId: activeCanvas?.id ?? null,
    initialContent: activeCanvas ? {
      title: activeCanvas.title,
      scene_json: activeCanvas.scene_json,
      element_count: activeCanvas.element_count,
      linked_document_id: activeCanvas.linked_document_id,
    } : null,
    recoveryKey: draftRecoveryKey,
    operator,
    getContent: getCollaborativeCanvasContent,
  });
  const persistCanvasSnapshot = useCallback((canvasId: string, force = false) => {
    const session = collaboration.session;
    if (!session) return Promise.reject(new Error('El lienzo aún no terminó de sincronizarse.'));
    const persist = async () => {
      let regenerate = force;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const stateVector = Y.encodeStateVector(session.doc);
        const content = getCollaborativeCanvasContent(session.doc);
        const signature = sceneSignature(content.scene_json);
        if (!regenerate && lastSnapshotSceneSignatureRef.current === signature) return;
        const snapshot = await createReportSnapshot(content.scene_json);
        if (!sameBytes(stateVector, Y.encodeStateVector(session.doc))) {
          regenerate = true;
          continue;
        }
        const updated = await api.updateReportCanvas(canvasId, { svg_snapshot: snapshot });
        if (!sameBytes(stateVector, Y.encodeStateVector(session.doc))) {
          regenerate = true;
          continue;
        }
        lastSnapshotSceneSignatureRef.current = signature;
        setActiveCanvas((current) => current?.id === canvasId
          ? { ...current, has_svg_snapshot: updated.has_svg_snapshot, updated_at: updated.updated_at }
          : current);
        setCanvases((current) => current.map((item) => item.id === canvasId
          ? { ...item, has_svg_snapshot: updated.has_svg_snapshot, updated_at: updated.updated_at }
          : item));
        return;
      }
      throw new Error('El lienzo sigue recibiendo cambios. Espera la sincronización y vuelve a guardar.');
    };
    const queued = snapshotQueueRef.current.then(persist, persist);
    snapshotQueueRef.current = queued.catch(() => undefined);
    return queued;
  }, [collaboration.session, getCollaborativeCanvasContent]);
  const hasUnsavedChanges = !!activeCanvas && (
    collaboration.isDirty || sceneDirty || (titleDraft.trim() || activeCanvas.title) !== activeCanvas.title ||
    linkedDocumentId !== (activeCanvas.linked_document_id || '')
  );
  const syncLabel = describeReportSync(collaboration, isSaving, hasUnsavedChanges);

  useEffect(() => {
    if (!isUnlocked) {
      setDocuments([]);
      return;
    }
    api.listReportDocuments().then(setDocuments).catch(() => {});
  }, [isUnlocked]);

  const loadCanvases = useCallback(async (preferId?: string | null) => {
    if (!isUnlocked) {
      setCanvases([]);
      setIsLoadingList(false);
      return;
    }
    setIsLoadingList(true);
    setErrorMessage(null);
    try {
      const list = await api.listReportCanvases();
      setCanvases(list);
      const targetId = preferId ?? (list[0]?.id ?? null);
      setSelectedId((prev) => {
        if (preferId) return preferId;
        if (prev && list.some((item) => item.id === prev)) return prev;
        return targetId;
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'No se pudieron cargar los lienzos.';
      setErrorMessage(msg);
    } finally {
      setIsLoadingList(false);
    }
  }, [isUnlocked]);

  useEffect(() => {
    void loadCanvases();
  }, [loadCanvases]);

  const selectCanvasWithGuard = useCallback(
    async (nextId: string) => {
      if (nextId === selectedId || savingRef.current) return;
      if (hasUnsavedChanges && collaboration.canEdit && collaboration.status === 'connected') {
        try {
          await collaboration.checkpoint(false, 'manual');
        } catch (error) {
          showToast(error instanceof Error ? error.message : 'No se pudo sincronizar el lienzo.', 'error');
          return;
        }
      }
      setSelectedId(nextId);
    },
    [collaboration.canEdit, collaboration.checkpoint, collaboration.status, hasUnsavedChanges, selectedId, showToast]
  );

  useEffect(() => {
    if (!isUnlocked || !selectedId) {
      canvasApiRef.current = null;
      setActiveCanvas(null);
      setTitleDraft('');
      latestSceneRef.current = null;
      setSceneDirty(false);
      return;
    }

    let cancelled = false;
    setActiveCanvas(null);
    setActionsOpen(false);
    setIsLoadingDetail(true);
    setErrorMessage(null);
    api
      .getReportCanvas(selectedId)
      .then((detail) => {
        if (cancelled) return;
        setActiveCanvas(detail);
        lastSnapshotSceneSignatureRef.current = detail.has_svg_snapshot ? sceneSignature(detail.scene_json || '{}') : null;
        setTitleDraft(detail.title);
        setLinkedDocumentId(detail.linked_document_id || '');
        latestSceneRef.current = {
          json: detail.scene_json || '{}',
          elementCount: detail.element_count,
        };
        setSceneDirty(false);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.message : 'No se pudo abrir el lienzo.';
        setErrorMessage(msg);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailLoadAttempt, isUnlocked, selectedId]);

  useEffect(() => {
    const session = collaboration.session;
    if (!activeCanvas || !session) return;
    const metadata = session.metadata;
    const scene = collaborativeCanvasScene(session.elements, session.files, session.appState);
    const sceneJson = JSON.stringify(scene);
    const count = scene.elements.filter((element) => !element.isDeleted).length;
    const title = String(metadata.get('title') ?? activeCanvas.title);
    const linkedId = (metadata.get('linked_document_id') as string | null | undefined) ?? '';
    setTitleDraft((current) => current === title ? current : title);
    setLinkedDocumentId((current) => current === linkedId ? current : linkedId);
    latestSceneRef.current = { json: sceneJson, elementCount: count };

    const excalidraw = canvasApiRef.current;
    if (excalidraw) {
      const currentElements = excalidraw.getSceneElementsIncludingDeleted();
      if (sceneElementSignature(currentElements) !== sceneElementSignature(scene.elements)) {
        const files = Object.values(scene.files).filter((file): file is Record<string, unknown> => Boolean(file && typeof file === 'object'));
        if (files.length) excalidraw.addFiles(files as never);
        excalidraw.updateScene({
          elements: scene.elements as never,
          appState: scene.appState as never,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
    }

    const nextSceneDirty = sceneSignature(sceneJson) !== savedSceneSignature;
    setSceneDirty(nextSceneDirty);
    if (collaboration.lastSavedAt && !collaboration.isDirty) {
      setActiveCanvas((current) => {
        if (!current || current.id !== activeCanvas.id) return current;
        if (current.scene_json === sceneJson && current.title === title && current.linked_document_id === (linkedId || null)) return current;
        return {
          ...current,
          title,
          scene_json: sceneJson,
          element_count: count,
          linked_document_id: linkedId || null,
          updated_at: collaboration.lastSavedAt!,
        };
      });
      setCanvases((current) => current.map((item) => item.id === activeCanvas.id ? {
        ...item,
        title,
        element_count: count,
        linked_document_id: linkedId || null,
        updated_at: collaboration.lastSavedAt!,
      } : item));
      setSceneDirty(false);
    }
  }, [
    activeCanvas?.id,
    collaboration.isDirty,
    collaboration.lastSavedAt,
    collaboration.revision,
    collaboration.session,
    savedSceneSignature,
  ]);

  useEffect(() => {
    if (!activeCanvas || !collaboration.session || !collaboration.canEdit
      || collaboration.status !== 'connected' || collaboration.isDirty || sceneDirty) return;
    const signature = sceneSignature(activeCanvas.scene_json || '{}');
    if (lastSnapshotSceneSignatureRef.current === signature) return;
    void persistCanvasSnapshot(activeCanvas.id).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo actualizar la vista previa del lienzo.');
    });
  }, [
    activeCanvas?.id,
    activeCanvas?.scene_json,
    collaboration.canEdit,
    collaboration.isDirty,
    collaboration.lastSavedAt,
    collaboration.session,
    collaboration.status,
    persistCanvasSnapshot,
    sceneDirty,
  ]);

  const handleCreateCanvas = async () => {
    const entered = await prompt({
      title: 'Nuevo lienzo',
      message: 'Asigna un nombre descriptivo para identificar este diagrama.',
      placeholder: 'Ej. Topología de red interna',
      defaultValue: 'Nuevo lienzo',
      confirmLabel: 'Crear lienzo',
    });
    if (!entered || !entered.trim()) return;

    try {
      const initialScene = JSON.stringify({
        elements: [],
        appState: { viewBackgroundColor: '#080A0A', theme: 'dark' },
        files: {},
      });
      const created = await api.createReportCanvas({
        title: entered.trim(),
        scene_json: initialScene,
        element_count: 0,
      });
      showToast('Lienzo creado.', 'success');
      await loadCanvases(created.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No se pudo crear el lienzo.', 'error');
    }
  };

  const handleSaveCanvas = useCallback(async (refreshSnapshot = false) => {
    if (!activeCanvas || !collaboration.session || !collaboration.canEdit || collaboration.status !== 'connected'
      || savingRef.current || (!hasUnsavedChanges && !refreshSnapshot)) return;
    savingRef.current = true;
    const content = getCollaborativeCanvasContent(collaboration.session.doc);
    const sceneJson = content.scene_json;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await collaboration.checkpoint(hasUnsavedChanges, 'manual');
      await persistCanvasSnapshot(activeCanvas.id, refreshSnapshot);
      const updated = await api.getReportCanvas(activeCanvas.id);
      lastSnapshotSceneSignatureRef.current = updated.has_svg_snapshot ? sceneSignature(updated.scene_json || '{}') : null;
      setActiveCanvas(updated);
      setTitleDraft(updated.title);
      setLinkedDocumentId(updated.linked_document_id || '');
      setCanvases((prev) =>
        prev.map((item) =>
          item.id === updated.id
            ? {
                ...item,
                title: updated.title,
                element_count: updated.element_count,
                updated_at: updated.updated_at,
                has_svg_snapshot: updated.has_svg_snapshot,
                linked_document_id: updated.linked_document_id,
              }
            : item
        )
      );
      setSceneDirty(sceneSignature(latestSceneRef.current?.json ?? sceneJson) !== sceneSignature(updated.scene_json));
      showToast('Lienzo guardado.', 'success');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo guardar el lienzo.';
      setErrorMessage(msg);
      showToast(msg, 'error');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [activeCanvas, collaboration.canEdit, collaboration.checkpoint, collaboration.session, collaboration.status, getCollaborativeCanvasContent, hasUnsavedChanges, persistCanvasSnapshot, showToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        if (activeCanvas) {
          event.preventDefault();
          void handleSaveCanvas();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeCanvas, handleSaveCanvas]);

  const handleDeleteCanvas = async (canvas: ReportCanvasSummary) => {
    const accepted = await confirm({
      title: 'Eliminar lienzo',
      message: `¿Seguro que deseas eliminar "${canvas.title}"?`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!accepted) return;

    try {
      await api.deleteReportCanvas(canvas.id);
      showToast('Lienzo eliminado.', 'info');
      const remaining = canvases.filter((item) => item.id !== canvas.id);
      setCanvases(remaining);
      if (selectedId === canvas.id) {
        setSelectedId(remaining[0]?.id ?? null);
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No se pudo eliminar el lienzo.', 'error');
    }
  };

  const filteredCanvases = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return canvases;
    return canvases.filter((item) => item.title.toLowerCase().includes(query));
  }, [canvases, searchQuery]);

  const initialExcalidrawData = useMemo(() => {
    if (!activeCanvas || !collaboration.session) return undefined;
    return collaborativeCanvasScene(collaboration.session.elements, collaboration.session.files, collaboration.session.appState);
  }, [activeCanvas?.id, collaboration.session]);

  const handleExcalidrawChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      const session = collaboration.session;
      if (!activeCanvas || !session || !collaboration.canEdit) return;
      const serializableAppState = {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
        gridModeEnabled: appState.gridModeEnabled,
        theme: 'dark',
      };
      const ids = new Set(elements.map((element) => element.id));
      const changedElements = elements.filter((element) => {
        const fields = session.elements.get(element.id);
        return !fields
          || fields.get('version') !== element.version
          || fields.get('versionNonce') !== element.versionNonce
          || fields.get('index') !== element.index
          || fields.get('isDeleted') !== element.isDeleted;
      });
      const stateVector = Y.encodeStateVector(session.doc);
      session.doc.transact(() => {
        for (const [id, fields] of session.elements.entries()) {
          if (!ids.has(id) && fields.get('isDeleted') !== true) {
            fields.set('isDeleted', true);
            fields.set('version', Number(fields.get('version') || 0) + 1);
          }
        }
        changedElements.forEach((element) => {
          let fields = session.elements.get(element.id);
          if (!fields) {
            fields = new Y.Map<unknown>();
            session.elements.set(element.id, fields);
          }
          const incoming = JSON.parse(JSON.stringify(element)) as Record<string, unknown>;
          applyExcalidrawElementFields(fields, incoming);
        });
        for (const [id, file] of Object.entries(files)) {
          if (!session.files.has(id)) session.files.set(id, JSON.parse(JSON.stringify(file)));
        }
        for (const [key, value] of Object.entries(serializableAppState)) {
          if (value !== undefined && !sameJson(session.appState.get(key), value)) session.appState.set(key, value);
        }
      });
      if (!sameBytes(stateVector, Y.encodeStateVector(session.doc))) {
        const scene = collaborativeCanvasScene(session.elements, session.files, session.appState);
        const serialized = JSON.stringify(scene);
        latestSceneRef.current = { json: serialized, elementCount: scene.elements.filter((element) => !element.isDeleted).length };
        setSceneDirty(sceneSignature(serialized) !== savedSceneSignature);
      }
      const selectedIds = Object.entries((appState.selectedElementIds || {}) as Record<string, boolean>)
        .filter(([, selected]) => selected).map(([id]) => id);
      const selection = JSON.stringify(selectedIds);
      if (selection !== lastSelectionRef.current) {
        lastSelectionRef.current = selection;
        collaboration.setPresenceField('selectedElementIds', Object.fromEntries(selectedIds.map((id) => [id, true])));
      }
    },
    [activeCanvas, collaboration.canEdit, collaboration.session, collaboration.setPresenceField, savedSceneSignature]
  );

  const collaborators = useMemo(() => new Map<SocketId, Collaborator>(
    collaboration.presentUsers.filter((person) => person.pointer).map((person) => [person.clientId as SocketId, {
      id: person.id,
      socketId: person.clientId as SocketId,
      username: person.name,
      pointer: { ...person.pointer!, renderCursor: true },
      button: person.button,
      color: { background: `${person.color}33`, stroke: person.color },
      selectedElementIds: Object.fromEntries((person.selectedElementIds ? Object.keys(person.selectedElementIds) : []).map((id) => [id, true])),
    }]),
  ), [collaboration.presentUsers]);

  useEffect(() => {
    if (!canvasApiRef.current) return;
    canvasApiRef.current.updateScene({ collaborators, captureUpdate: CaptureUpdateAction.NEVER });
  }, [collaborators]);

  const handlePointerUpdate = useCallback((payload: { pointer: { x: number; y: number; tool: 'pointer' | 'laser' }; button: 'down' | 'up' }) => {
    collaboration.setPresenceField('pointer', payload.pointer);
    collaboration.setPresenceField('button', payload.button);
  }, [collaboration.setPresenceField]);

  if (!isUnlocked) {
    return (
      <section className="mx-auto mt-12 max-w-xl px-4 text-center">
        <Lock size={24} className="mx-auto text-obsidian-muted" aria-hidden="true" />
        <h2 className="mt-3 font-heading text-lg font-semibold text-white">Lienzos protegidos</h2>
        <p className="mt-1 text-sm text-obsidian-muted">
          Desbloquea la bóveda para ver y editar los diagramas cifrados en Excalidraw.
        </p>
        <button type="button" onClick={openUnlockModal} className="ui-action-primary mt-4">
          Desbloquear
        </button>
      </section>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-5.5rem)] min-h-[540px] min-w-0 gap-4">
      {isSidebarOpen && (
        <aside className="flex w-full lg:w-72 max-h-60 lg:max-h-none shrink-0 flex-col rounded-xl border border-obsidian-border bg-obsidian-panel min-h-0">
          <div className="flex items-center justify-between gap-2 border-b border-obsidian-border px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <PenTool className="h-[18px] w-[18px] shrink-0 text-obsidian-muted" />
              <h2 className="truncate font-heading text-sm font-semibold text-white">Lienzos</h2>
            </div>
            {/* [Acción principal] Crea un nuevo lienzo de Excalidraw. */}
            <button
              type="button"
              onClick={handleCreateCanvas}
              className="ui-action-primary !px-3 text-xs"
            >
              <Plus className="h-4 w-4" />
              <span>Nuevo</span>
            </button>
          </div>

          <div className="border-b border-obsidian-border px-3 py-2.5">
            <label htmlFor="canvas-search" className="sr-only">
              Buscar lienzos
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-obsidian-muted" />
              <input
                id="canvas-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar lienzo"
                className="w-full min-h-11 rounded-lg border border-obsidian-border bg-obsidian-surface py-2 pl-9 pr-3 text-sm text-white placeholder:text-obsidian-muted focus:border-obsidian-accent focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-obsidian-border">
            {isLoadingList ? (
              <ReportLoadingSkeleton label="Cargando lienzos…" />
            ) : filteredCanvases.length === 0 ? (
              <div className="p-4 text-sm text-obsidian-muted">
                {canvases.length === 0 ? 'Aún no hay lienzos creados.' : 'Sin coincidencias.'}
              </div>
            ) : (
              filteredCanvases.map((item) => {
                const isSelected = item.id === selectedId;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-2 px-4 py-3 transition-colors ${
                      isSelected ? 'bg-obsidian-surface text-white' : 'hover:bg-obsidian-surface/60 text-obsidian-muted'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void selectCanvasWithGuard(item.id)}
                      className="min-w-0 min-h-11 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent"
                    >
                      <div className="truncate text-sm font-medium text-white">{item.title}</div>
                      <div className="mt-0.5 text-xs text-obsidian-muted">
                        {item.element_count} elementos · {formatApiDateTime(item.updated_at)}
                      </div>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      )}

      <section className="relative flex min-w-0 flex-1 flex-col rounded-xl border border-obsidian-border bg-obsidian-panel min-h-0">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-obsidian-border px-3 py-2">
          <div className="flex min-w-0 flex-1 basis-60 items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              aria-label={isSidebarOpen ? 'Ocultar lista de lienzos' : 'Mostrar lista de lienzos'}
              className="ui-action-icon"
            >
              {isSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>

            {activeCanvas ? (
              <>
                <input
                  type="text"
                  value={titleDraft}
                  maxLength={200}
                  disabled={isSaving || !collaboration.canEdit}
                  onChange={(e) => {
                    setTitleDraft(e.target.value);
                    collaboration.session?.metadata.set('title', e.target.value);
                  }}
                  aria-label="Título del lienzo"
                  className="min-w-0 flex-1 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-sm font-medium text-white focus:border-obsidian-accent focus:outline-none"
                />
                <label htmlFor="canvas-doc-link" className="sr-only">
                  Documento vinculado
                </label>
                <select
                  id="canvas-doc-link"
                  value={linkedDocumentId}
                  disabled={isSaving || !collaboration.canEdit}
                  onChange={(e) => {
                    setLinkedDocumentId(e.target.value);
                    collaboration.session?.metadata.set('linked_document_id', e.target.value || null);
                  }}
                  className="h-11 w-2/5 max-w-56 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 text-sm text-white focus:border-obsidian-accent focus:outline-none"
                >
                  <option value="">Sin documento vinculado</option>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <span className="text-sm text-obsidian-muted">Selecciona o crea un lienzo</span>
            )}
          </div>

          {activeCanvas && (
            <div className="flex items-center gap-2">
              <span role="status" className="grid size-8 shrink-0 place-items-center" title={syncLabel}>
                <span className="sr-only">{syncLabel}</span>
                {isSaving || collaboration.status === 'connecting' ? <RefreshCw className="size-4 motion-safe:animate-spin" aria-hidden="true" />
                  : collaboration.status !== 'connected' || collaboration.error || hasUnsavedChanges ? <AlertTriangle className="size-4 text-obsidian-amber" aria-hidden="true" />
                    : collaboration.canEdit ? <CheckCircle2 className="size-4 text-obsidian-emerald" aria-hidden="true" />
                      : <span aria-hidden="true" className="text-xs text-obsidian-muted">—</span>}
              </span>
              <button type="button" className="ui-action-secondary !min-h-11 shrink-0 gap-2 !px-2 sm:!px-3" onClick={() => setIsCollaborationOpen(!isCollaborationOpen)}
                aria-expanded={isCollaborationOpen} aria-label="Colaboración del lienzo" title="Colaboración del lienzo">
                <Users className="size-4" aria-hidden="true" />
                <span className="hidden xl:inline">Colaboración</span>
              </button>
              <button type="button" className="ui-action-icon !h-11 !w-11" onClick={() => {
                const selected = canvasApiRef.current?.getAppState().selectedElementIds || {};
                const ids = Object.entries(selected).filter(([, value]) => value).map(([id]) => id);
                setCollaborationAnchor(ids.length ? JSON.stringify({ kind: 'excalidraw-elements', ids }) : null);
                setIsCollaborationOpen(true);
              }} aria-label="Comentar elementos seleccionados" title="Comentar elementos seleccionados">
                <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
              </button>
              <div ref={actionsRef} className="relative"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setActionsOpen(false);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape' || !actionsOpen) return;
                  event.stopPropagation();
                  setActionsOpen(false);
                  actionTriggerRef.current?.focus();
                }}>
                <button ref={actionTriggerRef} type="button" className="ui-action-icon !h-11 !w-11"
                  aria-label="Acciones del lienzo" aria-expanded={actionsOpen}
                  aria-controls={actionsOpen ? 'canvas-actions' : undefined}
                  onClick={() => setActionsOpen((open) => !open)}>
                  <Menu className="h-4 w-4" aria-hidden="true" />
                </button>
                {actionsOpen && (
                  <div id="canvas-actions" className="absolute right-0 top-full z-50 mt-2 w-60 rounded-lg border border-obsidian-borderLight bg-obsidian-panel p-1 shadow-lg">
                    {([
                      [Save, 'Guardar', !hasUnsavedChanges || isSaving || !collaboration.canEdit || collaboration.status !== 'connected', () => void handleSaveCanvas()],
                      [RefreshCw, 'Actualizar imagen del informe', hasUnsavedChanges || isSaving || activeCanvas.element_count === 0 || !collaboration.canEdit || collaboration.status !== 'connected', () => void handleSaveCanvas(true)],
                      [Trash2, 'Eliminar', isSaving || collaboration.permission !== 'owner', () => void handleDeleteCanvas(activeCanvas)],
                    ] as const).map(([Icon, label, disabled, action]) => (
                      <button key={label} type="button" disabled={disabled}
                        className={`flex min-h-11 w-full items-center gap-2 rounded px-3 text-left text-sm hover:bg-obsidian-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent disabled:opacity-50 ${label === 'Eliminar' ? 'text-obsidian-errorText' : ''}`}
                        onClick={() => { setActionsOpen(false); actionTriggerRef.current?.focus(); action(); }}>
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </header>

        {errorMessage && (
          <div role="alert" className="border-b border-obsidian-border bg-obsidian-dangerBg px-4 py-2 text-xs text-obsidian-errorText">
            {errorMessage}
          </div>
        )}

        <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden rounded-b-xl">
          {!selectedId ? (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                icon={PenTool}
                title="Sin lienzos seleccionados"
                description="Crea un lienzo nuevo con Excalidraw para diagramar topologías, flujos o esquemas técnicos."
                actionLabel="Nuevo lienzo"
                onAction={() => void handleCreateCanvas()}
              />
            </div>
          ) : isLoadingDetail ? (
            <ReportLoadingSkeleton detail label="Cargando lienzo…" />
          ) : activeCanvas && !collaboration.session ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm leading-relaxed text-obsidian-muted" role="status">
              {syncLabel}
            </div>
          ) : !activeCanvas ? (
            <div className="flex h-full items-center justify-center p-6">
              <button type="button" className="ui-action-secondary" onClick={() => setDetailLoadAttempt((value) => value + 1)}>
                Reintentar abrir lienzo
              </button>
            </div>
          ) : (
            <div className="lessso-excalidraw-host">
              <Excalidraw
                key={activeCanvas.id}
                theme="dark"
                langCode="es-ES"
                initialData={initialExcalidrawData as never}
                excalidrawAPI={(api) => { canvasApiRef.current = api; }}
                onChange={handleExcalidrawChange}
                onPointerUpdate={handlePointerUpdate}
                isCollaborating={collaboration.presentUsers.length > 0}
                viewModeEnabled={!collaboration.canEdit}
              />
            </div>
          )}
        </div>
        {isCollaborationOpen && activeCanvas && (
          <ReportCollaborationPanel
            resourceType="canvas"
            resourceId={activeCanvas.id}
            controller={collaboration}
            operator={operator}
            anchor={collaborationAnchor}
            onClearAnchor={() => setCollaborationAnchor(null)}
            onNavigateToAnchor={(anchor) => {
              const canvas = canvasApiRef.current;
              if (!canvas) return false;
              try {
                const parsed = JSON.parse(anchor) as { kind?: string; ids?: unknown };
                if (parsed.kind !== 'excalidraw-elements' || !Array.isArray(parsed.ids)) return false;
                const ids = new Set(parsed.ids.filter((id): id is string => typeof id === 'string'));
                const elements = canvas.getSceneElements().filter((element) => ids.has(element.id));
                if (!elements.length) return false;
                canvas.updateScene({
                  appState: { selectedElementIds: Object.fromEntries(elements.map((element) => [element.id, true])) },
                  captureUpdate: CaptureUpdateAction.NEVER,
                });
                canvas.scrollToContent(elements, { fitToViewport: true });
                setIsCollaborationOpen(false);
                return true;
              } catch {
                return false;
              }
            }}
            onClose={() => setIsCollaborationOpen(false)}
            confirm={confirm}
            showToast={showToast}
          />
        )}
      </section>
    </div>
  );
};
