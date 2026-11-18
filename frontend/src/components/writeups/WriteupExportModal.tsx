import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileArchive, FileCode, FileSpreadsheet, FileText, Globe, Shield, X } from 'lucide-react';
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
  }) => Promise<string | undefined>;
}

const EXPORT_OPTIONS: Array<{
  format: WriteupExportFormat;
  label: string;
  ext: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { format: 'pdf', label: 'PDF Ejecutivo', ext: '.pdf', desc: 'Listo para entregar al cliente con paginación y gráficas.', icon: FileText },
  { format: 'docx', label: 'Word Editable', ext: '.docx', desc: 'Documento corporativo con tablas, diagramas e imágenes.', icon: FileText },
  { format: 'html', label: 'Página HTML', ext: '.html', desc: 'Abre en el navegador e incluye sus diagramas.', icon: Globe },
  { format: 'md_zip', label: 'Paquete portable', ext: '.zip', desc: 'Incluye el texto, los archivos adjuntos, las pizarras y los diagramas.', icon: FileArchive },
  { format: 'md', label: 'Texto Markdown', ext: '.md', desc: 'Informe de texto con sus datos iniciales.', icon: FileCode },
  { format: 'sarif', label: 'SARIF 2.1.0', ext: '.sarif.json', desc: 'Estándar de hallazgos compatible con GitHub/CI/SIEM.', icon: Shield },
  { format: 'json', label: 'JSON Estructurado', ext: '.json', desc: 'Datos completos, citas, activos y hallazgos.', icon: FileCode },
  { format: 'csv', label: 'CSV / Excel', ext: '.csv', desc: 'Incluye hallazgos y citas; protege el contenido que pueda interpretarse como fórmula.', icon: FileSpreadsheet },
];

export const WriteupExportModal: React.FC<WriteupExportModalProps> = ({ writeup, onClose, onExport }) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFormatRef = useRef<HTMLButtonElement>(null);
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
  const [lastSha, setLastSha] = useState<string | null>(null);
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
        dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
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

  const mermaidCount = useMemo(
    () => (writeup.markdown_content.match(/```mermaid\b/gi) || []).length,
    [writeup.markdown_content]
  );
  const supportsDocumentIndexes = ['pdf', 'docx', 'html', 'md', 'md_zip'].includes(selectedFormat);
  const hasCover = ['pdf', 'docx', 'html'].includes(selectedFormat);
  const isPackaged = selectedFormat === 'md_zip';
  const includesLinkedMedia = hasCover || isPackaged;
  const supportsTypography = ['pdf', 'docx', 'html'].includes(selectedFormat);
  const publicationReview = useMemo(() => reviewPublication(writeup), [writeup]);

  const handleRunExport = async () => {
    if (exportingRef.current) return;
    setLastSha(null);
    setExporting(true);
    setErrorMsg(null);
    try {
      let renderedDiagrams: Record<string, string> | undefined;
      if (mermaidCount > 0 && (selectedFormat === 'pdf' || selectedFormat === 'docx' || selectedFormat === 'html' || selectedFormat === 'md_zip')) {
        const compiled = await compileMermaidDiagramsForExport(writeup.markdown_content);
        if (Object.keys(compiled).length > 0) renderedDiagrams = compiled;
      }
      const sha = await onExport({
        format: selectedFormat,
        redact_for_client: redactForClient,
        include_watermark: includeWatermark,
        include_toc: includeToc,
        toc_depth: tocDepth,
        include_figure_index: includeFigures,
        include_table_index: includeTables,
        font_size_pt: fontSizePt,
        watermark_text: watermarkText.trim() || undefined,
        rendered_diagrams: renderedDiagrams,
      });
      if (sha) setLastSha(sha);
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

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5 space-y-5">
          <section aria-label="Revisión antes de exportar" className="border-b border-obsidian-borderLight pb-4 text-xs text-obsidian-muted">
            <h3 className="mb-2 font-semibold text-obsidian-text">Revisión antes de exportar</h3>
            <ul className="space-y-1">
              <li>Imágenes locales ausentes: {publicationReview.missingImages}</li>
              <li>Enlaces vacíos: {publicationReview.emptyLinks}</li>
              <li>Secciones sin contenido: {publicationReview.emptySections}</li>
              <li>Posibles secretos sin marcar: {publicationReview.possibleSecrets}</li>
              <li>Campos de evidencia censurados: {publicationReview.redactedFields}</li>
              <li>Preguntas y pasos pendientes: {publicationReview.pendingQuestions + publicationReview.pendingSteps}</li>
            </ul>
            <p className="mt-2 text-obsidian-muted">La búsqueda es orientativa: revisa el contenido y las imágenes manualmente antes de compartir.</p>
          </section>
          {/* [Estado seleccionable] Separa los documentos de los datos para intercambio. */}
          {[
            { label: 'Documentos', formats: EXPORT_OPTIONS.slice(0, 5) },
            { label: 'Intercambio de datos', formats: EXPORT_OPTIONS.slice(5) },
          ].map(({ label, formats }) => (
            <section key={label} aria-label={label}>
              <h3 className="mb-1 text-xs font-semibold text-obsidian-text">{label}</h3>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {formats.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button key={opt.format} type="button"
                      ref={opt.format === 'pdf' ? firstFormatRef : undefined}
                      onClick={() => { setSelectedFormat(opt.format); setLastSha(null); setErrorMsg(null); }}
                      disabled={exporting} aria-pressed={selectedFormat === opt.format}
                      className="ui-action-toggle min-w-0 w-full justify-start px-2 py-2 text-left"
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{opt.label}</span>
                        <span className="block text-xs font-normal text-obsidian-muted">{opt.desc}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-obsidian-muted">{opt.ext}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          <section aria-label="Contenido de la entrega" className="border-y border-obsidian-border py-3">
            <h3 className="mb-2 text-xs font-semibold text-obsidian-text">Contenido de la entrega</h3>
            <dl className="grid gap-x-6 gap-y-2 text-xs text-obsidian-muted sm:grid-cols-2">
              <div><dt className="text-obsidian-text">Destino</dt><dd>{redactForClient ? 'Copia para cliente' : 'Uso interno'}</dd></div>
              <div><dt className="text-obsidian-text">Portada</dt><dd>{hasCover ? 'Incluida' : 'No aplica'}</dd></div>
              <div><dt className="text-obsidian-text">Índices solicitados</dt><dd>{supportsDocumentIndexes ? [includeToc && 'Contenido', includeFigures && 'Figuras', includeTables && 'Tablas'].filter(Boolean).join(', ') || 'Ninguno' : 'No aplican'}</dd></div>
              <div><dt className="text-obsidian-text">Evidencias y anexos</dt><dd>{isPackaged ? 'El ZIP empaqueta los adjuntos y las pizarras del informe.' : includesLinkedMedia ? 'Se incorporan las figuras referenciadas compatibles con el formato.' : 'El formato no incorpora archivos adjuntos.'}</dd></div>
            </dl>
          </section>

          <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2">
            {supportsTypography && <label className="flex items-center gap-2 text-xs text-obsidian-text">
              Tamaño del texto
              <select value={fontSizePt} onChange={(event) => setFontSizePt(Number(event.target.value))} className="min-h-[44px] rounded-md border border-obsidian-borderLight bg-obsidian-surface px-2 text-white">
                {[8, 9, 10, 11, 12, 13, 14, 16, 18].map((size) => <option key={size} value={size}>{size} pt</option>)}
              </select>
            </label>}
            <label className="flex min-h-[44px] items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={redactForClient}
                onChange={(e) => setRedactForClient(e.target.checked)}
                className="mt-0.5 rounded border-obsidian-borderLight bg-obsidian-surface accent-obsidian-accent"
              />
              <div>
              <div className="text-xs font-medium text-obsidian-text">Copia para cliente (ocultar secretos)</div>
                <div className="text-[11px] text-obsidian-muted">Reemplaza segmentos {'{{redact:...}}'} por [REDACTED].</div>
              </div>
            </label>

            {supportsDocumentIndexes && (
              <div className="space-y-2 border-l border-obsidian-borderLight pl-4 text-xs text-obsidian-text">
                {includeToc && <label className="flex min-h-[44px] items-center gap-2">Niveles de encabezado
                  <select value={tocDepth} onChange={(event) => setTocDepth(Number(event.target.value))} className="min-h-[44px] rounded-md border border-obsidian-borderLight bg-obsidian-surface px-2 text-white">
                    {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>Hasta H{level}</option>)}
                  </select>
                </label>}
                <label className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={includeFigures} onChange={(event) => setIncludeFigures(event.target.checked)} /> Índice de figuras e imágenes</label>
                <label className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={includeTables} onChange={(event) => setIncludeTables(event.target.checked)} /> Índice de tablas</label>
              </div>
            )}

            {supportsDocumentIndexes && <label className="flex min-h-[44px] items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeToc}
                  onChange={(e) => setIncludeToc(e.target.checked)}
                  className="mt-0.5 rounded border-obsidian-borderLight bg-obsidian-surface accent-obsidian-accent"
                />
                <div>
                  <div className="text-xs font-medium text-obsidian-text">Tabla de contenidos</div>
                  <div className="text-[11px] text-obsidian-muted">Enlaza los encabezados disponibles en el formato elegido.</div>
                </div>
              </label>}

            <label className="flex min-h-[44px] items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeWatermark}
                onChange={(e) => setIncludeWatermark(e.target.checked)}
                className="mt-0.5 rounded border-obsidian-borderLight bg-obsidian-surface accent-obsidian-accent"
              />
              <div>
                <div className="text-xs font-medium text-obsidian-text">Incluir cinta de confidencialidad</div>
              <div className="text-[11px] text-obsidian-muted">Agrega una marca al documento exportado.</div>
              </div>
            </label>

            <div>
              <label htmlFor={`${titleId}-watermark`} className="block text-[11px] text-obsidian-muted mb-1">Texto de confidencialidad (opcional)</label>
              <input
                id={`${titleId}-watermark`}
                type="text"
                value={watermarkText}
                maxLength={120}
                onChange={(e) => setWatermarkText(e.target.value)}
                disabled={!includeWatermark}
                placeholder="Escribe una marca de confidencialidad"
                className="w-full min-h-11 min-w-0 bg-obsidian-panel border border-obsidian-borderLight rounded-lg px-2.5 py-1.5 text-xs text-obsidian-text disabled:opacity-50"
              />
            </div>
          </div>

          {lastSha && (
            <div role="status" className="flex min-w-0 items-center gap-2 border border-obsidian-border bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <div className="min-w-0 break-all">
                Archivo generado. Código de verificación: <span className="font-mono">{lastSha}</span>
              </div>
            </div>
          )}

          {errorMsg && (
            <div role="alert" className="border border-obsidian-border bg-rose-500/5 px-3 py-2 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-3.5 sm:px-5 bg-obsidian-surface/80 border-t border-obsidian-border">
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
            {exporting ? 'Compilando...' : `Descargar ${selectedFormat.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
};
