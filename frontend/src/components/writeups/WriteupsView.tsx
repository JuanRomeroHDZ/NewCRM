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
  Film,
  GitCompare,
  History,
  Image as ImageIcon,
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
  X,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { useC2 } from '../../context/C2Context';
import { EmptyState } from '../common/EmptyState';
import { api } from '../../lib/api';
import { formatApiDateTime } from '../../lib/dates';
import {
  InternalProject,
  Prospect,
  WriteupAsset,
  WriteupBoard,
  WriteupCitation,
  WriteupDetail,
  WriteupExportFormat,
  WriteupRevision,
  WriteupSeverity,
  WriteupStatus,
  WriteupStructuredFinding,
  WriteupSummary,
} from '../../types';
import { PentestWhiteboard } from './PentestWhiteboard';
import { WriteupExportModal } from './WriteupExportModal';
import { WriteupMarkdownSplitEditor } from './WriteupMarkdownSplitEditor';
import { MarkdownRichPreview } from './MarkdownRichPreview';
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

const MAX_REPORT_TITLE_LENGTH = 200;
const MAX_REPORT_TEXT_LENGTH = 500000;
const MAX_FINDINGS_COUNT = 200;

const SEVERITY_BAR_COLOR: Record<WriteupSeverity, string> = {
  critica: '#f43f5e',
  alta: '#f97316',
  media: '#f59e0b',
  baja: '#0ea5e9',
  informativa: '#64748b',
};

type WorkspaceMode = 'markdown' | 'whiteboard' | 'dual' | 'findings' | 'assets';

export const WriteupsView: React.FC = () => {
  const { isUnlocked, openUnlockModal, showToast, confirm, prompt, systemLocale } = useVault();
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
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [creatingWriteup, setCreatingWriteup] = useState(false);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [mode, setMode] = useState<WorkspaceMode>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 1280 ? 'dual' : 'markdown'
  );
  const [showList, setShowList] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1280 : true
  );
  const [showMetadata, setShowMetadata] = useState(false);
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
  const [saveError, setSaveError] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [editVersion, setEditVersion] = useState(0);
  const draftVersion = useRef(0);
  const saveInFlight = useRef(false);
  const lastAutoRevision = useRef(0);
  const autoSaveRef = useRef<() => void>(() => {});
  const markDirty = () => { draftVersion.current += 1; setEditVersion(draftVersion.current); setDirty(true); };
  const [showExportModal, setShowExportModal] = useState(false);
  const [lightboxAsset, setLightboxAsset] = useState<WriteupAsset | null>(null);
  const [diffRevision, setDiffRevision] = useState<WriteupRevision | null>(null);
  const [revisionView, setRevisionView] = useState<'diff' | 'preview'>('diff');
  const [findingCvssEditorIdx, setFindingCvssEditorIdx] = useState<number | null>(null);
  const [findingCvssMetrics, setFindingCvssMetrics] = useState<Cvss31Metrics>(DEFAULT_CVSS31_METRICS);
  const [revisions, setRevisions] = useState<WriteupRevision[]>([]);
  const [revisionLoading, setRevisionLoading] = useState(false);
  const [revisionEnd, setRevisionEnd] = useState(false);
  const [diffPage, setDiffPage] = useState(0);
  useEffect(() => { setDiffPage(0); }, [diffRevision?.id]);
  useEffect(() => { setRevisionEnd(false); }, [selectedId]);
  const loadMoreRevisions = async () => {
    if (!detail || revisionLoading) return;
    const id = detail.id;
    setRevisionLoading(true);
    try {
      const more = await api.listWriteupRevisions(id, revisions.length);
      if (selectedIdRef.current === id) {
        setRevisions(previous => [...previous, ...more.filter(item => !previous.some(existing => existing.id === item.id))]);
        setRevisionEnd(more.length < 40);
      }
    } catch (err) { showToast(err instanceof Error ? err.message : 'No se pudo cargar el historial', 'error'); }
    finally { setRevisionLoading(false); }
  };
  const openRevisionHistory = async () => {
    if (!detail || revisionLoading) return;
    const id = detail.id;
    setRevisionLoading(true);
    try {
      const latest = await api.listWriteupRevisions(id);
      if (selectedIdRef.current === id) {
        setRevisions(latest);
        setRevisionEnd(false);
        if (latest.length) { setRevisionView('diff'); setDiffRevision(latest[0]); }
        else showToast('Todavía no hay versiones para este informe.', 'info');
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
  const mediaTabUploadRef = useRef<HTMLInputElement>(null);
  const modalDialogRef = useRef<HTMLDivElement>(null);
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const previousModalFocusRef = useRef<HTMLElement | null>(null);
  const listRequestVersion = useRef(0);
  const detailRequestVersion = useRef(0);
  const selectionInProgressRef = useRef(false);
  const creationInProgressRef = useRef(false);
  const nextListOffset = useRef(0);

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
      worker.postMessage({ oldText: diffRevision.markdown_content, newText: markdown });
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
  const [findings, setFindings] = useState<WriteupStructuredFinding[]>([]);
  const [prospectId, setProspectId] = useState('');
  const [projectId, setProjectId] = useState('');
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
    return () => {
      Object.values(assetUrlsRef.current).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  useEffect(() => {
    if (isUnlocked) return;
    listRequestVersion.current += 1;
    detailRequestVersion.current += 1;
    selectedIdRef.current = null;
    clearAssetUrlCache();
    setItems([]);
    setSelectedId(null);
    setDetail(null);
    setRevisions([]);
    setProspects([]);
    setProjects([]);
    setAssetUrls({});
    setFailedAssetIds({});
    setActiveBoardId(null);
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
  }, [isUnlocked, clearAssetUrlCache]);

  const hydrateDraft = (data: WriteupDetail) => {
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
    setDirty(false);
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

  const loadDetail = useCallback(async (id: string) => {
    if (!isUnlocked) return;
    const version = ++detailRequestVersion.current;
    lastAutoRevision.current = 0;
    setLastSavedAt(null);
    setSaveError('');
    setLoadingDetail(true);
    setDetailError('');
    try {
      const data = await api.getWriteup(id);
      if (version !== detailRequestVersion.current) return;
      hydrateDraft(data);
      try {
        const revs = await api.listWriteupRevisions(id);
        if (version !== detailRequestVersion.current) return;
        setRevisions(revs);
        setRevisionEnd(false);
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
  }, [isUnlocked, preloadAssetUrls]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId && isUnlocked) {
      void loadDetail(selectedId);
    }
  }, [selectedId, isUnlocked, loadDetail]);

  const confirmDiscardDraft = async (nextAction: string) => {
    if (!dirty) return true;
    return confirm({
      title: 'Cambios sin guardar',
      message: `Tienes cambios sin guardar. Si ${nextAction}, se perderán.`,
      confirmLabel: 'Descartar cambios',
      cancelLabel: 'Seguir editando',
      tone: 'warning',
    });
  };

  const handleSelectWriteup = async (id: string) => {
    if (id === selectedIdRef.current) {
      if (typeof window !== 'undefined' && window.innerWidth < 1280) setShowList(false);
      return;
    }
    if (selectionInProgressRef.current) return;
    selectionInProgressRef.current = true;
    try {
      if (!(await confirmDiscardDraft('cambias de informe'))) return;
      detailRequestVersion.current += 1;
      clearAssetUrlCache();
      selectedIdRef.current = id;
      setSelectedId(id);
      setDetail(null);
      setRevisions([]);
      setDetailError('');
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
      if (!(await confirmDiscardDraft('creas un informe')) || !isUnlocked) return;
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
      if (!(await confirmDiscardDraft('importas la sesión C2')) || !isUnlocked) return;

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

  const handleSaveWriteup = async (saveRevision = false, markdownOverride?: string, automatic = false) => {
    if (!detail || saveInFlight.current) return false;
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
        save_revision: saveRevision,
        revision_note: saveRevision ? (automatic ? 'Guardado automático' : 'Instantánea manual del editor') : undefined,
      });
      // Keep edits made while the request was in flight.
      if (selectedIdRef.current === detail.id) {
        if (draftVersion.current === savedVersion) hydrateDraft(updated);
        else setDetail(updated);
        setLastSavedAt(new Date());
      }
      if (saveRevision) {
        if (automatic) lastAutoRevision.current = Date.now();
        try {
          const refreshedRevisions = await api.listWriteupRevisions(detail.id);
          if (selectedIdRef.current === detail.id) { setRevisions(refreshedRevisions); setRevisionEnd(false); }
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
      const message = err instanceof Error ? err.message : 'Error al guardar el informe';
      if (selectedIdRef.current === detail.id) {
        setSaveError(message);
        if (!automatic) showToast(message, 'error');
      }
      return false;
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  autoSaveRef.current = () => {
    if (dirty && !saveInFlight.current) {
      void handleSaveWriteup(Date.now() - lastAutoRevision.current >= 60_000, undefined, true);
    }
  };

  useEffect(() => {
    if (!dirty || !detail || !isUnlocked) return;
    const delay = window.setTimeout(() => autoSaveRef.current(), 2500);
    return () => window.clearTimeout(delay);
  }, [dirty, detail?.id, isUnlocked, editVersion]);

  useEffect(() => {
    if (!dirty || !detail || !isUnlocked) return;
    const interval = window.setInterval(() => autoSaveRef.current(), 10_000);
    return () => window.clearInterval(interval);
  }, [dirty, detail?.id, isUnlocked]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const handleDeleteWriteup = async () => {
    if (!detail) return;
    const confirmed = await confirm({
      title: 'Eliminar informe',
      message: `¿Eliminar el informe "${detail.title}"?`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      detailRequestVersion.current += 1;
      await api.deleteWriteup(detail.id);
      clearAssetUrlCache();
      setDetail(null);
      selectedIdRef.current = null;
      setSelectedId(null);
      setRevisions([]);
      setDetailError('');
      await loadList();
      showToast('Informe eliminado', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al eliminar', 'error');
    }
  };

  const handleUploadMedia = async (
    file: File,
    convertToGif = false
  ): Promise<{ id: string; filename: string } | null> => {
    if (!detail) return null;
    try {
      const uploaded = await api.uploadWriteupAsset(detail.id, file, undefined, convertToGif);
      const blob = await api.fetchWriteupAssetBlob(detail.id, uploaded.id);
      const objUrl = URL.createObjectURL(blob);
      assetUrlsRef.current[uploaded.id] = objUrl;
      setAssetUrls({ ...assetUrlsRef.current });
      setDetail((prev) => (prev ? { ...prev, assets: [...prev.assets, uploaded] } : prev));
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
      showToast(err instanceof Error ? err.message : 'Error subiendo evidencia multimedia', 'error');
      return null;
    }
  };

  const handleConvertVideoToGif = async (assetId: string) => {
    if (!detail) return;
    setConvertingAssetId(assetId);
    try {
      const gifAsset = await api.convertWriteupVideoToGif(detail.id, assetId);
      const blob = await api.fetchWriteupAssetBlob(detail.id, gifAsset.id);
      const objUrl = URL.createObjectURL(blob);
      assetUrlsRef.current[gifAsset.id] = objUrl;
      setAssetUrls({ ...assetUrlsRef.current });
      setDetail((prev) => (prev ? { ...prev, assets: [...prev.assets, gifAsset] } : prev));
      showToast(`GIF generado: ${gifAsset.filename}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo convertir el video a GIF', 'error');
    } finally {
      setConvertingAssetId(null);
    }
  };

  const handleSaveBoard = async (boardId: string, sceneJson: string, svgSnapshot: string, elementCount: number) => {
    if (!detail) return;
    try {
      const updatedBoard = await api.updateWriteupBoard(detail.id, boardId, {
        scene_json: sceneJson,
        svg_snapshot: svgSnapshot,
        element_count: elementCount,
      });
      setDetail((prev) =>
        prev
          ? { ...prev, boards: prev.boards.map((b) => (b.id === boardId ? updatedBoard : b)) }
          : prev,
      );
      showToast('Pizarra guardada', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error guardando pizarra', 'error');
    }
  };

  const handleCreateBoard = async () => {
    if (!detail) return;
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
    try {
      const board = await api.createWriteupBoard(detail.id, { title: cleanName });
      setDetail((prev) => (prev ? { ...prev, boards: [...prev.boards, board] } : prev));
      setActiveBoardId(board.id);
      showToast('Nueva pizarra agregada', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error creando pizarra', 'error');
    }
  };

  const handleDeleteAsset = async (asset: WriteupAsset) => {
    if (!detail) return;
    const confirmed = await confirm({
      title: 'Eliminar evidencia multimedia',
      message: `¿Eliminar "${asset.filename}" de este informe?`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteWriteupAsset(detail.id, asset.id);
      const cachedUrl = assetUrlsRef.current[asset.id];
      if (cachedUrl) {
        URL.revokeObjectURL(cachedUrl);
        delete assetUrlsRef.current[asset.id];
        setAssetUrls({ ...assetUrlsRef.current });
      }
      await loadDetail(detail.id);
      showToast('Evidencia eliminada', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al eliminar evidencia', 'error');
    }
  };

  const handleRestoreRevision = async (rev: WriteupRevision, closeDiffModal = false) => {
    if (saveInFlight.current) {
      showToast('Espera a que termine el guardado antes de restaurar.', 'warning');
      return;
    }
    if (!detail) return;
    const confirmed = await confirm({
      title: `Restaurar revisión v${rev.revision_number}`,
      message: `Se reemplazará el borrador actual con la revisión v${rev.revision_number}. ¿Continuar?`,
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
      const restored = await api.restoreWriteupRevision(detail.id, rev.id);
      if (selectedIdRef.current === detail.id) {
        if (draftVersion.current === restoredVersion) hydrateDraft(restored);
        else setDetail(restored);
        void preloadAssetUrls(restored, detailRequestVersion.current);
        const refreshedRevisions = await api.listWriteupRevisions(detail.id);
        if (selectedIdRef.current === detail.id) { setRevisions(refreshedRevisions); setRevisionEnd(false); }
        if (closeDiffModal) setDiffRevision(null);
        showToast(`Restaurado desde v${rev.revision_number}`, 'success');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo restaurar la revisión', 'error');
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!lightboxAsset && !diffRevision) return;
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
        if (diffRevision) setDiffRevision(null);
        else if (lightboxAsset) setLightboxAsset(null);
        return;
      }
      if (e.key === 'Tab' && modalDialogRef.current) {
        const focusable = Array.from(
          modalDialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), video[controls], a[href], [tabindex]:not([tabindex="-1"])')
        ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
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
  }, [lightboxAsset, diffRevision]);

  const handleCreateCitation = async (payload: {
    anchor_id: string;
    heading_path: string | null;
    line_start: number;
    line_end: number;
    quoted_text: string;
    markdown_content: string;
  }): Promise<boolean> => {
    if (!detail) return false;
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
      });
      setDetail((prev) => (prev ? { ...prev, citations: [...prev.citations, created] } : prev));
      const saved = await handleSaveWriteup(false, markdownWithCitation);
      if (!saved) {
        try {
          await api.deleteWriteupCitation(detail.id, created.id);
          setDetail((prev) => prev ? { ...prev, citations: prev.citations.filter((citation) => citation.id !== created.id) } : prev);
        } catch {
          showToast('La cita quedó creada, pero no se guardó el informe. Revisa la pizarra antes de volver a intentarlo.', 'warning');
        }
        return false;
      }
      if (mode === 'markdown' && typeof window !== 'undefined' && window.innerWidth >= 1280) {
        setMode('dual');
      }
      showToast(`Cita #${created.anchor_id} añadida a la pizarra`, 'success');
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo crear la citación', 'error');
      return false;
    }
  };

  const handleDeleteCitation = async (citationId: string) => {
    if (!detail) return;
    try {
      await api.deleteWriteupCitation(detail.id, citationId);
      setDetail((prev) => (prev ? { ...prev, citations: prev.citations.filter((c) => c.id !== citationId) } : prev));
      showToast('Citación eliminada', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error eliminando citación', 'error');
    }
  };

  const handleJumpToCitation = (cit: WriteupCitation) => {
    if (mode === 'whiteboard' || mode === 'findings' || mode === 'assets') {
      setMode(typeof window !== 'undefined' && window.innerWidth >= 1280 ? 'dual' : 'markdown');
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
      });
      setDetail((prev) =>
        prev ? { ...prev, citations: prev.citations.map((c) => (c.id === cit.id ? updated : c)) } : prev
      );
      showToast(`Cita #${cit.anchor_id} re-vinculada a línea ${targetStart}`, 'success');
    } catch (err) {
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

  return (
    <div className="writeups-view relative flex min-h-[calc(100dvh-4.5rem)] min-w-0 flex-col gap-3 overflow-x-clip p-2 sm:p-3 lg:h-[calc(100dvh-4.5rem)] lg:min-h-0 lg:flex-row lg:p-4">
      {/* Mobile / Medium Drawer Backdrop */}
      {showList && (
        <button
          type="button"
          aria-label="Cerrar lista de informes"
          onClick={() => setShowList(false)}
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
                  onClick={() => setShowList(false)}
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
                    aria-label={`${item.title}, severidad ${item.severity}, estado ${item.status}`}
                    className={`w-full rounded-xl border p-2.5 text-left text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                      SEVERITY_CARD[item.severity] || SEVERITY_CARD.media
                    } ${selected ? 'ring-2 ring-indigo-400 ring-offset-1 ring-offset-slate-900' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-medium text-white/75">{item.status}</span>
                    </div>
                    <div className="text-xs font-semibold line-clamp-2">{item.title}</div>
                    <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2 tabular-nums">
                      <span>{item.boards_count} pizarra</span>
                      <span>· {item.citations_count} citas</span>
                      <span>· {item.assets_count} med.</span>
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
              {!showList && <button type="button" onClick={() => setShowList(true)} className="min-h-[44px] lg:min-h-9 rounded-lg bg-slate-800 px-3 text-xs font-medium text-slate-200 hover:bg-slate-700">Ver lista</button>}
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
                  onClick={() => setShowList(true)}
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
            <div className="p-2.5 sm:p-3 border-b border-slate-800 bg-slate-900/95 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowList((v) => !v)}
                  title={showList ? 'Ocultar lista' : 'Mostrar lista'}
                  aria-label={showList ? 'Ocultar lista' : 'Mostrar lista'}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 shrink-0"
                >
                  {showList ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                </button>

                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    markDirty();
                  }}
                  aria-label="Título del informe"
                  maxLength={MAX_REPORT_TITLE_LENGTH}
                  className="flex-1 min-w-[120px] max-w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-sm font-bold text-white"
                />

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

                <button
                  type="button"
                  onClick={() => setShowMetadata((v) => !v)}
                  aria-label="Mostrar u ocultar detalles del informe"
                  aria-expanded={showMetadata}
                  className={`px-2 py-1.5 rounded-lg text-xs flex items-center gap-1 border ${
                    showMetadata ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-200' : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                  title="Mostrar u ocultar detalles del informe y sus relaciones"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Detalles</span>
                </button>

                <div className="flex max-w-full flex-wrap items-center justify-end gap-1 ml-auto">
                  {staleCount > 0 && (
                    <span className="px-1.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] flex items-center gap-1" title="Cita(s) desactualizada(s)">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {staleCount}
                    </span>
                  )}

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveWriteup(false)}
                    aria-label={saving ? 'Guardando informe' : dirty ? 'Guardar cambios del informe' : 'Informe guardado'}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                      dirty ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                    title="Guardar cambios protegidos"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{saving ? 'Guardando…' : dirty ? 'Guardar*' : 'Guardado'}</span>
                  </button>
                  <span role="status" className={saveError ? 'text-xs text-rose-300' : 'text-xs text-slate-400'}>
                    {saveError ? `No se pudo guardar: ${saveError}` : lastSavedAt && !dirty ? `Guardado a las ${lastSavedAt.toLocaleTimeString(systemLocale || 'es-MX', { hour: '2-digit', minute: '2-digit' })}` : dirty ? 'Guardado automático activado' : ''}
                  </span>

                  <button
                    type="button"
                    disabled={revisionLoading}
                    onClick={() => void openRevisionHistory()}
                    className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs flex items-center gap-1"
                    title="Explorar historial de versiones"
                  >
                    <History className="w-3.5 h-3.5" /> Historial
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSaveWriteup(true)}
                    className="p-1.5 sm:px-2 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1"
                    title="Guardar una revisión para poder restaurarla"
                    aria-label="Guardar revisión"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline">Revisión</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleCloneWriteup()}
                    className="p-1.5 sm:px-2 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1"
                    title="Duplicar informe con sus hallazgos, texto y pizarras"
                    aria-label="Duplicar informe"
                  >
                    <CopyPlus className="w-3.5 h-3.5 text-cyan-300" />
                    <span className="hidden xl:inline">Duplicar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowExportModal(true)}
                    aria-label="Exportar informe"
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1"
                    title="Exportar el informe"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Exportar</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteWriteup}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40"
                    title="Eliminar informe"
                    aria-label="Eliminar informe"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 pt-1 text-xs">
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
              )}

              {/* Mode Switcher + Board Picker */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="relative inline-flex max-w-full items-center">
                  <span className="sr-only">Vista del informe</span>
                  <select value={mode} onChange={(event) => setMode(event.target.value as WorkspaceMode)} className="min-h-10 max-w-full appearance-none rounded-lg border border-slate-700 bg-slate-950 pl-3 pr-9 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
                    <option value="markdown">Editor</option>
                    <option value="whiteboard">Pizarra</option>
                    <option value="dual">Dos vistas</option>
                    <option value="findings">Hallazgos ({findings.length})</option>
                    <option value="assets">Medios ({detail.assets.length})</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-400" aria-hidden="true" />
                </label>

                {(mode === 'dual' || mode === 'whiteboard') && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <select
                      value={activeBoard?.id || ''}
                      onChange={(e) => setActiveBoardId(e.target.value)}
                      aria-label="Seleccionar pizarra"
                      className="min-h-9 max-w-[160px] rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-200"
                    >
                      {detail.boards.map((b) => (
                        <option key={b.id} value={b.id}>{b.title}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleCreateBoard}
                      aria-label="Crear nueva pizarra"
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 flex items-center gap-1"
                      title="Nueva pizarra"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Pizarra</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Active Workspace Area (scrollable gracefully on mobile/medium, fixed split on desktop) */}
            <div className="flex-1 min-h-0 p-2 sm:p-3 overflow-y-auto lg:overflow-hidden">
              {mode === 'markdown' && (
                <WriteupMarkdownSplitEditor
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
                  citations={detail.citations}
                  assets={detail.assets}
                  assetObjectUrls={assetUrls}
                  assetLoadErrors={failedAssetIds}
                  targetScope={targetScope}
                  findings={findings}
                  onSaveBoard={handleSaveBoard}
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
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 h-full min-h-0">
                  <WriteupMarkdownSplitEditor
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
                    onApplyCvss={(score, vector, sev) => {
                      setCvssScore(score.toFixed(1));
                      setCvssVector(vector);
                      setSeverity(sev);
                      markDirty();
                    }}
                    jumpTarget={jumpTarget}
                    compactMode
                  />
                  {activeBoard && (
                    <PentestWhiteboard
                      board={activeBoard}
                      citations={detail.citations}
                      assets={detail.assets}
                      assetObjectUrls={assetUrls}
                      assetLoadErrors={failedAssetIds}
                      targetScope={targetScope}
                      findings={findings}
                      onSaveBoard={handleSaveBoard}
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
                                <span className="text-[10px] uppercase tracking-wide text-slate-400 truncate max-w-full">{sevKey}</span>
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
              )}

              {mode === 'assets' && (
                <div className="h-full overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-4 pr-1">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Evidencias multimedia (GIF / Video / WebP)
                      </h3>
                      <div className="flex items-center gap-2 text-xs">
                        <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={convertUploadToGif}
                            onChange={(e) => setConvertUploadToGif(e.target.checked)}
                            className="accent-indigo-500"
                          />
                          Video→GIF
                        </label>
                        <button
                          type="button"
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
                                disabled={convertingAssetId === asset.id}
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
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
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
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Historial de revisiones</h3>
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
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Auditoría de exportaciones</h3>
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

      {/* Line-by-Line Revision Diff Modal */}
      {diffRevision && detail && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-start sm:items-center justify-center overflow-y-auto overscroll-contain p-2 sm:p-4"
          onClick={() => setDiffRevision(null)}
        >
          <div
            ref={modalDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="diff-modal-title"
            className="my-auto w-full max-w-3xl max-h-[calc(100dvh-1rem)] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-slate-800">
              <div className="min-w-0">
                <h3 id="diff-modal-title" className="text-sm font-semibold text-white">
                  Revisión v{diffRevision.revision_number} frente al borrador actual
                </h3>
                <p className="text-[11px] text-slate-400">
                  Guardada el {formatApiDateTime(diffRevision.created_at, systemLocale || 'es-MX')}
                </p>
              </div>
              <div className="flex max-w-full flex-wrap items-center gap-2">
                <button
                  ref={modalCloseRef}
                  type="button"
                  onClick={() => void handleRestoreRevision(diffRevision, true)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restaurar v{diffRevision.revision_number}
                </button>
                <button
                  type="button"
                  onClick={() => setDiffRevision(null)}
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  aria-label="Cerrar comparación"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-slate-800">
              <button type="button" onClick={() => setRevisionView('diff')} aria-pressed={revisionView === 'diff'} className={`px-3 py-1.5 rounded text-xs ${revisionView === 'diff' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}>Cambios</button>
              <button type="button" onClick={() => setRevisionView('preview')} aria-pressed={revisionView === 'preview'} className={`px-3 py-1.5 rounded text-xs ${revisionView === 'preview' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}>Vista previa</button>
            </div>
            <div className="flex flex-1 min-h-0 flex-col sm:flex-row overflow-auto">
              <nav aria-label="Versiones del informe" className="sm:w-52 shrink-0 border-b sm:border-b-0 sm:border-r border-slate-800 p-3 overflow-auto">
                <p className="text-xs font-semibold text-slate-300 mb-2">Versiones</p>
                {revisions.map(rev => <button key={rev.id} type="button" onClick={() => setDiffRevision(rev)} aria-current={rev.id === diffRevision.id ? 'true' : undefined} className={`w-full text-left px-3 py-2 border-l-2 text-xs ${rev.id === diffRevision.id ? 'border-indigo-400 bg-slate-800 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
                  <span className="block font-medium">v{rev.revision_number} · {rev.change_note || 'Revisión'}</span>
                  <span className="block text-slate-400 mt-1">{formatApiDateTime(rev.created_at, systemLocale || 'es-MX')}</span>
                </button>)}
                {revisions.length >= 40 && !revisionEnd && <button type="button" onClick={() => void loadMoreRevisions()} disabled={revisionLoading} className="w-full mt-2 px-3 py-2 text-xs text-slate-200 bg-slate-800 rounded">{revisionLoading ? 'Cargando…' : 'Cargar versiones anteriores'}</button>}
              </nav>
              {revisionView === 'preview' ? <div className="flex-1 overflow-auto p-4 bg-slate-950">
                {diffRevision.snapshot ? <section className="mb-6 text-sm text-slate-200"><h3 className="text-lg font-semibold text-white">{diffRevision.snapshot.fields.title}</h3><p className="mt-1">Estado: {diffRevision.snapshot.fields.status} · Severidad: {diffRevision.snapshot.fields.severity}</p><p className="mt-1">{diffRevision.snapshot.boards.length} pizarras · {diffRevision.snapshot.findings.length} hallazgos</p>{diffRevision.snapshot.executive_summary && <p className="mt-3 whitespace-pre-wrap">{diffRevision.snapshot.executive_summary}</p>}{diffRevision.snapshot.findings.map((finding, index) => <p key={`${finding.id}-${index}`} className="mt-2">{finding.title} · {finding.severity}</p>)}</section> : <p className="mb-4 text-sm text-amber-300">Esta versión antigua solo conserva el Markdown.</p>}
                <MarkdownRichPreview markdown={diffRevision.markdown_content} redactPreview={false} boards={diffRevision.snapshot?.boards ?? detail.boards} assets={diffRevision.snapshot?.assets ?? detail.assets} assetObjectUrls={assetUrls} /></div> : <div className="flex-1 overflow-auto p-3 bg-slate-950 font-mono text-xs space-y-0.5">
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
