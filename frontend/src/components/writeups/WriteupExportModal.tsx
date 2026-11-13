import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileArchive, FileCode, FileSpreadsheet, FileText, Globe, Shield, X } from 'lucide-react';
import { WriteupDetail, WriteupExportFormat } from '../../types';
import { compileMermaidDiagramsForExport } from './mermaidExportHelper';

interface WriteupExportModalProps {
  writeup: WriteupDetail;
  onClose: () => void;
  onExport: (opts: {
    format: WriteupExportFormat;
    redact_for_client: boolean;
    include_watermark: boolean;
    include_toc: boolean;
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
  const [watermarkText, setWatermarkText] = useState('');
  const [exporting, setExporting] = useState(false);
  const [lastSha, setLastSha] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => firstFormatRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])')
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

  const handleRunExport = async () => {
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
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-black/75 p-2 sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="my-auto flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-2 px-3 py-3 sm:px-5 sm:py-4 border-b border-slate-800">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-white break-words">Exportar informe — {writeup.title}</h2>
            <p id={descriptionId} className="mt-1 text-xs text-slate-400">El archivo se genera en esta computadora y no se envía a servicios externos.</p>
          </div>
          <button ref={firstFormatRef} type="button" onClick={onClose} aria-label="Cerrar ventana de exportación" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5 space-y-5">
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-4 gap-2.5">
            {EXPORT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = selectedFormat === opt.format;
              return (
                <button
                  key={opt.format}
                  type="button"
                  onClick={() => setSelectedFormat(opt.format)}
                  aria-pressed={active}
                  className={`min-h-11 min-w-0 text-left p-3 rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                    active
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <Icon className={`w-4 h-4 ${active ? 'text-indigo-300' : 'text-slate-300'}`} aria-hidden="true" />
                    <span className="text-[10px] font-mono text-slate-400">{opt.ext}</span>
                  </div>
                  <div className="text-xs font-semibold">{opt.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{opt.desc}</div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/70 p-4 rounded-xl border border-slate-800">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={redactForClient}
                onChange={(e) => setRedactForClient(e.target.checked)}
                className="mt-0.5 rounded border-slate-600 bg-slate-800 text-indigo-600"
              />
              <div>
              <div className="text-xs font-medium text-slate-200">Copia para cliente (ocultar secretos)</div>
                <div className="text-[11px] text-slate-400">Reemplaza segmentos {'{{redact:...}}'} por [REDACTED].</div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeToc}
                onChange={(e) => setIncludeToc(e.target.checked)}
                className="mt-0.5 rounded border-slate-600 bg-slate-800 text-indigo-600"
              />
              <div>
                <div className="text-xs font-medium text-slate-200">Tabla de contenidos</div>
              <div className="text-[11px] text-slate-300">Agrega un índice en los archivos HTML y PDF.</div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeWatermark}
                onChange={(e) => setIncludeWatermark(e.target.checked)}
                className="mt-0.5 rounded border-slate-600 bg-slate-800 text-indigo-600"
              />
              <div>
                <div className="text-xs font-medium text-slate-200">Incluir cinta de confidencialidad</div>
              <div className="text-[11px] text-slate-300">Agrega una marca al documento exportado.</div>
              </div>
            </label>

            <div>
              <label htmlFor={`${titleId}-watermark`} className="block text-[11px] text-slate-300 mb-1">Texto de confidencialidad (opcional)</label>
              <input
                id={`${titleId}-watermark`}
                type="text"
                value={watermarkText}
                maxLength={120}
                onChange={(e) => setWatermarkText(e.target.value)}
                disabled={!includeWatermark}
                placeholder="Escribe una marca de confidencialidad"
                className="w-full min-h-11 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 disabled:opacity-50"
              />
            </div>
          </div>

          {lastSha && (
            <div role="status" className="flex min-w-0 items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <div className="min-w-0 break-all">
                Archivo generado. Código de verificación: <span className="font-mono">{lastSha}</span>
              </div>
            </div>
          )}

          {errorMsg && (
            <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-3.5 sm:px-5 bg-slate-950/80 border-t border-slate-800">
          <button type="button" onClick={onClose} className="min-h-11 px-4 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
            Cerrar
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={handleRunExport}
            className="min-h-11 min-w-0 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Compilando...' : `Descargar ${selectedFormat.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
};
