import React, { useState, useEffect } from 'react';
import { X, Code, Copy, Check, Download, Sparkles, Key } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { PlatformAccount } from '../../types';
import { useTransferDialog } from './useTransferDialog';

export const EnvExportModal: React.FC = () => {
  const { isEnvExportOpen, closeEnvExport, showToast, isUnlocked, openUnlockModal } = useVault();
  const [platforms, setPlatforms] = useState<PlatformAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [includeComments, setIncludeComments] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const dialogRef = useTransferDialog(isEnvExportOpen, closeEnvExport);

  useEffect(() => {
    if (!isEnvExportOpen) return;
    if (!isUnlocked) { closeEnvExport(); openUnlockModal(); return; }
    let active = true;
    setLoading(true);
    setPlatforms([]);
    setError('');
    api.getPlatforms()
      .then((result) => { if (active) setPlatforms(result); })
      .catch(() => { if (active) setError('No se pudieron cargar los servicios. Intenta de nuevo.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isEnvExportOpen, isUnlocked, attempt]);

  if (!isEnvExportOpen) return null;

  // Filter platforms with API keys or env vars
  const techPlatforms = platforms.filter(
    (p) => (p.api_keys && p.api_keys.length > 0) || (p.env_variables && p.env_variables.length > 0)
  );

  let envOutput = '';
  if (includeComments) {
    envOutput += `# ========================================================\n`;
    envOutput += `# LESSSO - Variables de entorno (.env)\n`;
    envOutput += `# Generated on: ${new Date().toISOString()}\n`;
    envOutput += `# Total Services: ${techPlatforms.length}\n`;
    envOutput += `# ========================================================\n\n`;
  }

  techPlatforms.forEach((p) => {
    if (includeComments) {
      envOutput += `### Platform: ${p.name} (${p.email_address || 'Root'})\n`;
    }
    // API Keys
    if (p.api_keys) {
      p.api_keys.forEach((ak) => {
        const keyName = `${p.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${ak.label.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
        const val = ak.key || ak.key_masked || '';
        envOutput += `${keyName}="${val}"\n`;
      });
    }
    // Env vars
    if (p.env_variables) {
      p.env_variables.forEach((ev) => {
        const val = ev.value || ev.value_masked || '';
        envOutput += `${ev.key}="${val}"\n`;
      });
    }
    envOutput += '\n';
  });

  const handleCopy = async () => {
    if (loading || error || !techPlatforms.length) return;
    try { await navigator.clipboard.writeText(envOutput); }
    catch { showToast('No se pudo copiar. Puedes descargar el archivo.', 'error'); return; }
    setCopied(true);
    showToast('Variables de entorno copiadas al portapapeles.', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (loading || error || !techPlatforms.length) return;
    const dataStr = 'data:text/plain;charset=utf-8,' + encodeURIComponent(envOutput);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', '.env');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Archivo .env descargado con éxito.', 'success');
  };

  return (
    <div
      className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeEnvExport();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="env-export-title"
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-obsidian-border bg-obsidian-panel p-4 shadow-xl space-y-5 sm:p-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
          <div className="flex min-w-0 items-start gap-3">
            <Code size={18} className="mt-0.5 shrink-0 text-obsidian-muted" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="env-export-title" className="text-lg font-bold text-white">Exportador de Entorno (.env Vault)</h2>
              <p className="text-xs text-white/50">
                Compila todas las llaves API y variables secretas en formato estándar listo para producción
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar exportador"
            onClick={closeEnvExport}
            className="ui-action-icon"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {loading && <p role="status" className="text-sm text-obsidian-muted">Cargando servicios…</p>}
        {error && <div role="alert" className="rounded-lg border border-obsidian-border bg-obsidian-surface p-3 text-xs text-obsidian-muted"><p>{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="ui-action-secondary mt-2">Reintentar</button></div>}
        {!loading && !error && techPlatforms.length === 0 && <p role="status" className="text-sm text-obsidian-muted">No hay servicios con llaves API o variables de entorno para exportar.</p>}
        {/* [Estado seleccionable] Incluye o excluye comentarios del archivo exportado. */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/60">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeComments}
              onChange={(e) => setIncludeComments(e.target.checked)}
              className="rounded border-obsidian-border bg-obsidian-surface accent-[var(--brand-accent)] focus:ring-0"
            />
            <span>Incluir comentarios de plataforma y encabezado</span>
          </label>
          <span className="text-[11px] font-mono text-obsidian-muted">
            {techPlatforms.length} servicios con secretos configurados
          </span>
        </div>

        {/* Code Preview */}
        <div className="relative rounded-xl border border-obsidian-border bg-black/50 overflow-hidden font-mono text-xs">
          <div className="flex items-center justify-between px-4 py-2 border-b border-obsidian-border bg-obsidian-surface/60 text-white/40 text-[11px]">
            <span>.env</span>
            <span>UTF-8</span>
          </div>
          <textarea
            aria-label="Vista previa del archivo de entorno"
            readOnly
            value={loading || error || !techPlatforms.length ? '' : envOutput}
            rows={12}
            className="w-full p-4 bg-transparent text-obsidian-text font-mono text-xs resize-none focus:outline-none"
          />
        </div>

        {/* [Acción secundaria] Copia el contenido o cierra la vista previa. */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={closeEnvExport}
            className="ui-action-secondary"
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={loading || Boolean(error) || !techPlatforms.length}
            onClick={handleCopy}
            className="ui-action-secondary"
          >
            {copied ? <Check size={16} className="text-emerald-400" aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            Copiar .env
          </button>
          {/* [Acción principal] Descarga el archivo .env compilado. */}
          <button
            type="button"
            disabled={loading || Boolean(error) || !techPlatforms.length}
            onClick={handleDownload}
            className="ui-action-primary"
          >
            <Download size={16} aria-hidden="true" /> Descargar .env
          </button>
        </div>
      </div>
    </div>
  );
};
