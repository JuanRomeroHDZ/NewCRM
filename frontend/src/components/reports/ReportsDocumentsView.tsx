import React, { useCallback, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bold,
  CheckCircle2,
  Code,
  Columns2,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  FileText,
  GitCompare,
  ImagePlus,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Lock,
  Menu,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Quote,
  Redo2,
  RefreshCw,
  Save,
  Search,
  SeparatorHorizontal,
  SpellCheck,
  Sparkles,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  Trash2,
  Underline,
  Undo2,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as Y from 'yjs';
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
import { TypstCodeEditor, TypstCodeEditorHandle } from './TypstCodeEditor';
import { useAuditedDialog } from '../common/useAuditedDialog';
import { ReportLoadingSkeleton } from './ReportLoadingSkeleton';
import { ReportCollaborationPanel } from './ReportCollaborationPanel';
import { describeReportSync, useReportCollaboration } from './useReportCollaboration';
import { TYPST_QUICK_SNIPPETS } from './typstSnippets';
import { getTypstDocumentTemplate, TYPST_DOCUMENT_TEMPLATES } from './typstTemplates';
import {
  deleteTypstRecoverySnapshots,
} from './typstRecovery';

const ReportPdfPreview = lazy(() => import('./ReportPdfPreview'));

const REPORT_EXPORT_EXTENSIONS = { pdf: 'pdf', html: 'html', typ: 'typ', typst_zip: 'typst.zip' } as const;

function validateExportName(name: string, extension: string) {
  const value = name.trim();
  const suffix = `.${extension}`;
  const stem = value.toLowerCase().endsWith(suffix) ? value.slice(0, -suffix.length) : value;
  if (value && (!stem || stem.length > 120 || /^[.]|[. ]$/.test(stem) ||
      /[\u0000-\u001F\u007F<>:"/\\|?*]/.test(stem) ||
      /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(stem))) {
    return { error: 'Usa un nombre válido sin caracteres reservados ni punto al inicio o al final.', stem: '' };
  }
  return { error: null, stem };
}

type DocumentPaneMode = 'split' | 'edit' | 'preview';

interface ToolbarButtonProps {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ label, icon: Icon, onClick, pressed, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={pressed}
    title={label}
    disabled={disabled}
    className="ui-action-icon h-11 w-11 shrink-0"
  >
    <Icon className="h-4 w-4" aria-hidden="true" />
  </button>
);

const STATUS_LABELS: Record<ReportDocumentStatus, string> = {
  borrador: 'Borrador',
  en_revision: 'En revisión',
  finalizado: 'Finalizado',
  entregado: 'Entregado',
};

const DOCUMENT_ACTION_CLASS = 'flex min-h-11 w-full items-center gap-2 rounded px-3 text-left text-sm hover:bg-obsidian-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent disabled:cursor-not-allowed disabled:opacity-50';

export const ReportsDocumentsView: React.FC = () => {
  const { isUnlocked, draftRecoveryKey, operator, openUnlockModal, setActiveSection, showToast, confirm } = useVault();

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
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [newDocumentTitle, setNewDocumentTitle] = useState('Nuevo informe');
  const [newDocumentTemplateId, setNewDocumentTemplateId] = useState('technical');

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [paneMode, setPaneMode] = useState<DocumentPaneMode>('split');
  const [redactForClient, setRedactForClient] = useState(false);
  const [quickSnippetId, setQuickSnippetId] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isCollaborationOpen, setIsCollaborationOpen] = useState(false);
  const [collaborationAnchor, setCollaborationAnchor] = useState<string | null>(null);

  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listLoadError, setListLoadError] = useState<string | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailLoadError, setDetailLoadError] = useState<string | null>(null);
  const [detailLoadAttempt, setDetailLoadAttempt] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'html' | 'typ' | 'typst_zip'>('pdf');
  const [pdfControls, setPdfControls] = useState<HTMLDivElement | null>(null);
  const [previewToolbar, setPreviewToolbar] = useState<HTMLDivElement | null>(null);
  const previewScrollArea = useRef<HTMLDivElement>(null);
  const [previewFormat, setPreviewFormat] = useState<'svg' | 'pdf' | 'html'>('svg');
  const [formatPreview, setFormatPreview] = useState<{ value: string | Blob; error: boolean } | null>(null);
  const exportOperation = useRef<number>(0);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportDialogRef = useAuditedDialog(exportOpen, () => setExportOpen(false));
  const [exportName, setExportName] = useState('');
  const [exportFieldError, setExportFieldError] = useState<string | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionsButtonRef = useRef<HTMLButtonElement>(null);
  const [correlations, setCorrelations] = useState<ReportCorrelationsResponse | null>(null);
  const [isCorrelationsOpen, setIsCorrelationsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [typstStatus, setTypstStatus] = useState<TypstStatusResponse | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [compileError, setCompileError] = useState<string | null>(null);

  const compileRequestSeq = useRef(0);
  const editorRef = useRef<TypstCodeEditorHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const savingDocumentIdsRef = useRef(new Set<string>());
  const mountedRef = useRef(false);
  const selectedIdRef = useRef(selectedId);
  const activeDocIdRef = useRef(activeDoc?.id ?? null);
  const draftValuesRef = useRef({ titleDraft, statusDraft, prospectIdDraft, projectIdDraft, sourceDraft });
  selectedIdRef.current = selectedId;
  activeDocIdRef.current = activeDoc?.id ?? null;
  draftValuesRef.current = { titleDraft, statusDraft, prospectIdDraft, projectIdDraft, sourceDraft };

  const getCollaborativeDocumentContent = useCallback((doc: Y.Doc) => {
    const metadata = doc.getMap<unknown>('metadata');
    return {
      title: String(metadata.get('title') ?? activeDoc?.title ?? ''),
      status: String(metadata.get('status') ?? activeDoc?.status ?? 'borrador'),
      source: doc.getText('typst-source').toString(),
      prospect_id: (metadata.get('prospect_id') as string | null | undefined) ?? null,
      project_id: (metadata.get('project_id') as string | null | undefined) ?? null,
      engagement_id: (metadata.get('engagement_id') as string | null | undefined) ?? null,
    };
  }, [activeDoc?.status, activeDoc?.title]);
  const collaboration = useReportCollaboration({
    resourceType: 'document',
    resourceId: activeDoc?.id ?? null,
    initialContent: activeDoc ? {
      title: activeDoc.title,
      status: activeDoc.status,
      source: activeDoc.source,
      prospect_id: activeDoc.prospect_id,
      project_id: activeDoc.project_id,
      engagement_id: activeDoc.engagement_id,
    } : null,
    recoveryKey: draftRecoveryKey,
    operator,
    getContent: getCollaborativeDocumentContent,
  });

  const updateCollaborativeMetadata = useCallback((field: string, value: unknown) => {
    if (collaboration.canEdit) collaboration.session?.metadata.set(field, value);
  }, [collaboration.canEdit, collaboration.session]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

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
      setListLoadError(null);
      setIsLoadingList(false);
      return;
    }
    setIsLoadingList(true);
    setListLoadError(null);
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
      setListLoadError(err instanceof ApiError ? err.message : 'No se pudieron cargar los documentos.');
    } finally {
      setIsLoadingList(false);
    }
  }, [isUnlocked]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const hasUnsavedChanges = activeDoc !== null && (
    collaboration.isDirty ||
    (titleDraft.trim() || activeDoc.title) !== activeDoc.title ||
    statusDraft !== activeDoc.status ||
    prospectIdDraft !== (activeDoc.prospect_id || '') ||
    projectIdDraft !== (activeDoc.project_id || '') ||
    sourceDraft !== activeDoc.source
  );
  const syncLabel = describeReportSync(collaboration, isSaving, hasUnsavedChanges);

  const selectDocumentWithGuard = useCallback(
    async (nextId: string) => {
      if (nextId === selectedId) return;
      if (hasUnsavedChanges && collaboration.canEdit && collaboration.status === 'connected') {
        try {
          await collaboration.checkpoint(false, 'manual');
        } catch (error) {
          showToast(error instanceof Error ? error.message : 'No se pudo sincronizar el documento.', 'error');
          return;
        }
      }
      setSelectedId(nextId);
    },
    [collaboration.canEdit, collaboration.checkpoint, collaboration.status, hasUnsavedChanges, selectedId, showToast]
  );

  const runCompile = useCallback(async (source: string, documentId?: string) => {
    const seq = ++compileRequestSeq.current;
    setIsCompiling(true);
    try {
      const res = await api.compileTypstPreview(source, documentId);
      if (seq !== compileRequestSeq.current) return;
      if (res.ok) {
        setPreviewPages(res.pages);
        setCompileError(null);
      } else {
        setPreviewPages([]);
        setCompileError(res.error || 'Error de compilación de Typst.');
      }
    } catch (err) {
      if (seq !== compileRequestSeq.current) return;
      setPreviewPages([]);
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
      setDetailLoadError(null);
      setPreviewPages([]);
      setCompileError(null);
      setIsLoadingDetail(false);
      compileRequestSeq.current += 1;
      setIsCompiling(false);
      return;
    }

    let cancelled = false;
    setIsLoadingDetail(true);
    setActiveDoc(null);
    setDetailLoadError(null);
    setErrorMessage(null);
    setPreviewPages([]);
    setCompileError(null);
    compileRequestSeq.current += 1;
    setIsCompiling(false);
    setCorrelations(null);
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
        api.getReportDocumentCorrelations(detail.id)
          .then((result) => { if (!cancelled) setCorrelations(result); })
          .catch(() => { if (!cancelled) setCorrelations(null); });
      })
      .catch((err) => {
        if (cancelled) return;
        setDetailLoadError(err instanceof ApiError ? err.message : 'No se pudo abrir el documento.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, detailLoadAttempt]);

  useEffect(() => {
    const session = collaboration.session;
    if (!session || !activeDoc || session.doc.isDestroyed) return;
    const content = getCollaborativeDocumentContent(session.doc);
    const nextSource = session.text.toString();
    setSourceDraft((current) => current === nextSource ? current : nextSource);
    setTitleDraft((current) => current === content.title ? current : content.title);
    setStatusDraft((current) => current === content.status ? current : content.status as ReportDocumentStatus);
    setProspectIdDraft((current) => current === (content.prospect_id || '') ? current : content.prospect_id || '');
    setProjectIdDraft((current) => current === (content.project_id || '') ? current : content.project_id || '');
    if (collaboration.lastSavedAt && !collaboration.isDirty) {
      setActiveDoc((current) => {
        if (!current || current.id !== activeDoc.id) return current;
        if (current.title === content.title && current.status === content.status && current.source === nextSource
          && current.prospect_id === content.prospect_id && current.project_id === content.project_id) return current;
        return {
          ...current,
          title: content.title,
          status: content.status as ReportDocumentStatus,
          source: nextSource,
          prospect_id: content.prospect_id,
          project_id: content.project_id,
          updated_at: collaboration.lastSavedAt!,
        };
      });
      setDocuments((current) => current.map((item) => item.id === activeDoc.id ? {
        ...item,
        title: content.title,
        status: content.status as ReportDocumentStatus,
        prospect_id: content.prospect_id,
        project_id: content.project_id,
        updated_at: collaboration.lastSavedAt!,
      } : item));
    }
  }, [
    activeDoc?.id,
    collaboration.isDirty,
    collaboration.lastSavedAt,
    collaboration.revision,
    collaboration.session,
    getCollaborativeDocumentContent,
  ]);

  const previewDocumentId = activeDoc?.id;
  useEffect(() => {
    if (!previewDocumentId || isLoadingDetail || paneMode === 'edit' || previewFormat !== 'svg') return;
    const timer = window.setTimeout(() => {
      void runCompile(sourceDraft, previewDocumentId);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [sourceDraft, previewDocumentId, isLoadingDetail, paneMode, previewFormat, runCompile]);

  useEffect(() => {
    setFormatPreview(null);
    if (!previewDocumentId || paneMode === 'edit' || previewFormat === 'svg') return;
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        const { blob } = await api.exportReportDocument(previewDocumentId, previewFormat, sourceDraft);
        const value = previewFormat === 'html' ? await blob.text() : blob;
        if (cancelled) return;
        if (previewFormat === 'pdf' && blob.type !== 'application/pdf') throw new Error('Formato de vista previa inválido.');
        setFormatPreview({ value, error: false });
      } catch {
        if (!cancelled) setFormatPreview({ value: 'No se pudo generar la vista previa en este formato.', error: true });
      }
    }, 650);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [previewDocumentId, paneMode, previewFormat, sourceDraft]);

  const handleCreateDocument = async () => {
    const cleanTitle = newDocumentTitle.trim();
    if (!cleanTitle) return;
    if (hasUnsavedChanges) {
      const saveFirst = await confirm({
        title: 'Guardar antes de crear',
        message: 'El nuevo documento se abrirá al crearlo. Guarda primero el borrador actual para conservar todos sus cambios.',
        confirmLabel: 'Guardar y crear',
        tone: 'warning',
      });
      if (!saveFirst) return;
      const saved = await handleSaveDocument();
      if (!saved) return;
    }
    const template = getTypstDocumentTemplate(newDocumentTemplateId);

    try {
      const created = await api.createReportDocument({
        title: cleanTitle,
        status: 'borrador',
        source: template.source,
      });
      setIsCreateFormOpen(false);
      setNewDocumentTitle('Nuevo informe');
      showToast('Documento creado.', 'success');
      await loadDocuments(created.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No se pudo crear el documento.', 'error');
    }
  };

  const closeActions = useCallback((restoreFocus = false) => {
    setActionsOpen(false);
    if (restoreFocus) actionsButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    closeActions();
    setExportOpen(false);
    setRedactForClient(false);
  }, [selectedId, closeActions]);

  useEffect(() => {
    if (!actionsOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !actionsRef.current?.contains(event.target)) closeActions();
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [actionsOpen, closeActions]);

  const handleSaveDocument = useCallback(async () => {
    if (!activeDoc) return false;
    if (!hasUnsavedChanges) return true;
    const targetDocumentId = activeDoc.id;
    if (savingDocumentIdsRef.current.has(targetDocumentId)) return false;
    savingDocumentIdsRef.current.add(targetDocumentId);
    const cleanTitle = titleDraft.trim() || activeDoc.title;
    const draftAtStart = {
      title: cleanTitle,
      status: statusDraft,
      prospectId: prospectIdDraft,
      projectId: projectIdDraft,
      source: sourceDraft,
    };
    setIsSaving(true);
    setErrorMessage(null);
    try {
      if (collaboration.session) {
        if (!collaboration.canEdit || collaboration.status !== 'connected') {
          throw new Error('Espera a que el reporte termine de sincronizarse para guardarlo.');
        }
        await collaboration.checkpoint(true, 'manual');
        const updated = await api.getReportDocument(targetDocumentId);
        setActiveDoc(updated);
        setTitleDraft(updated.title);
        setStatusDraft(updated.status);
        setProspectIdDraft(updated.prospect_id || '');
        setProjectIdDraft(updated.project_id || '');
        setSourceDraft(updated.source);
        setDocuments((prev) => prev.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
        showToast(`Documento guardado como versión: ${updated.title}`, 'success');
        return true;
      }
      const updated = await api.updateReportDocument(targetDocumentId, {
        title: cleanTitle,
        status: statusDraft,
        source: sourceDraft,
        prospect_id: prospectIdDraft || null,
        project_id: projectIdDraft || null,
      });
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
      if (selectedIdRef.current === targetDocumentId && activeDocIdRef.current === targetDocumentId) {
        setActiveDoc(updated);
        const currentDraft = draftValuesRef.current;
        const draftUnchanged = currentDraft.titleDraft.trim() === draftAtStart.title
          && currentDraft.statusDraft === draftAtStart.status
          && currentDraft.prospectIdDraft === draftAtStart.prospectId
          && currentDraft.projectIdDraft === draftAtStart.projectId
          && currentDraft.sourceDraft === draftAtStart.source;
        if (draftUnchanged) {
          setTitleDraft(updated.title);
          setStatusDraft(updated.status);
          setProspectIdDraft(updated.prospect_id || '');
          setProjectIdDraft(updated.project_id || '');
        }
      }
      showToast(`Documento guardado: ${updated.title}`, 'success');
      api.getReportDocumentCorrelations(updated.id)
        .then((result) => {
          if (selectedIdRef.current === targetDocumentId && activeDocIdRef.current === targetDocumentId) {
            setCorrelations(result);
          }
        })
        .catch(() => {});
      return true;
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'No se pudo guardar el documento.';
      setErrorMessage(msg);
      showToast(msg, 'error');
      return false;
    } finally {
      savingDocumentIdsRef.current.delete(targetDocumentId);
      setIsSaving(false);
    }
  }, [
    activeDoc,
    collaboration.canEdit,
    collaboration.checkpoint,
    collaboration.session,
    collaboration.status,
    hasUnsavedChanges,
    projectIdDraft,
    prospectIdDraft,
    showToast,
    sourceDraft,
    statusDraft,
    titleDraft,
  ]);

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

  useEffect(() => {
    exportOperation.current += 1;
    setIsExporting(false);
    setExportError(null);
  }, [selectedId, isUnlocked]);

  const handleExport = async (exportFormat: 'pdf' | 'html' | 'typ' | 'typst_zip') => {
    if (!activeDoc || isExporting) return;
    const requestId = ++exportOperation.current;
    const documentId = activeDoc.id;
    const isCurrent = () => mountedRef.current && selectedIdRef.current === documentId
      && exportOperation.current === requestId;
    setIsExporting(true);
    setExportError(null);
    try {
      if (collaboration.isDirty && collaboration.canEdit && collaboration.status === 'connected') {
        await collaboration.checkpoint(true, 'manual');
      }
      const result = await api.exportReportDocument(
        documentId, exportFormat, sourceDraft, redactForClient && exportFormat !== 'typ',
      );
      if (!isCurrent()) return;
      if (!result.blob.size) throw new Error('El servidor devolvió un archivo vacío.');
      const extension = REPORT_EXPORT_EXTENSIONS[exportFormat];
      const customName = validateExportName(exportName, extension).stem;
      const filename = (customName && `${customName}.${extension}`)
        || (result.filename === 'export' ? `documento.${extension}` : result.filename);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      if (!isCurrent()) return;
      let message = cause instanceof Error ? cause.message : 'No se pudo preparar el archivo.';
      if (cause instanceof ApiError && cause.status === 422) {
        message = exportFormat === 'html'
          ? 'Typst no pudo generar el HTML de este documento. Revisa la sintaxis o elige PDF.'
          : 'No se pudo exportar el documento. Compila la vista previa para revisar la sintaxis y los adjuntos.';
      }
      setExportError(message);
    } finally {
      if (isCurrent()) setIsExporting(false);
    }
  };

  const handleDeleteDocument = async (doc: ReportDocumentSummary) => {
    const deletesUnsavedDraft = selectedId === doc.id && hasUnsavedChanges;
    const accepted = await confirm({
      title: 'Eliminar documento',
      message: `¿Seguro que deseas eliminar "${doc.title}"? También se borrará su historial local cifrado${deletesUnsavedDraft ? ' y se perderán los cambios pendientes' : ''}.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!accepted) return;

    try {
      await api.deleteReportDocument(doc.id);
      const localHistoryDeleted = await deleteTypstRecoverySnapshots(doc.id).then(() => true).catch(() => false);
      showToast(
        localHistoryDeleted
          ? 'Documento eliminado y su historial local cifrado borrado.'
          : 'Documento eliminado, pero no se pudo borrar el historial local cifrado.',
        localHistoryDeleted ? 'info' : 'error',
      );
      const remaining = documents.filter((item) => item.id !== doc.id);
      setDocuments(remaining);
      if (selectedId === doc.id) {
        setSelectedId(remaining[0]?.id ?? null);
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'No se pudo eliminar el documento.', 'error');
    }
  };

  const insertSnippet = useCallback((snippet: string) => {
    const editor = editorRef.current;
    if (!editor) {
      setSourceDraft((prev) => `${prev}${prev.endsWith('\n') || prev === '' ? '' : '\n'}${snippet}`);
      return;
    }
    editor.insert(snippet);
  }, []);

  const handleImageFiles = useCallback(async (files: File[]) => {
    if (!activeDoc || !collaboration.canEdit || files.length === 0) return;
    const targetDocumentId = activeDoc.id;
    const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif']);
    const images = files.filter((file) => supportedTypes.has(file.type));
    if (images.length === 0) {
      setImageUploadError('Selecciona una imagen PNG, JPEG, WebP, AVIF o GIF.');
      return;
    }
    const unsupportedCount = files.length - images.length;
    setIsUploadingImage(true);
    setImageUploadError(null);
    try {
      let insertedCount = 0;
      let savedToPreviousDocument = false;
      for (const file of images) {
        const asset = await api.uploadReportDocumentAsset(targetDocumentId, file);
        if (selectedIdRef.current !== targetDocumentId || activeDocIdRef.current !== targetDocumentId) {
          savedToPreviousDocument = true;
          break;
        }
        const caption = asset.filename
          .replace(/\.[^.]+$/, '')
          .replace(/[\[\]\r\n]/g, ' ')
          .trim() || 'Captura de evidencia';
        insertSnippet(
          `\n#figure(\n  image("asset://${asset.id}", width: 90%),\n  caption: [${caption}],\n)\n`,
        );
        insertedCount += 1;
      }
      if (savedToPreviousDocument) {
        showToast('La imagen subida se guardó en el documento anterior y no se insertó en el documento abierto.', 'info');
      } else if (insertedCount > 0) {
        const unsupportedNotice = unsupportedCount > 0 ? ` Se omitieron ${unsupportedCount} archivos no compatibles.` : '';
        showToast(
          `${insertedCount === 1 ? 'Imagen cifrada e insertada.' : `${insertedCount} imágenes cifradas e insertadas.`}${unsupportedNotice}`,
          unsupportedCount > 0 ? 'info' : 'success',
        );
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'No se pudo subir la imagen.';
      setImageUploadError(message);
      showToast(message, 'error');
    } finally {
      setIsUploadingImage(false);
    }
  }, [activeDoc, collaboration.canEdit, insertSnippet, showToast]);

  const handleOpenCanvases = async () => {
    if (hasUnsavedChanges) {
      const saveFirst = await confirm({
        title: 'Guardar antes de abrir Lienzos',
        message: 'La lista de Lienzos abrirá otra sección. Guarda el documento actual para conservar sus cambios.',
        confirmLabel: 'Guardar y abrir Lienzos',
        tone: 'warning',
      });
      if (!saveFirst) return;
      const saved = await handleSaveDocument();
      if (!saved) return;
    }
    setActiveSection('reports_canvases');
  };

  useEffect(() => {
    if (!activeDoc || (!hasUnsavedChanges && !collaboration.isDirty)) return;

    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [activeDoc, collaboration.isDirty, hasUnsavedChanges]);

  const filteredDocuments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return documents;
    return documents.filter((item) => item.title.toLowerCase().includes(query));
  }, [documents, searchQuery]);

  const canvasesWithSnapshots = useMemo(
    () => canvases.filter((canvas) => canvas.element_count > 0 && canvas.has_svg_snapshot),
    [canvases],
  );

  // SVG image mode keeps Typst's glyph references and disables scripts and external loads.
  const errorLocation = compileError?.match(/document\.typ:(\d+):(\d+)/);
  const previewImages = useMemo(
    () => previewPages.map((markup) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`),
    [previewPages],
  );

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
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-[420px] min-w-0 flex-col gap-4 lg:min-h-[540px] lg:flex-row">
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
              onClick={() => setIsCreateFormOpen((open) => !open)}
              aria-expanded={isCreateFormOpen}
              aria-controls="create-report-document-form"
              className="ui-action-primary !px-3 text-xs"
            >
              <Plus className={`h-4 w-4 ${isCreateFormOpen ? 'rotate-45' : ''}`} />
              <span>{isCreateFormOpen ? 'Cerrar' : 'Nuevo'}</span>
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

          {isCreateFormOpen && (
            <form
              id="create-report-document-form"
              onSubmit={(event) => { event.preventDefault(); void handleCreateDocument(); }}
              className="space-y-3 border-b border-obsidian-border p-3"
            >
              <div className="space-y-1.5">
                <label htmlFor="new-report-title" className="block text-xs font-medium text-obsidian-muted">Título</label>
                <input
                  id="new-report-title"
                  value={newDocumentTitle}
                  onChange={(event) => setNewDocumentTitle(event.target.value)}
                  maxLength={200}
                  required
                  className="min-h-11 w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="new-report-template" className="block text-xs font-medium text-obsidian-muted">Plantilla</label>
                <select
                  id="new-report-template"
                  value={newDocumentTemplateId}
                  onChange={(event) => setNewDocumentTemplateId(event.target.value)}
                  className="h-11 w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent"
                >
                  {TYPST_DOCUMENT_TEMPLATES.map((template) => (
                    <option key={template.id} value={template.id}>{template.label}</option>
                  ))}
                </select>
                <p className="text-xs text-obsidian-muted">
                  {getTypstDocumentTemplate(newDocumentTemplateId).description}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setIsCreateFormOpen(false)} className="ui-action-secondary">Cancelar</button>
                <button type="submit" className="ui-action-primary">Crear documento</button>
              </div>
            </form>
          )}

          <div className="flex-1 overflow-y-auto divide-y divide-obsidian-border">
            {isLoadingList ? (
              <ReportLoadingSkeleton label="Cargando documentos…" />
            ) : listLoadError ? (
              <div role="alert" className="space-y-3 p-4 text-sm text-obsidian-errorText">
                <p>{listLoadError}</p>
                <button
                  type="button"
                  onClick={() => void loadDocuments()}
                  className="ui-action-secondary min-h-11 !px-3 text-xs"
                >
                  Reintentar
                </button>
              </div>
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
                  disabled={!collaboration.canEdit}
                  onChange={(e) => {
                    setTitleDraft(e.target.value);
                    updateCollaborativeMetadata('title', e.target.value);
                  }}
                  aria-label="Título del documento"
                  maxLength={200}
                  className="min-w-0 flex-1 min-h-11 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-sm font-medium text-white focus:border-obsidian-accent focus:outline-none"
                />
                <label htmlFor="doc-status-select" className="sr-only">
                  Estado del documento
                </label>
                <select
                  id="doc-status-select"
                  value={statusDraft}
                  disabled={!collaboration.canEdit}
                  onChange={(e) => {
                    const next = e.target.value as ReportDocumentStatus;
                    setStatusDraft(next);
                    updateCollaborativeMetadata('status', next);
                  }}
                  className="h-11 w-28 shrink-0 rounded-lg border border-obsidian-border bg-obsidian-surface px-2 text-xs text-white focus:border-obsidian-accent focus:outline-none"
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
              <div className="flex items-center rounded-lg border border-obsidian-border bg-obsidian-surface" role="group" aria-label="Modo de vista">
                {([
                  ['edit', 'Solo código', FileCode2],
                  ['split', 'Código y vista previa', Columns2],
                  ['preview', 'Solo vista previa', Eye],
                ] as const).map(([mode, label, Icon]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPaneMode(mode)}
                    aria-pressed={paneMode === mode}
                    aria-label={label}
                    title={label}
                    className={`ui-action-icon !h-11 !w-11 ${paneMode === mode ? 'bg-obsidian-panel text-white' : ''}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </button>
                ))}
              </div>

              <span role="status" className="grid size-8 shrink-0 place-items-center" title={syncLabel}>
                <span className="sr-only">{syncLabel}</span>
                {isSaving || collaboration.status === 'connecting' ? <RefreshCw className="size-4 motion-safe:animate-spin" aria-hidden="true" />
                  : collaboration.status !== 'connected' || collaboration.error || hasUnsavedChanges ? <AlertTriangle className="size-4 text-obsidian-amber" aria-hidden="true" />
                    : collaboration.canEdit ? <CheckCircle2 className="size-4 text-obsidian-emerald" aria-hidden="true" />
                      : <span aria-hidden="true" className="text-xs text-obsidian-muted">—</span>}
              </span>
              <button type="button" className="ui-action-secondary !min-h-11 shrink-0 gap-2 !px-2 sm:!px-3" onClick={() => setIsCollaborationOpen(!isCollaborationOpen)}
                aria-expanded={isCollaborationOpen} aria-label="Colaboración del reporte" title="Colaboración del reporte">
                <Users className="size-4" aria-hidden="true" />
                <span className="hidden xl:inline">Colaboración</span>
              </button>

              <div
                ref={actionsRef}
                className="relative"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) closeActions();
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape' || !actionsOpen) return;
                  event.stopPropagation();
                  closeActions(true);
                }}
              >
                <button
                  ref={actionsButtonRef}
                  type="button"
                  className="ui-action-icon !h-11 !w-11"
                  aria-label="Acciones del documento"
                  title="Acciones del documento"
                  aria-expanded={actionsOpen}
                  aria-controls={actionsOpen ? 'report-actions' : undefined}
                  onClick={() => actionsOpen ? closeActions() : setActionsOpen(true)}
                >
                  <Menu className="h-4 w-4" aria-hidden="true" />
                </button>
                {actionsOpen && (
                  <div id="report-actions" className="absolute right-0 top-full z-30 mt-2 max-h-[min(60dvh,24rem)] w-60 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-obsidian-borderLight bg-obsidian-panel p-1 shadow-lg">
                    <button type="button" className={DOCUMENT_ACTION_CLASS} disabled={!hasUnsavedChanges || isSaving || !collaboration.canEdit || collaboration.status !== 'connected'}
                      onClick={() => { closeActions(true); void handleSaveDocument(); }}>
                      <Save className="h-4 w-4" aria-hidden="true" /> Guardar
                    </button>
                    <button type="button" className={DOCUMENT_ACTION_CLASS}
                      onClick={() => { setIsCollaborationOpen(true); closeActions(true); }}>
                      <Users className="h-4 w-4" aria-hidden="true" /> Colaboración, historial y revisión
                    </button>
                    <button type="button" className={DOCUMENT_ACTION_CLASS} disabled={isExporting}
                      onClick={() => { closeActions(true); setExportName(''); setExportFieldError(null); setExportOpen(true); }}>
                      <Download className="h-4 w-4" aria-hidden="true" /> {isExporting ? 'Exportando…' : 'Exportar'}
                    </button>
                    <button type="button" className={`${DOCUMENT_ACTION_CLASS} text-obsidian-errorText`} disabled={isSaving}
                      onClick={() => { closeActions(true); void handleDeleteDocument(activeDoc); }}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" /> Eliminar
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </header>

        {activeDoc && exportError && (
          <p role="alert" className="break-words border-b border-obsidian-border px-4 py-2 text-xs text-obsidian-errorText">
            {exportError}
          </p>
        )}

        {activeDoc && exportOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4"
            onClick={(event) => { if (event.target === event.currentTarget) setExportOpen(false); }}>
            <div ref={exportDialogRef} role="dialog" aria-modal="true" aria-labelledby="report-export-title" tabIndex={-1}
              className="max-h-[90dvh] w-full max-w-[26rem] overflow-y-auto rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5">
              <h2 id="report-export-title" className="font-heading text-lg text-white">Exportar documento</h2>
              <p className="mt-1 break-words text-sm text-obsidian-muted">{activeDoc.title}</p>
              <form className="mt-4 space-y-3" onSubmit={(event) => {
                event.preventDefault();
                if (!Object.prototype.hasOwnProperty.call(REPORT_EXPORT_EXTENSIONS, exportFormat) || (exportFormat === 'typ' && redactForClient)) {
                  setExportFieldError('Elige un formato disponible para esta exportación.');
                  return;
                }
                const name = validateExportName(exportName, REPORT_EXPORT_EXTENSIONS[exportFormat]);
                if (name.error) {
                  setExportFieldError(name.error);
                  return;
                }
                setExportOpen(false);
                void handleExport(exportFormat);
              }}>
                <label className="grid items-center gap-1.5 text-sm text-obsidian-muted sm:grid-cols-[8rem_minmax(0,1fr)]">Formato
                  <select value={exportFormat} className="report-form-control w-full"
                    onChange={(event) => { setExportFormat(event.target.value as typeof exportFormat); setExportFieldError(null); }}>
                    <option value="pdf">PDF</option>
                    <option value="html">HTML (experimental)</option>
                    <option value="typ" disabled={redactForClient}>Código Typst (.typ)</option>
                    <option value="typst_zip">Proyecto Typst (.zip)</option>
                  </select>
                </label>
                {exportFormat === 'html' && <p className="text-xs text-obsidian-muted">Conserva la estructura del documento. La maquetación puede diferir del PDF.</p>}
                <label className="grid items-center gap-1.5 text-sm text-obsidian-muted sm:grid-cols-[8rem_minmax(0,1fr)]">Nombre del archivo
                  <input type="text" maxLength={130} value={exportName} className="report-form-control min-w-0 w-full"
                    aria-invalid={Boolean(exportFieldError)} aria-describedby={exportFieldError ? 'report-export-error' : undefined}
                    onChange={(event) => { setExportName(event.target.value); setExportFieldError(null); }} placeholder="Usar título del documento" />
                </label>
                {exportFieldError && <p id="report-export-error" role="alert" className="text-xs text-obsidian-errorText">{exportFieldError}</p>}
                <label className="flex min-h-11 items-center gap-2 text-sm text-obsidian-muted">
                  <input type="checkbox" checked={redactForClient} disabled={exportFormat === 'typ'}
                    onChange={(event) => setRedactForClient(event.target.checked)} />
                  Copia para cliente
                </label>
                {redactForClient && <p className="text-xs text-obsidian-muted">Censura texto marcado y credenciales comunes. Revisa las imágenes antes de compartir.</p>}
                <div className="flex justify-end gap-2 border-t border-obsidian-border pt-4">
                  <button type="button" className="ui-action-secondary" onClick={() => setExportOpen(false)}>Cancelar</button>
                  <button type="submit" className="ui-action-primary" disabled={isExporting ||
                    ((exportFormat === 'pdf' || exportFormat === 'html') && typstStatus?.available === false)}>
                    <Download className="size-4" aria-hidden="true" /> Exportar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activeDoc && (collaboration.error || collaboration.status === 'offline' || !collaboration.canEdit) && (
          <p className="border-b border-obsidian-border px-4 py-2 text-xs leading-relaxed text-obsidian-muted">{syncLabel}</p>
        )}

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
                  disabled={!collaboration.canEdit}
                  onChange={(e) => {
                    setProspectIdDraft(e.target.value);
                    updateCollaborativeMetadata('prospect_id', e.target.value || null);
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
                  disabled={!collaboration.canEdit}
                  onChange={(e) => {
                    setProjectIdDraft(e.target.value);
                    updateCollaborativeMetadata('project_id', e.target.value || null);
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

        {compileError && (
          <div className="shrink-0 border-b border-obsidian-border bg-obsidian-dangerBg px-3 py-2 text-xs">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3">
              <p role="alert" className="my-1 min-w-0 flex-1 truncate text-obsidian-errorText">
                {compileError.split('\n')[0]}
              </p>
              {errorLocation && (
                <button type="button" className="ui-action-secondary min-h-11 !px-2"
                  onClick={() => {
                    if (paneMode === 'preview') setPaneMode('split');
                    const [, line, column] = errorLocation;
                    requestAnimationFrame(() => editorRef.current?.goToLine(Number(line), Number(column)));
                  }}>
                  Ir a la línea {errorLocation[1]}
                </button>
              )}
            </div>
            <details key={compileError} className="text-obsidian-muted">
              <summary className="max-w-max cursor-pointer py-2">Detalles de compilación</summary>
              <pre tabIndex={0} className="max-h-[min(8rem,20dvh)] overflow-auto whitespace-pre-wrap break-all font-mono text-obsidian-errorText">{compileError}</pre>
            </details>
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
                onAction={() => { setIsSidebarOpen(true); setIsCreateFormOpen(true); }}
              />
            </div>
          ) : isLoadingDetail ? (
            <ReportLoadingSkeleton detail label="Cargando documento…" />
          ) : detailLoadError ? (
            <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-obsidian-errorText">{detailLoadError}</p>
              <button
                type="button"
                onClick={() => setDetailLoadAttempt((attempt) => attempt + 1)}
                className="ui-action-secondary min-h-11"
              >
                Reintentar
              </button>
            </div>
          ) : !activeDoc ? (
            <div className="flex flex-1 items-center justify-center text-sm text-obsidian-muted">
              Selecciona o crea un documento Typst.
            </div>
          ) : (
            <div className="flex flex-1 flex-col md:flex-row min-h-0 min-w-0 divide-y md:divide-y-0 md:divide-x divide-obsidian-border">
              <div
                aria-hidden={paneMode === 'preview'}
                className={`${paneMode === 'preview' ? 'hidden' : 'flex'} min-w-0 flex-1 flex-col bg-obsidian-bg`}
              >
                  <div className="flex min-w-0 items-center gap-2 border-b border-obsidian-border px-2 py-1.5 text-xs text-obsidian-muted">
                    <div className="min-w-0 flex-1 overflow-x-auto" role="toolbar" aria-label="Herramientas de edición Typst">
                      <div className="flex w-max items-center gap-2 py-0.5">
                        <span className="shrink-0 px-2 text-xs text-obsidian-muted">Documentos · Typst</span>
                        <span aria-hidden="true" className="h-7 w-px shrink-0 bg-obsidian-border" />
                        <div className="flex items-center gap-1" role="group" aria-label="Formato de texto">
                          <ToolbarButton label="Negrita" icon={Bold} onClick={() => editorRef.current?.wrapSelection('*', '*')} />
                          <ToolbarButton label="Cursiva" icon={Italic} onClick={() => editorRef.current?.wrapSelection('_', '_')} />
                          <ToolbarButton label="Tachado" icon={Strikethrough} onClick={() => editorRef.current?.wrapSelection('#strike[', ']')} />
                          <ToolbarButton label="Subrayado" icon={Underline} onClick={() => editorRef.current?.wrapSelection('#underline[', ']')} />
                          <ToolbarButton label="Superíndice" icon={Superscript} onClick={() => editorRef.current?.wrapSelection('#super[', ']')} />
                          <ToolbarButton label="Subíndice" icon={Subscript} onClick={() => editorRef.current?.wrapSelection('#sub[', ']')} />
                          <ToolbarButton label="Código en línea" icon={Code} onClick={() => editorRef.current?.wrapSelection('`', '`')} />
                        </div>
                        <span aria-hidden="true" className="h-7 w-px shrink-0 bg-obsidian-border" />
                        <div className="flex items-center gap-1" role="group" aria-label="Bloques y estructura">
                          <select aria-label="Nivel de título" value=""
                            className="h-11 rounded-lg border border-obsidian-border bg-obsidian-surface px-2 text-xs"
                            onChange={(event) => editorRef.current?.setHeading(Number(event.target.value))}>
                            <option value="">Título…</option>
                            {Array.from({ length: 6 }, (_, index) => (
                              <option key={index} value={index + 1}>Nivel {index + 1}</option>
                            ))}
                          </select>
                          <ToolbarButton label="Lista con viñetas" icon={List} onClick={() => insertSnippet('\n- Primer elemento\n- Segundo elemento\n')} />
                          <ToolbarButton label="Lista numerada" icon={ListOrdered} onClick={() => insertSnippet('\n+ Primer paso\n+ Segundo paso\n')} />
                          <ToolbarButton label="Lista de tareas" icon={ListChecks} onClick={() => insertSnippet('\n- [ ] Tarea pendiente\n- [x] Tarea completada\n')} />
                          <ToolbarButton label="Cita" icon={Quote} onClick={() => editorRef.current?.wrapSelection('#quote[', ']')} />
                          <ToolbarButton label="Bloque de código" icon={Code} onClick={() => insertSnippet('\n```text\nCódigo o salida\n```\n')} />
                          <ToolbarButton label="Tabla" icon={Table} onClick={() => insertSnippet('\n#set table.cell(breakable: false)\n#table(\n  columns: (1fr, 1fr),\n  table.header([Campo], [Detalle]),\n  [Dato], [Descripción],\n)\n')} />
                          <ToolbarButton label="Salto de página" icon={SeparatorHorizontal} onClick={() => insertSnippet('\n#pagebreak()\n')} />
                        </div>
                        <span aria-hidden="true" className="h-7 w-px shrink-0 bg-obsidian-border" />
                        <div className="flex items-center gap-1" role="group" aria-label="Enlaces, imágenes y lienzos">
                          <ToolbarButton label="Insertar enlace" icon={Link} onClick={() => editorRef.current?.wrapSelection('#link("https://example.com")[', ']')} />
                          <ToolbarButton label={isUploadingImage ? 'Subiendo imagen' : 'Insertar imagen o captura'} icon={ImagePlus} disabled={isUploadingImage} onClick={() => fileInputRef.current?.click()} />
                          {canvasesWithSnapshots.length > 0 && (
                            <select
                              aria-label="Insertar lienzo"
                              value=""
                              onChange={(event) => {
                                const canvasId = event.target.value;
                                if (!canvasId) return;
                                const canvas = canvasesWithSnapshots.find((item) => item.id === canvasId);
                                const caption = JSON.stringify(canvas?.title || 'Diagrama');
                                insertSnippet(`\n#figure(\n  image("canvas://${canvasId}", width: 95%),\n  caption: ${caption},\n)\n`);
                              }}
                              className="h-11 max-w-[190px] rounded-lg border border-obsidian-border bg-obsidian-surface px-2 text-xs text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent"
                            >
                              <option value="">Insertar lienzo…</option>
                              {canvasesWithSnapshots.map((canvas) => (
                                <option key={canvas.id} value={canvas.id}>
                                  {canvas.linked_document_id === activeDoc.id ? `${canvas.title} (vinculado)` : canvas.title}
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleOpenCanvases()}
                            className="ui-action-secondary min-h-11 shrink-0 !px-3 text-xs"
                          >
                            {canvasesWithSnapshots.length > 0 || canvases.length > 0 ? 'Abrir lienzos' : 'Crear lienzo'}
                          </button>
                        </div>
                        <span aria-hidden="true" className="h-7 w-px shrink-0 bg-obsidian-border" />
                        <div className="flex items-center gap-1" role="group" aria-label="Historial y revisión">
                          <ToolbarButton label="Deshacer" icon={Undo2} onClick={() => editorRef.current?.undo()} />
                          <ToolbarButton label="Rehacer" icon={Redo2} onClick={() => editorRef.current?.redo()} />
                          <ToolbarButton label="Buscar en el documento" icon={Search} onClick={() => editorRef.current?.openSearch()} />
                          <ToolbarButton label="Comprobar sintaxis Typst" icon={SpellCheck} disabled={isCompiling} onClick={() => void runCompile(sourceDraft, activeDoc.id)} />
                        </div>
                        <span aria-hidden="true" className="h-7 w-px shrink-0 bg-obsidian-border" />
                        <div className="flex items-center gap-1" role="group" aria-label="Notas y censura">
                          <ToolbarButton label="Insertar nota Typst" icon={MessageSquarePlus} onClick={() => insertSnippet('\n// Nota: ')} />
                          <ToolbarButton label="Comentar selección compartida" icon={Users} onClick={() => {
                            setCollaborationAnchor(editorRef.current?.getSelectionAnchor() ?? null);
                            setIsCollaborationOpen(true);
                          }} />
                          <ToolbarButton label="Marcar selección para censura" icon={EyeOff} onClick={() => editorRef.current?.wrapSelection('{{redact:', '}}', 'dato_sensible')} />
                        </div>
                        <span aria-hidden="true" className="h-7 w-px shrink-0 bg-obsidian-border" />
                        <div className="flex items-center gap-2" role="group" aria-label="Snippets rápidos">
                          <Sparkles className="ml-1 h-4 w-4 shrink-0 text-obsidian-muted" aria-hidden="true" />
                          <select
                            aria-label="Insertar snippet rápido"
                            value={quickSnippetId}
                            onChange={(event) => {
                              const snippet = TYPST_QUICK_SNIPPETS.find((item) => item.id === event.target.value);
                              if (snippet) insertSnippet(snippet.snippet);
                              setQuickSnippetId('');
                            }}
                            className="h-11 max-w-[190px] rounded-lg border border-obsidian-border bg-obsidian-surface px-2 text-xs text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent"
                          >
                            <option value="">Snippets rápidos…</option>
                            {TYPST_QUICK_SNIPPETS.map((snippet) => <option key={snippet.id} value={snippet.id}>{snippet.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void runCompile(sourceDraft, activeDoc.id)}
                      disabled={isCompiling}
                      className="ui-action-secondary min-h-11 shrink-0 !px-3 text-xs"
                    >
                      <RefreshCw className={`h-4 w-4 ${isCompiling ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
                      <span>{isCompiling ? 'Compilando…' : 'Compilar'}</span>
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                    multiple
                    tabIndex={-1}
                    aria-label="Seleccionar capturas para insertar"
                    className="sr-only"
                    onChange={(event) => {
                      const files = Array.from(event.currentTarget.files ?? []);
                      event.currentTarget.value = '';
                      void handleImageFiles(files);
                    }}
                  />
                  {(imageUploadError || isUploadingImage) && (
                    <div className="border-b border-obsidian-border px-4 py-2 text-xs" role={imageUploadError ? 'alert' : 'status'} aria-live="polite">
                      {imageUploadError || 'Cifrando y preparando imagen…'}
                    </div>
                  )}
                  <TypstCodeEditor
                    ref={editorRef}
                    value={sourceDraft}
                    sharedText={collaboration.session?.text}
                    awareness={collaboration.session?.awareness}
                    readOnly={!collaboration.canEdit}
                    label="Código fuente Typst"
                    onChange={(value) => {
                      setSourceDraft(value);
                    }}
                    onPasteImages={handleImageFiles}
                  />
              </div>

              {paneMode !== 'edit' && (
                <div className="flex min-w-0 flex-1 flex-col bg-obsidian-bg">
                  <div ref={setPreviewToolbar} className="flex shrink-0 flex-wrap items-center gap-2 border-b border-obsidian-border px-3 py-1.5 text-xs text-obsidian-muted">
                    <span>
                      Vista previa
                    </span>
                    <select aria-label="Formato de vista previa" className="report-form-control report-preview-select" value={previewFormat}
                      onChange={(event) => setPreviewFormat(event.target.value as typeof previewFormat)}>
                      <option value="svg">SVG</option>
                      <option value="pdf">PDF</option>
                      <option value="html" title="Formato experimental de Typst">HTML</option>
                    </select>
                  </div>

                  <div ref={setPdfControls} className="shrink-0 empty:hidden" />
                  <div ref={previewScrollArea} role="region" aria-label="Contenido de la vista previa" tabIndex={0}
                    className="min-h-0 flex-1 space-y-6 overflow-auto overscroll-contain p-4 focus-visible:-outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent sm:p-6">
                    {previewFormat !== 'svg' ? (
                      !formatPreview || formatPreview.error ? (
                        <p role={formatPreview?.error ? 'alert' : 'status'} className="text-sm text-obsidian-muted">
                          {typeof formatPreview?.value === 'string' ? formatPreview.value : 'Preparando vista previa…'}
                        </p>
                      ) : formatPreview.value instanceof Blob ? (
                        <Suspense fallback={<p role="status" className="text-sm text-obsidian-muted">Cargando visor PDF…</p>}>
                          {previewToolbar && pdfControls && (
                            <ReportPdfPreview blob={formatPreview.value} toolbar={previewToolbar} controls={pdfControls} scrollArea={previewScrollArea} />
                          )}
                        </Suspense>
                      ) : (
                        <iframe title="Vista previa HTML" sandbox="" referrerPolicy="no-referrer"
                          srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'none'">${formatPreview.value}`}
                          className="h-full min-h-96 w-full border-0 bg-white" />
                      )
                    ) : previewPages.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-obsidian-muted">
                        {isCompiling ? 'Compilando vista previa…' : 'Sin páginas renderizadas.'}
                      </div>
                    ) : (
                      previewImages.map((src, idx) => (
                        <img
                          key={idx}
                          src={src}
                          alt={`Página ${idx + 1} del documento`}
                          loading={idx === 0 ? 'eager' : 'lazy'}
                          decoding="async"
                          className="mx-auto block h-auto w-full max-w-[820px] rounded-lg border border-obsidian-border bg-white"
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {isCollaborationOpen && activeDoc && (
          <ReportCollaborationPanel
            resourceType="document"
            resourceId={activeDoc.id}
            controller={collaboration}
            operator={operator}
            anchor={collaborationAnchor}
            onClearAnchor={() => setCollaborationAnchor(null)}
            onNavigateToAnchor={(anchor) => {
              const located = editorRef.current?.goToCommentAnchor(anchor) ?? false;
              if (located) setIsCollaborationOpen(false);
              return located;
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
