import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Code,
  Columns2,
  Download,
  Eye,
  FileCode2,
  FileText,
  GitCompare,
  Heading2,
  List,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Save,
  Search,
  SeparatorHorizontal,
  Table,
  Trash2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { ApiError } from '../../lib/apiErrors';
import { formatApiDateTime } from '../../lib/dates';
import { useVault } from '../../context/VaultContext';
import {
  InternalProject,
  Prospect,
  ReportCanvasSummary,
  ReportCorrelationsResponse,
  ReportDocumentDetail,
  ReportDocumentStatus,
  ReportDocumentSummary,
  TypstStatusResponse,
} from '../../types';
import { EmptyState } from '../common/EmptyState';

type DocumentPaneMode = 'split' | 'edit' | 'preview';

const STATUS_LABELS: Record<ReportDocumentStatus, string> = {
  borrador: 'Borrador',
  en_revision: 'En revisión',
  finalizado: 'Finalizado',
  entregado: 'Entregado',
};

export const ReportsDocumentsView: React.FC = () => {
  const { isUnlocked, openUnlockModal, setActiveSection, showToast, confirm, prompt } = useVault();

  const [documents, setDocuments] = useState<ReportDocumentSummary[]>([]);
  const [canvases, setCanvases] = useState<ReportCanvasSummary[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [projects, setProjects] = useState<InternalProject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<ReportDocumentDetail | null>(null);

  const [titleDraft, setTitleDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<ReportDocumentStatus>('borrador');
  const [prospectIdDraft, setProspectIdDraft] = useState<string>('');
  const [projectIdDraft, setProjectIdDraft] = useState<string>('');
  const [sourceDraft, setSourceDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [paneMode, setPaneMode] = useState<DocumentPaneMode>('split');

  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'html' | 'typ'>('pdf');
  const [correlations, setCorrelations] = useState<ReportCorrelationsResponse | null>(null);
  const [isCorrelationsOpen, setIsCorrelationsOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [typstStatus, setTypstStatus] = useState<TypstStatusResponse | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [compileError, setCompileError] = useState<string | null>(null);

  const compileRequestSeq = useRef(0);

  useEffect(() => {
    if (!isUnlocked) {
      setCanvases([]);
      setProspects([]);
      setProjects([]);
      return;
    }
    api
      .getTypstStatus()
      .then(setTypstStatus)
      .catch(() => setTypstStatus({ available: false, version: null, binary: null }));
    api.listReportCanvases().then(setCanvases).catch(() => {});
    api.getProspects().then(setProspects).catch(() => {});
    api.getProjects().then(setProjects).catch(() => {});
  }, [isUnlocked]);

  const loadDocuments = useCallback(async (preferId?: string | null) => {
    if (!isUnlocked) {
      setDocuments([]);
      setIsLoadingList(false);
      return;
    }
    setIsLoadingList(true);
    setErrorMessage(null);
    try {
      const list = await api.listReportDocuments();
      setDocuments(list);
      const targetId = preferId ?? (list[0]?.id ?? null);
      setSelectedId((prev) => {
        if (preferId) return preferId;
        if (prev && list.some((item) => item.id === prev)) return prev;
        return targetId;
      });
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : 'No se pudieron cargar los documentos.');
    } finally {
      setIsLoadingList(false);
    }
  }, [isUnlocked]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const selectDocumentWithGuard = useCallback(
    async (nextId: string) => {
      if (nextId === selectedId) return;
      if (hasUnsavedChanges) {
        const discard = await confirm({
          title: 'Cambios sin guardar',
          message: 'Tienes cambios pendientes en el documento actual. ¿Descartarlos y continuar?',
          confirmLabel: 'Descartar',
          tone: 'warning',
        });
        if (!discard) return;
      }
      setSelectedId(nextId);
    },
    [confirm, hasUnsavedChanges, selectedId]
  );

  const runCompile = useCallback(async (source: string) => {
    const seq = ++compileRequestSeq.current;
    setIsCompiling(true);
    try {
      const res = await api.compileTypstPreview(source);
      if (seq !== compileRequestSeq.current) return;
      if (res.ok) {
        setPreviewPages(res.pages);
        setCompileError(null);
      } else {
        setCompileError(res.error || 'Error de compilación de Typst.');
      }
    } catch (err) {
      if (seq !== compileRequestSeq.current) return;
      setCompileError(err instanceof ApiError ? err.message : 'No se pudo compilar la vista previa.');
    } finally {
      if (seq === compileRequestSeq.current) {
        setIsCompiling(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isUnlocked || !selectedId) {
      setActiveDoc(null);
      setTitleDraft('');
      setStatusDraft('borrador');
      setProspectIdDraft('');
      setProjectIdDraft('');
      setSourceDraft('');
      setPreviewPages([]);
      setCompileError(null);
      setHasUnsavedChanges(false);
      return;
    }

    let cancelled = false;
    setIsLoadingDetail(true);
    setErrorMessage(null);
    api
      .getReportDocument(selectedId)
      .then((detail) => {
        if (cancelled) return;
        setActiveDoc(detail);
        setTitleDraft(detail.title);
        setStatusDraft(detail.status);
        setProspectIdDraft(detail.prospect_id || '');
        setProjectIdDraft(detail.project_id || '');
        setSourceDraft(detail.source);
        setHasUnsavedChanges(false);
        void runCompile(detail.source);
        api.getReportDocumentCorrelations(detail.id).then(setCorrelations).catch(() => setCorrelations(null));
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(err instanceof ApiError ? err.message : 'No se pudo abrir el documento.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, runCompile]);

  useEffect(() => {
    if (!activeDoc || isLoadingDetail || paneMode === 'edit') return;
    const timer = window.setTimeout(() => {
      void runCompile(sourceDraft);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [sourceDraft, activeDoc, isLoadingDetail, paneMode, runCompile]);

  const handleCreateDocument = async () => {
    const entered = await prompt({
      title: 'Nuevo documento Typst',
      message: 'Asigna un título para identificar este informe o documento.',
      placeholder: 'Ej. Informe de evaluación Q4',
      defaultValue: 'Nuevo informe',
      confirmLabel: 'Crear documento',
    });
    if (!entered || !entered.trim()) return;

    try {
      const created = await api.createReportDocument({
        title: entered.trim(),
        status: 'borrador',
      });
      showToast('Documento creado.', 'success');
      await loadDocuments(created.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No se pudo crear el documento.', 'error');
    }
  };

  const handleSaveDocument = useCallback(async () => {
    if (!activeDoc) return;
    const cleanTitle = titleDraft.trim() || activeDoc.title;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const updated = await api.updateReportDocument(activeDoc.id, {
        title: cleanTitle,
        status: statusDraft,
        source: sourceDraft,
        prospect_id: prospectIdDraft || null,
        project_id: projectIdDraft || null,
      });
      setActiveDoc(updated);
      setTitleDraft(updated.title);
      setStatusDraft(updated.status);
      setProspectIdDraft(updated.prospect_id || '');
      setProjectIdDraft(updated.project_id || '');
      setDocuments((prev) =>
        prev.map((item) =>
          item.id === updated.id
            ? {
                ...item,
                title: updated.title,
                status: updated.status,
                prospect_id: updated.prospect_id,
                project_id: updated.project_id,
                updated_at: updated.updated_at,
              }
            : item
        )
      );
      setHasUnsavedChanges(false);
      showToast('Documento guardado.', 'success');
      api.getReportDocumentCorrelations(updated.id).then(setCorrelations).catch(() => {});
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'No se pudo guardar el documento.';
      setErrorMessage(msg);
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  }, [activeDoc, projectIdDraft, prospectIdDraft, showToast, sourceDraft, statusDraft, titleDraft]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        if (activeDoc) {
          event.preventDefault();
          void handleSaveDocument();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeDoc, handleSaveDocument]);

  const handleExportPdf = async () => {
    if (!activeDoc) return;
    setIsExportingPdf(true);
    try {
      const { blob, filename } = await api.exportReportDocument(activeDoc.id, exportFormat, sourceDraft);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename || `${titleDraft.trim() || 'documento'}.${exportFormat}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast(`Archivo exportado: ${anchor.download}`, 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : `No se pudo exportar en ${exportFormat.toUpperCase()}.`, 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDeleteDocument = async (doc: ReportDocumentSummary) => {
    const accepted = await confirm({
      title: 'Eliminar documento',
      message: `¿Seguro que deseas eliminar "${doc.title}"?`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!accepted) return;

    try {
      await api.deleteReportDocument(doc.id);
      showToast('Documento eliminado.', 'info');
      const remaining = documents.filter((item) => item.id !== doc.id);
      setDocuments(remaining);
      if (selectedId === doc.id) {
        setSelectedId(remaining[0]?.id ?? null);
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No se pudo eliminar el documento.', 'error');
    }
  };

  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertSnippet = useCallback((snippet: string) => {
    const textarea = editorTextareaRef.current;
    if (!textarea) {
      setSourceDraft((prev) => `${prev}${prev.endsWith('\n') || prev === '' ? '' : '\n'}${snippet}`);
      setHasUnsavedChanges(true);
      return;
    }
    const start = textarea.selectionStart ?? sourceDraft.length;
    const end = textarea.selectionEnd ?? sourceDraft.length;
    const next = sourceDraft.slice(0, start) + snippet + sourceDraft.slice(end);
    setSourceDraft(next);
    setHasUnsavedChanges(true);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + snippet.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }, [sourceDraft]);

  const filteredDocuments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return documents;
    return documents.filter((item) => item.title.toLowerCase().includes(query));
  }, [documents, searchQuery]);

  if (!isUnlocked) {
    return (
      <section className="mx-auto mt-12 max-w-xl px-4 text-center">
        <Lock size={24} className="mx-auto text-obsidian-muted" aria-hidden="true" />
        <h2 className="mt-3 font-heading text-lg font-semibold text-white">Documentos protegidos</h2>
        <p className="mt-1 text-sm text-obsidian-muted">
          Desbloquea la bóveda para consultar y editar los documentos cifrados en Typst.
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
              <FileText className="h-[18px] w-[18px] shrink-0 text-obsidian-muted" />
              <h2 className="truncate font-heading text-sm font-semibold text-white">Documentos</h2>
            </div>
            {/* [Acción principal] Crea un nuevo documento Typst. */}
            <button
              type="button"
              onClick={handleCreateDocument}
              className="ui-action-primary !px-3 text-xs"
            >
              <Plus className="h-4 w-4" />
              <span>Nuevo</span>
            </button>
          </div>

          <div className="border-b border-obsidian-border px-3 py-2.5">
            <label htmlFor="doc-search" className="sr-only">
              Buscar documentos
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-obsidian-muted" />
              <input
                id="doc-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar documento"
                className="w-full min-h-11 rounded-lg border border-obsidian-border bg-obsidian-surface py-2 pl-9 pr-3 text-sm text-white placeholder:text-obsidian-muted focus:border-obsidian-accent focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-obsidian-border">
            {isLoadingList ? (
              <p className="p-4 text-sm text-obsidian-muted">Cargando documentos…</p>
            ) : filteredDocuments.length === 0 ? (
              <div className="p-4 text-sm text-obsidian-muted">
                {documents.length === 0 ? 'Aún no hay documentos creados.' : 'Sin coincidencias.'}
              </div>
            ) : (
              filteredDocuments.map((item) => {
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
                      onClick={() => void selectDocumentWithGuard(item.id)}
                      className="min-w-0 min-h-11 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent"
                    >
                      <div className="truncate text-sm font-medium text-white">{item.title}</div>
                      <div className="mt-0.5 text-xs text-obsidian-muted">
                        {STATUS_LABELS[item.status] || item.status} · {formatApiDateTime(item.updated_at)}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteDocument(item)}
                      aria-label={`Eliminar ${item.title}`}
                      className="ui-action-icon text-obsidian-muted hover:text-obsidian-errorText"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      )}

      <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-obsidian-border bg-obsidian-panel min-h-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-obsidian-border px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              aria-label={isSidebarOpen ? 'Ocultar lista de documentos' : 'Mostrar lista de documentos'}
              className="ui-action-icon"
            >
              {isSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>

            {activeDoc ? (
              <>
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => {
                    setTitleDraft(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  aria-label="Título del documento"
                  className="min-w-0 flex-1 min-h-11 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-sm font-medium text-white focus:border-obsidian-accent focus:outline-none"
                />
                <label htmlFor="doc-status-select" className="sr-only">
                  Estado del documento
                </label>
                <select
                  id="doc-status-select"
                  value={statusDraft}
                  onChange={(e) => {
                    setStatusDraft(e.target.value as ReportDocumentStatus);
                    setHasUnsavedChanges(true);
                  }}
                  className="h-11 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 text-sm text-white focus:border-obsidian-accent focus:outline-none"
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <span className="text-sm text-obsidian-muted">Selecciona o crea un documento Typst</span>
            )}
          </div>

          {activeDoc && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-lg border border-obsidian-border bg-obsidian-surface p-0.5" role="group" aria-label="Modo de vista">
                <button
                  type="button"
                  onClick={() => setPaneMode('edit')}
                  aria-pressed={paneMode === 'edit'}
                  className={`ui-action-toggle !px-2.5 text-xs ${paneMode === 'edit' ? 'bg-obsidian-panel text-white' : ''}`}
                >
                  <FileCode2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Código</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaneMode('split')}
                  aria-pressed={paneMode === 'split'}
                  className={`ui-action-toggle !px-2.5 text-xs ${paneMode === 'split' ? 'bg-obsidian-panel text-white' : ''}`}
                >
                  <Columns2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Dividido</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaneMode('preview')}
                  aria-pressed={paneMode === 'preview'}
                  className={`ui-action-toggle !px-2.5 text-xs ${paneMode === 'preview' ? 'bg-obsidian-panel text-white' : ''}`}
                >
                  <Eye className="h-4 w-4" />
                  <span className="hidden sm:inline">Vista previa</span>
                </button>
              </div>

              <span className="px-1 text-xs text-obsidian-muted" aria-live="polite">
                {isSaving ? (
                  'Guardando…'
                ) : hasUnsavedChanges ? (
                  'Cambios pendientes'
                ) : (
                  <span className="inline-flex items-center gap-1 text-obsidian-emerald">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Guardado
                  </span>
                )}
              </span>

              <label htmlFor="doc-export-format" className="sr-only">
                Formato de exportación
              </label>
              <select
                id="doc-export-format"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as 'pdf' | 'html' | 'typ')}
                className="h-11 rounded-lg border border-obsidian-border bg-obsidian-surface px-2.5 text-xs text-white focus:border-obsidian-accent focus:outline-none"
              >
                <option value="pdf">PDF</option>
                <option value="html">HTML</option>
                <option value="typ">Typst (.typ)</option>
              </select>

              {/* [Acción secundaria] Exporta el documento en el formato elegido. */}
              <button
                type="button"
                onClick={() => void handleExportPdf()}
                disabled={isExportingPdf || (exportFormat !== 'typ' && typstStatus?.available === false)}
                className="ui-action-secondary"
              >
                <Download className="h-4 w-4" />
                <span>{isExportingPdf ? 'Exportando…' : 'Exportar'}</span>
              </button>

              {/* [Acción principal] Guarda el código fuente Typst cifrado en el servidor. */}
              <button
                type="button"
                onClick={() => void handleSaveDocument()}
                disabled={isSaving}
                className="ui-action-primary"
              >
                <Save className="h-4 w-4" />
                <span>Guardar</span>
              </button>
            </div>
          )}
        </header>

        {activeDoc && (prospects.length > 0 || projects.length > 0) && (
          <div className="flex flex-wrap items-center gap-3 border-b border-obsidian-border px-4 py-2 text-xs">
            {prospects.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="doc-prospect-select" className="text-obsidian-muted">
                  Prospecto:
                </label>
                <select
                  id="doc-prospect-select"
                  value={prospectIdDraft}
                  onChange={(e) => {
                    setProspectIdDraft(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  className="h-11 max-w-[200px] rounded-lg border border-obsidian-border bg-obsidian-surface px-2.5 text-xs text-white focus:border-obsidian-accent focus:outline-none"
                >
                  <option value="">Sin prospecto</option>
                  {prospects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.company_name || p.contact_name || p.id}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {projects.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="doc-project-select" className="text-obsidian-muted">
                  Proyecto:
                </label>
                <select
                  id="doc-project-select"
                  value={projectIdDraft}
                  onChange={(e) => {
                    setProjectIdDraft(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  className="h-11 max-w-[200px] rounded-lg border border-obsidian-border bg-obsidian-surface px-2.5 text-xs text-white focus:border-obsidian-accent focus:outline-none"
                >
                  <option value="">Sin proyecto</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {activeDoc && correlations && correlations.matches.length > 0 && (
          <div className="border-b border-obsidian-border bg-obsidian-surface/60 px-4 py-2">
            <button
              type="button"
              onClick={() => setIsCorrelationsOpen((prev) => !prev)}
              className="flex min-h-11 w-full items-center justify-between gap-2 text-xs text-obsidian-muted hover:text-white focus-visible:outline-none"
            >
              <span className="inline-flex items-center gap-1.5">
                <GitCompare className="h-4 w-4 text-obsidian-accent" />
                <span>
                  {correlations.matches.length}{' '}
                  {correlations.matches.length === 1 ? 'documento relacionado' : 'documentos relacionados'}
                </span>
              </span>
              <span>{isCorrelationsOpen ? 'Ocultar' : 'Ver'}</span>
            </button>
            {isCorrelationsOpen && (
              <div className="mt-2 flex flex-wrap gap-2">
                {correlations.matches.map((match) => (
                  <button
                    key={match.id}
                    type="button"
                    onClick={() => void selectDocumentWithGuard(match.id)}
                    className="min-h-11 rounded-lg border border-obsidian-border bg-obsidian-panel px-2.5 py-1.5 text-left text-xs text-white hover:border-obsidian-borderLight focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent"
                  >
                    <span className="font-medium">{match.title}</span>
                    <span className="ml-2 text-obsidian-muted">{match.reasons.join(' · ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {typstStatus && !typstStatus.available && (
          <div role="status" className="flex items-center gap-2 border-b border-obsidian-border bg-obsidian-surface px-4 py-2 text-xs text-obsidian-amber">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>El binario de Typst aún no está disponible en el servidor; puedes editar y guardar código mientras termina su instalación.</span>
          </div>
        )}

        {errorMessage && (
          <div role="alert" className="border-b border-obsidian-border bg-obsidian-dangerBg px-4 py-2 text-xs text-obsidian-errorText">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                icon={FileText}
                title="Sin documentos seleccionados"
                description="Crea un documento con Typst para redactar informes técnicos con vista previa en vivo y exportación PDF."
                actionLabel="Nuevo documento"
                onAction={() => void handleCreateDocument()}
              />
            </div>
          ) : isLoadingDetail || !activeDoc ? (
            <div className="flex flex-1 items-center justify-center text-sm text-obsidian-muted">
              Cargando documento…
            </div>
          ) : (
            <div className="flex flex-1 flex-col md:flex-row min-h-0 min-w-0 divide-y md:divide-y-0 md:divide-x divide-obsidian-border">
              {paneMode !== 'preview' && (
                <div className="flex min-w-0 flex-1 flex-col bg-obsidian-bg">
                  <div className="flex items-center justify-between gap-2 border-b border-obsidian-border px-3 py-1.5 text-xs text-obsidian-muted overflow-x-auto">
                    <div className="flex items-center gap-1" role="toolbar" aria-label="Inserción rápida Typst">
                      <button
                        type="button"
                        onClick={() => insertSnippet('\n== Sección\n\n')}
                        title="Insertar sección"
                        aria-label="Insertar sección"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-obsidian-muted hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent"
                      >
                        <Heading2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => insertSnippet('\n- Elemento 1\n- Elemento 2\n')}
                        title="Insertar lista"
                        aria-label="Insertar lista"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-obsidian-muted hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent"
                      >
                        <List className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          insertSnippet(
                            '\n#table(\n  columns: (auto, 1fr),\n  inset: 8pt,\n  [*Campo*], [*Valor*],\n  [Dato], [Detalle],\n)\n'
                          )
                        }
                        title="Insertar tabla"
                        aria-label="Insertar tabla"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-obsidian-muted hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent"
                      >
                        <Table className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => insertSnippet('\n```bash\n# comando o salida\n```\n')}
                        title="Insertar bloque de código"
                        aria-label="Insertar bloque de código"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-obsidian-muted hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent"
                      >
                        <Code className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => insertSnippet('\n#pagebreak()\n')}
                        title="Insertar salto de página"
                        aria-label="Insertar salto de página"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-obsidian-muted hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent"
                      >
                        <SeparatorHorizontal className="h-4 w-4" />
                      </button>
                      {canvases.length > 0 ? (
                        <select
                          aria-label="Insertar lienzo"
                          value=""
                          onChange={(e) => {
                            const cid = e.target.value;
                            if (!cid) return;
                            const chosen = canvases.find((c) => c.id === cid);
                            const caption = chosen ? chosen.title.replace(/[[\]]/g, '') : 'Diagrama';
                            insertSnippet(`\n#figure(\n  image("canvas://${cid}", width: 95%),\n  caption: [${caption}],\n)\n`);
                          }}
                          className="ml-1 h-8 max-w-[170px] rounded-md border border-obsidian-border bg-obsidian-surface px-2 text-xs text-white focus:border-obsidian-accent focus:outline-none"
                        >
                          <option value="">Insertar lienzo…</option>
                          {canvases.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.linked_document_id === activeDoc?.id ? `${c.title} (vinculado)` : c.title}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActiveSection('reports_canvases')}
                          className="ml-1 rounded-md px-2 py-1 text-xs text-obsidian-muted hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent"
                        >
                          Crear lienzo
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void runCompile(sourceDraft)}
                      disabled={isCompiling}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-obsidian-muted hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isCompiling ? 'animate-spin' : ''}`} />
                      <span>{isCompiling ? 'Compilando…' : 'Compilar'}</span>
                    </button>
                  </div>
                  <label htmlFor="typst-source-editor" className="sr-only">
                    Código fuente Typst
                  </label>
                  <textarea
                    ref={editorTextareaRef}
                    id="typst-source-editor"
                    value={sourceDraft}
                    onChange={(e) => {
                      setSourceDraft(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    spellCheck={false}
                    className="flex-1 w-full resize-none bg-obsidian-bg p-4 font-mono text-sm leading-6 text-white placeholder:text-obsidian-muted focus:outline-none"
                    placeholder="Escribe código Typst aquí…"
                  />
                </div>
              )}

              {paneMode !== 'edit' && (
                <div className="flex min-w-0 flex-1 flex-col bg-obsidian-bg">
                  <div className="flex items-center justify-between border-b border-obsidian-border px-4 py-2 text-xs text-obsidian-muted">
                    <span>
                      Vista previa ({previewPages.length} {previewPages.length === 1 ? 'página' : 'páginas'})
                    </span>
                    {typstStatus?.version && <span className="font-mono">{typstStatus.version}</span>}
                  </div>

                  {compileError && (
                    <div role="alert" className="border-b border-obsidian-border bg-obsidian-dangerBg px-4 py-2.5 font-mono text-xs text-obsidian-errorText whitespace-pre-wrap">
                      {compileError}
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                    {previewPages.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-obsidian-muted">
                        {isCompiling ? 'Compilando vista previa…' : 'Sin páginas renderizadas.'}
                      </div>
                    ) : (
                      previewPages.map((svgMarkup, idx) => (
                        <div
                          key={idx}
                          className="mx-auto w-full max-w-[820px] overflow-hidden rounded-lg border border-obsidian-border bg-white shadow-obsidian [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                          aria-label={`Página ${idx + 1}`}
                          dangerouslySetInnerHTML={{ __html: svgMarkup }}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
