import React, { useMemo, useState } from 'react';
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
  { format: 'html', label: 'HTML Autocontenido', ext: '.html', desc: 'Archivo offline único con diagramas SVG y cero scripts externos.', icon: Globe },
  { format: 'md_zip', label: 'Paquete Portable', ext: '.zip', desc: 'Markdown + assets/ WebP + pizarras y diagramas SVG + manifest.', icon: FileArchive },
  { format: 'md', label: 'Markdown Plano', ext: '.md', desc: 'Documento Markdown limpio con frontmatter YAML.', icon: FileCode },
  { format: 'sarif', label: 'SARIF 2.1.0', ext: '.sarif.json', desc: 'Estándar de hallazgos compatible con GitHub/CI/SIEM.', icon: Shield },
  { format: 'json', label: 'JSON Estructurado', ext: '.json', desc: 'Datos completos, citas, activos y hallazgos.', icon: FileCode },
  { format: 'csv', label: 'CSV / Excel', ext: '.csv', desc: 'Matriz de hallazgos y citas protegida contra fórmulas DDE.', icon: FileSpreadsheet },
];

export const WriteupExportModal: React.FC<WriteupExportModalProps> = ({ writeup, onClose, onExport }) => {
  const [selectedFormat, setSelectedFormat] = useState<WriteupExportFormat>('pdf');
  const [redactForClient, setRedactForClient] = useState(true);
  const [includeWatermark, setIncludeWatermark] = useState(true);
  const [includeToc, setIncludeToc] = useState(true);
  const [watermarkText, setWatermarkText] = useState('');
  const [exporting, setExporting] = useState(false);
  const [lastSha, setLastSha] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-white">Exportar Writeup — {writeup.title}</h3>
            <p className="text-xs text-slate-400">Compilación unificada sin llamadas externas (protección SSRF y XSS activa)</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {EXPORT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = selectedFormat === opt.format;
              return (
                <button
                  key={opt.format}
                  type="button"
                  onClick={() => setSelectedFormat(opt.format)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    active
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <Icon className={`w-4 h-4 ${active ? 'text-indigo-400' : 'text-slate-400'}`} />
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
                <div className="text-xs font-medium text-slate-200">Modo Cliente (Censurar secretos)</div>
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
                <div className="text-[11px] text-slate-400">Genera índice automático en HTML/PDF.</div>
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
                <div className="text-[11px] text-slate-400">Agrega marca de agua superior en PDF/HTML/DOCX.</div>
              </div>
            </label>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Texto de confidencialidad personalizado (opcional)</label>
              <input
                type="text"
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                disabled={!includeWatermark}
                placeholder="Ej: CONFIDENCIAL — CLIENTE ACME"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 disabled:opacity-50"
              />
            </div>
          </div>

          {lastSha && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <div className="truncate">
                Archivo generado y auditado. SHA-256: <span className="font-mono">{lastSha}</span>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-slate-950/80 border-t border-slate-800">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-800">
            Cerrar
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={handleRunExport}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Compilando...' : `Descargar ${selectedFormat.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
};
