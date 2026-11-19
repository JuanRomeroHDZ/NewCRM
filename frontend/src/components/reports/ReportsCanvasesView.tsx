import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Excalidraw, exportToCanvas } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import './excalidraw-obsidian.css';

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
} from 'lucide-react';
import { api } from '../../lib/api';
import { ApiError } from '../../lib/apiErrors';
import { formatApiDateTime } from '../../lib/dates';
import { useVault } from '../../context/VaultContext';
import { ReportCanvasDetail, ReportCanvasSummary, ReportDocumentSummary } from '../../types';
import { EmptyState } from '../common/EmptyState';

interface ParsedExcalidrawScene {
  elements?: readonly Record<string, unknown>[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
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
      .map(({ id, version, versionNonce }) => [id, version, versionNonce]),
    scene.appState?.viewBackgroundColor,
    scene.appState?.gridModeEnabled ? scene.appState.gridSize : null,
  ]);
}

export const ReportsCanvasesView: React.FC = () => {
  const { isUnlocked, openUnlockModal, showToast, confirm, prompt } = useVault();

  const [canvases, setCanvases] = useState<ReportCanvasSummary[]>([]);
  const [documents, setDocuments] = useState<ReportDocumentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCanvas, setActiveCanvas] = useState<ReportCanvasDetail | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [linkedDocumentId, setLinkedDocumentId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailLoadAttempt, setDetailLoadAttempt] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [sceneDirty, setSceneDirty] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionTriggerRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);
  const hasUnsavedChanges = !!activeCanvas && (
    sceneDirty || (titleDraft.trim() || activeCanvas.title) !== activeCanvas.title ||
    linkedDocumentId !== (activeCanvas.linked_document_id || '')
  );

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
      if (hasUnsavedChanges) {
        const discard = await confirm({
          title: 'Cambios sin guardar',
          message: 'Tienes cambios pendientes en el lienzo actual. ¿Descartarlos y continuar?',
          confirmLabel: 'Descartar',
          tone: 'warning',
        });
        if (!discard) return;
      }
      setSelectedId(nextId);
    },
    [confirm, hasUnsavedChanges, selectedId]
  );

  useEffect(() => {
    if (!isUnlocked || !selectedId) {
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
    if (!activeCanvas || savingRef.current || (!hasUnsavedChanges && !refreshSnapshot)) return;
    savingRef.current = true;
    const cleanTitle = titleDraft.trim() || activeCanvas.title;
    const scenePayload = latestSceneRef.current;
    const sceneJson = scenePayload?.json ?? activeCanvas.scene_json;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const svgSnapshot = await createReportSnapshot(sceneJson);
      const updated = await api.updateReportCanvas(activeCanvas.id, {
        title: cleanTitle,
        scene_json: sceneJson,
        svg_snapshot: svgSnapshot,
        element_count: scenePayload?.elementCount ?? activeCanvas.element_count,
        linked_document_id: linkedDocumentId || null,
      });
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
      const msg = err instanceof ApiError ? err.message : 'No se pudo guardar el lienzo.';
      setErrorMessage(msg);
      showToast(msg, 'error');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [activeCanvas, hasUnsavedChanges, linkedDocumentId, showToast, titleDraft]);

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
    if (!activeCanvas) return undefined;
    return parseCanvasScene(activeCanvas.scene_json);
  }, [activeCanvas]);

  const handleExcalidrawChange = useCallback(
    (elements: readonly Record<string, unknown>[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
      if (!activeCanvas) return;
      const nonDeletedCount = elements.filter((el) => !el.isDeleted).length;
      const serializableAppState = {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
        gridModeEnabled: appState.gridModeEnabled,
        theme: 'dark',
      };
      const serialized = JSON.stringify({
        elements,
        appState: serializableAppState,
        files,
      });
      if (latestSceneRef.current?.json !== serialized) {
        latestSceneRef.current = { json: serialized, elementCount: nonDeletedCount };
        setSceneDirty(sceneSignature(serialized) !== savedSceneSignature);
      }
    },
    [activeCanvas, savedSceneSignature]
  );

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
              <p className="p-4 text-sm text-obsidian-muted">Cargando lienzos…</p>
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

      <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-obsidian-border bg-obsidian-panel min-h-0">
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
                  disabled={isSaving}
                  onChange={(e) => {
                    setTitleDraft(e.target.value);
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
                  disabled={isSaving}
                  onChange={(e) => {
                    setLinkedDocumentId(e.target.value);
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
              <span role="status" className="flex items-center justify-center px-1"
                title={isSaving ? 'Guardando…' : hasUnsavedChanges ? 'Cambios pendientes' : 'Guardado'}>
                <span className="sr-only">{isSaving ? 'Guardando…' : hasUnsavedChanges ? 'Cambios pendientes' : 'Guardado'}</span>
                {isSaving ? <RefreshCw className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                  : hasUnsavedChanges ? <AlertTriangle className="h-4 w-4 text-obsidian-amber" aria-hidden="true" />
                    : <CheckCircle2 className="h-4 w-4 text-obsidian-emerald" aria-hidden="true" />}
              </span>
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
                      [Save, 'Guardar', !hasUnsavedChanges || isSaving, () => void handleSaveCanvas()],
                      [RefreshCw, 'Actualizar imagen del informe', hasUnsavedChanges || isSaving || activeCanvas.element_count === 0, () => void handleSaveCanvas(true)],
                      [Trash2, 'Eliminar', isSaving, () => void handleDeleteCanvas(activeCanvas)],
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
            <div className="flex h-full items-center justify-center text-sm text-obsidian-muted">
              Cargando lienzo…
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
                onChange={handleExcalidrawChange as never}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
