import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, Eye, X } from 'lucide-react';
import { WriteupDetail, WriteupExportFormat, WriteupExportLayout, WriteupExportOptions } from '../../types';
import { api } from '../../lib/api';
import { compileMermaidDiagramsForExport } from './mermaidExportHelper';
import { reviewPublication } from './writeupWorkbenchUtils';

interface WriteupExportModalProps {
  writeup: WriteupDetail;
  onClose: () => void;
  onExport: (opts: WriteupExportOptions, destination?: FileSystemFileHandle) => Promise<void>;
}

type SaveFilePicker = (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;

const DEFAULT_LAYOUT: WriteupExportLayout = {
  font_family: 'serif',
  heading_scale: 100,
  heading_indent_mm: 2,
  margin_mm: 20,
  line_spacing: 1.45,
  figure_width_percent: 90,
  accent_color: '#075C4C',
  include_cover: true,
};

const EXPORT_OPTIONS: Array<{
  format: WriteupExportFormat;
  label: string;
  ext: string;
  desc: string;
}> = [
  { format: 'pdf', label: 'PDF', ext: '.pdf', desc: 'Informe paginado con las figuras del documento.' },
  { format: 'docx', label: 'Word', ext: '.docx', desc: 'Documento corporativo con tablas, diagramas e imágenes.' },
  { format: 'html', label: 'HTML', ext: '.html', desc: 'Abre en el navegador e incluye sus diagramas.' },
  { format: 'md_zip', label: 'Paquete portable', ext: '.zip', desc: 'Incluye Markdown editable, una versión HTML para leer sin conexión y los archivos del informe.' },
  { format: 'md', label: 'Texto Markdown', ext: '.md', desc: 'Informe de texto con sus datos iniciales.' },
  { format: 'sarif', label: 'SARIF 2.1.0', ext: '.sarif.json', desc: 'Estándar de hallazgos compatible con GitHub/CI/SIEM.' },
  { format: 'json', label: 'JSON Estructurado', ext: '.json', desc: 'Datos completos, citas, activos y hallazgos.' },
  { format: 'csv', label: 'CSV compatible con Excel', ext: '.csv', desc: 'Incluye hallazgos y citas; protege el contenido que pueda interpretarse como fórmula.' },
];

export const WriteupExportModal: React.FC<WriteupExportModalProps> = ({ writeup, onClose, onExport }) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFormatRef = useRef<HTMLSelectElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [selectedFormat, setSelectedFormat] = useState<WriteupExportFormat>('pdf');
  const [redactForClient, setRedactForClient] = useState(true);
  const [includeWatermark, setIncludeWatermark] = useState(true);
  const [includeToc, setIncludeToc] = useState(true);
  const [tocDepth, setTocDepth] = useState(6);
  const [includeFigures, setIncludeFigures] = useState(false);
  const [includeTables, setIncludeTables] = useState(false);
  const [fontSizePt, setFontSizePt] = useState(11);
  const [watermarkText, setWatermarkText] = useState('');
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [accentInput, setAccentInput] = useState(DEFAULT_LAYOUT.accent_color);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [exportStage, setExportStage] = useState('');
  const exporting = Boolean(exportStage);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const exportingRef = useRef(false);
  exportingRef.current = exporting;
  const requestClose = () => { if (!exportingRef.current) onCloseRef.current(); };

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => firstFormatRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!exportingRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex]:not([tabindex="-1"])')
      ).filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, []);

  const supportsDocumentIndexes = ['pdf', 'docx', 'html', 'md', 'md_zip'].includes(selectedFormat);
  const hasCover = ['pdf', 'docx', 'html'].includes(selectedFormat);
  const isPackaged = selectedFormat === 'md_zip';
  const includesLinkedMedia = hasCover || isPackaged;
  const supportsTypography = includesLinkedMedia;
  const previewOpen = showPreview && supportsTypography;
  const updateLayout = <K extends keyof WriteupExportLayout,>(key: K, value: WriteupExportLayout[K]) =>
    setLayout(current => ({ ...current, [key]: value }));
  const publicationReview = useMemo(() => reviewPublication(writeup), [writeup]);
  const format = EXPORT_OPTIONS.find(option => option.format === selectedFormat)!;
  const checks = [
    { label: 'Imágenes locales ausentes', count: publicationReview.missingImages },
    { label: 'Enlaces vacíos', count: publicationReview.emptyLinks },
    { label: 'Secciones sin contenido', count: publicationReview.emptySections },
    { label: 'Posibles secretos sin marcar', count: publicationReview.possibleSecrets },
    { label: 'Preguntas y pasos pendientes', count: publicationReview.pendingQuestions + publicationReview.pendingSteps },
  ].filter(check => check.count > 0);
  const indexes = [includeToc && 'contenido', includeFigures && 'figuras', includeTables && 'tablas'].filter(Boolean);


  const diagramCache = useMemo(() => new Map<boolean, Promise<Record<string, string>>>(), [writeup.markdown_content]);
  const getDiagrams = useCallback(() => {
    if (!includesLinkedMedia) return Promise.resolve({});
    let pending = diagramCache.get(redactForClient);
    if (!pending) {
      pending = compileMermaidDiagramsForExport(writeup.markdown_content, redactForClient).catch(error => {
        diagramCache.delete(redactForClient);
        throw error;
      });
      diagramCache.set(redactForClient, pending);
    }
    return pending;
  }, [diagramCache, includesLinkedMedia, redactForClient, writeup.markdown_content]);

  useEffect(() => {
    if (!includesLinkedMedia) return;
    const timer = window.setTimeout(() => { void getDiagrams().catch(() => undefined); }, 250);
    return () => window.clearTimeout(timer);
  }, [getDiagrams, includesLinkedMedia]);

  const exportOptions = useMemo<WriteupExportOptions>(() => ({
    format: selectedFormat,
    redact_for_client: redactForClient,
    include_watermark: supportsTypography && includeWatermark,
    include_toc: supportsDocumentIndexes && includeToc,
    toc_depth: tocDepth,
    include_figure_index: supportsDocumentIndexes && includeFigures,
    include_table_index: supportsDocumentIndexes && includeTables,
    font_size_pt: fontSizePt,
    watermark_text: watermarkText.trim() || undefined,
    layout: supportsTypography ? layout : undefined,
  }), [selectedFormat, redactForClient, supportsTypography, includeWatermark, supportsDocumentIndexes, includeToc, tocDepth, includeFigures, includeTables, fontSizePt, watermarkText, layout]);

  useEffect(() => {
    if (!previewOpen || exporting) return;
    const controller = new AbortController();
    setPreviewBusy(true);
    setPreviewError('');
    const timer = window.setTimeout(async () => {
      try {
        const diagrams = await getDiagrams();
        if (controller.signal.aborted) return;
        const html = await api.previewWriteupExport(writeup.id, {
          ...exportOptions,
          draft_title: writeup.title.trim() || 'Informe sin título',
          draft_markdown: writeup.markdown_content,
          rendered_diagrams: diagrams,
        }, controller.signal);
        if (!controller.signal.aborted) setPreviewHtml(html);
      } catch (error) {
        if (!controller.signal.aborted) setPreviewError(error instanceof Error ? error.message : 'No se pudo generar la vista previa.');
      } finally {
        if (!controller.signal.aborted) setPreviewBusy(false);
      }
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [previewOpen, exportOptions, exporting, getDiagrams, writeup.id, writeup.title, writeup.markdown_content]);

  const saveFilePicker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;

  const handleRunExport = async () => {
    if (exportingRef.current) return;
    setExportStage(saveFilePicker ? 'Elige dónde guardarlo…' : 'Preparando…');
    setErrorMsg(null);
    try {
      let destination: FileSystemFileHandle | undefined;
      if (saveFilePicker) {
        try {
          // The native picker needs the activation from this click.
          destination = await saveFilePicker.call(window, { suggestedName: `${writeup.slug || 'informe'}${format.ext}` });
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          if (!(error instanceof DOMException) || !['SecurityError', 'NotAllowedError', 'NotSupportedError'].includes(error.name)) throw error;
        }
      }
      setExportStage('Preparando diagramas…');
      const diagrams = await getDiagrams();
      setExportStage(`Generando ${format.ext.slice(1).toUpperCase()}…`);
      await onExport({ ...exportOptions, rendered_diagrams: diagrams }, destination);
      onCloseRef.current();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo generar el archivo.');
    } finally {
      setExportStage('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-black/75 p-2 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        aria-busy={exporting}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(e) => e.stopPropagation()}
        className={`my-auto flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-xl border border-obsidian-borderLight bg-obsidian-panel shadow-2xl ${previewOpen ? 'max-w-7xl' : 'max-w-2xl'}`}
      >
        <div className="flex items-start justify-between gap-2 px-3 py-3 sm:px-5 sm:py-4 border-b border-obsidian-border">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-white break-words">Exportar informe — {writeup.title}</h2>
            <p id={descriptionId} className="mt-1 text-xs text-obsidian-muted">El archivo se genera en esta computadora y no se envía a servicios externos.</p>
          </div>
          {/* [Icono] Cierra el diálogo sin exportar. */}
          <button type="button" onClick={requestClose} disabled={exporting} aria-label="Cerrar ventana de exportación" className="ui-action-icon shrink-0">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto ${previewOpen ? 'xl:grid xl:grid-cols-[minmax(24rem,2fr)_minmax(0,3fr)] xl:overflow-hidden' : ''}`}>
          <div className={`min-h-0 min-w-0 space-y-4 p-4 sm:px-5 ${previewOpen ? 'xl:overflow-y-auto' : ''}`}>
          <fieldset disabled={exporting} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid min-w-0 gap-1 text-xs text-obsidian-text">
                Formato
                <select ref={firstFormatRef} value={selectedFormat} onChange={(event) => {
                  setSelectedFormat(event.target.value as WriteupExportFormat);
                  setPreviewHtml('');
                  setErrorMsg(null);
                }} className="w-full min-w-0 ps-3">
                  {[{ label: 'Documentos', options: EXPORT_OPTIONS.slice(0, 5) }, { label: 'Intercambio de datos', options: EXPORT_OPTIONS.slice(5) }].map(group =>
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map(option => <option key={option.format} value={option.format}>{option.label} ({option.ext})</option>)}
                    </optgroup>
                  )}
                </select>
              </label>
              <label className="grid min-w-0 gap-1 text-xs text-obsidian-text">
                Destino
                <select value={redactForClient ? 'client' : 'internal'} onChange={event => {
                  setRedactForClient(event.target.value === 'client');
                  setPreviewHtml('');
                  setErrorMsg(null);
                }} className="w-full min-w-0 ps-3">
                  <option value="client">Copia para cliente</option>
                  <option value="internal">Uso interno</option>
                </select>
              </label>
            </div>
            <p className="text-xs text-obsidian-muted">{format.desc}</p>
            {redactForClient && <p className="text-xs text-obsidian-muted">La copia oculta el contenido marcado para censurar. Revisa los adjuntos antes de compartir.</p>}

            <section aria-label="Contenido de la entrega" className="border-t border-obsidian-border pt-3">
              <h3 className="text-xs font-semibold text-obsidian-text">Contenido de la entrega</h3>
              <p className="mt-1 text-xs text-obsidian-muted">
                {[
                  supportsTypography && layout.include_cover && 'Portada',
                  supportsDocumentIndexes && indexes.length > 0 && `Índices de ${indexes.join(', ')}`,
                  isPackaged ? 'Adjuntos y pizarras' : includesLinkedMedia ? 'Figuras referenciadas' : 'Sin archivos adjuntos',
                ].filter(Boolean).join(' · ')}
              </p>
            </section>

            {supportsTypography && (
              <details open={previewOpen || undefined} className="group border-t border-obsidian-border pt-1">
                <summary className="ui-nav-action cursor-pointer">Diseño de la entrega<ChevronDown className="ml-auto h-4 w-4 group-open:rotate-180" aria-hidden="true" /></summary>
                <div className="grid grid-cols-2 gap-3 px-3 pb-2">
                  <label className="grid min-w-0 gap-1 text-xs">
                    Tipografía
                    <select value={layout.font_family} onChange={event => updateLayout('font_family', event.target.value as WriteupExportLayout['font_family'])} className="w-full min-w-0 ps-2">
                      <option value="serif">Con serifas</option>
                      <option value="sans">Sin serifas</option>
                    </select>
                  </label>
                  <label className="grid min-w-0 gap-1 text-xs">
                    Tamaño del texto
                    <select value={fontSizePt} onChange={event => setFontSizePt(Number(event.target.value))} className="w-full min-w-0 ps-2">
                      {[8, 9, 10, 11, 12, 13, 14, 16, 18].map(size => <option key={size} value={size}>{size} pt</option>)}
                    </select>
                  </label>
                  {([
                    ['heading_scale', 'Tamaño de títulos', [75, 85, 100, 110, 125], '%'],
                    ['heading_indent_mm', 'Sangría de subtítulos', [0, 2, 4, 6], ' mm'],
                    ['margin_mm', 'Márgenes', [12, 16, 20, 24, 28, 30], ' mm'],
                    ['figure_width_percent', 'Ancho máximo de figuras', [40, 55, 70, 80, 90, 100], '%'],
                    ['line_spacing', 'Interlineado', [1.15, 1.3, 1.45, 1.7], ''],
                  ] as const).map(([key, label, values, unit]) => (
                    <label key={key} className="grid min-w-0 gap-1 text-xs">{label}
                      <select value={layout[key]} onChange={event => updateLayout(key, Number(event.target.value))} className="w-full min-w-0 ps-2">
                        {values.map(value => <option key={value} value={value}>{value}{unit}</option>)}
                      </select>
                    </label>
                  ))}
                  <div className="grid min-w-0 gap-1 text-xs">
                    <label htmlFor={`${titleId}-accent`}>Color de acento</label>
                    <div className="flex min-h-11 items-center gap-2">
                      <input id={`${titleId}-accent`} type="color" value={layout.accent_color} onInput={event => {
                        const value = event.currentTarget.value.toUpperCase();
                        setAccentInput(value);
                        updateLayout('accent_color', value);
                      }} className="h-11 w-11 shrink-0" />
                      <input type="text" value={accentInput} maxLength={7} spellCheck={false} aria-label="Código de color de acento"
                        onChange={event => {
                          const value = event.target.value.toUpperCase();
                          setAccentInput(value);
                          if (/^#[0-9A-F]{6}$/.test(value)) updateLayout('accent_color', value);
                        }}
                        onBlur={() => setAccentInput(layout.accent_color)}
                        className="min-h-11 w-full min-w-0 rounded-lg border border-obsidian-borderLight px-2 font-mono text-xs"
                      />
                    </div>
                  </div>
                  <label className="flex min-h-11 items-center gap-2 text-xs">
                    <input type="checkbox" checked={layout.include_cover} onChange={event => updateLayout('include_cover', event.target.checked)} /> Portada
                  </label>
                </div>
              </details>
            )}

            {supportsDocumentIndexes && <details className="group border-t border-obsidian-border pt-1">
              <summary className="ui-nav-action cursor-pointer">Opciones del documento<ChevronDown className="ml-auto h-4 w-4 group-open:rotate-180" aria-hidden="true" /></summary>
              <div className="grid gap-x-4 gap-y-1 px-3 pb-2 sm:grid-cols-2">
                <label className="flex min-h-11 items-center gap-2 text-xs">
                  <input type="checkbox" checked={includeToc} onChange={event => setIncludeToc(event.target.checked)} /> Índice de contenido
                </label>
                {includeToc && <label className="flex min-h-11 flex-wrap items-center gap-2 text-xs">
                  Profundidad
                  <select value={tocDepth} onChange={event => setTocDepth(Number(event.target.value))} className="ps-2">
                    {[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={level}>Hasta H{level}</option>)}
                  </select>
                </label>}
                <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={includeFigures} onChange={event => setIncludeFigures(event.target.checked)} /> Índice de figuras</label>
                <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={includeTables} onChange={event => setIncludeTables(event.target.checked)} /> Índice de tablas</label>
                {supportsTypography && <>
                  <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={includeWatermark} onChange={event => setIncludeWatermark(event.target.checked)} /> Marca de confidencialidad</label>
                  {includeWatermark && <label className="grid gap-1 text-xs sm:col-span-2">
                    Texto de confidencialidad (opcional)
                    <input type="text" value={watermarkText} maxLength={120} onChange={event => setWatermarkText(event.target.value)} className="min-h-11 min-w-0 rounded-lg border px-3" />
                  </label>}
                </>}
              </div>
            </details>}
          </fieldset>

          <details className="group border-t border-obsidian-border pt-1" open={checks.length > 0 || undefined}>
            <summary className="ui-nav-action cursor-pointer">Revisión antes de exportar{checks.length > 0 && <span className="text-amber-200">· {checks.length} por revisar</span>}<ChevronDown className="ml-auto h-4 w-4 group-open:rotate-180" aria-hidden="true" /></summary>
            <div className="space-y-1 px-3 pb-2 text-xs text-obsidian-muted">
              {checks.length === 0 ? <p>La revisión automática no detectó problemas.</p> : <ul className="space-y-1">
                {checks.map(check => <li key={check.label}>{check.label} · {check.count}</li>)}
              </ul>}
              {redactForClient && publicationReview.redactedFields > 0 && <p>Campos de evidencia marcados para censurar · {publicationReview.redactedFields}</p>}
            </div>
          </details>

          {errorMsg && (
            <div role="alert" className="border border-obsidian-border bg-rose-500/5 px-3 py-2 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}
          </div>
          {previewOpen && (
            <section aria-label="Vista previa de exportación" className="flex min-h-0 min-w-0 flex-col border-t border-obsidian-border xl:border-l xl:border-t-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-obsidian-border px-4 py-3">
                <h3 className="text-sm font-medium text-obsidian-text">Vista previa de exportación</h3>
                <span role="status" className="text-xs text-obsidian-muted">{previewBusy ? 'Actualizando…' : ''}</span>
                {(selectedFormat === 'pdf' || selectedFormat === 'docx') && <p className="basis-full text-xs text-obsidian-muted">Vista continua del diseño. Los saltos de página se calculan al exportar.</p>}
              </div>
              {previewError ? (
                <p role="alert" className="p-4 text-sm text-rose-200">{previewError}</p>
              ) : previewHtml ? (
                <iframe title="Documento con el diseño de exportación" sandbox="" srcDoc={previewHtml} className="min-h-[24rem] w-full flex-1 bg-white xl:min-h-[30rem]" />
              ) : <p className="p-4 text-sm text-obsidian-muted">Preparando el documento…</p>}
            </section>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-3.5 sm:px-5 bg-obsidian-surface/80 border-t border-obsidian-border">
          {supportsTypography && <button type="button" disabled={exporting} onClick={() => setShowPreview(open => !open)} aria-expanded={previewOpen} className="ui-action-secondary mr-auto">
            <Eye className="h-4 w-4" aria-hidden="true" />{previewOpen ? 'Ocultar vista previa' : 'Ver vista previa'}
          </button>}
          {!saveFilePicker && <p className="mr-auto text-xs text-obsidian-muted">La carpeta se elige en la configuración de descargas del navegador.</p>}
          {/* [Acción secundaria] Cerrar conserva el informe sin cambios. */}
          <button type="button" onClick={requestClose} disabled={exporting} className="ui-action-secondary">
            Cerrar
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={handleRunExport}
            className="ui-action-primary min-w-0"
          >
            {/* [Acción principal] Genera y descarga el formato seleccionado. */}
            <Download className="w-4 h-4" />
            {exporting ? exportStage : `${saveFilePicker ? 'Guardar' : 'Descargar'} ${format.ext.slice(1).toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
};
