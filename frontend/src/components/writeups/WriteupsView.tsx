import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Calculator,
  CheckCircle2,
  Columns2,
  Copy,
  CopyPlus,
  Download,
  FileCode2,
  Film,
  GitCompare,
  History,
  Image as ImageIcon,
  Layers,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
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
import { EmptyState } from '../common/EmptyState';
import { api } from '../../lib/api';
import {
  InternalProject,
  Prospect,
  WriteupAsset,
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
import {
  calculateCvss31,
  computeLineDiff,
  Cvss31Metrics,
  DEFAULT_CVSS31_METRICS,
  parseCvss31Vector,
  PENTEST_TAXONOMY_PRESETS,
} from './pentestUtils';

const SEVERITY_BADGE: Record<WriteupSeverity, string> = {
  critica: 'bg-rose-600/20 text-rose-300 border-rose-500/40',
  alta: 'bg-orange-600/20 text-orange-300 border-orange-500/40',
  media: 'bg-amber-600/20 text-amber-300 border-amber-500/40',
  baja: 'bg-sky-600/20 text-sky-300 border-sky-500/40',
  informativa: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
};

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
  const [items, setItems] = useState<WriteupSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WriteupDetail | null>(null);
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
  const [saving, setSaving] = useState(false);
  const [convertingAssetId, setConvertingAssetId] = useState<string | null>(null);
  const [convertUploadToGif, setConvertUploadToGif] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [lightboxAsset, setLightboxAsset] = useState<WriteupAsset | null>(null);
  const [diffRevision, setDiffRevision] = useState<WriteupRevision | null>(null);
  const [findingCvssEditorIdx, setFindingCvssEditorIdx] = useState<number | null>(null);
  const [findingCvssMetrics, setFindingCvssMetrics] = useState<Cvss31Metrics>(DEFAULT_CVSS31_METRICS);
  const [revisions, setRevisions] = useState<WriteupRevision[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [projects, setProjects] = useState<InternalProject[]>([]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [failedAssetIds, setFailedAssetIds] = useState<Record<string, boolean>>({});
  const [jumpTarget, setJumpTarget] = useState<{ line: number; anchorId: string; ts: number } | null>(null);
  const assetUrlsRef = useRef<Record<string, string>>({});
  const selectedIdRef = useRef<string | null>(selectedId);
  const mediaTabUploadRef = useRef<HTMLInputElement>(null);

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
  const [findings, setFindings] = useState<WriteupStructuredFinding[]>([]);
  const [prospectId, setProspectId] = useState('');
  const [projectId, setProjectId] = useState('');

  useEffect(() => {
    return () => {
      Object.values(assetUrlsRef.current).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

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

  const preloadAssetUrls = useCallback(async (writeup: WriteupDetail) => {
    const nextMap: Record<string, string> = { ...assetUrlsRef.current };
    const nextErrors: Record<string, boolean> = {};
    for (const asset of writeup.assets) {
      if (nextMap[asset.id]) continue;
      try {
        const blob = await api.fetchWriteupAssetBlob(writeup.id, asset.id);
        nextMap[asset.id] = URL.createObjectURL(blob);
      } catch {
        nextErrors[asset.id] = true;
      }
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
  }, []);

  const loadList = useCallback(async () => {
    if (!isUnlocked) return;
    setLoadingList(true);
    try {
      const [rows, pros, projs] = await Promise.all([
        api.listWriteups({
          q: debouncedSearchQuery.trim() || undefined,
          severity: severityFilter || undefined,
        }),
        api.getProspects().catch(() => [] as Prospect[]),
        api.getProjects().catch(() => [] as InternalProject[]),
      ]);
      setItems(rows);
      setProspects(pros);
      setProjects(projs);
      if (!selectedIdRef.current && rows.length > 0) {
        setSelectedId(rows[0].id);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error cargando writeups', 'error');
    } finally {
      setLoadingList(false);
    }
  }, [isUnlocked, debouncedSearchQuery, severityFilter, showToast]);

  const loadDetail = useCallback(async (id: string) => {
    if (!isUnlocked) return;
    try {
      const [data, revs] = await Promise.all([
        api.getWriteup(id),
        api.listWriteupRevisions(id),
      ]);
      hydrateDraft(data);
      setRevisions(revs);
      void preloadAssetUrls(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error cargando detalle del writeup', 'error');
    }
  }, [isUnlocked, preloadAssetUrls, showToast]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId && isUnlocked) {
      void loadDetail(selectedId);
    }
  }, [selectedId, isUnlocked, loadDetail]);

  const handleSelectWriteup = (id: string) => {
    setSelectedId(id);
    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      setShowList(false);
    }
  };

  const handleCreateWriteup = async () => {
    const newTitle = await prompt({
      title: 'Nuevo writeup de pentesting',
      message: 'Título del nuevo writeup de pentesting:',
      defaultValue: 'Auditoría API REST — Cliente',
      confirmLabel: 'Crear',
      required: true,
    });
    if (!newTitle || !newTitle.trim()) return;
    try {
      const created = await api.createWriteup({
        title: newTitle.trim(),
        severity: 'media',
        status: 'borrador',
        markdown_content: `# ${newTitle.trim()} {#intro}\n\n## Resumen de hallazgos\nDescribe el contexto de la prueba autorizada aquí.\n`,
      });
      setItems((prev) => [created, ...prev]);
      setSelectedId(created.id);
      hydrateDraft(created);
      if (typeof window !== 'undefined' && window.innerWidth < 1280) {
        setShowList(false);
      }
      showToast('Writeup creado con pizarra vinculada', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo crear el writeup', 'error');
    }
  };

  const handleSaveWriteup = async (saveRevision = false) => {
    if (!detail) return;
    setSaving(true);
    try {
      const parsedCvss = cvssScore.trim() ? Number(cvssScore) : null;
      const updated = await api.updateWriteup(detail.id, {
        title: title.trim(),
        status: statusVal,
        severity,
        cvss_score: parsedCvss !== null && Number.isFinite(parsedCvss) ? parsedCvss : null,
        cvss_vector: cvssVector.trim() || null,
        cwe_id: cweId.trim() || null,
        cve_id: cveId.trim() || null,
        target_scope: targetScope.trim() || null,
        executive_summary: execSummary,
        markdown_content: markdown,
        findings,
        prospect_id: prospectId || null,
        project_id: projectId || null,
        save_revision: saveRevision,
        revision_note: saveRevision ? 'Instantánea manual del editor' : undefined,
      });
      hydrateDraft(updated);
      if (saveRevision) {
        setRevisions(await api.listWriteupRevisions(detail.id));
      }
      await loadList();
      showToast(saveRevision ? 'Guardado con revisión histórica' : 'Cambios guardados y cifrados', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error guardando writeup', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWriteup = async () => {
    if (!detail) return;
    const confirmed = await confirm({
      title: 'Eliminar writeup',
      message: `¿Eliminar el writeup "${detail.title}"?`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteWriteup(detail.id);
      setDetail(null);
      setSelectedId(null);
      await loadList();
      showToast('Writeup eliminado', 'info');
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
        ? `GIF animado optimizado (${pct}% ahorro) y cifrado`
        : uploaded.mime_type.startsWith('video/')
        ? 'Video cifrado sin metadatos listo en Medios'
        : `Imagen optimizada sin EXIF (${pct}% menor) y cifrada`;
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
      showToast('Pizarra guardada y sanitizada', 'success');
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
    });
    if (!name || !name.trim()) return;
    try {
      const board = await api.createWriteupBoard(detail.id, { title: name.trim() });
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
      message: `¿Eliminar "${asset.filename}" de este writeup?`,
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
    if (!detail) return;
    const confirmed = await confirm({
      title: `Restaurar revisión v${rev.revision_number}`,
      message: `Se reemplazará el borrador actual con la revisión v${rev.revision_number}. ¿Continuar?`,
      confirmLabel: 'Restaurar',
      tone: 'warning',
    });
    if (!confirmed) return;
    try {
      const restored = await api.restoreWriteupRevision(detail.id, rev.id);
      hydrateDraft(restored);
      setRevisions(await api.listWriteupRevisions(detail.id));
      if (closeDiffModal) {
        setDiffRevision(null);
      }
      showToast(`Restaurado desde v${rev.revision_number}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo restaurar la revisión', 'error');
    }
  };

  useEffect(() => {
    if (!lightboxAsset && !diffRevision) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (diffRevision) setDiffRevision(null);
        else if (lightboxAsset) setLightboxAsset(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxAsset, diffRevision]);

  const handleCreateCitation = async (payload: {
    anchor_id: string;
    heading_path: string | null;
    line_start: number;
    line_end: number;
    quoted_text: string;
  }) => {
    if (!detail) return;
    const targetBoardId = activeBoardId || detail.boards[0]?.id;
    if (!targetBoardId) {
      showToast('Crea una pizarra primero para enlazar citaciones', 'warning');
      return;
    }
    try {
      const created = await api.createWriteupCitation(detail.id, {
        board_id: targetBoardId,
        ...payload,
      });
      setDetail((prev) => (prev ? { ...prev, citations: [...prev.citations, created] } : prev));
      await handleSaveWriteup(false);
      if (mode === 'markdown' && typeof window !== 'undefined' && window.innerWidth >= 1280) {
        setMode('dual');
      }
      showToast(`Cita #${created.anchor_id} añadida a la pizarra`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo crear la citación', 'error');
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
    if (dirty) await handleSaveWriteup(false);
    try {
      const cloned = await api.cloneWriteup(detail.id);
      setSelectedId(cloned.id);
      await loadList();
      await loadDetail(cloned.id);
      showToast(`Writeup clonado: ${cloned.title}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error clonando writeup', 'error');
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
    if (dirty) await handleSaveWriteup(false);
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
      <div className="flex flex-col items-center justify-center h-[70vh] text-center p-6">
        <Shield className="w-12 h-12 text-indigo-400 mb-3" />
        <h2 className="text-xl font-bold text-white mb-2">Bóveda bloqueada</h2>
        <p className="text-sm text-slate-400 max-w-md mb-5">
          Los writeups, diagramas y evidencias multimedia se cifran con tu llave maestra AES-256-GCM. Desbloquea la bóveda para continuar.
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
    <div className="relative flex flex-col lg:flex-row gap-3 p-2 sm:p-3 lg:p-4 min-h-[calc(100dvh-4.5rem)] lg:h-[calc(100dvh-4.5rem)]">
      {/* Mobile / Medium Drawer Backdrop */}
      {showList && (
        <button
          type="button"
          aria-label="Cerrar lista de writeups"
          onClick={() => setShowList(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[1px] lg:hidden"
        />
      )}

      {/* Collapsible / Drawer Writeups List */}
      {showList && (
        <aside className="fixed inset-y-0 left-0 z-40 w-80 max-w-[85vw] lg:static lg:z-auto lg:w-64 xl:w-72 shrink-0 flex flex-col bg-slate-900 border border-slate-800 lg:rounded-2xl overflow-hidden shadow-2xl lg:shadow-none">
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                Writeups ({items.length})
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleCreateWriteup}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nuevo
                </button>
                <button
                  type="button"
                  onClick={() => setShowList(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden"
                  aria-label="Cerrar panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar…"
                className="w-full pl-8 pr-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
              />
            </div>

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200"
            >
              <option value="">Todas las severidades</option>
              <option value="critica">Crítica</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
              <option value="informativa">Informativa</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {loadingList && items.length === 0 ? (
              <p className="text-xs text-slate-400 p-3">Cargando…</p>
            ) : items.length === 0 ? (
              <div className="text-center p-4 text-xs text-slate-400 space-y-2">
                <p>Sin writeups registrados.</p>
                <button
                  type="button"
                  onClick={handleCreateWriteup}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300"
                >
                  Crear primero
                </button>
              </div>
            ) : (
              items.map((item) => {
                const selected = selectedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectWriteup(item.id)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-colors ${
                      selected
                        ? 'bg-indigo-600/15 border-indigo-500/50 text-white'
                        : 'bg-slate-950/50 border-slate-800/80 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase ${SEVERITY_BADGE[item.severity] || SEVERITY_BADGE.media}`}>
                        {item.severity}
                      </span>
                      <span className="text-[10px] text-slate-400">{item.status}</span>
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
          </div>
        </aside>
      )}

      {/* Main Editor + Whiteboard Workspace */}
      <section className="flex-1 flex flex-col min-w-0 min-h-0 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
        {!detail ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6 text-center gap-3">
            <BookOpen className="w-10 h-10 text-slate-600" />
            <p className="text-sm">Selecciona un writeup o crea uno nuevo.</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setShowList(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5"
              >
                <PanelLeftOpen className="w-4 h-4" />
                Ver lista ({items.length})
              </button>
              <button
                type="button"
                onClick={handleCreateWriteup}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Nuevo writeup
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
                    setDirty(true);
                  }}
                  aria-label="Título del writeup"
                  className="flex-1 min-w-[150px] bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-sm font-bold text-white"
                />

                <select
                  value={severity}
                  aria-label="Severidad"
                  onChange={(e) => {
                    setSeverity(e.target.value as WriteupSeverity);
                    setDirty(true);
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
                    setDirty(true);
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
                  className={`px-2 py-1.5 rounded-lg text-xs flex items-center gap-1 border ${
                    showMetadata ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-200' : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                  title="Mostrar/ocultar metadatos técnicos y CRM"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Metadatos</span>
                </button>

                <div className="flex items-center gap-1 ml-auto">
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
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                      dirty ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                    title="Guardar cambios cifrados"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{saving ? '…' : dirty ? 'Guardar*' : 'Guardado'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSaveWriteup(true)}
                    className="p-1.5 sm:px-2 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1"
                    title="Guardar punto de restauración histórico"
                    aria-label="Snapshot"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline">Snapshot</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleCloneWriteup()}
                    className="p-1.5 sm:px-2 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1"
                    title="Clonar writeup (hallazgos, markdown y pizarras)"
                    aria-label="Clonar writeup"
                  >
                    <CopyPlus className="w-3.5 h-3.5 text-cyan-300" />
                    <span className="hidden xl:inline">Clonar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowExportModal(true)}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1"
                    title="Exportar reporte multiformato"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Exportar</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteWriteup}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40"
                    title="Eliminar writeup"
                    aria-label="Eliminar writeup"
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
                      setDirty(true);
                    }}
                    placeholder="CVSS (0-10)"
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200"
                  />
                  <input
                    type="text"
                    value={cweId}
                    onChange={(e) => {
                      setCweId(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="CWE-89"
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200"
                  />
                  <input
                    type="text"
                    value={cveId}
                    onChange={(e) => {
                      setCveId(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="CVE-2026-XXXX"
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200"
                  />
                  <input
                    type="text"
                    value={targetScope}
                    onChange={(e) => {
                      setTargetScope(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Alcance / Target URL"
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200"
                  />
                  <select
                    value={prospectId}
                    onChange={(e) => {
                      setProspectId(e.target.value);
                      setDirty(true);
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
                    onChange={(e) => {
                      setProjectId(e.target.value);
                      setDirty(true);
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
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto max-w-full">
                  {[
                    { id: 'markdown', label: 'Editor', icon: FileCode2 },
                    { id: 'whiteboard', label: 'Pizarra', icon: Layers },
                    { id: 'dual', label: 'Dual', icon: Columns2 },
                    { id: 'findings', label: `Hallazgos (${findings.length})`, icon: Shield },
                    { id: 'assets', label: `Medios (${detail.assets.length})`, icon: ImageIcon },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const active = mode === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setMode(tab.id as WorkspaceMode)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 shrink-0 ${
                          active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {(mode === 'dual' || mode === 'whiteboard') && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <select
                      value={activeBoard?.id || ''}
                      onChange={(e) => setActiveBoardId(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 max-w-[160px]"
                    >
                      {detail.boards.map((b) => (
                        <option key={b.id} value={b.id}>{b.title}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleCreateBoard}
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
                    setDirty(true);
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
                    setDirty(true);
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
                    setDirty(true);
                    showToast('Diagrama insertado en Markdown', 'success');
                  }}
                />
              )}

              {mode === 'dual' && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 h-full min-h-0">
                  <WriteupMarkdownSplitEditor
                    markdown={markdown}
                    onChange={(next) => {
                      setMarkdown(next);
                      setDirty(true);
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
                      setDirty(true);
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
                        setDirty(true);
                        showToast('Diagrama insertado en Markdown', 'success');
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
                    <label className="block text-xs font-semibold text-slate-300">Resumen Ejecutivo</label>
                    <textarea
                      rows={3}
                      value={execSummary}
                      onChange={(e) => {
                        setExecSummary(e.target.value);
                        setDirty(true);
                      }}
                      placeholder="Resumen de negocio y conclusiones principales del engagement…"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white">Hallazgos estructurados</h3>
                    <button
                      type="button"
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
                        setDirty(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1"
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
                            onChange={(e) => {
                              const next = [...findings];
                              next[idx] = { ...f, id: e.target.value };
                              setFindings(next);
                              setDirty(true);
                            }}
                            placeholder="ID (H-01)"
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono"
                          />
                          <input
                            type="text"
                            value={f.title}
                            onChange={(e) => {
                              const next = [...findings];
                              next[idx] = { ...f, title: e.target.value };
                              setFindings(next);
                              setDirty(true);
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
                              setDirty(true);
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
                              setDirty(true);
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
                                setDirty(true);
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
                                setDirty(true);
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
                                cwe_id: `${preset.cwe} · ${preset.owasp} · MITRE ${preset.mitre}`,
                                cvss_score: res.score,
                                cvss_vector: res.vector,
                                severity: res.severity,
                              };
                              setFindings(next);
                              setDirty(true);
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
                            onChange={(e) => {
                              const next = [...findings];
                              next[idx] = { ...f, cwe_id: e.target.value };
                              setFindings(next);
                              setDirty(true);
                            }}
                            placeholder="CWE / OWASP / MITRE ATT&CK"
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-[11px]"
                          />
                          <input
                            type="text"
                            value={f.affected_target || ''}
                            onChange={(e) => {
                              const next = [...findings];
                              next[idx] = { ...f, affected_target: e.target.value };
                              setFindings(next);
                              setDirty(true);
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
                                        setDirty(true);
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
                            onChange={(e) => {
                              const next = [...findings];
                              next[idx] = { ...f, summary: e.target.value };
                              setFindings(next);
                              setDirty(true);
                            }}
                            placeholder="Resumen técnico ({{redact:...}})"
                            className="bg-slate-900 border border-slate-700 rounded p-2 text-slate-100"
                          />
                          <textarea
                            rows={2}
                            value={f.remediation}
                            onChange={(e) => {
                              const next = [...findings];
                              next[idx] = { ...f, remediation: e.target.value };
                              setFindings(next);
                              setDirty(true);
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
                                title="Inspeccionar evidencia y metadatos SHA-256 / EXIF"
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
                              title="Ver en Lightbox (SHA-256 / EXIF)"
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
                                setDirty(true);
                                showToast('Referencia insertada en Markdown', 'success');
                              }}
                              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300"
                              title="Insertar en Markdown"
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
                        Citaciones texto ↔ pizarra ({detail.citations.length})
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
                                    Re-vincular
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
                        <p className="text-xs text-slate-500">Pulsa Snapshot para guardar un punto de restauración.</p>
                      ) : (
                        revisions.map((rev) => (
                          <div key={rev.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
                            <div>
                              <div className="font-medium text-slate-200">
                                v{rev.revision_number} · {rev.change_note || 'Revisión'}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {new Date(rev.created_at).toLocaleString(systemLocale || 'es-MX')} · {rev.content_hash.slice(0, 12)}
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
                          description="Exporta el reporte para registrar su auditoría SHA-256."
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
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxAsset(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="lightbox-modal-title"
            className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/95">
              <div className="min-w-0">
                <h3 id="lightbox-modal-title" className="text-sm font-semibold text-white truncate">{lightboxAsset.filename}</h3>
                <p className="text-[11px] text-slate-400 font-mono truncate">
                  {lightboxAsset.mime_type} · {lightboxAsset.width}x{lightboxAsset.height}px · SHA-256: {lightboxAsset.sha256.slice(0, 16)}…
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxAsset(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                aria-label="Cerrar visor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-slate-950 flex items-center justify-center min-h-[220px]">
              {assetUrls[lightboxAsset.id] ? (
                lightboxAsset.mime_type.toLowerCase().startsWith('video/') ? (
                  <video src={assetUrls[lightboxAsset.id]} controls autoPlay loop muted className="max-h-[60vh] rounded-lg border border-slate-800" />
                ) : (
                  <img src={assetUrls[lightboxAsset.id]} alt={lightboxAsset.filename} className="max-h-[60vh] object-contain rounded-lg border border-slate-800" />
                )
              ) : failedAssetIds[lightboxAsset.id] ? (
                <p className="text-xs text-rose-400">No se pudo descifrar o cargar esta evidencia multimedia.</p>
              ) : (
                <p className="text-xs text-slate-400">Descifrando evidencia…</p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-slate-800 bg-slate-900 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className={`px-2 py-0.5 rounded border ${lightboxAsset.exif_stripped ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
                  {lightboxAsset.exif_stripped ? 'EXIF / Metadatos eliminados' : 'Sin metadatos EXIF'}
                </span>
                <span className="text-slate-400 tabular-nums">
                  {(lightboxAsset.original_size_bytes / 1024).toFixed(1)} KB → {(lightboxAsset.optimized_size_bytes / 1024).toFixed(1)} KB
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(lightboxAsset.sha256);
                    showToast('Hash SHA-256 copiado', 'info');
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar SHA-256
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMarkdown((prev) => `${prev}\n![${lightboxAsset.filename}](asset://${lightboxAsset.id})\n`);
                    setDirty(true);
                    setLightboxAsset(null);
                    showToast('Evidencia insertada en Markdown', 'success');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                >
                  Insertar en .md
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Line-by-Line Revision Diff Modal */}
      {diffRevision && detail && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDiffRevision(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="diff-modal-title"
            className="w-full max-w-3xl max-h-[88vh] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div>
                <h3 id="diff-modal-title" className="text-sm font-semibold text-white">
                  Comparación v{diffRevision.revision_number} vs borrador actual
                </h3>
                <p className="text-[11px] text-slate-400">
                  Snapshot del {new Date(diffRevision.created_at).toLocaleString(systemLocale || 'es-MX')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
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
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                  aria-label="Cerrar comparación"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3 bg-slate-950 font-mono text-xs space-y-0.5">
              {computeLineDiff(diffRevision.markdown_content, markdown).map((ln, i) => (
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
