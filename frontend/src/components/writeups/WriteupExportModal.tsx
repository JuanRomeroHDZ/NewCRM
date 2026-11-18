import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, X } from 'lucide-react';
import { WriteupDetail, WriteupExportFormat } from '../../types';
import { compileMermaidDiagramsForExport } from './mermaidExportHelper';
import { reviewPublication } from './writeupWorkbenchUtils';

interface WriteupExportModalProps {
  writeup: WriteupDetail;
  onClose: () => void;
  onExport: (opts: {
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
  }, destination?: FileSystemFileHandle) => Promise<void>;
}

type SaveFilePicker = (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;

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
  const [exporting, setExporting] = useState(false);
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
  const supportsTypography = hasCover;
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


  const saveFilePicker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;

  const handleRunExport = async () => {
    if (exportingRef.current) return;
    setExporting(true);
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
      let renderedDiagrams: Record<string, string> | undefined;
      if (includesLinkedMedia) {
        const compiled = await compileMermaidDiagramsForExport(writeup.markdown_content, redactForClient);
        if (Object.keys(compiled).length > 0) renderedDiagrams = compiled;
      }
      await onExport({
        format: selectedFormat,
        redact_for_client: redactForClient,
        include_watermark: hasCover && includeWatermark,
        include_toc: supportsDocumentIndexes && includeToc,
        toc_depth: tocDepth,
        include_figure_index: supportsDocumentIndexes && includeFigures,
        include_table_index: supportsDocumentIndexes && includeTables,
        font_size_pt: fontSizePt,
        watermark_text: watermarkText.trim() || undefined,
        rendered_diagrams: renderedDiagrams,
      }, destination);
      onCloseRef.current();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo generar el archivo.');
    } finally {
      setExporting(false);
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
        className="my-auto flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-obsidian-borderLight bg-obsidian-panel shadow-2xl"
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:px-5">
          <fieldset disabled={exporting} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid min-w-0 gap-1 text-xs text-obsidian-text">
                Formato
                <select ref={firstFormatRef} value={selectedFormat} onChange={(event) => {
                  setSelectedFormat(event.target.value as WriteupExportFormat);
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
                  hasCover && 'Portada',
                  supportsDocumentIndexes && indexes.length > 0 && `Índices de ${indexes.join(', ')}`,
                  isPackaged ? 'Adjuntos y pizarras' : includesLinkedMedia ? 'Figuras referenciadas' : 'Sin archivos adjuntos',
                ].filter(Boolean).join(' · ')}
              </p>
            </section>

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
                  <label className="flex min-h-11 flex-wrap items-center gap-2 text-xs">
                    Tamaño del texto
                    <select value={fontSizePt} onChange={event => setFontSizePt(Number(event.target.value))} className="ps-2">
                      {[8, 9, 10, 11, 12, 13, 14, 16, 18].map(size => <option key={size} value={size}>{size} pt</option>)}
                    </select>
                  </label>
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

        <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-3.5 sm:px-5 bg-obsidian-surface/80 border-t border-obsidian-border">
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
            {exporting ? 'Generando…' : `${saveFilePicker ? 'Guardar' : 'Descargar'} ${format.ext.slice(1).toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
};
