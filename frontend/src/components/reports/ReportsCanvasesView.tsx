import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import './excalidraw-obsidian.css';

if (typeof window !== 'undefined') {
  (window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/';
}
import {
  CheckCircle2,
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
import { ReportCanvasDetail, ReportCanvasSummary } from '../../types';
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

export const ReportsCanvasesView: React.FC = () => {
  const { showToast, confirm, prompt } = useVault();

  const [canvases, setCanvases] = useState<ReportCanvasSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCanvas, setActiveCanvas] = useState<ReportCanvasDetail | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const latestSceneRef = useRef<{ json: string; elementCount: number } | null>(null);

  const loadCanvases = useCallback(async (preferId?: string | null) => {
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
  }, []);

  useEffect(() => {
    void loadCanvases();
  }, [loadCanvases]);

  useEffect(() => {
    if (!selectedId) {
      setActiveCanvas(null);
      setTitleDraft('');
      latestSceneRef.current = null;
      setHasUnsavedChanges(false);
      return;
    }

    let cancelled = false;
    setIsLoadingDetail(true);
    setErrorMessage(null);
    api
      .getReportCanvas(selectedId)
      .then((detail) => {
        if (cancelled) return;
        setActiveCanvas(detail);
        setTitleDraft(detail.title);
        latestSceneRef.current = {
          json: detail.scene_json || '{}',
          elementCount: detail.element_count,
        };
        setHasUnsavedChanges(false);
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
  }, [selectedId]);

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

  const handleSaveCanvas = useCallback(async () => {
    if (!activeCanvas) return;
    const cleanTitle = titleDraft.trim() || activeCanvas.title;
    const scenePayload = latestSceneRef.current;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const updated = await api.updateReportCanvas(activeCanvas.id, {
        title: cleanTitle,
        scene_json: scenePayload?.json ?? activeCanvas.scene_json,
        element_count: scenePayload?.elementCount ?? activeCanvas.element_count,
      });
      setActiveCanvas(updated);
      setTitleDraft(updated.title);
      setCanvases((prev) =>
        prev.map((item) =>
          item.id === updated.id
            ? {
                ...item,
                title: updated.title,
                element_count: updated.element_count,
                updated_at: updated.updated_at,
              }
            : item
        )
      );
      setHasUnsavedChanges(false);
      showToast('Lienzo guardado.', 'success');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'No se pudo guardar el lienzo.';
      setErrorMessage(msg);
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  }, [activeCanvas, showToast, titleDraft]);

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
        theme: 'dark',
      };
      const serialized = JSON.stringify({
        elements,
        appState: serializableAppState,
        files,
      });
      if (latestSceneRef.current?.json !== serialized) {
        latestSceneRef.current = { json: serialized, elementCount: nonDeletedCount };
        setHasUnsavedChanges(true);
      }
    },
    [activeCanvas]
  );

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-5.5rem)] min-h-[540px] min-w-0 gap-4">
      {isSidebarOpen && (
        <aside className="flex w-full lg:w-72 max-h-60 lg:max-h-none shrink-0 flex-col rounded-xl border border-obsidian-border bg-obsidian-panel min-h-0">
          <div className="flex items-center justify-between gap-2 border-b border-obsidian-border px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <PenTool className="h-[18px] w-[18px] shrink-0 text-obsidian-muted" />
              <h2 className="truncate text-sm font-semibold text-white">Lienzos</h2>
            </div>
            {/* [Acción principal] Crea un nuevo lienzo de Excalidraw. */}
            <button
              type="button"
              onClick={handleCreateCanvas}
              className="ui-action-primary !h-9 !min-h-[36px] !px-3 text-xs"
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
                className="w-full rounded-lg border border-obsidian-border bg-obsidian-surface py-2 pl-9 pr-3 text-sm text-white placeholder:text-obsidian-muted focus:border-obsidian-accent focus:outline-none"
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
                      onClick={() => setSelectedId(item.id)}
                      className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent"
                    >
                      <div className="truncate text-sm font-medium text-white">{item.title}</div>
                      <div className="mt-0.5 text-xs text-obsidian-muted">
                        {item.element_count} elementos · {formatApiDateTime(item.updated_at)}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCanvas(item)}
                      aria-label={`Eliminar ${item.title}`}
                      className="ui-action-icon !h-9 !w-9 !min-h-[36px] !min-w-[36px] text-obsidian-muted hover:text-obsidian-errorText"
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
              aria-label={isSidebarOpen ? 'Ocultar lista de lienzos' : 'Mostrar lista de lienzos'}
              className="ui-action-icon"
            >
              {isSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>

            {activeCanvas ? (
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => {
                  setTitleDraft(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                aria-label="Título del lienzo"
                className="min-w-0 flex-1 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-sm font-medium text-white focus:border-obsidian-accent focus:outline-none"
              />
            ) : (
              <span className="text-sm text-obsidian-muted">Selecciona o crea un lienzo</span>
            )}
          </div>

          {activeCanvas && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-obsidian-muted" aria-live="polite">
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
              {/* [Acción principal] Guarda el estado del lienzo cifrado en el servidor. */}
              <button
                type="button"
                onClick={() => void handleSaveCanvas()}
                disabled={isSaving}
                className="ui-action-primary"
              >
                <Save className="h-4 w-4" />
                <span>Guardar</span>
              </button>
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
          ) : isLoadingDetail || !activeCanvas ? (
            <div className="flex h-full items-center justify-center text-sm text-obsidian-muted">
              Cargando lienzo…
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
