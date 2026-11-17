import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Copy,
  CopyPlus,
  Download,
  MoreVertical,
  Film,
  GitCompare,
  History,
  Image as ImageIcon,
  Lock,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Radar,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Shield,
  SlidersHorizontal,
  Trash2,
  Upload,
  Unlock,
  X,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { useC2 } from '../../context/C2Context';
import { EmptyState } from '../common/EmptyState';
import { api, clearWriteupEditLease } from '../../lib/api';
import { ApiError } from '../../lib/apiErrors';
import { formatApiDateTime, parseApiDate } from '../../lib/dates';
import { deriveDraftKey, draftStorageKey, encryptDraft, listDraftCopies, readDraft, removeDraft, storeEncryptedDraft } from '../../lib/writeupDraftRecovery';
import {
  InternalProject,
  Prospect,
  WriteupAsset,
  WriteupBoard,
  WriteupCitation,
  WriteupDetail,
  WriteupExportFormat,
  WriteupRevision,
  WriteupRevisionAuthor,
  WriteupSeverity,
  WriteupStatus,
  WriteupStructuredFinding,
  WriteupSummary,
} from '../../types';
import { PentestWhiteboard, type WhiteboardRecoveryDraft } from './PentestWhiteboard';
import { WriteupExportModal } from './WriteupExportModal';
import { WriteupMarkdownSplitEditor, type WriteupEditorSessionState } from './WriteupMarkdownSplitEditor';
import { MarkdownRichPreview } from './MarkdownRichPreview';
import { WriteupCorrelationsPanel } from './WriteupCorrelationsPanel';
import { correlateWriteup } from '../../lib/writeupCorrelations';
import { MAX_REPORT_TEXT_LENGTH, MAX_REPORT_TITLE_LENGTH } from './writeupLimits';
import {
  calculateCvss31,
  type DiffLine,
  Cvss31Metrics,
  DEFAULT_CVSS31_METRICS,
  parseCvss31Vector,
  PENTEST_TAXONOMY_PRESETS,
} from './pentestUtils';

const SEVERITY_CARD: Record<WriteupSeverity, string> = {
  critica: 'border-rose-700/70 bg-rose-950/55 hover:bg-rose-900/55',
  alta: 'border-orange-700/70 bg-orange-950/50 hover:bg-orange-900/50',
  media: 'border-amber-700/70 bg-amber-950/45 hover:bg-amber-900/45',
  baja: 'border-sky-800/70 bg-sky-950/45 hover:bg-sky-900/45',
  informativa: 'border-slate-700 bg-slate-800/70 hover:bg-slate-700/70',
};

const SEVERITY_LABEL: Record<WriteupSeverity, string> = {
  critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja', informativa: 'Info',
};
const STATUS_LABEL: Record<WriteupStatus, string> = {
  borrador: 'Borrador', en_revision: 'En revisión', finalizado: 'Finalizado', entregado: 'Entregado',
};

const MAX_FINDINGS_COUNT = 200;
const DIALOG_FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  'a[href]',
  'summary',
  'video[controls]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const getDialogFocusableElements = (dialog: HTMLElement): HTMLElement[] =>
  Array.from(dialog.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR)).filter((element) =>
    !element.closest('[hidden], [inert], [aria-hidden="true"]') && element.getClientRects().length > 0,
  );

const localDateBoundaryUtc = (value: string, endOfDay = false) => {
  if (!value) return undefined;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const SEVERITY_BAR_COLOR: Record<WriteupSeverity, string> = {
  critica: '#f43f5e',
  alta: '#f97316',
  media: '#f59e0b',
  baja: '#0ea5e9',
  informativa: '#64748b',
};

type WorkspaceMode = 'markdown' | 'whiteboard' | 'dual' | 'findings' | 'assets';
type RecoveryDraft = {
  baseUpdatedAt: string; savedAt?: string; title: string; status: WriteupStatus; severity: WriteupSeverity;
  cvssScore: string; cvssVector: string; cweId: string; cveId: string; targetScope: string;
  executiveSummary: string; markdown: string; findings: WriteupStructuredFinding[]; prospectId: string; projectId: string;
  boardDrafts?: WhiteboardRecoveryDraft[];
  workspaceMode?: WorkspaceMode;
  activeBoardId?: string | null;
  editorSession?: WriteupEditorSessionState;
};
type RecoveryCandidate = { storageKey: string; legacy: boolean; draft: RecoveryDraft };
type WriteupEditLockState =
  | { kind: 'acquiring' }
  | { kind: 'owned'; expiresAt: string }
  | { kind: 'blocked' | 'unavailable'; message: string }
  | { kind: 'manual' }
  | null;

const isRecoveryDraft = (value: unknown): value is RecoveryDraft => {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<RecoveryDraft>;
  const boardDraftsValid = draft.boardDrafts === undefined || (Array.isArray(draft.boardDrafts) && draft.boardDrafts.length <= 50 && draft.boardDrafts.every((board) =>
    Boolean(board) && typeof board.boardId === 'string' && board.boardId.length <= 128 &&
    typeof board.title === 'string' && board.title.length <= 180 &&
    typeof board.sceneJson === 'string' && board.sceneJson.length <= 500_000 &&
    typeof board.svgSnapshot === 'string' && board.svgSnapshot.length <= 1_500_000 &&
    Number.isInteger(board.elementCount) && board.elementCount >= 0 && board.elementCount <= 10_000 &&
    Number.isInteger(board.sceneGeneration) && board.sceneGeneration >= 0
  ));
  const editorSessionValid = draft.editorSession === undefined || (
    Number.isInteger(draft.editorSession.selectionStart) && draft.editorSession.selectionStart >= 0 &&
    Number.isInteger(draft.editorSession.selectionEnd) && draft.editorSession.selectionEnd >= draft.editorSession.selectionStart &&
    Number.isFinite(draft.editorSession.scrollTop) && draft.editorSession.scrollTop >= 0
  );
  const workspaceModeValid = draft.workspaceMode === undefined || ['markdown', 'whiteboard', 'dual', 'findings', 'assets'].includes(draft.workspaceMode);
  return typeof draft.baseUpdatedAt === 'string' && typeof draft.title === 'string' &&
    ['borrador', 'en_revision', 'finalizado', 'entregado'].includes(draft.status || '') &&
    ['critica', 'alta', 'media', 'baja', 'informativa'].includes(draft.severity || '') &&
    typeof draft.cvssScore === 'string' && typeof draft.cvssVector === 'string' &&
    typeof draft.cweId === 'string' && typeof draft.cveId === 'string' &&
    typeof draft.targetScope === 'string' && typeof draft.executiveSummary === 'string' &&
    typeof draft.markdown === 'string' && Array.isArray(draft.findings) &&
    typeof draft.prospectId === 'string' && typeof draft.projectId === 'string' && boardDraftsValid && editorSessionValid && workspaceModeValid &&
    (draft.activeBoardId === undefined || draft.activeBoardId === null || typeof draft.activeBoardId === 'string');
};

const recoveryDraftMatchesServer = (draft: RecoveryDraft, server: WriteupDetail) =>
  !(draft.boardDrafts?.length) &&
  draft.title.trim() === server.title && draft.status === server.status && draft.severity === server.severity &&
  (draft.cvssScore.trim() ? Number(draft.cvssScore) : null) === (server.cvss_score ?? null) &&
  (draft.cvssVector.trim() || null) === (server.cvss_vector ?? null) &&
  (draft.cweId.trim() || null) === (server.cwe_id ?? null) &&
  (draft.cveId.trim() || null) === (server.cve_id ?? null) &&
  (draft.targetScope.trim() || null) === (server.target_scope ?? null) &&
  draft.executiveSummary === (server.executive_summary || '') &&
  draft.markdown === (server.markdown_content || '') &&
  JSON.stringify(draft.findings) === JSON.stringify(server.findings || []) &&
  (draft.prospectId || null) === (server.prospect_id ?? null) &&
  (draft.projectId || null) === (server.project_id ?? null);

export const WriteupsView: React.FC = () => {
  const { isUnlocked, draftRecoveryKey, openUnlockModal, showToast, confirm, prompt, systemLocale } = useVault();
  const {
    selectedIface: c2Iface,
    gateway: c2Gateway,
    hosts: c2Hosts,
    hostOsMap: c2HostOsMap,
    portScanIp: c2PortIp,
    portResults: c2Ports,
    exploitResults: c2Exploits,
    creds: c2Creds,
    wifiAps: c2WifiAps,
    cameraDiscovered: c2Cameras,
    cameraFindings: c2CameraFindings,
    demoMode: c2DemoMode,
  } = useC2();
  const [items, setItems] = useState<WriteupSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WriteupDetail | null>(null);
  const [editLockState, setEditLockState] = useState<WriteupEditLockState>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [creatingWriteup, setCreatingWriteup] = useState(false);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [editorSessionRevision, setEditorSessionRevision] = useState(0);
  const [mode, setMode] = useState<WorkspaceMode>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 1280 ? 'dual' : 'markdown'
  );
  const [showList, setShowList] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1280 : true
  );
  const workspaceModeManuallySelectedRef = useRef(false);
  const reportListManuallyToggledRef = useRef(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showCorrelations, setShowCorrelations] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState('');
  const [loadMoreError, setLoadMoreError] = useState('');
  const [saving, setSaving] = useState(false);
  const [convertingAssetId, setConvertingAssetId] = useState<string | null>(null);
  const [convertUploadToGif, setConvertUploadToGif] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [boardRecoveryDrafts, setBoardRecoveryDrafts] = useState<Record<string, WhiteboardRecoveryDraft>>({});
  const [unsavedBoardIds, setUnsavedBoardIds] = useState<Record<string, true>>({});
  const [saveError, setSaveError] = useState('');
  const [saveConflict, setSaveConflict] = useState(false);
  const [conflictServer, setConflictServer] = useState<WriteupDetail | null>(null);
  const [showConflict, setShowConflict] = useState(false);
  const [recoveryCandidates, setRecoveryCandidates] = useState<RecoveryCandidate[]>([]);
  const [showRecovery, setShowRecovery] = useState(false);
  const [newRecoveryCopyAvailable, setNewRecoveryCopyAvailable] = useState(false);
  const [conflictDiff, setConflictDiff] = useState<DiffLine[]>([]);
  const [conflictDiffLoading, setConflictDiffLoading] = useState(false);
  const [conflictDiffPage, setConflictDiffPage] = useState(0);
  const [conflictCompareMode, setConflictCompareMode] = useState<'diff' | 'side-by-side'>('diff');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [localDraftSavedAt, setLocalDraftSavedAt] = useState<Date | null>(null);
  const [localDraftError, setLocalDraftError] = useState(false);
  const [editVersion, setEditVersion] = useState(0);
  const isWriteupEditingBlocked = Boolean(detail?.manual_locked || editLockState?.kind === 'acquiring' || editLockState?.kind === 'blocked' || editLockState?.kind === 'unavailable' || editLockState?.kind === 'manual');
  const draftVersion = useRef(0);
  const editorDirtyRef = useRef(false);
  const boardRecoveryDraftsRef = useRef<Record<string, WhiteboardRecoveryDraft>>({});
  const unsavedBoardIdsRef = useRef<Record<string, true>>({});
  const boardEditRevisionsRef = useRef<Record<string, number>>({});
  const boardSavePromisesRef = useRef<Record<string, Promise<boolean>>>({});
  const writeupVersionByReportRef = useRef<Record<string, string>>({});
  const handleSaveBoardRef = useRef<(boardId: string, sceneJson: string, svgSnapshot: string, elementCount: number) => Promise<boolean>>(async () => false);
  const localDraftPersistPromiseRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const saveInFlight = useRef(false);
  const lastAutoRevision = useRef(0);
  const autoSaveRef = useRef<() => void>(() => {});
  const markDirty = () => {
    if (isWriteupEditingBlocked) return;
    draftVersion.current += 1;
    editorDirtyRef.current = true;
    setEditVersion(draftVersion.current);
    setDirty(true);
  };
  const [showExportModal, setShowExportModal] = useState(false);
  const [lightboxAsset, setLightboxAsset] = useState<WriteupAsset | null>(null);
  const [diffRevision, setDiffRevision] = useState<WriteupRevision | null>(null);
  const [showRevisionHistory, setShowRevisionHistory] = useState(false);
  const [revisionSelectionExplicit, setRevisionSelectionExplicit] = useState(false);
  const [revisionView, setRevisionView] = useState<'diff' | 'preview'>('diff');
  const [findingCvssEditorIdx, setFindingCvssEditorIdx] = useState<number | null>(null);
  const [findingCvssMetrics, setFindingCvssMetrics] = useState<Cvss31Metrics>(DEFAULT_CVSS31_METRICS);
  const [revisions, setRevisions] = useState<WriteupRevision[]>([]);
  const [revisionAuthors, setRevisionAuthors] = useState<WriteupRevisionAuthor[]>([]);
  const [revisionDetails, setRevisionDetails] = useState<Record<string, WriteupRevision>>({});
  const [revisionDetailLoading, setRevisionDetailLoading] = useState(false);
  const [revisionSearch, setRevisionSearch] = useState('');
  const [revisionType, setRevisionType] = useState<WriteupRevision['change_type'] | ''>('');
  const [revisionAuthor, setRevisionAuthor] = useState('');
  const [revisionAfter, setRevisionAfter] = useState('');
  const [revisionBefore, setRevisionBefore] = useState('');
  const [revisionLoading, setRevisionLoading] = useState(false);
  const [revisionEnd, setRevisionEnd] = useState(false);
  const [diffPage, setDiffPage] = useState(0);
  const revisionCursor = useRef<number | null>(null);
  const revisionRequestVersion = useRef(0);
  const revisionTree = useMemo(() => {
    const groups = new Map<string, { label: string; revisions: WriteupRevision[] }>();
    for (const revision of revisions) {
      const date = parseApiDate(revision.created_at);
      const key = Number.isNaN(date.getTime()) ? 'unknown' : `${date.getFullYear()}-${date.getMonth()}`;
      const label = Number.isNaN(date.getTime()) ? 'Fecha desconocida' : date.toLocaleDateString(systemLocale || 'es-MX', { month: 'long', year: 'numeric' });
      const group = groups.get(key) || { label, revisions: [] };
      group.revisions.push(revision);
      groups.set(key, group);
    }
    return [...groups.entries()];
  }, [revisions, systemLocale]);
  const revisionFilterCount = [revisionSearch.trim(), revisionType, revisionAuthor, revisionAfter, revisionBefore].filter(Boolean).length;
  useEffect(() => { setDiffPage(0); }, [diffRevision?.id]);
  useEffect(() => {
    revisionRequestVersion.current += 1;
    revisionCursor.current = null;
    setRevisionEnd(false);
    setRevisionDetailLoading(false);
    setRevisions([]);
    setRevisionDetails({});
    setShowRevisionHistory(false);
    setRevisionSelectionExplicit(false);
    setDiffRevision(null);
  }, [selectedId]);
  const selectRevision = async (revision: WriteupRevision, userSelected = true) => {
    if (userSelected) setRevisionSelectionExplicit(true);
    const requestVersion = ++revisionRequestVersion.current;
    setDiffRevision(revision);
    setRevisionView('diff');
    const cached = revisionDetails[revision.id];
    if (cached) {
      setDiffRevision(cached);
      setRevisionDetailLoading(false);
      return;
    }
    if (!detail) { setRevisionDetailLoading(false); return; }
    setRevisionDetailLoading(true);
    try {
      const complete = await api.getWriteupRevision(detail.id, revision.id);
      if (requestVersion !== revisionRequestVersion.current) return;
      setRevisionDetails({ [complete.id]: complete });
      if (selectedIdRef.current === detail.id) setDiffRevision(complete);
    } catch (err) {
      if (requestVersion === revisionRequestVersion.current) {
        showToast(err instanceof Error ? err.message : 'No se pudo abrir esta versión.', 'error');
      }
    } finally {
      if (requestVersion === revisionRequestVersion.current) setRevisionDetailLoading(false);
    }
  };
  const closeRevisionHistory = useCallback(() => {
    revisionRequestVersion.current += 1;
    setRevisionDetailLoading(false);
    setShowRevisionHistory(false);
    setRevisionSelectionExplicit(false);
    setDiffRevision(null);
  }, []);
  const revisionFilters = (beforeRevisionNumber?: number) => ({
    limit: 40,
    include_content: false,
    ...(beforeRevisionNumber ? { before_revision_number: beforeRevisionNumber } : {}),
    ...(revisionSearch.trim() ? { search: revisionSearch.trim() } : {}),
    ...(revisionType ? { change_type: revisionType } : {}),
    ...(revisionAuthor ? { author_id: revisionAuthor } : {}),
    ...(localDateBoundaryUtc(revisionAfter) ? { created_after: localDateBoundaryUtc(revisionAfter) } : {}),
    ...(localDateBoundaryUtc(revisionBefore, true) ? { created_before: localDateBoundaryUtc(revisionBefore, true) } : {}),
  });
  const loadMoreRevisions = async () => {
    if (!detail || revisionLoading) return;
    const id = detail.id;
    const cursor = revisionCursor.current;
    if (!cursor) return;
    setRevisionLoading(true);
    try {
      const more = await api.listWriteupRevisions(id, revisionFilters(cursor));
      if (selectedIdRef.current === id) {
        setRevisions(previous => [...previous, ...more.filter(item => !previous.some(existing => existing.id === item.id))]);
        setRevisionEnd(more.length < 40);
        if (more.length) revisionCursor.current = more[more.length - 1].revision_number;
      }
    } catch (err) { showToast(err instanceof Error ? err.message : 'No se pudo cargar el historial', 'error'); }
    finally { setRevisionLoading(false); }
  };
  const openRevisionHistory = async (resetFilters = false) => {
    if (!detail || revisionLoading) return;
    const id = detail.id;
    setRevisionLoading(true);
    try {
      const filters = resetFilters ? { limit: 40, include_content: false } : revisionFilters();
      const [latest, authorResult] = await Promise.all([
        api.listWriteupRevisions(id, filters),
        api.listWriteupRevisionAuthors(id).then(authors => ({ authors, error: false })).catch(() => ({ authors: [], error: true })),
      ]);
      if (selectedIdRef.current === id) {
        setRevisions(latest);
        setRevisionAuthors(authorResult.authors);
        if (authorResult.error) showToast('El historial abrió, pero no se pudo cargar el filtro por autor.', 'warning');
        setRevisionDetails({});
        setRevisionEnd(latest.length < 40);
        revisionCursor.current = latest.length ? latest[latest.length - 1].revision_number : null;
        setShowRevisionHistory(true);
        setRevisionSelectionExplicit(false);
        if (latest.length) void selectRevision(latest[0], false);
        else { revisionRequestVersion.current += 1; setRevisionDetailLoading(false); setDiffRevision(null); }
      }
    } catch (err) { showToast(err instanceof Error ? err.message : 'No se pudo cargar el historial', 'error'); }
    finally { setRevisionLoading(false); }
  };
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [projects, setProjects] = useState<InternalProject[]>([]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [failedAssetIds, setFailedAssetIds] = useState<Record<string, boolean>>({});
  const [jumpTarget, setJumpTarget] = useState<{ line: number; anchorId: string; ts: number } | null>(null);
  const assetUrlsRef = useRef<Record<string, string>>({});
  const selectedIdRef = useRef<string | null>(selectedId);
  const editClientIdRef = useRef<string | null>(null);
  const activeEditLeaseRef = useRef<{ writeupId: string; clientId: string; expiresAt: string } | null>(null);
  const pendingEditLeaseRef = useRef<Record<string, Promise<boolean>>>({});
  const editorSessionRef = useRef<Record<string, WriteupEditorSessionState>>({});
  const editorSessionPersistTimerRef = useRef<number | null>(null);
  const recordEditorSession = (id: string, session: WriteupEditorSessionState) => {
    const previous = editorSessionRef.current[id];
    if (previous && previous.selectionStart === session.selectionStart && previous.selectionEnd === session.selectionEnd && previous.scrollTop === session.scrollTop) return;
    editorSessionRef.current[id] = session;
    if (editorSessionPersistTimerRef.current !== null) window.clearTimeout(editorSessionPersistTimerRef.current);
    editorSessionPersistTimerRef.current = window.setTimeout(() => {
      editorSessionPersistTimerRef.current = null;
      setEditorSessionRevision((revision) => revision + 1);
    }, 350);
  };
  if (!editClientIdRef.current) {
    editClientIdRef.current = `writeup-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
  }
  const mediaTabUploadRef = useRef<HTMLInputElement>(null);
  const modalDialogRef = useRef<HTMLDivElement>(null);
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const recoveryDialogRef = useRef<HTMLDivElement>(null);
  const recoveryCloseRef = useRef<HTMLButtonElement>(null);
  const conflictDialogRef = useRef<HTMLDivElement>(null);
  const conflictCloseRef = useRef<HTMLButtonElement>(null);
  const previousModalFocusRef = useRef<HTMLElement | null>(null);
  const listRequestVersion = useRef(0);
  const detailRequestVersion = useRef(0);
  const selectionInProgressRef = useRef(false);
  const creationInProgressRef = useRef(false);
  const nextListOffset = useRef(0);
  const draftWriteGeneration = useRef(0);
  const recoveredSourceRef = useRef<string | null>(null);
  const draftWarningShown = useRef(false);

  const removeAcknowledgedRecoveryCopies = useCallback((reportId: string) => {
    if (selectedIdRef.current !== reportId || editorDirtyRef.current ||
      Object.keys(unsavedBoardIdsRef.current).length > 0 || Object.keys(boardRecoveryDraftsRef.current).length > 0) return false;

    // Invalidate any in-flight encryption before removing the current tab's
    // copies. Other tabs' independent recovery records are left untouched.
    draftWriteGeneration.current += 1;
    const sourceKey = recoveredSourceRef.current;
    const keys = [...new Set([draftStorageKey(reportId), sourceKey].filter((key): key is string => Boolean(key)))];
    let removed = true;
    for (const storageKey of keys) {
      if (!removeDraft(storageKey)) removed = false;
      else setRecoveryCandidates(current => current.filter(candidate => candidate.storageKey !== storageKey));
      if (recoveredSourceRef.current === storageKey && removed) recoveredSourceRef.current = null;
    }
    if (removed) {
      setLocalDraftSavedAt(null);
      setLocalDraftError(false);
    } else {
      showToast('El informe se guardó, pero una copia local cifrada no pudo eliminarse y se conservará para recuperarla.', 'warning');
    }
    return removed;
  }, [showToast]);

  const handleBoardDirtyChange = useCallback((reportId: string, boardId: string, isDirty: boolean, sceneGeneration: number) => {
    if (selectedIdRef.current !== reportId) return;
    const currentGeneration = boardEditRevisionsRef.current[boardId] ?? -1;
    if (sceneGeneration > currentGeneration) boardEditRevisionsRef.current[boardId] = sceneGeneration;
    const next = { ...unsavedBoardIdsRef.current };
    if (isDirty) next[boardId] = true;
    else if ((boardEditRevisionsRef.current[boardId] ?? -1) <= sceneGeneration) delete next[boardId];
    unsavedBoardIdsRef.current = next;
    setUnsavedBoardIds(next);
  }, []);

  const handleBoardDraftChange = useCallback((reportId: string, boardId: string, draft: WhiteboardRecoveryDraft | null) => {
    if (selectedIdRef.current !== reportId) return;
    const next = { ...boardRecoveryDraftsRef.current };
    if (draft) next[draft.boardId] = draft;
    else delete next[boardId];
    if (!draft && !unsavedBoardIdsRef.current[boardId]) delete boardEditRevisionsRef.current[boardId];
    boardRecoveryDraftsRef.current = next;
    setBoardRecoveryDrafts(next);
    if (!draft) removeAcknowledgedRecoveryCopies(reportId);
  }, [removeAcknowledgedRecoveryCopies]);

  const onCurrentBoardDirtyChange = useCallback((boardId: string, isDirty: boolean, sceneGeneration: number) => {
    if (detail?.id) handleBoardDirtyChange(detail.id, boardId, isDirty, sceneGeneration);
  }, [detail?.id, handleBoardDirtyChange]);
  const onCurrentBoardDraftChange = useCallback((boardId: string, draft: WhiteboardRecoveryDraft | null) => {
    if (detail?.id) handleBoardDraftChange(detail.id, boardId, draft);
  }, [detail?.id, handleBoardDraftChange]);

  const acknowledgeBoardRecoverySnapshot = useCallback((reportId: string, snapshot: WhiteboardRecoveryDraft) => {
    if (selectedIdRef.current !== reportId) return false;
    const latestDraft = boardRecoveryDraftsRef.current[snapshot.boardId];
    if (latestDraft?.sceneGeneration !== snapshot.sceneGeneration ||
      boardEditRevisionsRef.current[snapshot.boardId] !== snapshot.sceneGeneration) return false;
    handleBoardDirtyChange(reportId, snapshot.boardId, false, snapshot.sceneGeneration);
    handleBoardDraftChange(reportId, snapshot.boardId, null);
    return true;
  }, [handleBoardDirtyChange, handleBoardDraftChange]);

  const clearInMemoryBoardDrafts = useCallback(() => {
    boardRecoveryDraftsRef.current = {};
    unsavedBoardIdsRef.current = {};
    boardEditRevisionsRef.current = {};
    setBoardRecoveryDrafts({});
    setUnsavedBoardIds({});
  }, []);

  const clearAssetUrlCache = useCallback(() => {
    Object.values(assetUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    assetUrlsRef.current = {};
    setAssetUrls({});
    setFailedAssetIds({});
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const id = detail?.id;
    if (!id || !isUnlocked) return;
    const prefix = `lessso.writeup-draft.v2.${encodeURIComponent(id)}.`;
    const ownKey = draftStorageKey(id);
    const onStorage = (event: StorageEvent) => {
      if (event.newValue && event.key?.startsWith(prefix) && event.key !== ownKey) setNewRecoveryCopyAvailable(true);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [detail?.id, isUnlocked]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // Editable draft fields
  const [title, setTitle] = useState('');
  const [statusVal, setStatusVal] = useState<WriteupStatus>('borrador');
  const [severity, setSeverity] = useState<WriteupSeverity>('media');
  const [cvssScore, setCvssScore] = useState<string>('');
  const [cvssVector, setCvssVector] = useState('');
  const [cweId, setCweId] = useState('');
  const [cveId, setCveId] = useState('');
  const [targetScope, setTargetScope] = useState('');
  const [execSummary, setExecSummary] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [revisionDiff, setRevisionDiff] = useState<DiffLine[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState('');
  const [diffAttempt, setDiffAttempt] = useState(0);
  useEffect(() => {
    if (!diffRevision || revisionView !== 'diff') {
      setRevisionDiff([]);
      setDiffLoading(false);
      setDiffError('');
      return;
    }
    setRevisionDiff([]);
    setDiffPage(0);
    setDiffLoading(true);
    setDiffError('');
    let worker: Worker | undefined;
    try {
      worker = new Worker(new URL('./revisionDiff.worker.ts', import.meta.url), { type: 'module' });
      const activeWorker = worker;
      worker.onmessage = (event: MessageEvent<DiffLine[]>) => {
        setRevisionDiff(event.data);
        setDiffLoading(false);
        activeWorker.terminate();
      };
      worker.onerror = () => {
        setDiffLoading(false);
        setDiffError('No se pudo calcular la comparación. Inténtalo de nuevo.');
        activeWorker.terminate();
      };
      worker.postMessage({ oldText: diffRevision.markdown_content ?? '', newText: markdown });
    } catch {
      worker?.terminate();
      setDiffLoading(false);
      setDiffError('No se pudo iniciar la comparación. Inténtalo de nuevo.');
      return;
    }
    return () => {
      if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); }
    };
  }, [diffRevision, markdown, revisionView, diffAttempt]);
  useEffect(() => {
    if (!showConflict || !conflictServer) {
      setConflictDiff([]);
      setConflictDiffLoading(false);
      return;
    }
    setConflictDiff([]);
    setConflictDiffPage(0);
    setConflictDiffLoading(true);
    let worker: Worker | undefined;
    try {
      worker = new Worker(new URL('./revisionDiff.worker.ts', import.meta.url), { type: 'module' });
      const activeWorker = worker;
      activeWorker.onmessage = (event: MessageEvent<DiffLine[]>) => {
        setConflictDiff(event.data);
        setConflictDiffLoading(false);
        activeWorker.terminate();
      };
      activeWorker.onerror = () => {
        setConflictDiffLoading(false);
        activeWorker.terminate();
      };
      activeWorker.postMessage({ oldText: conflictServer.markdown_content, newText: markdown });
    } catch {
      worker?.terminate();
      setConflictDiffLoading(false);
    }
    return () => {
      if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); }
    };
  }, [showConflict, conflictServer, markdown]);
  const [findings, setFindings] = useState<WriteupStructuredFinding[]>([]);
  const [prospectId, setProspectId] = useState('');
  const [projectId, setProjectId] = useState('');
  useEffect(() => {
    const id = detail?.id;
    const generation = ++draftWriteGeneration.current;
    const pendingBoardDrafts = Object.values(boardRecoveryDrafts);
    if (!id || !isUnlocked || !draftRecoveryKey) return;
    const storageKey = draftStorageKey(id);
    const draft: RecoveryDraft = {
      baseUpdatedAt: detail.updated_at, savedAt: new Date().toISOString(), title, status: statusVal, severity,
      cvssScore, cvssVector, cweId, cveId, targetScope, executiveSummary: execSummary, markdown, findings,
      prospectId, projectId, boardDrafts: pendingBoardDrafts, workspaceMode: mode, activeBoardId,
      editorSession: editorSessionRef.current[id],
    };
    setLocalDraftSavedAt(null);
    setLocalDraftError(false);
    const persist = encryptDraft(draftRecoveryKey, storageKey, draft).then(ciphertext => {
      if (generation === draftWriteGeneration.current) {
        storeEncryptedDraft(storageKey, ciphertext);
        setLocalDraftSavedAt(new Date());
        setLocalDraftError(false);
      }
      return true;
    }).catch(() => {
      if (generation === draftWriteGeneration.current) setLocalDraftError(true);
      if (!draftWarningShown.current) {
        draftWarningShown.current = true;
        showToast('No se pudo guardar la copia local cifrada (el almacenamiento puede estar lleno o desactivado). Mantén esta página abierta hasta confirmar el guardado.', 'warning');
      }
      return false;
    });
    localDraftPersistPromiseRef.current = persist;
    return () => { draftWriteGeneration.current += 1; };
  }, [detail?.id, detail?.updated_at, isUnlocked, draftRecoveryKey, dirty, editVersion, editorSessionRevision, boardRecoveryDrafts, title, statusVal, severity, cvssScore, cvssVector, cweId, cveId, targetScope, execSummary, markdown, findings, prospectId, projectId, mode, activeBoardId, showToast]);
  const changedRevisionSections = useMemo(() => {
    const snapshot = diffRevision?.snapshot;
    if (!snapshot || !detail) return [];
    const fields = snapshot.fields;
    const metadataChanged = fields.title !== title || fields.status !== statusVal || fields.severity !== severity ||
      (fields.cvss_score ?? '') !== (cvssScore === '' ? '' : Number(cvssScore)) || (fields.cvss_vector ?? '') !== cvssVector ||
      (fields.cwe_id ?? '') !== cweId || (fields.cve_id ?? '') !== cveId || (fields.target_scope ?? '') !== targetScope ||
      (fields.prospect_id ?? '') !== prospectId || (fields.project_id ?? '') !== projectId || (snapshot.executive_summary ?? '') !== execSummary;
    const boardContent = (boards: WriteupBoard[]) => boards.map(({ id, title: boardTitle, scene_json, svg_snapshot, element_count }) => ({ id, title: boardTitle, scene_json, svg_snapshot, element_count })).sort((a, b) => a.id.localeCompare(b.id));
    const assetIds = (assets: WriteupAsset[]) => assets.map(asset => asset.id).sort();
    const citationContent = (citations: WriteupCitation[]) => citations.map(({ id, board_id, anchor_id, board_element_id, heading_path, line_start, line_end, quoted_text, color, note }) => ({ id, board_id, anchor_id, board_element_id, heading_path, line_start, line_end, quoted_text, color, note })).sort((a, b) => a.id.localeCompare(b.id));
    return [metadataChanged && 'Datos del informe', JSON.stringify(snapshot.findings) !== JSON.stringify(findings) && 'Hallazgos', JSON.stringify(boardContent(snapshot.boards)) !== JSON.stringify(boardContent(detail.boards)) && 'Pizarras', JSON.stringify(citationContent(snapshot.citations)) !== JSON.stringify(citationContent(detail.citations)) && 'Citas', snapshot.assets && JSON.stringify(assetIds(snapshot.assets)) !== JSON.stringify(assetIds(detail.assets)) && 'Evidencias'].filter(Boolean) as string[];
  }, [diffRevision, detail, title, statusVal, severity, cvssScore, cvssVector, cweId, cveId, targetScope, prospectId, projectId, execSummary, findings]);

  useEffect(() => {
    const lease = activeEditLeaseRef.current;
    if (!detail?.id || !lease || lease.writeupId !== detail.id) return;
    const timer = window.setInterval(async () => {
      try {
        const renewed = await api.renewWriteupEditLease(lease.writeupId, lease.clientId);
        if (activeEditLeaseRef.current?.writeupId !== lease.writeupId) return;
        activeEditLeaseRef.current = { ...lease, expiresAt: renewed.expires_at };
        setEditLockState({ kind: 'owned', expiresAt: renewed.expires_at });
      } catch (error) {
        if (activeEditLeaseRef.current?.writeupId !== lease.writeupId) return;
        activeEditLeaseRef.current = null;
        clearWriteupEditLease(lease.writeupId);
        const message = error instanceof Error ? error.message : 'Se perdió la reserva de edición.';
        setEditLockState({ kind: error instanceof ApiError && error.status === 423 ? 'blocked' : 'unavailable', message });
        showToast('Se perdió la reserva de edición. El borrador cifrado local se conserva; ya no se enviarán cambios hasta recuperar el acceso.', 'warning');
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [detail?.id, editLockState?.kind, showToast]);

  useEffect(() => () => {
    const lease = activeEditLeaseRef.current;
    if (lease) void api.releaseWriteupEditLease(lease.writeupId);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(assetUrlsRef.current).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  useEffect(() => {
    if (isUnlocked) return;
    const activeLease = activeEditLeaseRef.current;
    if (activeLease) void api.releaseWriteupEditLease(activeLease.writeupId);
    activeEditLeaseRef.current = null;
    setEditLockState(null);
    // Locking must not treat a pending local copy as a successfully saved draft.
    draftWriteGeneration.current += 1;
    listRequestVersion.current += 1;
    detailRequestVersion.current += 1;
    revisionRequestVersion.current += 1;
    selectedIdRef.current = null;
    clearAssetUrlCache();
    setItems([]);
    setSelectedId(null);
    setDetail(null);
    setRevisions([]);
    setRecoveryCandidates([]);
    setShowRecovery(false);
    setNewRecoveryCopyAvailable(false);
    setSaveConflict(false);
    setConflictServer(null);
    setShowConflict(false);
    setProspects([]);
    setProjects([]);
    setAssetUrls({});
    setFailedAssetIds({});
    setActiveBoardId(null);
    editorDirtyRef.current = false;
    boardRecoveryDraftsRef.current = {};
    unsavedBoardIdsRef.current = {};
    boardEditRevisionsRef.current = {};
    setBoardRecoveryDrafts({});
    setUnsavedBoardIds({});
    setTitle('');
    setStatusVal('borrador');
    setSeverity('media');
    setCvssScore('');
    setCvssVector('');
    setCweId('');
    setCveId('');
    setTargetScope('');
    setExecSummary('');
    setMarkdown('');
    setFindings([]);
    setProspectId('');
    setProjectId('');
    setDirty(false);
    setLocalDraftSavedAt(null);
    setLocalDraftError(false);
    setLoadingList(false);
    setLoadingMore(false);
    setLoadingDetail(false);
    setCreatingWriteup(false);
    setListError('');
    setDetailError('');
    setLoadMoreError('');
    setTotal(0);
    setHasMore(false);
    setShowExportModal(false);
    setLightboxAsset(null);
    setDiffRevision(null);
    setShowRevisionHistory(false);
    setRevisions([]);
    setRevisionDetails({});
  }, [isUnlocked, clearAssetUrlCache]);

  const hydrateDraft = (data: WriteupDetail) => {
    writeupVersionByReportRef.current[data.id] = data.updated_at;
    setDetail(data);
    setTitle(data.title);
    setStatusVal(data.status);
    setSeverity(data.severity);
    setCvssScore(data.cvss_score !== null && data.cvss_score !== undefined ? String(data.cvss_score) : '');
    setCvssVector(data.cvss_vector || '');
    setCweId(data.cwe_id || '');
    setCveId(data.cve_id || '');
    setTargetScope(data.target_scope || '');
    setExecSummary(data.executive_summary || '');
    setMarkdown(data.markdown_content || '');
    setFindings(data.findings || []);
    setProspectId(data.prospect_id || '');
    setProjectId(data.project_id || '');
    setActiveBoardId((curr) =>
      data.boards.some((b) => b.id === curr) ? curr : (data.boards[0]?.id || null),
    );
    editorDirtyRef.current = false;
    setDirty(false);
    setSaveConflict(false);
    setConflictServer(null);
    setShowConflict(false);
  };

  const applyRecoveryDraft = (draft: RecoveryDraft, server: WriteupDetail, sourceKey: string) => {
    recoveredSourceRef.current = sourceKey;
    const contentChanged = draft.title !== server.title || draft.status !== server.status || draft.severity !== server.severity ||
      draft.cvssScore !== (server.cvss_score === null || server.cvss_score === undefined ? '' : String(server.cvss_score)) ||
      draft.cvssVector !== (server.cvss_vector || '') || draft.cweId !== (server.cwe_id || '') || draft.cveId !== (server.cve_id || '') ||
      draft.targetScope !== (server.target_scope || '') || draft.executiveSummary !== (server.executive_summary || '') ||
      draft.markdown !== (server.markdown_content || '') || JSON.stringify(draft.findings) !== JSON.stringify(server.findings || []) ||
      draft.prospectId !== (server.prospect_id || '') || draft.projectId !== (server.project_id || '') || (draft.boardDrafts?.length || 0) > 0;
    setTitle(draft.title); setStatusVal(draft.status); setSeverity(draft.severity);
    setCvssScore(draft.cvssScore); setCvssVector(draft.cvssVector); setCweId(draft.cweId); setCveId(draft.cveId);
    setTargetScope(draft.targetScope); setExecSummary(draft.executiveSummary); setMarkdown(draft.markdown);
    setFindings(draft.findings); setProspectId(draft.prospectId); setProjectId(draft.projectId);
    const recoveredBoards = Object.fromEntries((draft.boardDrafts || []).map(board => [board.boardId, board]));
    const recoveredBoardIds = Object.fromEntries((draft.boardDrafts || []).map(board => [board.boardId, true as const]));
    boardRecoveryDraftsRef.current = recoveredBoards;
    unsavedBoardIdsRef.current = recoveredBoardIds;
    boardEditRevisionsRef.current = Object.fromEntries((draft.boardDrafts || []).map(board => [board.boardId, board.sceneGeneration]));
    setBoardRecoveryDrafts(recoveredBoards);
    setUnsavedBoardIds(recoveredBoardIds);
    if (draft.workspaceMode) {
      workspaceModeManuallySelectedRef.current = true;
      setMode(draft.workspaceMode);
    }
    if (draft.activeBoardId && server.boards.some(board => board.id === draft.activeBoardId)) setActiveBoardId(draft.activeBoardId);
    if (draft.editorSession) editorSessionRef.current[server.id] = draft.editorSession;
    if (contentChanged) draftVersion.current += 1;
    editorDirtyRef.current = contentChanged;
    if (contentChanged) setEditVersion(draftVersion.current);
    setDirty(contentChanged);
    setShowRecovery(false);
    if (contentChanged && draft.baseUpdatedAt !== server.updated_at) {
      setSaveConflict(true);
      setConflictServer(server);
      setSaveError('El informe cambió en otra sesión. Tus cambios siguen aquí; compáralos antes de continuar.');
      setShowConflict(true);
    }
  };

  const restoreRecoveryCandidate = (candidate: RecoveryCandidate) => {
    if (isWriteupEditingBlocked || !detail) {
      showToast('Este writeup está en solo lectura. Desbloquéalo o espera a que termine la reserva de edición para restaurar el borrador.', 'warning');
      return;
    }
    const draft = candidate.draft;
    applyRecoveryDraft(draft, detail, candidate.storageKey);
  };

  const discoverRecoveryCopies = useCallback(async (id: string, server: WriteupDetail): Promise<RecoveryCandidate[]> => {
    if (!draftRecoveryKey) return [];
    const copies = listDraftCopies(id);
    const candidates: RecoveryCandidate[] = [];
    const lockedCopies: typeof copies = [];
    for (const copy of copies) {
      try {
        const draft = await readDraft<unknown>(draftRecoveryKey, copy);
        if (isRecoveryDraft(draft)) candidates.push({ storageKey: copy.storageKey, legacy: copy.legacy, draft });
      } catch { lockedCopies.push(copy); }
    }
    let unreadableCount = lockedCopies.length;
    if (lockedCopies.length) {
      const oldPassword = await prompt({
        title: 'Abrir copias locales cifradas',
        message: 'Algunas copias no se abrieron con la contraseña actual. Si cambiaste la contraseña de la bóveda, escribe la anterior para intentar recuperar todas las copias que coincidan. Cancelar conserva las copias.',
        inputType: 'password', confirmLabel: 'Intentar recuperar', cancelLabel: 'Conservar copias', maxLength: 512,
      });
      if (oldPassword) {
        const oldKey = await deriveDraftKey(oldPassword);
        let recoveredOldCopies = 0;
        for (const copy of lockedCopies) {
          try {
            const draft = await readDraft<unknown>(oldKey, copy);
            if (isRecoveryDraft(draft)) {
              candidates.push({ storageKey: copy.storageKey, legacy: copy.legacy, draft });
              recoveredOldCopies += 1;
            }
          } catch { /* Keep unreadable copies intact for a later attempt. */ }
        }
        unreadableCount -= recoveredOldCopies;
      }
    }
    const needsRecovery: RecoveryCandidate[] = [];
    for (const candidate of candidates) {
      // A matching server version is already backed up. Cleanup is safe only
      // because the complete editable payload matches the acknowledged record.
      if (recoveryDraftMatchesServer(candidate.draft, server) && removeDraft(candidate.storageKey)) continue;
      needsRecovery.push(candidate);
    }
    if (unreadableCount > 0) {
      showToast(`${unreadableCount} copia(s) cifrada(s) no se pudo abrir. Se conservaron para intentarlo después.`, 'warning');
    }
    return needsRecovery;
  }, [draftRecoveryKey, prompt, showToast]);

  const refreshRecoveryCopies = async () => {
    if (!detail) return;
    const id = detail.id;
    const version = detailRequestVersion.current;
    try {
      const discovered = await discoverRecoveryCopies(id, detail);
      if (version !== detailRequestVersion.current || selectedIdRef.current !== id) return;
      setRecoveryCandidates(current => {
        const byKey = new Map(current.map(candidate => [candidate.storageKey, candidate]));
        discovered.forEach(candidate => byKey.set(candidate.storageKey, candidate));
        return [...byKey.values()].sort((a, b) => (b.draft.savedAt || '').localeCompare(a.draft.savedAt || ''));
      });
      setNewRecoveryCopyAvailable(false);
      if (discovered.length) setShowRecovery(true);
      else showToast('No se encontraron otras copias locales recuperables.', 'info');
    } catch {
      showToast('No se pudieron revisar las copias locales. Se conservaron sin cambios.', 'warning');
    }
  };

  const updateWriteupVersion = async (id: string, updatedAt?: string | null) => {
    let version = updatedAt || undefined;
    if (!version) {
      try { version = (await api.getWriteup(id)).updated_at; }
      catch { /* The next write will still be guarded by the server. */ }
    }
    if (version) {
      writeupVersionByReportRef.current[id] = version;
      setDetail(current => current?.id === id ? { ...current, updated_at: version! } : current);
    }
    return version;
  };

  const surfaceResourceConflict = async (id: string, err: unknown) => {
    if (!(err instanceof ApiError) || err.status !== 409) return false;
    const message = 'El informe cambió en otra sesión. Revisa la versión del servidor y vuelve a intentar.';
    setSaveConflict(true);
    setSaveError(message);
    if (selectedIdRef.current === id) {
      try {
        const latest = await api.getWriteup(id);
        writeupVersionByReportRef.current[id] = latest.updated_at;
        setConflictServer(latest);
      }
      catch { setConflictServer(null); }
      setShowConflict(true);
    }
    showToast(message, 'warning');
    return true;
  };

  const preloadAssetUrls = useCallback(async (writeup: WriteupDetail, requestVersion: number) => {
    if (!isUnlocked || requestVersion !== detailRequestVersion.current) return;
    const nextMap: Record<string, string> = { ...assetUrlsRef.current };
    const nextErrors: Record<string, boolean> = {};
    const createdUrls: string[] = [];
    for (const asset of writeup.assets) {
      if (nextMap[asset.id]) continue;
      try {
        const blob = await api.fetchWriteupAssetBlob(writeup.id, asset.id);
        if (!isUnlocked || requestVersion !== detailRequestVersion.current) {
          createdUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        const url = URL.createObjectURL(blob);
        createdUrls.push(url);
        nextMap[asset.id] = url;
      } catch {
        nextErrors[asset.id] = true;
      }
    }
    if (!isUnlocked || requestVersion !== detailRequestVersion.current) {
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
      return;
    }
    assetUrlsRef.current = nextMap;
    setAssetUrls(nextMap);
    setFailedAssetIds((prev) => {
      const updated = { ...prev };
      for (const asset of writeup.assets) {
        if (nextMap[asset.id]) {
          delete updated[asset.id];
        } else if (nextErrors[asset.id]) {
          updated[asset.id] = true;
        }
      }
      return updated;
    });
  }, [isUnlocked]);

  useEffect(() => {
    if (detail && diffRevision?.snapshot?.assets) {
      void preloadAssetUrls({ ...detail, assets: diffRevision.snapshot.assets }, detailRequestVersion.current);
    }
  }, [detail, diffRevision, preloadAssetUrls]);

  const loadList = useCallback(async () => {
    if (!isUnlocked) return;
    const version = ++listRequestVersion.current;
    nextListOffset.current = 0;
    setLoadingList(true);
    setLoadingMore(false);
    setItems([]);
    setTotal(0);
    setHasMore(false);
    setListError('');
    setLoadMoreError('');
    try {
      const [page, pros, projs] = await Promise.all([
        api.listWriteupsPage({
          q: debouncedSearchQuery.trim() || undefined,
          severity: severityFilter || undefined,
          limit: 50,
          offset: 0,
        }),
        api.getProspects().catch(() => [] as Prospect[]),
        api.getProjects().catch(() => [] as InternalProject[]),
      ]);
      if (version !== listRequestVersion.current) return;
      setItems(page.items);
      setTotal(page.total);
      setHasMore(page.hasMore);
      nextListOffset.current = page.items.length;
      setProspects(pros);
      setProjects(projs);
      if (!selectedIdRef.current && page.items.length > 0) {
        setSelectedId(page.items[0].id);
      }
    } catch (err) {
      if (version === listRequestVersion.current) {
        setListError(err instanceof Error ? err.message : 'Error al cargar los informes');
      }
    } finally {
      if (version === listRequestVersion.current) setLoadingList(false);
    }
  }, [isUnlocked, debouncedSearchQuery, severityFilter]);

  const handleLoadMore = async () => {
    if (!isUnlocked || loadingMore || !hasMore) return;
    const version = listRequestVersion.current;
    setLoadingMore(true);
    setLoadMoreError('');
    try {
      const page = await api.listWriteupsPage({
        q: debouncedSearchQuery.trim() || undefined,
        severity: severityFilter || undefined,
        limit: 50,
        offset: nextListOffset.current,
      });
      if (version !== listRequestVersion.current) return;
      nextListOffset.current += page.items.length;
      setItems((current) => {
        const knownIds = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !knownIds.has(item.id))];
      });
      setTotal(page.total);
      setHasMore(page.hasMore);
    } catch (err) {
      if (version === listRequestVersion.current) {
        setLoadMoreError(err instanceof Error ? err.message : 'No se pudieron cargar más informes.');
      }
    } finally {
      if (version === listRequestVersion.current) setLoadingMore(false);
    }
  };

  const acquireEditLease = useCallback(async (id: string) => {
    const pending = pendingEditLeaseRef.current[id];
    if (pending) return pending;
    const clientId = editClientIdRef.current;
    if (!clientId) return false;
    const request = (async () => {
      if (selectedIdRef.current === id) setEditLockState({ kind: 'acquiring' });
      try {
        const lease = await api.acquireWriteupEditLease(id, clientId);
        if (selectedIdRef.current !== id) {
          await api.releaseWriteupEditLease(id);
          return false;
        }
        activeEditLeaseRef.current = { writeupId: id, clientId, expiresAt: lease.expires_at };
        setEditLockState({ kind: 'owned', expiresAt: lease.expires_at });
        return true;
      } catch (error) {
        clearWriteupEditLease(id);
        if (activeEditLeaseRef.current?.writeupId === id) activeEditLeaseRef.current = null;
        if (selectedIdRef.current === id) {
          const message = error instanceof Error ? error.message : 'No se pudo reservar este writeup para edición.';
          setEditLockState({ kind: error instanceof ApiError && error.status === 423 ? 'blocked' : 'unavailable', message });
        }
        return false;
      }
    })();
    pendingEditLeaseRef.current[id] = request;
    try {
      return await request;
    } finally {
      if (pendingEditLeaseRef.current[id] === request) delete pendingEditLeaseRef.current[id];
    }
  }, []);

  const releaseEditLease = useCallback(async (id: string) => {
    if (activeEditLeaseRef.current?.writeupId !== id) return;
    try {
      await api.releaseWriteupEditLease(id);
    } catch {
      clearWriteupEditLease(id);
      if (selectedIdRef.current === id) showToast('La reserva no se pudo liberar ahora; vencerá automáticamente en 90 segundos.', 'warning');
    } finally {
      if (activeEditLeaseRef.current?.writeupId === id) activeEditLeaseRef.current = null;
    }
  }, [showToast]);

  const handleToggleManualLock = async () => {
    if (!detail || editLockState?.kind === 'acquiring') return;
    const writeupId = detail.id;
    try {
      if (detail.manual_locked || editLockState?.kind === 'manual') {
        await api.clearWriteupManualLock(writeupId);
        if (selectedIdRef.current !== writeupId) return;
        setDetail((current) => current?.id === writeupId ? {
          ...current,
          manual_locked: false,
          manual_locked_by: null,
          manual_locked_at: null,
        } : current);
        setEditLockState({ kind: 'acquiring' });
        if (await acquireEditLease(writeupId)) {
          if (selectedIdRef.current === writeupId) showToast('Edición desbloqueada y reservada para esta sesión', 'success');
        } else if (selectedIdRef.current === writeupId) {
          showToast('Se quitó el bloqueo, pero no se pudo reservar la edición. Reintenta antes de cambiar el informe.', 'warning');
        }
        return;
      }

      const result = await api.setWriteupManualLock(writeupId);
      if (activeEditLeaseRef.current?.writeupId === writeupId) activeEditLeaseRef.current = null;
      clearWriteupEditLease(writeupId);
      if (selectedIdRef.current !== writeupId) return;
      setDetail((current) => current?.id === writeupId ? {
        ...current,
        manual_locked: true,
        manual_locked_by: result.manual_locked_by,
        manual_locked_at: result.manual_locked_at,
      } : current);
      setEditLockState({ kind: 'manual' });
      showToast('Edición bloqueada. La lectura y exportación siguen disponibles.', 'success');
    } catch (error) {
      if (selectedIdRef.current === writeupId) showToast(error instanceof Error ? error.message : 'No se pudo cambiar el bloqueo del informe.', 'error');
    }
  };

  const loadDetail = useCallback(async (id: string) => {
    if (!isUnlocked) return;
    const version = ++detailRequestVersion.current;
    recoveredSourceRef.current = null;
    setRecoveryCandidates([]);
    setShowRecovery(false);
    setNewRecoveryCopyAvailable(false);
    setLocalDraftSavedAt(null);
    setLocalDraftError(false);
    setEditLockState({ kind: 'acquiring' });
    lastAutoRevision.current = 0;
    setLastSavedAt(null);
    setSaveError('');
    setLoadingDetail(true);
    setDetailError('');
    try {
      const data = await api.getWriteup(id);
      if (version !== detailRequestVersion.current) return;
      hydrateDraft(data);
      const leaseOwned = data.manual_locked
        ? (setEditLockState({ kind: 'manual' }), false)
        : await acquireEditLease(id);
      if (version !== detailRequestVersion.current || selectedIdRef.current !== id) return;
      if (draftRecoveryKey) {
        try {
          const needsRecovery = await discoverRecoveryCopies(id, data);
          if (version !== detailRequestVersion.current || selectedIdRef.current !== id) return;
          const currentTabCopy = draftStorageKey(id);
          const resumable = leaseOwned
            ? needsRecovery.find(candidate => candidate.storageKey === currentTabCopy && candidate.draft.baseUpdatedAt === data.updated_at)
            : undefined;
          if (resumable) {
            applyRecoveryDraft(resumable.draft, data, resumable.storageKey);
          }
          const remainingRecovery = resumable
            ? needsRecovery.filter(candidate => candidate.storageKey !== resumable.storageKey)
            : needsRecovery;
          if (remainingRecovery.length) {
            setRecoveryCandidates(remainingRecovery.sort((a, b) => (b.draft.savedAt || '').localeCompare(a.draft.savedAt || '')));
            setShowRecovery(true);
          }
        } catch {
          showToast('No se pudieron revisar las copias cifradas. Se conservaron sin cambios.', 'warning');
        }
      }
      try {
        const revs = await api.listWriteupRevisions(id, { limit: 40, include_content: false });
        if (version !== detailRequestVersion.current) return;
        setRevisions(revs);
        setRevisionEnd(revs.length < 40);
        revisionCursor.current = revs.length ? revs[revs.length - 1].revision_number : null;
      } catch {
        if (version === detailRequestVersion.current) setRevisions([]);
      }
      void preloadAssetUrls(data, version);
    } catch (err) {
      if (version === detailRequestVersion.current) {
        setDetail(null);
        setRevisions([]);
        setDetailError(err instanceof Error ? err.message : 'No se pudo cargar el informe.');
      }
    } finally {
      if (version === detailRequestVersion.current) setLoadingDetail(false);
    }
  }, [isUnlocked, preloadAssetUrls, draftRecoveryKey, discoverRecoveryCopies, acquireEditLease]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId && isUnlocked) {
      void loadDetail(selectedId);
    }
  }, [selectedId, isUnlocked, loadDetail]);

  const persistDraftBeforeNavigation = async (nextAction: string) => {
    const pendingBoardCount = Object.keys(unsavedBoardIdsRef.current).length;
    if (!detail || !draftRecoveryKey || !isUnlocked) {
      showToast(`No se puede conservar el borrador antes de que ${nextAction}; vuelve a desbloquear la bóveda e inténtalo de nuevo.`, 'warning');
      return false;
    }
    if (pendingBoardCount) await new Promise<void>(resolve => window.setTimeout(resolve, 400));
    const reportId = detail.id;
    const sourceVersion = draftVersion.current;
    const boardSnapshot = JSON.stringify(boardRecoveryDraftsRef.current);
    const editorSessionSnapshot = JSON.stringify(editorSessionRef.current[reportId] ?? null);
    const storageKey = draftStorageKey(reportId);
    const draft: RecoveryDraft = {
      baseUpdatedAt: detail.updated_at,
      savedAt: new Date().toISOString(),
      title,
      status: statusVal,
      severity,
      cvssScore,
      cvssVector,
      cweId,
      cveId,
      targetScope,
      executiveSummary: execSummary,
      markdown,
      findings,
      prospectId,
      projectId,
      boardDrafts: Object.values(boardRecoveryDraftsRef.current),
      workspaceMode: mode,
      activeBoardId,
      editorSession: editorSessionRef.current[reportId],
    };
    const generation = ++draftWriteGeneration.current;
    try {
      const ciphertext = await encryptDraft(draftRecoveryKey, storageKey, draft);
      if (generation !== draftWriteGeneration.current || selectedIdRef.current !== reportId || sourceVersion !== draftVersion.current || boardSnapshot !== JSON.stringify(boardRecoveryDraftsRef.current) || editorSessionSnapshot !== JSON.stringify(editorSessionRef.current[reportId] ?? null)) {
        showToast(`El borrador cambió mientras ${nextAction}; vuelve a intentarlo para asegurar la copia más reciente.`, 'warning');
        return false;
      }
      storeEncryptedDraft(storageKey, ciphertext);
      recoveredSourceRef.current = storageKey;
      localDraftPersistPromiseRef.current = Promise.resolve(true);
      setLocalDraftSavedAt(new Date());
      setLocalDraftError(false);
    } catch {
      setLocalDraftError(true);
      showToast(`No se pudo confirmar la copia cifrada antes de que ${nextAction}. El informe permanece abierto para no perder cambios.`, 'error');
      return false;
    }
    editorDirtyRef.current = false;
    setDirty(false);
    clearInMemoryBoardDrafts();
    return true;
  };

  const handleSelectWriteup = async (id: string) => {
    if (id === selectedIdRef.current) {
      if (typeof window !== 'undefined' && window.innerWidth < 1280) setShowList(false);
      return;
    }
    if (selectionInProgressRef.current) return;
    selectionInProgressRef.current = true;
    try {
      const previousId = selectedIdRef.current;
      if (!(await persistDraftBeforeNavigation('cambies de informe'))) return;
      if (previousId) await releaseEditLease(previousId);
      detailRequestVersion.current += 1;
      clearAssetUrlCache();
      selectedIdRef.current = id;
      setSelectedId(id);
      setDetail(null);
      setEditLockState({ kind: 'acquiring' });
      setRevisions([]);
      setDetailError('');
      editorDirtyRef.current = false;
      setDirty(false);
      if (typeof window !== 'undefined' && window.innerWidth < 1280) setShowList(false);
    } finally {
      selectionInProgressRef.current = false;
    }
  };

  const handleCreateWriteup = async () => {
    if (creationInProgressRef.current) return;
    creationInProgressRef.current = true;
    try {
      const newTitle = await prompt({
        title: 'Nuevo informe de seguridad',
        message: 'Escribe el título del informe.',
        confirmLabel: 'Crear',
        required: true,
        maxLength: MAX_REPORT_TITLE_LENGTH,
      });
      if (newTitle === null) return;
      const cleanTitle = newTitle.trim();
      if (cleanTitle.length < 2) {
        showToast('El título debe tener al menos 2 caracteres.', 'warning');
        return;
      }
      if (cleanTitle.length > MAX_REPORT_TITLE_LENGTH) {
        showToast(`El título no puede superar ${MAX_REPORT_TITLE_LENGTH} caracteres.`, 'warning');
        return;
      }
      const previousId = selectedIdRef.current;
      if (!(await persistDraftBeforeNavigation('crees un informe')) || !isUnlocked) return;
      if (previousId) await releaseEditLease(previousId);
      setCreatingWriteup(true);
      const created = await api.createWriteup({
        title: cleanTitle,
        severity: 'media',
        status: 'borrador',
        markdown_content: `# ${cleanTitle} {#intro}\n\n## Resumen de hallazgos\nDescribe el contexto de la prueba autorizada aquí.\n`,
      });
      detailRequestVersion.current += 1;
      selectedIdRef.current = created.id;
      setSelectedId(created.id);
      setEditLockState({ kind: 'acquiring' });
      clearAssetUrlCache();
      hydrateDraft(created);
      await loadList();
      if (typeof window !== 'undefined' && window.innerWidth < 1280) {
        setShowList(false);
      }
      showToast('Informe creado con una pizarra', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo crear el informe', 'error');
    } finally {
      creationInProgressRef.current = false;
      setCreatingWriteup(false);
    }
  };

  const handleCreateFromC2Session = async () => {
    if (creationInProgressRef.current) return;
    creationInProgressRef.current = true;
    try {
      const targetLabel = c2PortIp || c2Hosts[0]?.ip || c2Gateway?.ip || c2Iface || 'Red Lab';
      const defaultTitle = `Auditoría C2 - ${targetLabel}`;
      const newTitle = await prompt({
        title: 'Importar sesión C2 a informe',
        message: `Se generará un borrador con ${c2Hosts.length} host(s), ${c2Ports.length} puerto(s) y ${c2Creds.length} credencial(es) capturadas en esta sesión.`,
        defaultValue: defaultTitle,
        confirmLabel: 'Importar borrador',
        required: true,
        maxLength: MAX_REPORT_TITLE_LENGTH,
      });
      if (newTitle === null) return;
      const cleanTitle = newTitle.trim();
      if (cleanTitle.length < 2) {
        showToast('El título debe tener al menos 2 caracteres.', 'warning');
        return;
      }
      const previousId = selectedIdRef.current;
      if (!(await persistDraftBeforeNavigation('importes la sesión C2')) || !isUnlocked) return;
      if (previousId) await releaseEditLease(previousId);

      const sections: string[] = [
        `# ${cleanTitle} {#c2-resumen}`,
        '',
        '## Alcance y entorno {#alcance}',
        `- **Interfaz:** \`${c2Iface || 'N/A'}\``,
        `- **Gateway:** \`${c2Gateway?.ip || 'N/A'}\``,
        `- **Objetivo principal:** \`${c2PortIp || c2Hosts[0]?.ip || 'Por definir'}\``,
        `- **Modo:** ${c2DemoMode ? 'Laboratorio simulado (Demo)' : 'Operación real'}`,
      ];

      if (c2Hosts.length > 0) {
        sections.push('', '## Hosts descubiertos {#hosts}', '| IP | MAC | Fabricante | SO estimado |', '| --- | --- | --- | --- |');
        for (const h of c2Hosts.slice(0, 40)) {
          const osInfo = c2HostOsMap[h.ip]?.os || h.os || '-';
          sections.push(`| ${h.ip} | ${h.mac} | ${h.vendor || '-'} | ${osInfo} |`);
        }
      }

      if (c2Ports.length > 0) {
        sections.push('', `## Puertos abiertos (${c2PortIp || 'objetivo'}) {#puertos}`, '| Puerto | Servicio | Banner / Versión |', '| --- | --- | --- |');
        for (const p of c2Ports.slice(0, 50)) {
          sections.push(`| ${p.port} | ${p.service || '-'} | ${(p.banner || '-').replace(/\|/g, '/')} |`);
        }
      }

      if (c2Exploits.length > 0) {
        sections.push('', '## Coincidencias Exploit-DB / Searchsploit {#exploits}');
        for (const svc of c2Exploits) {
          sections.push(`- **Puerto ${svc.port} (${svc.service}):** ${svc.exploits.map((e) => e.title).join('; ') || 'Sin coincidencias'}`);
        }
      }

      if (c2Creds.length > 0) {
        sections.push('', '## Credenciales observadas {#credenciales}', `- Total capturado en búfer: ${c2Creds.length} registro(s). Sanitiza antes de entregar.`);
        for (const c of c2Creds.slice(0, 20)) {
          sections.push(`- \`${c.proto}\` (${c.src} -> ${c.dst}): \`${c.data}\``);
        }
      }

      if (c2Cameras.length > 0 || c2CameraFindings.length > 0) {
        sections.push('', '## Cámaras y dispositivos IP {#camaras}');
        sections.push(`- Descubiertas: ${c2Cameras.length} | Hallazgos de auditoría: ${c2CameraFindings.length}`);
      }

      if (c2WifiAps.length > 0) {
        sections.push('', '## Puntos de acceso Wi-Fi observados {#wifi}');
        sections.push(`- Total SSIDs/BSSIDs detectados: ${c2WifiAps.length}`);
      }

      if (c2Hosts.length === 0 && c2Ports.length === 0 && c2Creds.length === 0 && c2CameraFindings.length === 0) {
        sections.push('', '## Notas de laboratorio {#notas}', 'Aún no había escaneos activos en memoria. Ejecuta Reconocimiento o Escaneo de puertos en Red y Lab (C2) y documenta tus hallazgos aquí.');
      }

      const structuredFindings: WriteupStructuredFinding[] = [];
      for (const f of c2CameraFindings.slice(0, 25)) {
        const sevMap: Record<string, WriteupSeverity> = {
          critical: 'critica',
          high: 'alta',
          medium: 'media',
          low: 'baja',
          info: 'informativa',
        };
        structuredFindings.push({
          id: `c2-cam-${structuredFindings.length + 1}`,
          title: f.title || `Hallazgo ${f.module}`,
          severity: sevMap[(f.severity || '').toLowerCase()] || 'media',
          affected_target: c2Cameras[0]?.ip || targetLabel,
          status: 'abierta',
          summary: f.detail || f.title || 'Hallazgo de auditoría de cámara IP.',
          remediation: 'Restringir acceso de red, cambiar credenciales por defecto y deshabilitar servicios innecesarios.',
        });
      }
      for (const svc of c2Exploits) {
        if (svc.exploits.length > 0 && structuredFindings.length < 30) {
          structuredFindings.push({
            id: `c2-exp-${svc.port}-${structuredFindings.length + 1}`,
            title: `Superficie conocida en puerto ${svc.port}/${svc.service}`,
            severity: 'alta',
            affected_target: c2PortIp || targetLabel,
            status: 'abierta',
            summary: `Se detectaron ${svc.exploits.length} referencia(s) pública(s) para ${svc.banner || svc.service}.`,
            remediation: 'Actualizar servicio a versión parcheada o limitar exposición por firewall.',
          });
        }
      }

      const maxSev: WriteupSeverity = structuredFindings.some((f) => f.severity === 'critica')
        ? 'critica'
        : structuredFindings.some((f) => f.severity === 'alta')
        ? 'alta'
        : c2Creds.length > 0 || structuredFindings.length > 0
        ? 'media'
        : 'informativa';

      setCreatingWriteup(true);
      const created = await api.createWriteup({
        title: cleanTitle,
        severity: maxSev,
        status: 'borrador',
        target_scope: targetLabel,
        tags: ['c2-import', ...(c2DemoMode ? ['lab-demo'] : ['pentest'])],
        markdown_content: `${sections.join('\n')}\n`,
        executive_summary: `Borrador generado desde la sesión C2 (${c2Hosts.length} hosts, ${c2Ports.length} puertos, ${structuredFindings.length} hallazgos).`,
        findings: structuredFindings,
      });
      detailRequestVersion.current += 1;
      selectedIdRef.current = created.id;
      setSelectedId(created.id);
      setEditLockState({ kind: 'acquiring' });
      clearAssetUrlCache();
      hydrateDraft(created);
      await loadList();
      if (typeof window !== 'undefined' && window.innerWidth < 1280) {
        setShowList(false);
      }
      showToast('Sesión C2 importada en un nuevo borrador de informe', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo importar la sesión C2', 'error');
    } finally {
      creationInProgressRef.current = false;
      setCreatingWriteup(false);
    }
  };

  const handleSaveWriteup = async (
    saveRevision = false,
    markdownOverride?: string,
    automatic = false,
    expectedUpdatedAtOverride?: string,
    revisionNoteOverride?: string,
    revisionTypeOverride?: WriteupRevision['change_type'],
  ) => {
    if (!detail || saveInFlight.current) return false;
    if (isWriteupEditingBlocked) {
      if (!automatic) showToast('La edición está bloqueada en esta sesión. Tus cambios locales siguen guardados.', 'warning');
      return false;
    }
    if (saveConflict) { setShowConflict(true); return false; }
    const savedVersion = draftVersion.current;
    const reportValidationError = (message: string) => {
      setSaveError(message);
      if (!automatic) showToast(message, 'warning');
    };
    const cleanTitle = title.trim();
    if (cleanTitle.length < 2) {
      reportValidationError('El título debe tener al menos 2 caracteres.');
      return false;
    }
    if (cleanTitle.length > MAX_REPORT_TITLE_LENGTH) {
      reportValidationError(`El título no puede superar ${MAX_REPORT_TITLE_LENGTH} caracteres.`);
      return false;
    }

    const parsedCvss = cvssScore.trim() ? Number(cvssScore) : null;
    if (parsedCvss !== null && (!Number.isFinite(parsedCvss) || parsedCvss < 0 || parsedCvss > 10)) {
      reportValidationError('El puntaje CVSS debe estar entre 0 y 10.');
      return false;
    }
    if (findings.length > MAX_FINDINGS_COUNT) {
      reportValidationError(`Un informe puede tener hasta ${MAX_FINDINGS_COUNT} hallazgos.`);
      return false;
    }
    if (
      (markdownOverride ?? markdown).length > MAX_REPORT_TEXT_LENGTH ||
      execSummary.length > 25000 || cweId.length > 32 || cveId.length > 64 || targetScope.length > 500 ||
      findings.some((finding) =>
        finding.id.length > 64 || finding.title.length > 200 ||
        finding.summary.length > 4000 || finding.remediation.length > 4000 ||
        (finding.cvss_vector || '').length > 128 || (finding.cwe_id || '').length > 32 ||
        (finding.cve_id || '').length > 64 || (finding.affected_target || '').length > 255
      )
    ) {
      reportValidationError('Uno o más campos superan el límite permitido. Acorta el texto antes de guardar.');
      return false;
    }
    const invalidFinding = findings.find((finding) =>
      !finding.id.trim() || !finding.title.trim() ||
      (finding.cvss_score != null && (!Number.isFinite(finding.cvss_score) || finding.cvss_score < 0 || finding.cvss_score > 10))
    );
    if (invalidFinding) {
      reportValidationError('Revisa el identificador, el título y el puntaje de cada hallazgo.');
      return false;
    }
    saveInFlight.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const updated = await api.updateWriteup(detail.id, {
        title: cleanTitle,
        status: statusVal,
        severity,
        cvss_score: parsedCvss !== null && Number.isFinite(parsedCvss) ? parsedCvss : null,
        cvss_vector: cvssVector.trim() || null,
        cwe_id: cweId.trim() || null,
        cve_id: cveId.trim() || null,
        target_scope: targetScope.trim() || null,
        executive_summary: execSummary,
        markdown_content: markdownOverride ?? markdown,
        findings,
        prospect_id: prospectId || null,
        project_id: projectId || null,
        expected_updated_at: expectedUpdatedAtOverride || detail.updated_at,
        save_revision: saveRevision,
        revision_note: saveRevision ? (revisionNoteOverride || (automatic ? 'Guardado automático' : 'Instantánea manual del editor')) : undefined,
        revision_type: saveRevision ? (revisionTypeOverride || (automatic ? 'autosave' : 'manual')) : undefined,
      });
      writeupVersionByReportRef.current[detail.id] = updated.updated_at;
      // Keep edits made while the request was in flight.
      if (selectedIdRef.current === detail.id) {
        if (draftVersion.current === savedVersion) hydrateDraft(updated);
        else setDetail(updated);
        setLastSavedAt(new Date());
      }
      // Keep the encrypted recovery source while any board scene remains dirty.
      // Cleanup happens only when this exact editor version and every canvas
      // have been acknowledged by the server.
      if (draftVersion.current === savedVersion) removeAcknowledgedRecoveryCopies(detail.id);
      if (saveRevision) {
        if (automatic) lastAutoRevision.current = Date.now();
        try {
          const refreshedRevisions = await api.listWriteupRevisions(detail.id, { limit: 40, include_content: false });
          if (selectedIdRef.current === detail.id) {
            setRevisions(refreshedRevisions);
            setRevisionEnd(refreshedRevisions.length < 40);
            revisionCursor.current = refreshedRevisions.length ? refreshedRevisions[refreshedRevisions.length - 1].revision_number : null;
          }
        } catch {
          if (selectedIdRef.current === detail.id) showToast('El informe se guardó, pero no se pudo actualizar la lista de revisiones.', 'warning');
        }
      }
      if (!automatic) {
        await loadList();
        showToast(saveRevision ? 'Informe guardado con una revisión' : 'Cambios del informe guardados', 'success');
      }
      return true;
    } catch (err) {
      const isConflict = err instanceof ApiError && err.status === 409;
      const message = isConflict
        ? 'El informe cambió en otra sesión. Tus cambios siguen aquí; compáralos antes de continuar.'
        : err instanceof Error ? err.message : 'Error al guardar el informe';
      if (selectedIdRef.current === detail.id) {
        if (isConflict) {
          setSaveConflict(true);
          try {
            const latest = await api.getWriteup(detail.id);
            writeupVersionByReportRef.current[detail.id] = latest.updated_at;
            if (selectedIdRef.current === detail.id) setConflictServer(latest);
          } catch { /* The draft remains available even if fetching the other version fails. */ }
        }
        if (selectedIdRef.current === detail.id) {
          setSaveError(message);
          if (!automatic) showToast(message, 'error');
        }
      }
      return false;
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  const handleCreateMilestone = async () => {
    const name = await prompt({
      title: 'Nombrar versión importante',
      message: 'Usa un nombre breve que explique qué captura esta versión del writeup.',
      placeholder: 'Ej. Acceso inicial confirmado',
      confirmLabel: 'Guardar versión',
      required: true,
      maxLength: 120,
    });
    if (name === null) return;
    const cleanName = name.trim();
    if (cleanName.length < 3) {
      showToast('El nombre necesita al menos 3 caracteres.', 'warning');
      return;
    }
    await handleSaveWriteup(true, undefined, false, undefined, cleanName, 'milestone');
  };

  autoSaveRef.current = () => {
    if (dirty && !isWriteupEditingBlocked && !saveInFlight.current && !saveConflict) {
      void handleSaveWriteup(Date.now() - lastAutoRevision.current >= 60_000, undefined, true);
    }
  };

  useEffect(() => {
    if (!dirty || !detail || !isUnlocked || isWriteupEditingBlocked) return;
    const delay = window.setTimeout(() => autoSaveRef.current(), 2500);
    return () => window.clearTimeout(delay);
  }, [dirty, detail?.id, isUnlocked, isWriteupEditingBlocked, editVersion]);

  useEffect(() => {
    const pending = dirty || Object.keys(unsavedBoardIds).length > 0;
    let message = '';
    if (saveError) message = `No se pudo guardar: ${saveError}`;
    else if (saving) message = 'Guardando…';
    else if (pending) message = localDraftError ? 'Copia local no disponible' : localDraftSavedAt ? `Copia local ${localDraftSavedAt.toLocaleTimeString(systemLocale || 'es-MX', { hour: '2-digit', minute: '2-digit' })} · pendiente de sincronizar` : 'Guardando copia local cifrada…';
    else if (lastSavedAt) message = `Guardado a las ${lastSavedAt.toLocaleTimeString(systemLocale || 'es-MX', { hour: '2-digit', minute: '2-digit' })}`;
    window.dispatchEvent(new CustomEvent('writeup_saved_notice', { detail: { message, persistent: Boolean(saveError || saving || pending) } }));
  }, [dirty, unsavedBoardIds, saving, saveError, localDraftError, localDraftSavedAt, lastSavedAt, systemLocale]);

  useEffect(() => {
    if (!dirty || !detail || !isUnlocked || isWriteupEditingBlocked) return;
    const interval = window.setInterval(() => autoSaveRef.current(), 10_000);
    return () => window.clearInterval(interval);
  }, [dirty, detail?.id, isUnlocked, isWriteupEditingBlocked]);

  useEffect(() => {
    if (!dirty && Object.keys(unsavedBoardIds).length === 0) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, unsavedBoardIds]);

  const handleDeleteWriteup = async () => {
    if (!detail || isWriteupEditingBlocked) return;
    const confirmed = await confirm({
      title: 'Eliminar informe',
      message: `¿Eliminar el informe "${detail.title}"?`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      detailRequestVersion.current += 1;
      await api.deleteWriteup(detail.id, detail.updated_at);
      clearAssetUrlCache();
      setDetail(null);
      selectedIdRef.current = null;
      setSelectedId(null);
      setRevisions([]);
      setDetailError('');
      await loadList();
      showToast('Informe eliminado', 'info');
    } catch (err) {
      if (await surfaceResourceConflict(detail.id, err)) return;
      showToast(err instanceof Error ? err.message : 'Error al eliminar', 'error');
    }
  };

  const handleUploadMedia = async (
    file: File,
    convertToGif = false
  ): Promise<{ id: string; filename: string } | null> => {
    if (!detail || isWriteupEditingBlocked) return null;
    try {
      const uploaded = await api.uploadWriteupAsset(detail.id, file, undefined, convertToGif, detail.updated_at);
      await updateWriteupVersion(detail.id, uploaded.writeup_updated_at);
      const blob = await api.fetchWriteupAssetBlob(detail.id, uploaded.id);
      const objUrl = URL.createObjectURL(blob);
      assetUrlsRef.current[uploaded.id] = objUrl;
      setAssetUrls({ ...assetUrlsRef.current });
      setDetail((prev) => (prev && prev.id === detail.id ? { ...prev, updated_at: uploaded.writeup_updated_at || prev.updated_at, assets: [...prev.assets, uploaded] } : prev));
      const pct = uploaded.original_size_bytes > 0
        ? Math.max(0, Math.round((1 - uploaded.optimized_size_bytes / uploaded.original_size_bytes) * 100))
        : 0;
      const msg = uploaded.mime_type === 'image/gif'
        ? `GIF animado optimizado (${pct}% menos espacio) y protegido`
        : uploaded.mime_type.startsWith('video/')
        ? 'Video listo en Medios; se quitaron sus datos de origen'
        : `Imagen optimizada y protegida (${pct}% menos espacio)`;
      showToast(msg, 'success');
      return { id: uploaded.id, filename: uploaded.filename };
    } catch (err) {
      if (await surfaceResourceConflict(detail.id, err)) return null;
      showToast(err instanceof Error ? err.message : 'Error subiendo evidencia multimedia', 'error');
      return null;
    }
  };

  const handleConvertVideoToGif = async (assetId: string) => {
    if (!detail || isWriteupEditingBlocked) return;
    setConvertingAssetId(assetId);
    try {
      const gifAsset = await api.convertWriteupVideoToGif(detail.id, assetId, { expectedUpdatedAt: detail.updated_at });
      await updateWriteupVersion(detail.id, gifAsset.writeup_updated_at);
      const blob = await api.fetchWriteupAssetBlob(detail.id, gifAsset.id);
      const objUrl = URL.createObjectURL(blob);
      assetUrlsRef.current[gifAsset.id] = objUrl;
      setAssetUrls({ ...assetUrlsRef.current });
      setDetail((prev) => (prev && prev.id === detail.id ? { ...prev, updated_at: gifAsset.writeup_updated_at || prev.updated_at, assets: [...prev.assets, gifAsset] } : prev));
      showToast(`GIF generado: ${gifAsset.filename}`, 'success');
    } catch (err) {
      if (await surfaceResourceConflict(detail.id, err)) return;
      showToast(err instanceof Error ? err.message : 'No se pudo convertir el video a GIF', 'error');
    } finally {
      setConvertingAssetId(null);
    }
  };

  const handleSaveBoard = async (boardId: string, sceneJson: string, svgSnapshot: string, elementCount: number): Promise<boolean> => {
    if (!detail || isWriteupEditingBlocked) return false;
    const reportId = detail.id;
    const requestKey = `${reportId}:${boardId}`;
    const existing = boardSavePromisesRef.current[requestKey];
    if (existing) return existing;
    const saveRequest = (async () => {
      try {
        const updatedBoard = await api.updateWriteupBoard(reportId, boardId, {
          scene_json: sceneJson,
          svg_snapshot: svgSnapshot,
          element_count: elementCount,
          expected_updated_at: writeupVersionByReportRef.current[reportId] || detail.updated_at,
        });
        await updateWriteupVersion(reportId, updatedBoard.writeup_updated_at);
        setDetail((prev) =>
          prev?.id === reportId
            ? { ...prev, updated_at: updatedBoard.writeup_updated_at || prev.updated_at, boards: prev.boards.map((b) => (b.id === boardId ? updatedBoard : b)) }
            : prev,
        );
        return true;
      } catch (err) {
        if (await surfaceResourceConflict(reportId, err)) return false;
        showToast(err instanceof Error ? err.message : 'Error guardando pizarra', 'error');
        return false;
      }
    })();
    boardSavePromisesRef.current[requestKey] = saveRequest;
    try {
      return await saveRequest;
    } finally {
      if (boardSavePromisesRef.current[requestKey] === saveRequest) delete boardSavePromisesRef.current[requestKey];
    }
  };
  handleSaveBoardRef.current = handleSaveBoard;

  useEffect(() => {
    const reportId = detail?.id;
    if (!reportId || !isUnlocked || Object.keys(boardRecoveryDrafts).length === 0) return;
    let disposed = false;
    let running = false;
    const savePendingScenes = async () => {
      if (disposed || running || selectedIdRef.current !== reportId) return;
      running = true;
      try {
        const snapshots = Object.values(boardRecoveryDraftsRef.current);
        for (const snapshot of snapshots) {
          if (disposed || selectedIdRef.current !== reportId || !unsavedBoardIdsRef.current[snapshot.boardId]) continue;
          const saved = await handleSaveBoardRef.current(snapshot.boardId, snapshot.sceneJson, snapshot.svgSnapshot, snapshot.elementCount);
          if (saved && !disposed) acknowledgeBoardRecoverySnapshot(reportId, snapshot);
        }
      } finally {
        running = false;
      }
    };
    const debounce = window.setTimeout(() => { void savePendingScenes(); }, 1_000);
    const retry = window.setInterval(() => { void savePendingScenes(); }, 10_000);
    return () => {
      disposed = true;
      window.clearTimeout(debounce);
      window.clearInterval(retry);
    };
  }, [detail?.id, isUnlocked, boardRecoveryDrafts, acknowledgeBoardRecoverySnapshot]);

  const flushBoardRecoveryBeforeNavigation = async (nextAction: string) => {
    const pendingBoards = Object.keys(unsavedBoardIdsRef.current).length;
    if (pendingBoards > 0) {
      const accepted = await confirm({
        title: 'Pizarra pendiente de guardado',
        message: `Hay ${pendingBoards} pizarra(s) con cambios pendientes. La copia cifrada local se conservará mientras ${nextAction}. ¿Continuar?`,
        confirmLabel: 'Continuar',
        cancelLabel: 'Seguir editando',
        tone: 'warning',
      });
      if (!accepted) return false;
      // The canvas publishes its latest scene after a short debounce. Flush
      // that encrypted recovery record before the canvas unmounts.
      await new Promise<void>(resolve => window.setTimeout(resolve, 400));
      const localCopySaved = await localDraftPersistPromiseRef.current;
      if (!localCopySaved) {
        showToast('No se confirmó la copia local cifrada. La pizarra permanece pendiente; vuelve a su vista para reintentar.', 'warning');
        return false;
      }
      const pendingSnapshots = Object.values(boardRecoveryDraftsRef.current);
      let serverSaveFailed = false;
      for (const snapshot of pendingSnapshots) {
        if (!unsavedBoardIdsRef.current[snapshot.boardId]) continue;
        const saved = await handleSaveBoard(snapshot.boardId, snapshot.sceneJson, snapshot.svgSnapshot, snapshot.elementCount);
        if (!saved) {
          serverSaveFailed = true;
          continue;
        }
        if (detail?.id) acknowledgeBoardRecoverySnapshot(detail.id, snapshot);
      }
      if (Object.keys(unsavedBoardIdsRef.current).length > 0) {
        await new Promise<void>(resolve => window.setTimeout(resolve, 400));
        const latestCopySaved = await localDraftPersistPromiseRef.current;
        if (!latestCopySaved) {
          showToast('No se pudo guardar localmente la última escena; permanece en la vista para evitar perderla.', 'warning');
          return false;
        }
      }
      if (serverSaveFailed) showToast('Algunas pizarras siguen pendientes en el servidor; sus copias cifradas se conservaron.', 'warning');
    }
    return true;
  };

  const handleWorkspaceModeChange = async (nextMode: WorkspaceMode, userInitiated = false) => {
    if (nextMode === mode) {
      if (userInitiated) workspaceModeManuallySelectedRef.current = true;
      return;
    }
    if (!(await flushBoardRecoveryBeforeNavigation('cambias de vista'))) return;
    if (userInitiated) workspaceModeManuallySelectedRef.current = true;
    setMode(nextMode);
  };

  const handleManualReportListChange = (nextOpen?: boolean) => {
    reportListManuallyToggledRef.current = true;
    setShowList((current) => nextOpen ?? !current);
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const wideViewport = window.matchMedia('(min-width: 1280px)');
    const syncResponsiveDefaults = () => {
      if (!workspaceModeManuallySelectedRef.current) setMode(wideViewport.matches ? 'dual' : 'markdown');
      if (!reportListManuallyToggledRef.current) setShowList(wideViewport.matches);
    };
    if (typeof wideViewport.addEventListener === 'function') {
      wideViewport.addEventListener('change', syncResponsiveDefaults);
      return () => wideViewport.removeEventListener('change', syncResponsiveDefaults);
    }
    wideViewport.addListener(syncResponsiveDefaults);
    return () => wideViewport.removeListener(syncResponsiveDefaults);
  }, []);

  const handleSelectBoard = async (boardId: string) => {
    if (boardId === activeBoardId) return;
    if (!(await flushBoardRecoveryBeforeNavigation('cambias de pizarra'))) return;
    setActiveBoardId(boardId);
  };

  const handleCreateBoard = async () => {
    if (!detail || isWriteupEditingBlocked) return;
    const name = await prompt({
      title: 'Nueva pizarra',
      message: 'Nombre de la nueva pizarra:',
      defaultValue: `Diagrama #${detail.boards.length + 1}`,
      confirmLabel: 'Crear',
      required: true,
      maxLength: 180,
    });
    if (name === null) return;
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      showToast('El nombre debe tener al menos 2 caracteres.', 'warning');
      return;
    }
    if (cleanName.length > 180) {
      showToast('El nombre no puede superar 180 caracteres.', 'warning');
      return;
    }
    if (!(await flushBoardRecoveryBeforeNavigation('creas otra pizarra'))) return;
    try {
      const board = await api.createWriteupBoard(detail.id, { title: cleanName, expected_updated_at: writeupVersionByReportRef.current[detail.id] || detail.updated_at });
      await updateWriteupVersion(detail.id, board.writeup_updated_at);
      setDetail((prev) => (prev && prev.id === detail.id ? { ...prev, updated_at: board.writeup_updated_at || prev.updated_at, boards: [...prev.boards, board] } : prev));
      setActiveBoardId(board.id);
      showToast('Nueva pizarra agregada', 'success');
    } catch (err) {
      if (await surfaceResourceConflict(detail.id, err)) return;
      showToast(err instanceof Error ? err.message : 'Error creando pizarra', 'error');
    }
  };

  const handleDeleteAsset = async (asset: WriteupAsset) => {
    if (!detail || isWriteupEditingBlocked) return;
    const confirmed = await confirm({
      title: 'Eliminar evidencia multimedia',
      message: `¿Eliminar "${asset.filename}" de este informe?`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const updatedAt = await api.deleteWriteupAsset(detail.id, asset.id, detail.updated_at);
      await updateWriteupVersion(detail.id, updatedAt);
      const cachedUrl = assetUrlsRef.current[asset.id];
      if (cachedUrl) {
        URL.revokeObjectURL(cachedUrl);
        delete assetUrlsRef.current[asset.id];
        setAssetUrls({ ...assetUrlsRef.current });
      }
      setDetail(current => current?.id === detail.id ? { ...current, updated_at: updatedAt || current.updated_at, assets: current.assets.filter(item => item.id !== asset.id) } : current);
      showToast('Evidencia eliminada', 'info');
    } catch (err) {
      if (await surfaceResourceConflict(detail.id, err)) return;
      showToast(err instanceof Error ? err.message : 'Error al eliminar evidencia', 'error');
    }
  };

  const handleRestoreRevision = async (rev: WriteupRevision, closeDiffModal = false) => {
    if (isWriteupEditingBlocked) return;
    if (saveInFlight.current) {
      showToast('Espera a que termine el guardado antes de restaurar.', 'warning');
      return;
    }
    if (!detail) return;
    const confirmed = await confirm({
      title: `Restaurar revisión v${rev.revision_number}`,
      message: rev.snapshot
        ? `La revisión v${rev.revision_number} reemplazará el texto, datos, hallazgos, evidencias, pizarras y citas actuales. El estado actual se guardará primero como una nueva revisión, para que puedas volver a él. ¿Continuar?`
        : `Esta revisión antigua solo contiene Markdown y reemplazará únicamente el texto actual. El estado actual se guardará primero como una nueva revisión, para que puedas volver a él. ¿Continuar?`,
      confirmLabel: 'Restaurar',
      tone: 'warning',
    });
    if (!confirmed) return;
    if (saveInFlight.current) {
      showToast('Espera a que termine el guardado antes de restaurar.', 'warning');
      return;
    }
    const restoredVersion = draftVersion.current;
    saveInFlight.current = true;
    setSaving(true);
    try {
      const restored = await api.restoreWriteupRevision(detail.id, rev.id, detail.updated_at);
      if (selectedIdRef.current === detail.id) {
        if (draftVersion.current === restoredVersion) hydrateDraft(restored);
        else setDetail(restored);
        void preloadAssetUrls(restored, detailRequestVersion.current);
        const refreshedRevisions = await api.listWriteupRevisions(detail.id, { limit: 40, include_content: false });
        if (selectedIdRef.current === detail.id) {
          setRevisions(refreshedRevisions);
          setRevisionEnd(refreshedRevisions.length < 40);
          revisionCursor.current = refreshedRevisions.length ? refreshedRevisions[refreshedRevisions.length - 1].revision_number : null;
        }
        if (closeDiffModal) { setDiffRevision(null); setShowRevisionHistory(false); }
        showToast(`Restaurado desde v${rev.revision_number}`, 'success');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSaveConflict(true);
        setSaveError('El informe cambió en otra sesión. Tus cambios siguen aquí; compáralos antes de continuar.');
        try {
          const latest = await api.getWriteup(detail.id);
          writeupVersionByReportRef.current[detail.id] = latest.updated_at;
          setConflictServer(latest);
        } catch { /* Retry from the comparison. */ }
        setDiffRevision(null);
        setShowRevisionHistory(false);
        setShowConflict(true);
      } else showToast(err instanceof Error ? err.message : 'No se pudo restaurar la revisión', 'error');
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!lightboxAsset && !showRevisionHistory) return;
    previousModalFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => modalCloseRef.current?.focus(), 0);
    const onKeyDown = (e: KeyboardEvent) => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'));
      if (dialogs[dialogs.length - 1] !== modalDialogRef.current) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (showRevisionHistory) closeRevisionHistory();
        else if (lightboxAsset) setLightboxAsset(null);
        return;
      }
      if (e.key === 'Tab' && modalDialogRef.current) {
        const focusable = getDialogFocusableElements(modalDialogRef.current);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousModalFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [lightboxAsset, showRevisionHistory, closeRevisionHistory]);

  useEffect(() => {
    const recoveryOpen = showRecovery && recoveryCandidates.length > 0;
    const conflictOpen = showConflict && saveConflict && Boolean(detail);
    if (!recoveryOpen && !conflictOpen) return;
    const dialogRef = conflictOpen ? conflictDialogRef : recoveryDialogRef;
    const closeRef = conflictOpen ? conflictCloseRef : recoveryCloseRef;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'));
      if (dialogs[dialogs.length - 1] !== dialogRef.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (conflictOpen) setShowConflict(false);
        else setShowRecovery(false);
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = getDialogFocusableElements(dialogRef.current);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [showRecovery, recoveryCandidates.length, showConflict, saveConflict, detail]);

  const handleCreateCitation = async (payload: {
    anchor_id: string;
    heading_path: string | null;
    line_start: number;
    line_end: number;
    quoted_text: string;
    markdown_content: string;
  }): Promise<boolean> => {
    if (!detail || isWriteupEditingBlocked) return false;
    const targetBoardId = activeBoardId || detail.boards[0]?.id;
    if (!targetBoardId) {
      showToast('Crea una pizarra primero para enlazar citaciones', 'warning');
      return false;
    }
    try {
      const { markdown_content: markdownWithCitation, ...citationPayload } = payload;
      const created = await api.createWriteupCitation(detail.id, {
        board_id: targetBoardId,
        ...citationPayload,
        expected_updated_at: detail.updated_at,
      });
      setDetail((prev) => (prev && prev.id === detail.id ? { ...prev, updated_at: created.writeup_updated_at || prev.updated_at, citations: [...prev.citations, created] } : prev));
      const saved = await handleSaveWriteup(false, markdownWithCitation, false, created.writeup_updated_at || detail.updated_at);
      if (!saved) {
        try {
          const updatedAt = await api.deleteWriteupCitation(detail.id, created.id, created.writeup_updated_at || detail.updated_at);
          await updateWriteupVersion(detail.id, updatedAt);
          setDetail((prev) => prev ? { ...prev, citations: prev.citations.filter((citation) => citation.id !== created.id) } : prev);
        } catch {
          showToast('La cita quedó creada, pero no se guardó el informe. Revisa la pizarra antes de volver a intentarlo.', 'warning');
        }
        return false;
      }
      if (mode === 'markdown' && typeof window !== 'undefined' && window.innerWidth >= 1280) {
        void handleWorkspaceModeChange('dual');
      }
      showToast(`Cita #${created.anchor_id} añadida a la pizarra`, 'success');
      return true;
    } catch (err) {
      if (await surfaceResourceConflict(detail.id, err)) return false;
      showToast(err instanceof Error ? err.message : 'No se pudo crear la citación', 'error');
      return false;
    }
  };

  const handleDeleteCitation = async (citationId: string) => {
    if (!detail || isWriteupEditingBlocked) return;
    try {
      const updatedAt = await api.deleteWriteupCitation(detail.id, citationId, detail.updated_at);
      await updateWriteupVersion(detail.id, updatedAt);
      setDetail((prev) => (prev && prev.id === detail.id ? { ...prev, updated_at: updatedAt || prev.updated_at, citations: prev.citations.filter((c) => c.id !== citationId) } : prev));
      showToast('Citación eliminada', 'info');
    } catch (err) {
      if (await surfaceResourceConflict(detail.id, err)) return;
      showToast(err instanceof Error ? err.message : 'Error eliminando citación', 'error');
    }
  };

  const handleJumpToCitation = (cit: WriteupCitation) => {
    if (mode === 'whiteboard' || mode === 'findings' || mode === 'assets') {
      void handleWorkspaceModeChange(typeof window !== 'undefined' && window.innerWidth >= 1280 ? 'dual' : 'markdown');
    }
    setJumpTarget({ line: cit.line_start, anchorId: cit.anchor_id, ts: Date.now() });
  };

  const handleReanchorCitation = async (cit: WriteupCitation) => {
    if (!detail) return;
    const lines = markdown.split(/\r?\n/);
    const token = `{#${cit.anchor_id}}`;
    let newLine = lines.findIndex((ln) => ln.includes(token)) + 1;
    if (newLine <= 0) {
      const needle = cit.quoted_text.slice(0, 28).toLowerCase();
      newLine = lines.findIndex((ln) => ln.toLowerCase().includes(needle)) + 1;
    }
    const targetStart = newLine > 0 ? newLine : cit.line_start;
    const updatedLineText = lines[targetStart - 1]?.replace(/\{#[a-zA-Z0-9_-]+\}/g, '').trim() || cit.quoted_text;
    try {
      const updated = await api.updateWriteupCitation(detail.id, cit.id, {
        line_start: targetStart,
        line_end: targetStart,
        quoted_text: updatedLineText,
        expected_updated_at: detail.updated_at,
      });
      await updateWriteupVersion(detail.id, updated.writeup_updated_at);
      setDetail((prev) =>
        prev ? { ...prev, updated_at: updated.writeup_updated_at || prev.updated_at, citations: prev.citations.map((c) => (c.id === cit.id ? updated : c)) } : prev
      );
      showToast(`Cita #${cit.anchor_id} re-vinculada a línea ${targetStart}`, 'success');
    } catch (err) {
      if (await surfaceResourceConflict(detail.id, err)) return;
      showToast(err instanceof Error ? err.message : 'Error al re-vincular cita', 'error');
    }
  };

  const handleCloneWriteup = async () => {
    if (!detail) return;
    if (dirty && !(await handleSaveWriteup(false))) return;
    try {
      const cloned = await api.cloneWriteup(detail.id);
      setSelectedId(cloned.id);
      await loadList();
      await loadDetail(cloned.id);
      showToast(`Informe duplicado: ${cloned.title}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al duplicar el informe', 'error');
    }
  };

  const handleExport = async (opts: {
    format: WriteupExportFormat;
    redact_for_client: boolean;
    include_watermark: boolean;
    include_toc: boolean;
    toc_depth?: number;
    include_figure_index?: boolean;
    include_table_index?: boolean;
    font_size_pt?: number;
    watermark_text?: string;
    rendered_diagrams?: Record<string, string>;
  }) => {
    if (!detail) return undefined;
    if (dirty && !(await handleSaveWriteup(false))) return undefined;
    const { blob, filename, sha256 } = await api.exportWriteup(detail.id, opts);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    await loadDetail(detail.id);
    showToast(`Exportado: ${filename}`, 'success');
    return sha256;
  };

  if (!isUnlocked) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center p-4 text-center sm:min-h-[70vh] sm:p-6">
        <Shield className="w-12 h-12 text-indigo-400 mb-3" />
        <h2 className="text-xl font-bold text-white mb-2">Bóveda bloqueada</h2>
        <p className="text-sm text-slate-400 max-w-md mb-5">
          Tus informes, diagramas y evidencias se guardan protegidos. Desbloquea la bóveda para continuar.
        </p>
        <button
          type="button"
          onClick={openUnlockModal}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
        >
          Desbloquear bóveda
        </button>
      </div>
    );
  }

  const activeBoard = detail?.boards.find((b) => b.id === activeBoardId) || detail?.boards[0] || null;
  const staleCount = detail?.citations.filter((c) => c.is_stale).length || 0;
  const metadataSummary = [
    cvssScore ? `CVSS ${cvssScore}` : null,
    cweId.trim() || null,
    cveId.trim() || null,
    targetScope.trim() ? targetScope.trim().slice(0, 24) : null,
  ].filter(Boolean);
  const reportCorrelations = useMemo(() => detail ? correlateWriteup(detail, items, {
    cveId, cweId, targetScope, prospectId, projectId, findings,
  }) : [], [detail, items, cveId, cweId, targetScope, prospectId, projectId, findings]);

  return (
    <div className="writeups-view relative flex min-h-[calc(100dvh-4.5rem)] min-w-0 flex-col gap-3 overflow-x-clip p-2 sm:p-3 lg:h-[calc(100dvh-4.5rem)] lg:min-h-0 lg:flex-row lg:p-4">
      {/* Mobile / Medium Drawer Backdrop */}
      {showList && (
        <button
          type="button"
          aria-label="Cerrar lista de informes"
          onClick={() => handleManualReportListChange(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[1px] lg:hidden"
        />
      )}

      {/* Collapsible / Drawer Writeups List */}
      {showList && (
        <aside aria-label="Lista de informes" className="fixed inset-y-0 left-0 z-40 flex w-80 max-w-[85vw] shrink-0 flex-col overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl lg:static lg:z-auto lg:w-64 lg:rounded-2xl lg:shadow-none xl:w-72">
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                Informes ({total})
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleCreateWriteup}
                  disabled={creatingWriteup}
                  className="inline-flex min-h-[44px] lg:min-h-8 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-60"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  {creatingWriteup ? 'Creando…' : 'Nuevo'}
                </button>
                <button
                  type="button"
                  onClick={() => handleManualReportListChange(false)}
                  className="inline-flex min-h-[44px] min-w-[44px] lg:min-h-8 lg:min-w-8 items-center justify-center rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                  aria-label="Cerrar panel"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                maxLength={120}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Buscar informes"
                placeholder="Buscar…"
                className="w-full min-h-[44px] lg:min-h-8 pl-8 pr-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
              />
            </div>

            <div className="relative">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              aria-label="Filtrar informes por severidad"
              className="w-full min-h-[44px] lg:min-h-8 appearance-none bg-slate-950 border border-slate-800 rounded-lg pl-2 pr-8 py-1.5 text-xs text-slate-200"
            >
              <option value="">Todas las severidades</option>
              <option value="critica">Crítica</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
              <option value="informativa">Informativa</option>
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {loadingList && items.length === 0 ? (
              <p role="status" aria-live="polite" className="p-3 text-xs text-slate-400">Cargando informes…</p>
            ) : listError && items.length === 0 ? (
              <div className="space-y-2 p-3 text-xs text-rose-300">
                <p role="alert">{listError}</p>
                <button
                  type="button"
                  onClick={() => void loadList()}
                  className="min-h-[44px] lg:min-h-9 rounded-lg border border-rose-500/30 px-3 text-rose-200 hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  Reintentar
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="text-center p-4 text-xs text-slate-400 space-y-2">
                <p>No hay informes guardados todavía.</p>
                <p className="text-[11px] text-slate-500">Crea un informe vacío o importa datos desde Red y Lab (C2).</p>
              </div>
            ) : (
              items.map((item) => {
                const selected = selectedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectWriteup(item.id)}
                    aria-current={selected ? 'true' : undefined}
                    aria-label={`${item.title}, severidad ${SEVERITY_LABEL[item.severity] || item.severity}, estado ${STATUS_LABEL[item.status] || item.status}, alcance ${item.target_scope || 'no indicado'}`}
                    className={`w-full rounded-xl border p-2.5 text-left text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                      SEVERITY_CARD[item.severity] || SEVERITY_CARD.media
                    } ${selected ? '!border-emerald-400' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-medium text-white/80">{STATUS_LABEL[item.status] || item.status}</span>
                      <span className="shrink-0 rounded border border-white/20 bg-slate-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-white">{SEVERITY_LABEL[item.severity] || item.severity}</span>
                    </div>
                    <div className="text-xs font-semibold line-clamp-2">{item.title}</div>
                    <div className="mt-1 truncate text-[10px] text-slate-200/90" title={item.target_scope || 'Alcance no indicado'}>
                      {item.target_scope || 'Alcance no indicado'}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2 tabular-nums">
                      <span>{item.boards_count} pizarra</span>
                      <span>· {item.citations_count} citas</span>
                      <span>· {item.assets_count} med.</span>
                    </div>
                    <div className="mt-1 truncate text-[10px] text-slate-400" title={`Actualizado ${formatApiDateTime(item.updated_at, systemLocale || 'es-MX')}`}>
                      Actualizado {formatApiDateTime(item.updated_at, systemLocale || 'es-MX')}
                    </div>
                  </button>
                );
              })
            )}
            {hasMore && !loadingList && (
              <div className="flex flex-col items-center gap-2 p-2">
                {loadMoreError && <p role="alert" className="text-center text-xs text-rose-300">{loadMoreError}</p>}
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  aria-label="Cargar más informes"
                  className="inline-flex min-h-[44px] lg:min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:border-indigo-400/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-wait disabled:opacity-60"
                >
                  {loadingMore && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  {loadingMore ? 'Cargando…' : loadMoreError ? 'Reintentar carga' : 'Cargar más'}
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Main Editor + Whiteboard Workspace */}
      <section aria-label="Editor del informe" className="flex min-h-[50vh] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 lg:min-h-0">
        {!detail ? loadingDetail ? (
          <div role="status" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-300" aria-hidden="true" />
            <p className="text-sm">Cargando informe…</p>
          </div>
        ) : detailError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p role="alert" className="max-w-md text-sm text-rose-300">{detailError}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {selectedId && <button type="button" onClick={() => void loadDetail(selectedId)} className="min-h-[44px] lg:min-h-9 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-500">Reintentar</button>}
              {!showList && <button type="button" onClick={() => handleManualReportListChange(true)} className="min-h-[44px] lg:min-h-9 rounded-lg bg-slate-800 px-3 text-xs font-medium text-slate-200 hover:bg-slate-700">Ver lista</button>}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6 text-center gap-3">
            <BookOpen className="w-10 h-10 text-slate-600" aria-hidden="true" />
            <p className="text-sm max-w-md">
              {total > 0
                ? 'Selecciona un informe de la lista o crea un nuevo borrador.'
                : 'Inicia un writeup desde cero o importa hosts, puertos y credenciales de tu sesión C2.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {!showList && (
                <button
                  type="button"
                  onClick={() => handleManualReportListChange(true)}
                  className="inline-flex min-h-[44px] lg:min-h-9 items-center gap-1.5 rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
                >
                  <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
                  Ver lista ({total})
                </button>
              )}
              <button
                type="button"
                onClick={handleCreateWriteup}
                disabled={creatingWriteup}
                className="inline-flex min-h-[44px] lg:min-h-9 items-center gap-1.5 rounded-xl bg-obsidian-gold px-4 py-2 text-xs font-semibold text-black hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                {creatingWriteup ? 'Creando…' : 'Nuevo informe'}
              </button>
              <button
                type="button"
                onClick={handleCreateFromC2Session}
                disabled={creatingWriteup}
                className="inline-flex min-h-[44px] lg:min-h-9 items-center gap-1.5 rounded-xl border border-obsidian-borderLight bg-obsidian-panel px-4 py-2 text-xs font-semibold text-white hover:border-obsidian-gold disabled:cursor-wait disabled:opacity-60"
              >
                <Radar className="w-4 h-4 text-obsidian-gold" aria-hidden="true" />
                <span>
                  Importar sesión C2
                  {(c2Hosts.length + c2Ports.length + c2Creds.length) > 0
                    ? ` (${c2Hosts.length}h / ${c2Ports.length}p)`
                    : ''}
                </span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Compact Responsive Header Bar */}
            <div className="writeup-header-container p-2.5 sm:p-3 border-b border-slate-800 bg-slate-900/95 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleManualReportListChange()}
                  title={showList ? 'Ocultar lista' : 'Mostrar lista'}
                  aria-label={showList ? 'Ocultar lista' : 'Mostrar lista'}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 shrink-0"
                >
                  {showList ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                </button>

                <input
                  type="text"
                  value={title}
                  disabled={isWriteupEditingBlocked}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    markDirty();
                  }}
                  aria-label="Título del informe"
                  maxLength={MAX_REPORT_TITLE_LENGTH}
                  className="writeup-header-title h-10 min-w-[120px] w-48 max-w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-sm font-bold text-white"
                />

                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <label className="relative inline-flex max-w-full items-center">
                  <span className="sr-only">Área de trabajo</span>
                    <select value={mode} aria-label="Área de trabajo" onChange={(event) => void handleWorkspaceModeChange(event.target.value as WorkspaceMode, true)} className="min-h-10 max-w-full appearance-none rounded-lg border border-slate-700 bg-slate-950 pl-3 pr-9 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
                    <option value="markdown">Informe</option>
                    <option value="whiteboard">Pizarra</option>
                    <option value="dual">Informe y pizarra</option>
                    <option value="findings">Hallazgos ({findings.length})</option>
                    <option value="assets">Evidencias ({detail.assets.length})</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-400" aria-hidden="true" />
                </label>

                {(mode === 'dual' || mode === 'whiteboard') && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <select
                      value={activeBoard?.id || ''}
                      onChange={(e) => void handleSelectBoard(e.target.value)}
                      aria-label="Seleccionar pizarra"
                      className="h-10 max-w-[160px] rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-200"
                    >
                      {detail.boards.map((b) => (
                        <option key={b.id} value={b.id}>{b.title}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={isWriteupEditingBlocked}
                      onClick={handleCreateBoard}
                      aria-label="Crear nueva pizarra"
                      className="h-10 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1"
                      title="Nueva pizarra"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Pizarra</span>
                    </button>
                  </div>
                )}
              </div>

                <button
                  type="button"
                  onClick={() => setShowCorrelations((visible) => !visible)}
                  aria-expanded={showCorrelations}
                  aria-controls="writeup-correlations-panel"
                  aria-label="Mostrar u ocultar correlaciones"
                  className={`writeup-header-compact-button inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs ${showCorrelations ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 bg-slate-800 text-slate-300 hover:text-white'}`}
                  title="Detectar coincidencias con otros informes"
                >
                  <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="writeup-header-action-label">Correlaciones</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowMetadata((v) => !v)}
                  aria-label="Mostrar u ocultar detalles del informe"
                  aria-expanded={showMetadata}
                  className={`writeup-header-compact-button px-2 py-1.5 rounded-lg text-xs flex items-center gap-1 border ${
                    showMetadata ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200' : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                  title="Mostrar u ocultar detalles del informe y sus relaciones"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span className="writeup-header-action-label">Detalles</span>
                </button>

                <div className="writeup-header-actions flex max-w-full flex-wrap items-center justify-end gap-1 ml-auto">
                  <button
                    type="button"
                    disabled={editLockState?.kind === 'acquiring'}
                    onClick={() => {
                      if (detail.manual_locked || editLockState?.kind === 'manual') {
                        void handleToggleManualLock();
                      } else if (editLockState?.kind === 'blocked' || editLockState?.kind === 'unavailable') {
                        void acquireEditLease(detail.id).then((acquired) => {
                          if (acquired) showToast('Reserva de edición recuperada.', 'success');
                        });
                      } else {
                        void handleToggleManualLock();
                      }
                    }}
                    aria-label={detail.manual_locked || editLockState?.kind === 'manual'
                      ? 'Desbloquear edición'
                      : editLockState?.kind === 'blocked' || editLockState?.kind === 'unavailable'
                        ? 'Reintentar reserva de edición'
                        : 'Bloquear edición'}
                    title={detail.manual_locked || editLockState?.kind === 'manual'
                      ? 'Desbloquear edición'
                      : editLockState?.kind === 'blocked' || editLockState?.kind === 'unavailable'
                        ? 'Reintentar reserva de edición'
                        : 'Bloquear edición'}
                    className="writeup-header-compact-button h-10 w-10 shrink-0 justify-center rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:cursor-wait disabled:opacity-50"
                  >
                    {detail.manual_locked || editLockState?.kind === 'manual' ? <Unlock className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
                  </button>
                  {staleCount > 0 && (
                    <span className="px-1.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] flex items-center gap-1" title="Cita(s) desactualizada(s)">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {staleCount}
                    </span>
                  )}

                  <button
                    type="button"
                    disabled={saving || isWriteupEditingBlocked}
                    onClick={() => void handleSaveWriteup(false)}
                    aria-label={saving ? 'Guardando informe' : dirty ? 'Guardar cambios del informe' : 'Informe guardado'}
                    className={`writeup-header-compact-button h-10 w-10 shrink-0 justify-center rounded-lg text-xs font-semibold flex items-center ${
                      dirty ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                    title={saving ? 'Guardando informe' : dirty ? 'Guardar cambios del informe' : 'Informe guardado'}
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>
                  <span role="status" className={saveError ? 'text-xs text-rose-300' : 'text-xs text-slate-400'}>
                  {saveError ? `No se pudo guardar: ${saveError}` : localDraftError ? 'Copia local no disponible; vuelve a la pizarra para reintentar' : ''}
                  </span>
                  {recoveryCandidates.length > 0 && (
                    <button type="button" onClick={() => setShowRecovery(true)} className="rounded-lg border border-amber-700/70 bg-amber-950/50 px-3 py-2 text-xs text-amber-100 hover:bg-amber-900/60" aria-label={`Ver ${recoveryCandidates.length} copias locales recuperables`}>
                      Recuperación local · {recoveryCandidates.length}
                    </button>
                  )}
                  {newRecoveryCopyAvailable && <button type="button" onClick={() => void refreshRecoveryCopies()} className="rounded-lg border border-cyan-700/70 bg-cyan-950/50 px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-900/60">Buscar copias de otras pestañas</button>}
                  {saveConflict && <button type="button" onClick={async () => {
                    try { if (detail) { const latest = await api.getWriteup(detail.id); writeupVersionByReportRef.current[detail.id] = latest.updated_at; setConflictServer(latest); } }
                    catch { /* Keep the last retrieved version and permit retry. */ }
                    setShowConflict(true);
                  }} className="rounded-lg bg-amber-900 px-3 py-2 text-xs text-white hover:bg-amber-800">Comparar versiones</button>}

                  <button
                    type="button"
                    disabled={revisionLoading}
                    onClick={() => void openRevisionHistory()}
                    className="writeup-header-compact-button h-10 w-10 shrink-0 justify-center rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs flex items-center"
                    aria-label="Abrir historial del informe"
                    title="Explorar historial de versiones"
                  >
                    <History className="w-4 h-4" aria-hidden="true" />
                  </button>


                  <button
                    type="button"
                    onClick={() => setShowExportModal(true)}
                    aria-label="Exportar informe"
                    className="writeup-header-compact-button h-10 w-10 shrink-0 justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center"
                    title="Exportar el informe"
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                  </button>

                  <details className="relative">
                    <summary data-caret="manual" aria-label="Más acciones del informe" title="Más acciones del informe" className="writeup-header-more-summary flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg bg-slate-800 text-xs text-slate-200 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 [&::-webkit-details-marker]:hidden"><MoreVertical className="h-4 w-4" aria-hidden="true" /></summary>
                    <div className="absolute right-0 z-30 mt-1 grid min-w-48 gap-1 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl">
                  <button
                    type="button"
                    disabled={isWriteupEditingBlocked}
                    onClick={() => void handleCreateMilestone()}
                    className="p-1.5 sm:px-2 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1"
                    title="Guardar una versión importante con nombre"
                    aria-label="Hito · Nombrar versión importante"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Crear hito</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleCloneWriteup()}
                    className="p-1.5 sm:px-2 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1"
                    title="Duplicar informe con sus hallazgos, texto y pizarras"
                    aria-label="Duplicar informe"
                  >
                    <CopyPlus className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Duplicar informe</span>
                  </button>
                  <button
                    type="button"
                    disabled={isWriteupEditingBlocked}
                    onClick={handleDeleteWriteup}
                    className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-left text-slate-400 hover:bg-rose-950/40 hover:text-rose-400"
                    title="Eliminar informe"
                    aria-label="Eliminar informe"
                  >
                    <Trash2 className="w-4 h-4" /> <span className="ml-1 text-xs">Eliminar informe</span>
                  </button>
                    </div>
                  </details>
                </div>
              </div>

              {/* Compact summary badge line when metadata tray is collapsed */}
              {!showMetadata && metadataSummary.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                  {metadataSummary.map((chip) => (
                    <span key={chip} className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 font-mono">
                      {chip}
                    </span>
                  ))}
                </div>
              )}

              {/* Progressive Disclosure Advanced Metadata & CRM Tray */}
              {showMetadata && (
                <fieldset disabled={isWriteupEditingBlocked} className="contents">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-2 pt-1 text-xs">
                <select
                  value={severity}
                  aria-label="Severidad"
                  onChange={(e) => {
                    setSeverity(e.target.value as WriteupSeverity);
                    markDirty();
                  }}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                >
                  <option value="critica">Crítica</option>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                  <option value="informativa">Info</option>
                </select>

                <select
                  value={statusVal}
                  aria-label="Estado"
                  onChange={(e) => {
                    setStatusVal(e.target.value as WriteupStatus);
                    markDirty();
                  }}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                >
                  <option value="borrador">Borrador</option>
                  <option value="en_revision">Revisión</option>
                  <option value="finalizado">Finalizado</option>
                  <option value="entregado">Entregado</option>
                </select>


                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={cvssScore}
                    onChange={(e) => {
                      setCvssScore(e.target.value);
                      markDirty();
                    }}
                    placeholder="CVSS (0-10)"
                    aria-label="Puntaje de riesgo CVSS, de 0 a 10"
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200"
                  />
                  <input
                    type="text"
                    value={cweId}
                    maxLength={32}
                    onChange={(e) => {
                      setCweId(e.target.value);
                      markDirty();
                    }}
                    placeholder="Identificador CWE"
                    aria-label="Identificador CWE"
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200"
                  />
                  <input
                    type="text"
                    value={cveId}
                    maxLength={64}
                    onChange={(e) => {
                      setCveId(e.target.value);
                      markDirty();
                    }}
                    placeholder="Identificador CVE"
                    aria-label="Identificador CVE"
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200"
                  />
                  <input
                    type="text"
                    value={targetScope}
                    maxLength={500}
                    onChange={(e) => {
                      setTargetScope(e.target.value);
                      markDirty();
                    }}
                    placeholder="Alcance o dirección del sitio"
                    aria-label="Alcance o dirección del sitio"
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200"
                  />
                  <select
                    value={prospectId}
                    aria-label="Vincular prospecto"
                    onChange={(e) => {
                      setProspectId(e.target.value);
                      markDirty();
                    }}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200"
                  >
                    <option value="">Sin prospecto CRM</option>
                    {prospects.map((p) => (
                      <option key={p.id} value={p.id}>{p.company_name}</option>
                    ))}
                  </select>
                  <select
                    value={projectId}
                    aria-label="Vincular proyecto"
                    onChange={(e) => {
                      setProjectId(e.target.value);
                      markDirty();
                    }}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200"
                  >
                    <option value="">Sin proyecto</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                </fieldset>
              )}


            </div>

            {editLockState?.kind === 'manual' || detail.manual_locked ? (
              <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-300">
                <Lock className="h-4 w-4 shrink-0 text-obsidian-gold" aria-hidden="true" />
                <span>Edición bloqueada manualmente{detail.manual_locked_by ? ` por ${detail.manual_locked_by}` : ''}. Puedes leer y exportar el informe.</span>
              </div>
            ) : editLockState?.kind === 'blocked' || editLockState?.kind === 'unavailable' ? (
              <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-300">
                <Lock className="h-4 w-4 shrink-0 text-obsidian-gold" aria-hidden="true" />
                <span>{editLockState.message} El borrador local cifrado se conserva; puedes seguir leyendo y exportar.</span>
              </div>
            ) : editLockState?.kind === 'acquiring' ? (
              <div role="status" aria-live="polite" className="flex items-center gap-2 border-b border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-400">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>Reservando edición…</span>
              </div>
            ) : null}

            <div id="writeup-correlations-panel" hidden={!showCorrelations}>
              <WriteupCorrelationsPanel
                correlations={reportCorrelations}
                loadedCount={items.length}
                totalCount={total}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onOpenReport={(reportId) => void handleSelectWriteup(reportId)}
                onLoadMore={() => void handleLoadMore()}
              />
            </div>

            {/* Active Workspace Area (scrollable gracefully on mobile/medium, fixed split on desktop) */}
            <div className="flex-1 min-h-0 p-2 sm:p-3 overflow-y-auto lg:overflow-hidden">
              {mode === 'markdown' && (
                <WriteupMarkdownSplitEditor
                  key={detail.id}
                  markdown={markdown}
                  onChange={(next) => {
                    setMarkdown(next);
                    markDirty();
                  }}
                  boards={detail.boards}
                  assets={detail.assets}
                  assetObjectUrls={assetUrls}
                  onUploadMedia={handleUploadMedia}
                  onCreateCitation={handleCreateCitation}
                  onSave={() => void handleSaveWriteup(false)}
                  onInspectAsset={setLightboxAsset}
                  readOnly={isWriteupEditingBlocked}
                  editorSession={editorSessionRef.current[detail.id]}
                  onEditorSessionChange={(session) => recordEditorSession(detail.id, session)}
                  onApplyCvss={(score, vector, sev) => {
                    setCvssScore(score.toFixed(1));
                    setCvssVector(vector);
                    setSeverity(sev);
                    markDirty();
                    showToast(`CVSS ${score.toFixed(1)} aplicado`, 'success');
                  }}
                  jumpTarget={jumpTarget}
                />
              )}

              {mode === 'whiteboard' && activeBoard && (
                <PentestWhiteboard
                  board={activeBoard}
                  recoveryDraft={boardRecoveryDrafts[activeBoard.id]}
                  citations={detail.citations}
                  assets={detail.assets}
                  assetObjectUrls={assetUrls}
                  assetLoadErrors={failedAssetIds}
                  targetScope={targetScope}
                  findings={findings}
                  readOnly={isWriteupEditingBlocked}
                  onSaveBoard={handleSaveBoard}
                  onDirtyChange={onCurrentBoardDirtyChange}
                  onDraftChange={onCurrentBoardDraftChange}
                  onJumpToCitation={handleJumpToCitation}
                  onDeleteCitation={handleDeleteCitation}
                  onInsertBoardIntoMarkdown={(bId, bTitle) => {
                    setMarkdown((prev) => `${prev}\n![${bTitle}](board://${bId})\n`);
                    markDirty();
                      showToast('Diagrama añadido al informe', 'success');
                  }}
                />
              )}

              {mode === 'dual' && (
                <div className="grid grid-cols-1 grid-rows-[minmax(18rem,1fr)_minmax(18rem,1fr)] 2xl:grid-cols-2 2xl:grid-rows-1 gap-3 h-full min-h-0 overflow-y-auto 2xl:overflow-y-hidden">
                  <WriteupMarkdownSplitEditor
                    key={detail.id}
                    markdown={markdown}
                    onChange={(next) => {
                      setMarkdown(next);
                      markDirty();
                    }}
                    boards={detail.boards}
                    assets={detail.assets}
                    assetObjectUrls={assetUrls}
                    onUploadMedia={handleUploadMedia}
                    onCreateCitation={handleCreateCitation}
                    onSave={() => void handleSaveWriteup(false)}
                    onInspectAsset={setLightboxAsset}
                    readOnly={isWriteupEditingBlocked}
                    editorSession={editorSessionRef.current[detail.id]}
                    onEditorSessionChange={(session) => recordEditorSession(detail.id, session)}
                    onApplyCvss={(score, vector, sev) => {
                      setCvssScore(score.toFixed(1));
                      setCvssVector(vector);
                      setSeverity(sev);
                      markDirty();
                    }}
                    jumpTarget={jumpTarget}
                  />
                  {activeBoard && (
                    <PentestWhiteboard
                      board={activeBoard}
                      recoveryDraft={boardRecoveryDrafts[activeBoard.id]}
                      citations={detail.citations}
                      assets={detail.assets}
                      assetObjectUrls={assetUrls}
                      assetLoadErrors={failedAssetIds}
                      targetScope={targetScope}
                      findings={findings}
                      readOnly={isWriteupEditingBlocked}
                      onSaveBoard={handleSaveBoard}
                      onDirtyChange={onCurrentBoardDirtyChange}
                      onDraftChange={onCurrentBoardDraftChange}
                      onJumpToCitation={handleJumpToCitation}
                      onDeleteCitation={handleDeleteCitation}
                      onInsertBoardIntoMarkdown={(bId, bTitle) => {
                        setMarkdown((prev) => `${prev}\n![${bTitle}](board://${bId})\n`);
                        markDirty();
                        showToast('Diagrama añadido al informe', 'success');
                      }}
                    />
                  )}
                </div>
              )}

              {mode === 'findings' && (
                <fieldset disabled={isWriteupEditingBlocked} className="contents">
                <div className="h-full overflow-y-auto space-y-4 pr-1">
                  {/* SVG Findings Severity Matrix */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                        <BarChart3 className="w-4 h-4 text-indigo-400" />
                        Matriz de Severidad y Remediación ({findings.length} hallazgos)
                      </span>
                      <span className="text-[11px] text-slate-400 tabular-nums">
                        Abiertos: {findings.filter((x) => x.status === 'abierta').length} · Mitigados:{' '}
                        {findings.filter((x) => x.status === 'mitigada').length}
                      </span>
                    </div>
                    {(() => {
                      const sevOrder: WriteupSeverity[] = ['critica', 'alta', 'media', 'baja', 'informativa'];
                      const counts = sevOrder.map((s) => findings.filter((x) => x.severity === s).length);
                      const maxCount = Math.max(1, ...counts);
                      return (
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end pt-1">
                          {sevOrder.map((sevKey, i) => {
                            const cnt = counts[i];
                            const barHeight = Math.max(6, Math.round((cnt / maxCount) * 38));
                            return (
                              <div key={sevKey} className="flex flex-col items-center gap-1 bg-slate-900/70 rounded-lg py-2 px-1 border border-slate-800/80">
                                <span className="text-xs font-bold text-white tabular-nums">{cnt}</span>
                                <svg width="36" height="40" viewBox="0 0 36 40" aria-hidden="true">
                                  <rect x="6" y={40 - barHeight} width="24" height={barHeight} rx="4" fill={SEVERITY_BAR_COLOR[sevKey]} fillOpacity="0.85" />
                                </svg>
                                <span className="max-w-full truncate text-xs font-medium text-slate-300">{sevKey}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2">
                    <label htmlFor="writeup-executive-summary" className="block text-xs font-semibold text-slate-300">Resumen ejecutivo</label>
                    <textarea
                      id="writeup-executive-summary"
                      rows={3}
                      value={execSummary}
                      maxLength={25000}
                      onChange={(e) => {
                        setExecSummary(e.target.value);
                        markDirty();
                      }}
                      placeholder="Resumen del proyecto y sus conclusiones principales…"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white">Hallazgos estructurados</h3>
                    <button
                      type="button"
                      disabled={findings.length >= MAX_FINDINGS_COUNT}
                      onClick={() => {
                        setFindings((prev) => [
                          ...prev,
                          {
                            id: `H-${String(prev.length + 1).padStart(2, '0')}`,
                            title: 'Nuevo hallazgo de seguridad',
                            severity: 'media',
                            cvss_score: 5.5,
                            cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:N',
                            cwe_id: '',
                            affected_target: targetScope || '',
                            status: 'abierta',
                            summary: '',
                            remediation: '',
                          },
                        ]);
                        markDirty();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={`Máximo ${MAX_FINDINGS_COUNT} hallazgos por informe`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar
                    </button>
                  </div>

                  <div className="space-y-3">
                    {findings.map((f, idx) => (
                      <div key={`${f.id}-${idx}`} className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2.5 text-xs">
                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                          <input
                            type="text"
                            value={f.id}
                            maxLength={64}
                            onChange={(e) => {
                              const next = [...findings];
                              next[idx] = { ...f, id: e.target.value };
                              setFindings(next);
                              markDirty();
                            }}
                            placeholder="ID (H-01)"
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono"
                          />
                          <input
                            type="text"
                            value={f.title}
                            maxLength={200}
                            onChange={(e) => {
                              const next = [...findings];
                              next[idx] = { ...f, title: e.target.value };
                              setFindings(next);
                              markDirty();
                            }}
                            placeholder="Título del hallazgo"
                            className="sm:col-span-2 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-semibold"
                          />
                          <select
                            value={f.severity}
                            onChange={(e) => {
                              const next = [...findings];
                              next[idx] = { ...f, severity: e.target.value as WriteupSeverity };
                              setFindings(next);
                              markDirty();
                            }}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                          >
                            <option value="critica">Crítica</option>
                            <option value="alta">Alta</option>
                            <option value="media">Media</option>
                            <option value="baja">Baja</option>
                            <option value="informativa">Informativa</option>
                          </select>
                          <select
                            value={f.status}
                            onChange={(e) => {
                              const next = [...findings];
                              next[idx] = { ...f, status: e.target.value as WriteupStructuredFinding['status'] };
                              setFindings(next);
                              markDirty();
                            }}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                          >
                            <option value="abierta">Abierta</option>
                            <option value="mitigada">Mitigada</option>
                            <option value="riesgo_aceptado">Riesgo aceptado</option>
                            <option value="falso_positivo">Falso positivo</option>
                          </select>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              min={0}
                              max={10}
                              step={0.1}
                              value={f.cvss_score ?? ''}
                              onChange={(e) => {
                                const next = [...findings];
                                next[idx] = { ...f, cvss_score: e.target.value ? Number(e.target.value) : null };
                                setFindings(next);
                                markDirty();
                              }}
                              placeholder="CVSS"
                              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (findingCvssEditorIdx === idx) {
                                  setFindingCvssEditorIdx(null);
                                } else {
                                  setFindingCvssMetrics(parseCvss31Vector(f.cvss_vector) || DEFAULT_CVSS31_METRICS);
                                  setFindingCvssEditorIdx(idx);
                                }
                              }}
                              className={`p-1.5 rounded border ${
                                findingCvssEditorIdx === idx
                                  ? 'bg-indigo-600 border-indigo-400 text-white'
                                  : 'bg-slate-900 border-slate-700 text-cyan-300 hover:bg-slate-800'
                              }`}
                              title="Calculadora CVSS 3.1 para este hallazgo"
                            >
                              <Calculator className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFindings(findings.filter((_, i) => i !== idx));
                                markDirty();
                              }}
                              className="p-1.5 rounded text-rose-400 hover:bg-rose-950/40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* OWASP / CWE / MITRE ATT&CK Preset Bar + Affected Target */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <select
                            value=""
                            onChange={(e) => {
                              const preset = PENTEST_TAXONOMY_PRESETS.find((p) => p.cwe === e.target.value);
                              if (!preset) return;
                              const res = calculateCvss31(preset.defaultMetrics);
                              const next = [...findings];
                              next[idx] = {
                                ...f,
                                cwe_id: preset.cwe,
                                cvss_score: res.score,
                                cvss_vector: res.vector,
                                severity: res.severity,
                              };
                              setFindings(next);
                              markDirty();
                              showToast(`Taxonomía ${preset.cwe} / ${preset.mitre} aplicada`, 'success');
                            }}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                          >
                            <option value="">Aplicar preset OWASP / CWE / MITRE…</option>
                            {PENTEST_TAXONOMY_PRESETS.map((p) => (
                              <option key={p.cwe} value={p.cwe}>
                                {p.cwe} · {p.name} ({p.mitre})
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={f.cwe_id || ''}
                            maxLength={32}
                            onChange={(e) => {
                              const next = [...findings];
                              next[idx] = { ...f, cwe_id: e.target.value };
                              setFindings(next);
                              markDirty();
                            }}
                            placeholder="CWE / OWASP / MITRE ATT&CK"
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-[11px]"
                          />
                          <input
                            type="text"
                            value={f.affected_target || ''}
                            maxLength={255}
                            onChange={(e) => {
                              const next = [...findings];
                              next[idx] = { ...f, affected_target: e.target.value };
                              setFindings(next);
                              markDirty();
                            }}
                            placeholder="Endpoint / Host afectado"
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-[11px]"
                          />
                        </div>

                        {findingCvssEditorIdx === idx && (
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-indigo-500/40 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-indigo-200 text-[11px]">Vector CVSS v3.1 del hallazgo</span>
                              {(() => {
                                const calc = calculateCvss31(findingCvssMetrics);
                                return (
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold text-[11px] tabular-nums">
                                      {calc.score.toFixed(1)} ({calc.severity})
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = [...findings];
                                        next[idx] = {
                                          ...f,
                                          cvss_score: calc.score,
                                          cvss_vector: calc.vector,
                                          severity: calc.severity,
                                        };
                                        setFindings(next);
                                        markDirty();
                                        setFindingCvssEditorIdx(null);
                                      }}
                                      className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px]"
                                    >
                                      Aplicar
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                              {(
                                [
                                  ['AV', 'AV', ['N', 'A', 'L', 'P']],
                                  ['AC', 'AC', ['L', 'H']],
                                  ['PR', 'PR', ['N', 'L', 'H']],
                                  ['UI', 'UI', ['N', 'R']],
                                  ['S', 'S', ['U', 'C']],
                                  ['C', 'C', ['N', 'L', 'H']],
                                  ['I', 'I', ['N', 'L', 'H']],
                                  ['A', 'A', ['N', 'L', 'H']],
                                ] as const
                              ).map(([k, lbl, opts]) => (
                                <label key={k} className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                                  <span className="text-[10px] font-mono text-slate-400">{lbl}:</span>
                                  <select
                                    value={findingCvssMetrics[k]}
                                    onChange={(e) => setFindingCvssMetrics((p) => ({ ...p, [k]: e.target.value }))}
                                    className="flex-1 bg-transparent text-slate-100 text-[11px]"
                                  >
                                    {opts.map((v) => (
                                      <option key={v} value={v} className="bg-slate-950">{v}</option>
                                    ))}
                                  </select>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <textarea
                            rows={2}
                            value={f.summary}
                            maxLength={4000}
                            onChange={(e) => {
                              const next = [...findings];
                              next[idx] = { ...f, summary: e.target.value };
                              setFindings(next);
                              markDirty();
                            }}
                            placeholder="Resumen técnico ({{redact:...}})"
                            className="bg-slate-900 border border-slate-700 rounded p-2 text-slate-100"
                          />
                          <textarea
                            rows={2}
                            value={f.remediation}
                            maxLength={4000}
                            onChange={(e) => {
                              const next = [...findings];
                              next[idx] = { ...f, remediation: e.target.value };
                              setFindings(next);
                              markDirty();
                            }}
                            placeholder="Remediación recomendada…"
                            className="bg-slate-900 border border-slate-700 rounded p-2 text-slate-100"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                </fieldset>
              )}

              {mode === 'assets' && (
                <div className="h-full overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-4 pr-1">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold text-slate-300">
                        Evidencias multimedia (GIF, video y WebP)
                      </h3>
                      <div className="flex items-center gap-2 text-xs">
                        <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={convertUploadToGif}
                            onChange={(e) => setConvertUploadToGif(e.target.checked)}
                          disabled={isWriteupEditingBlocked}
                            className="accent-indigo-500"
                          />
                          Video→GIF
                        </label>
                        <button
                          type="button"
                          disabled={isWriteupEditingBlocked}
                          onClick={() => mediaTabUploadRef.current?.click()}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Subir media
                        </button>
                        <input
                          ref={mediaTabUploadRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.mkv"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              const isVid = f.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(f.name);
                              void handleUploadMedia(f, isVid ? convertUploadToGif : false);
                            }
                            e.target.value = '';
                          }}
                        />
                      </div>
                    </div>

                    {detail.assets.length === 0 ? (
                      <p className="text-xs text-slate-500">Sin medios adjuntos. Pega con Ctrl+V o sube imágenes, GIFs o videos MP4/WebM.</p>
                    ) : (
                      detail.assets.map((asset) => {
                        const savedPct = asset.original_size_bytes > 0
                          ? Math.round((1 - asset.optimized_size_bytes / asset.original_size_bytes) * 100)
                          : 0;
                        const isVideo = asset.mime_type.toLowerCase().startsWith('video/');
                        return (
                          <div key={asset.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                            {assetUrls[asset.id] && (
                              <button
                                type="button"
                                onClick={() => setLightboxAsset(asset)}
                                className="shrink-0 rounded overflow-hidden border border-slate-700 hover:border-indigo-400 transition-colors"
                        title="Ampliar evidencia"
                              >
                                {isVideo ? (
                                  <video src={assetUrls[asset.id]} muted loop playsInline className="w-20 h-14 object-cover bg-black" />
                                ) : (
                                  <img src={assetUrls[asset.id]} alt={asset.filename} className="w-16 h-12 object-cover" />
                                )}
                              </button>
                            )}
                            <div className="flex-1 min-w-0 text-xs">
                              <div className="font-medium text-slate-200 truncate">{asset.filename}</div>
                              <div className="text-[11px] text-slate-400 tabular-nums">
                                {asset.mime_type} · {(asset.optimized_size_bytes / 1024).toFixed(1)} KB ({savedPct}% ahorro)
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setLightboxAsset(asset)}
                              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                              title="Ampliar evidencia"
                              aria-label="Inspeccionar evidencia"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                            {isVideo && (
                              <button
                                type="button"
                                disabled={isWriteupEditingBlocked || convertingAssetId === asset.id}
                                onClick={() => void handleConvertVideoToGif(asset.id)}
                                className="px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center gap-1 shrink-0"
                                title="Convertir este video a GIF animado sin metadatos"
                              >
                                <Film className="w-3.5 h-3.5" />
                                {convertingAssetId === asset.id ? 'Convirtiendo…' : 'A GIF'}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={isWriteupEditingBlocked}
                              onClick={() => {
                                setMarkdown((prev) => `${prev}\n![${asset.filename}](asset://${asset.id})\n`);
                                markDirty();
                                showToast('Referencia añadida al informe', 'success');
                              }}
                              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300"
                              title="Añadir al informe"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={isWriteupEditingBlocked}
                              onClick={() => void handleDeleteAsset(asset)}
                              className="p-1.5 rounded text-slate-400 hover:text-rose-400"
                              title="Eliminar medio"
                              aria-label="Eliminar medio"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="space-y-4">
                    {/* Citations & Stale Diff Panel */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-slate-300">
                        Citas del informe en la pizarra ({detail.citations.length})
                      </h3>
                      {detail.citations.length === 0 ? (
                        <p className="text-xs text-slate-500">Selecciona texto en el editor y pulsa Citar para enlazarlo.</p>
                      ) : (
                        detail.citations.map((cit) => (
                          <div key={cit.id} className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-indigo-300">#{cit.anchor_id}</span>
                                <span className="text-[11px] text-slate-400 tabular-nums">L{cit.line_start}</span>
                                {cit.is_stale && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-semibold">
                                    Texto modificado
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleJumpToCitation(cit)}
                                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]"
                                >
                                  Ir a línea
                                </button>
                                {cit.is_stale && (
                                  <button
                                    type="button"
                                    onClick={() => void handleReanchorCitation(cit)}
                                    className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/30 text-amber-200 text-[11px] flex items-center gap-1"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                    Vincular de nuevo
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="text-[11px] text-slate-300 line-clamp-2 italic">"{cit.quoted_text}"</p>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-slate-300">Historial de revisiones</h3>
                      {revisions.length === 0 ? (
                        <p className="text-xs text-slate-400">Guarda una revisión desde la parte superior para poder restaurarla después.</p>
                      ) : (
                        revisions.map((rev) => (
                          <div key={rev.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
                            <div>
                              <div className="font-medium text-slate-200">
                                v{rev.revision_number} · {rev.change_note || 'Revisión'}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {formatApiDateTime(rev.created_at, systemLocale || 'es-MX')} · {rev.content_hash.slice(0, 12)}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setDiffRevision(rev)}
                                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 flex items-center gap-1"
                                title="Comparar línea por línea contra el borrador actual"
                              >
                                <GitCompare className="w-3 h-3" />
                                Diff
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRestoreRevision(rev)}
                                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 flex items-center gap-1"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Restaurar
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-slate-300">Auditoría de exportaciones</h3>
                      {detail.export_logs.length === 0 ? (
                        <EmptyState
                          icon={Download}
                          title="Sin exportaciones registradas"
                          description="Exporta el informe y muestra un código de verificación."
                          className="p-4"
                        />
                      ) : (
                        detail.export_logs.map((log) => (
                          <div key={log.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] text-slate-300 tabular-nums">
                            <span className="flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <strong className="uppercase">{log.export_format}</strong>
                              {log.redacted_for_client && <span className="px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Cliente</span>}
                            </span>
                            <span className="font-mono text-slate-400">{log.sha256.slice(0, 12)} · {(log.byte_size / 1024).toFixed(1)}KB</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {showExportModal && detail && (
                  <WriteupExportModal
          writeup={detail}
          onClose={() => setShowExportModal(false)}
          onExport={handleExport}
        />
      )}

      {/* Evidence Image / Video Lightbox Modal */}
      {lightboxAsset && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-start sm:items-center justify-center overflow-y-auto overscroll-contain p-2 sm:p-4"
          onClick={() => setLightboxAsset(null)}
        >
          <div
            ref={modalDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lightbox-modal-title"
            className="my-auto w-full max-w-3xl max-h-[calc(100dvh-1rem)] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/95">
              <div className="min-w-0">
                <h3 id="lightbox-modal-title" className="text-sm font-semibold text-white truncate">{lightboxAsset.filename}</h3>
                <p className="text-[11px] text-slate-400 font-mono truncate">
                  {lightboxAsset.mime_type} · {lightboxAsset.width}×{lightboxAsset.height}px · Código de verificación: {lightboxAsset.sha256.slice(0, 16)}…
                </p>
              </div>
              <button
                ref={modalCloseRef}
                type="button"
                onClick={() => setLightboxAsset(null)}
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                aria-label="Cerrar visor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-3 sm:p-4 bg-slate-950 flex items-center justify-center min-h-[120px] sm:min-h-[220px]">
              {assetUrls[lightboxAsset.id] ? (
                lightboxAsset.mime_type.toLowerCase().startsWith('video/') ? (
                  <video src={assetUrls[lightboxAsset.id]} controls autoPlay loop muted className="max-h-[60vh] rounded-lg border border-slate-800" />
                ) : (
                  <img src={assetUrls[lightboxAsset.id]} alt={lightboxAsset.filename} className="max-h-[60vh] object-contain rounded-lg border border-slate-800" />
                )
              ) : failedAssetIds[lightboxAsset.id] ? (
                <p className="text-xs text-rose-300">No se pudo abrir esta evidencia.</p>
              ) : (
                <p className="text-xs text-slate-400">Abriendo evidencia…</p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-slate-800 bg-slate-900 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className={`px-2 py-0.5 rounded border ${lightboxAsset.exif_stripped ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
                  {lightboxAsset.exif_stripped ? 'Datos de imagen eliminados' : 'Sin datos adicionales de imagen'}
                </span>
                <span className="text-slate-400 tabular-nums">
                  {(lightboxAsset.original_size_bytes / 1024).toFixed(1)} KB → {(lightboxAsset.optimized_size_bytes / 1024).toFixed(1)} KB
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(lightboxAsset.sha256);
                  showToast('Código de verificación copiado', 'info');
                  }}
                  className="min-h-11 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar código de verificación
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMarkdown((prev) => `${prev}\n![${lightboxAsset.filename}](asset://${lightboxAsset.id})\n`);
                    markDirty();
                    setLightboxAsset(null);
                    showToast('Evidencia añadida al informe', 'success');
                  }}
                  className="min-h-11 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                >
                  Añadir al informe
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRecovery && detail && recoveryCandidates.length > 0 && (
        <div ref={recoveryDialogRef} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="writeup-recovery-title">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 text-slate-100 shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-4">
              <div>
                <h3 id="writeup-recovery-title" className="font-semibold">Copias locales recuperables</h3>
                <p className="mt-1 text-sm text-slate-300">Cada pestaña guarda su propia copia cifrada. Recupera la que tenga tus cambios más recientes; las demás se conservan.</p>
              </div>
              <button ref={recoveryCloseRef} type="button" onClick={() => setShowRecovery(false)} className="min-h-11 rounded-lg bg-slate-800 px-4 py-2 text-sm">Conservar y cerrar</button>
            </div>
            <div className="min-h-0 space-y-3 overflow-y-auto p-4" aria-label="Copias guardadas en este navegador">
              {recoveryCandidates.map((candidate, index) => {
                const stale = candidate.draft.baseUpdatedAt !== detail.updated_at;
                const savedAt = candidate.draft.savedAt;
                const preview = candidate.draft.markdown.replace(/\s+/g, ' ').trim();
                return (
                  <article key={candidate.storageKey} className="rounded-lg border border-slate-700 bg-slate-900/80 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-semibold">{candidate.draft.title || `Copia ${index + 1}`}</h4>
                        <p className="mt-1 text-xs text-slate-400">
                          {savedAt ? `Guardada ${formatApiDateTime(savedAt, systemLocale || 'es-MX')}` : 'Fecha de copia desconocida'}
                          {' · '}{candidate.legacy ? 'Formato anterior' : 'Esta pestaña'}
                        </p>
                        {!!candidate.draft.boardDrafts?.length && <p className="mt-2 text-xs text-indigo-200">{candidate.draft.boardDrafts.length} pizarra(s) pendiente(s): {candidate.draft.boardDrafts.map(board => board.title).join(', ')}</p>}
                        {stale && <p className="mt-2 flex items-center gap-1 text-xs text-amber-200"><AlertTriangle className="h-3.5 w-3.5" />El informe del servidor cambió; habrá que comparar antes de guardar.</p>}
                        <p className="mt-2 line-clamp-2 break-words text-xs text-slate-300">{preview.slice(0, 240) || 'El borrador no contiene texto Markdown.'}</p>
                      </div>
                      <button type="button" onClick={() => restoreRecoveryCandidate(candidate)} className="min-h-11 shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
                        {stale ? 'Comparar y recuperar' : 'Recuperar copia'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="border-t border-slate-800 px-4 py-3 text-xs text-slate-400">Cerrar esta ventana no borra las copias. Se eliminan automáticamente solo después de confirmar el guardado de la versión recuperada.</p>
          </div>
        </div>
      )}

      {/* Line-by-Line Revision Diff Modal */}
      {showConflict && saveConflict && detail && (
        <div ref={conflictDialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="writeup-conflict-title">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 text-slate-100 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
              <div><h3 id="writeup-conflict-title" className="font-semibold">El informe cambió en otra sesión</h3><p className="mt-1 text-sm text-slate-300">Compara el Markdown y los campos antes de elegir qué versión guardar.</p></div>
              <button ref={conflictCloseRef} type="button" onClick={() => setShowConflict(false)} className="min-h-11 rounded-lg bg-slate-800 px-4 py-2 text-sm">Cerrar</button>
            </div>
            <div className="min-h-0 overflow-auto p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2" role="group" aria-label="Vista de comparación">
                  <button type="button" aria-pressed={conflictCompareMode === 'diff'} onClick={() => setConflictCompareMode('diff')} className={`min-h-10 rounded-lg px-3 text-xs ${conflictCompareMode === 'diff' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}>Cambios por línea</button>
                  <button type="button" aria-pressed={conflictCompareMode === 'side-by-side'} onClick={() => setConflictCompareMode('side-by-side')} className={`min-h-10 rounded-lg px-3 text-xs ${conflictCompareMode === 'side-by-side' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}>Lado a lado</button>
                </div>
                {conflictCompareMode === 'diff' && conflictDiff.length > 400 && <div className="flex items-center gap-2 text-xs text-slate-300">
                  <span>Filas {conflictDiffPage * 400 + 1}–{Math.min((conflictDiffPage + 1) * 400, conflictDiff.length)} de {conflictDiff.length}</span>
                  <button type="button" disabled={conflictDiffPage === 0} onClick={() => setConflictDiffPage(page => Math.max(0, page - 1))} className="min-h-10 rounded bg-slate-800 px-3 disabled:opacity-40">Anterior</button>
                  <button type="button" disabled={(conflictDiffPage + 1) * 400 >= conflictDiff.length} onClick={() => setConflictDiffPage(page => page + 1)} className="min-h-10 rounded bg-slate-800 px-3 disabled:opacity-40">Siguiente</button>
                </div>}
              </div>
              {conflictCompareMode === 'diff' ? (
                <div className="overflow-auto rounded-lg border border-slate-800 bg-slate-900" aria-live="polite">
                  {conflictDiffLoading ? <p className="p-4 text-sm text-slate-300">Comparando los cambios…</p> : conflictDiff.length ? (
                    <pre aria-label="Cambios de Markdown por línea" className="max-h-[52vh] min-h-48 overflow-auto p-3 font-mono text-xs leading-5">{conflictDiff.slice(conflictDiffPage * 400, (conflictDiffPage + 1) * 400).map((line, index) => (
                      <div key={`${conflictDiffPage}-${index}`} className={`whitespace-pre-wrap break-words px-2 ${line.kind === 'added' ? 'bg-emerald-950/70 text-emerald-200' : line.kind === 'removed' ? 'bg-rose-950/70 text-rose-200' : 'text-slate-300'}`}><span aria-hidden="true" className="mr-2 inline-block w-4 select-none text-slate-500">{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}</span>{line.text || ' '}</div>
                    ))}</pre>
                  ) : <p className="p-4 text-sm text-slate-300">No hay diferencias de Markdown o no se pudo calcular la comparación. Usa la vista lado a lado para revisar el texto completo.</p>}
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex min-w-0 flex-col gap-2 text-sm font-semibold">Tu borrador · {title} · {statusVal} · {severity}<textarea readOnly value={markdown} rows={18} className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm font-normal text-white" /></label>
                  <label className="flex min-w-0 flex-col gap-2 text-sm font-semibold">Versión guardada{conflictServer ? ` · ${conflictServer.title} · ${conflictServer.status} · ${conflictServer.severity}` : ' · No se pudo cargar'}<textarea readOnly value={conflictServer?.markdown_content || ''} rows={18} className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm font-normal text-white" /></label>
                </div>
              )}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="flex min-w-0 flex-col gap-2 text-sm font-semibold">Campos de tu borrador<textarea readOnly rows={8} value={JSON.stringify({ title, status: statusVal, severity, cvssScore, cvssVector, cweId, cveId, targetScope, execSummary, prospectId, projectId, findings }, null, 2)} className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs font-normal text-white" /></label>
                <label className="flex min-w-0 flex-col gap-2 text-sm font-semibold">Campos guardados<textarea readOnly rows={8} value={conflictServer ? JSON.stringify({ title: conflictServer.title, status: conflictServer.status, severity: conflictServer.severity, cvssScore: conflictServer.cvss_score, cvssVector: conflictServer.cvss_vector, cweId: conflictServer.cwe_id, cveId: conflictServer.cve_id, targetScope: conflictServer.target_scope, execSummary: conflictServer.executive_summary, prospectId: conflictServer.prospect_id, projectId: conflictServer.project_id, findings: conflictServer.findings }, null, 2) : ''} className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs font-normal text-white" /></label>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 p-4">
              <button type="button" onClick={() => setShowConflict(false)} className="rounded-lg bg-slate-800 px-4 py-2 text-sm">Seguir con mi borrador</button>
              <button type="button" onClick={async () => {
                const accepted = await confirm({ title: 'Usar mi borrador', message: 'Al guardar se reemplazarán el texto y los campos del informe en el servidor con los de tu borrador. Se volverá a comprobar que no haya cambios nuevos.', confirmLabel: 'Usar mi borrador', tone: 'warning' });
                if (!accepted) return;
                try {
                  const latest = await api.getWriteup(detail.id);
                  if (selectedIdRef.current === detail.id) { writeupVersionByReportRef.current[detail.id] = latest.updated_at; setDetail(latest); setSaveConflict(false); setConflictServer(null); setShowConflict(false); setSaveError(''); }
                } catch (err) { showToast(err instanceof Error ? err.message : 'No se pudo comprobar el informe.', 'error'); }
              }} className="rounded-lg bg-amber-900 px-4 py-2 text-sm text-white hover:bg-amber-800">Usar mi borrador</button>
              <button type="button" onClick={async () => {
                const accepted = await confirm({ title: 'Cargar la versión guardada', message: 'Se reemplazarán los cambios locales de este editor. Copia antes cualquier contenido que quieras conservar.', confirmLabel: 'Cargar versión guardada', tone: 'warning' });
                if (!accepted) return;
            try { const latest = await api.getWriteup(detail.id); if (selectedIdRef.current === detail.id) { writeupVersionByReportRef.current[detail.id] = latest.updated_at; recoveredSourceRef.current = null; hydrateDraft(latest); setSaveError(''); } }
                catch (err) { showToast(err instanceof Error ? err.message : 'No se pudo cargar el informe.', 'error'); }
              }} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">Cargar versión guardada</button>
            </div>
          </div>
        </div>
      )}
  {showRevisionHistory && detail && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-start sm:items-center justify-center overflow-y-auto overscroll-contain p-2 sm:p-4"
          onClick={closeRevisionHistory}
        >
          <div
            ref={modalDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="diff-modal-title"
            className="my-auto w-full max-w-5xl max-h-[calc(100dvh-1rem)] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-slate-800">
              <div className="min-w-0">
                <h3 id="diff-modal-title" className="text-sm font-semibold text-white">Historial del informe</h3>
                <p className="text-[11px] text-slate-400">Compara, previsualiza y restaura una versión anterior.</p>
              </div>
              <div className="flex max-w-full flex-wrap items-center gap-2">
                {diffRevision && revisionSelectionExplicit && <button type="button" disabled={revisionDetailLoading} onClick={() => void handleRestoreRevision(diffRevision, true)} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1 disabled:cursor-wait disabled:opacity-50">
                  <RotateCcw className="w-3.5 h-3.5" /> Restaurar v{diffRevision.revision_number}
                </button>}
                {diffRevision && !revisionSelectionExplicit && <span className="self-center text-[11px] text-slate-400">Elige una versión para habilitar la restauración.</span>}
                <button
                  ref={modalCloseRef}
                  type="button"
                  onClick={closeRevisionHistory}
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  aria-label="Cerrar comparación"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {diffRevision && <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-slate-800">
              <span className="mr-auto self-center text-xs text-slate-400">v{diffRevision.revision_number} · {diffRevision.change_note || 'Revisión'} · {formatApiDateTime(diffRevision.created_at, systemLocale || 'es-MX')}</span>
              <button type="button" onClick={() => setRevisionView('diff')} aria-pressed={revisionView === 'diff'} className={`px-3 py-1.5 rounded text-xs ${revisionView === 'diff' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}>Cambios</button>
              <button type="button" onClick={() => setRevisionView('preview')} aria-pressed={revisionView === 'preview'} className={`px-3 py-1.5 rounded text-xs ${revisionView === 'preview' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}>Vista previa</button>
            </div>}
            <div className="flex flex-1 min-h-0 flex-col sm:flex-row overflow-auto">
              <nav aria-label="Versiones del informe" className="sm:w-72 shrink-0 border-b sm:border-b-0 sm:border-r border-slate-800 p-3 overflow-auto">
                <form className="border-b border-slate-800 pb-3" onSubmit={event => { event.preventDefault(); void openRevisionHistory(); }}>
                  <details open={revisionFilterCount > 0}>
                    <summary className="cursor-pointer rounded px-2 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800">Filtros{revisionFilterCount ? ` · ${revisionFilterCount} activos` : ''}</summary>
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <label className="col-span-2 text-[11px] text-slate-300">Buscar nombre, nota o autor
                        <input value={revisionSearch} onChange={event => setRevisionSearch(event.target.value)} maxLength={120} className="mt-1 min-h-10 w-full rounded bg-slate-950 px-2 text-xs text-white" placeholder="Ej. Acceso inicial confirmado" />
                      </label>
                      <label className="text-[11px] text-slate-300">Tipo
                        <select value={revisionType} onChange={event => setRevisionType(event.target.value as WriteupRevision['change_type'] | '')} className="mt-1 min-h-10 w-full rounded bg-slate-950 px-2 text-xs text-white">
                          <option value="">Todos</option><option value="initial">Inicial</option><option value="autosave">Autoguardado</option><option value="manual">Manual</option><option value="milestone">Importante</option><option value="restore">Restauración</option><option value="edit">Edición</option><option value="evidence">Evidencia</option><option value="board">Pizarra</option><option value="citation">Cita</option>
                        </select>
                      </label>
                      <label className="text-[11px] text-slate-300">Autor
                        <select value={revisionAuthor} onChange={event => setRevisionAuthor(event.target.value)} className="mt-1 min-h-10 w-full rounded bg-slate-950 px-2 text-xs text-white">
                          <option value="">Todos</option>{revisionAuthors.map(author => <option key={author.id} value={author.id}>{author.name}</option>)}
                        </select>
                      </label>
                      <label className="text-[11px] text-slate-300">Desde<input aria-label="Fecha inicial" type="date" value={revisionAfter} onChange={event => setRevisionAfter(event.target.value)} className="mt-1 min-h-10 w-full rounded bg-slate-950 px-2 text-xs text-white" /></label>
                      <label className="text-[11px] text-slate-300">Hasta<input aria-label="Fecha final" type="date" value={revisionBefore} onChange={event => setRevisionBefore(event.target.value)} className="mt-1 min-h-10 w-full rounded bg-slate-950 px-2 text-xs text-white" /></label>
                      <button type="submit" disabled={revisionLoading} className="col-span-2 min-h-10 rounded bg-indigo-600 px-3 text-xs font-medium text-white disabled:opacity-50">{revisionLoading ? 'Aplicando…' : 'Aplicar filtros'}</button>
                      {revisionFilterCount > 0 && <button type="button" disabled={revisionLoading} onClick={() => { setRevisionSearch(''); setRevisionType(''); setRevisionAuthor(''); setRevisionAfter(''); setRevisionBefore(''); void openRevisionHistory(true); }} className="col-span-2 min-h-10 rounded border border-slate-700 px-3 text-xs text-slate-200 disabled:opacity-50">Limpiar filtros</button>}
                    </div>
                  </details>
                </form>
                <p className="mt-3 text-xs font-semibold text-slate-300">Versiones ({revisions.length})</p>
                {revisionTree.map(([key, group], index) => <details key={key} open={index === 0} className="mt-2">
                  <summary className="cursor-pointer rounded px-2 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800">{group.label} <span className="text-slate-500">({group.revisions.length})</span></summary>
                  <div className="mt-1 space-y-1">
                    {group.revisions.map(rev => <button key={rev.id} type="button" onClick={() => void selectRevision(rev)} aria-current={rev.id === diffRevision?.id ? 'true' : undefined} className={`w-full rounded border px-2 py-2 text-left text-xs ${rev.id === diffRevision?.id ? 'border-emerald-700/50 bg-emerald-950/30 text-white' : 'border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800'}`}>
                      <span className="block font-medium">v{rev.revision_number} · {rev.change_note || 'Revisión'}</span>
                      <span className="mt-1 block text-slate-400">{rev.created_by_name || 'Sistema'} · {formatApiDateTime(rev.created_at, systemLocale || 'es-MX')}</span>
                    </button>)}
                  </div>
                </details>)}
                {!revisionLoading && revisions.length === 0 && <p className="mt-3 text-xs text-slate-400">No hay versiones con estos filtros.</p>}
                {revisions.length > 0 && !revisionEnd && <button type="button" onClick={() => void loadMoreRevisions()} disabled={revisionLoading} className="w-full mt-2 min-h-10 px-3 py-2 text-xs text-slate-200 bg-slate-800 rounded disabled:opacity-50">{revisionLoading ? 'Cargando…' : 'Cargar versiones anteriores'}</button>}
              </nav>
              {!diffRevision ? <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-400">Selecciona una versión para ver los cambios.</div> : revisionDetailLoading ? <div role="status" className="flex flex-1 items-center justify-center p-8 text-sm text-slate-300">Cargando la versión completa…</div> : revisionView === 'preview' ? <div className="flex-1 overflow-auto p-4 bg-slate-950">
                {diffRevision.snapshot ? <div className="mb-6 space-y-3 text-sm text-slate-200">
                  <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                    <h3 className="text-lg font-semibold text-white">{String(diffRevision.snapshot.fields.title || 'Informe sin título')}</h3>
                    <p className="mt-1 text-xs text-slate-300">Estado: {String(diffRevision.snapshot.fields.status || '—')} · Severidad: {String(diffRevision.snapshot.fields.severity || '—')} · CVSS: {String(diffRevision.snapshot.fields.cvss_score ?? '—')}</p>
                    <p className="mt-1 text-xs text-slate-400">CWE: {String(diffRevision.snapshot.fields.cwe_id || '—')} · CVE: {String(diffRevision.snapshot.fields.cve_id || '—')} · Alcance: {String(diffRevision.snapshot.fields.target_scope || '—')}</p>
                    {diffRevision.snapshot.executive_summary && <p className="mt-3 whitespace-pre-wrap">{diffRevision.snapshot.executive_summary}</p>}
                  </section>
                  {diffRevision.snapshot.findings.length > 0 && <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                    <h4 className="font-semibold text-white">Hallazgos · {diffRevision.snapshot.findings.length}</h4>
                    <div className="mt-2 space-y-2">{diffRevision.snapshot.findings.map((finding, index) => <details key={`${finding.id}-${index}`} className="rounded border border-slate-800 p-2">
                      <summary className="cursor-pointer font-medium">{finding.id} · {finding.title} <span className="text-slate-400">({finding.severity})</span></summary>
                      {finding.affected_target && <p className="mt-2 break-all text-xs text-slate-400">Activo: {finding.affected_target}</p>}
                      {finding.summary && <p className="mt-2 whitespace-pre-wrap text-xs">{finding.summary}</p>}
                      {finding.remediation && <p className="mt-2 whitespace-pre-wrap text-xs text-emerald-200">Remediación: {finding.remediation}</p>}
                    </details>)}</div>
                  </section>}
                  {diffRevision.snapshot.boards.length > 0 && <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                    <h4 className="font-semibold text-white">Pizarras · {diffRevision.snapshot.boards.length}</h4>
                    <div className="mt-2 space-y-2">{diffRevision.snapshot.boards.map(board => <details key={board.id} className="rounded border border-slate-800 p-2">
                      <summary className="cursor-pointer">{board.title} · {board.element_count} elementos</summary>
                      {board.svg_snapshot && <img loading="lazy" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(board.svg_snapshot)}`} alt={`Vista guardada de la pizarra ${board.title}`} className="mt-2 max-h-80 max-w-full rounded border border-slate-700 bg-slate-950 object-contain" />}
                    </details>)}</div>
                  </section>}
                  {diffRevision.snapshot.citations.length > 0 && <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                    <h4 className="font-semibold text-white">Citas y vínculos · {diffRevision.snapshot.citations.length}</h4>
                    <div className="mt-2 space-y-2">{diffRevision.snapshot.citations.map(citation => <article key={citation.id} className="rounded border border-slate-800 p-2 text-xs">
                      <p className="font-medium">{citation.anchor_id} · líneas {citation.line_start}–{citation.line_end}{citation.heading_path ? ` · ${citation.heading_path}` : ''}</p>
                      <blockquote className="mt-1 border-l-2 border-slate-600 pl-2 text-slate-300">{citation.quoted_text}</blockquote>
                      {citation.note && <p className="mt-1 text-slate-400">{citation.note}</p>}
                    </article>)}</div>
                  </section>}
                  {(diffRevision.snapshot.assets?.length || 0) > 0 && <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                    <h4 className="font-semibold text-white">Evidencias · {diffRevision.snapshot.assets?.length || 0}</h4>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">{diffRevision.snapshot.assets?.map(asset => <figure key={asset.id} className="min-w-0 rounded border border-slate-800 p-2">
                      {assetUrls[asset.id] && <img loading="lazy" src={assetUrls[asset.id]} alt={asset.caption || asset.filename} className="max-h-48 max-w-full rounded object-contain" />}
                      <figcaption className="mt-1 break-all text-xs">{asset.filename}{asset.caption ? ` · ${asset.caption}` : ''}</figcaption>
                    </figure>)}</div>
                  </section>}
                </div> : <p className="mb-4 rounded border border-amber-800/60 bg-amber-950/30 p-3 text-sm text-amber-200">Esta revisión antigua solo conserva el Markdown. Las versiones creadas ahora también incluyen los datos, hallazgos, pizarras, citas y evidencias.</p>}
                <MarkdownRichPreview markdown={diffRevision.markdown_content || ''} redactPreview={false} boards={diffRevision.snapshot?.boards ?? detail.boards} assets={diffRevision.snapshot?.assets ?? detail.assets} assetObjectUrls={assetUrls} /></div> : <div className="flex-1 overflow-auto p-3 bg-slate-950 font-mono text-xs space-y-0.5">
              {changedRevisionSections.length > 0 && <p className="mb-3 rounded bg-amber-950/50 p-2 font-sans text-amber-200">También cambiaron: {changedRevisionSections.join(', ')}. Abre Vista previa para consultar la versión guardada.</p>}
              {diffLoading && <p role="status" className="py-3 font-sans text-slate-300">Calculando cambios…</p>}
              {diffError && <div role="alert" className="py-3 font-sans text-rose-300">{diffError} <button type="button" onClick={() => setDiffAttempt(value => value + 1)} className="rounded bg-slate-800 px-3 py-2 text-slate-100">Reintentar</button></div>}
              {revisionDiff.slice(diffPage * 300, (diffPage + 1) * 300).map((ln, i) => (
                <div
                  key={i}
                  className={`px-2 py-0.5 rounded whitespace-pre-wrap break-all ${
                    ln.kind === 'added'
                      ? 'bg-emerald-950/60 text-emerald-300'
                      : ln.kind === 'removed'
                        ? 'bg-rose-950/60 text-rose-300'
                        : 'text-slate-400'
                  }`}
                >
                  <span className="inline-block w-4 select-none opacity-75">
                    {ln.kind === 'added' ? '+' : ln.kind === 'removed' ? '-' : ' '}
                  </span>
                  {ln.text || ' '}
                </div>
              ))}
              {revisionDiff.length > 300 && <div className="flex items-center gap-3 py-3 font-sans text-slate-200"><button type="button" disabled={diffPage === 0} onClick={() => setDiffPage(page => page - 1)} className="px-3 py-2 bg-slate-800 rounded disabled:opacity-40">Anterior</button><span>Bloque {diffPage + 1} de {Math.ceil(revisionDiff.length / 300)}</span><button type="button" disabled={(diffPage + 1) * 300 >= revisionDiff.length} onClick={() => setDiffPage(page => page + 1)} className="px-3 py-2 bg-slate-800 rounded disabled:opacity-40">Siguiente</button></div>}
              </div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
