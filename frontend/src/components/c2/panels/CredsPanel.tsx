import React, { useState } from 'react';
import { Download, KeyRound, Loader2, Play, Square, Trash2 } from 'lucide-react';
import { useVault } from '../../../context/VaultContext';
import { useC2 } from '../../../context/C2Context';
import { c2Api } from '../../../lib/c2Api';

export const CredsPanel: React.FC = () => {
  const { showToast } = useVault();
  const {
    lang,
    t,
    selectedIface,
    moduleStatus,
    creds,
    clearCredsBuffer,
    refreshStatus,
    addLog,
  } = useC2();

  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const running = Boolean(moduleStatus.creds);

  const handleStart = async () => {
    if (!selectedIface) {
      const msg = t('poison.needIface');
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }

    setBusy(true);
    try {
      await c2Api.startCreds({ interface: selectedIface });
      await refreshStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start credential capture';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await c2Api.stopCreds();
      await refreshStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to stop credential capture';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await c2Api.exportCredsBlob();
      showToast(
        lang === 'es' ? 'Credenciales exportadas (creds.json)' : 'Credentials exported (creds.json)',
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await c2Api.clearCreds();
      clearCredsBuffer();
      addLog('info', t('creds.cleared'));
      showToast(t('creds.cleared'), 'info');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to clear credentials buffer';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setClearing(false);
    }
  };

  return (
    <section className="border-t border-obsidian-border py-4 sm:py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2.5">
            <KeyRound size={18} className="text-obsidian-muted" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold text-white">{t('creds.title')}</h2>
            <span
              className={`rounded border px-2 py-0.5 font-mono text-[11px] font-semibold ${
                running
                  ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                  : 'border-obsidian-border bg-obsidian-surface text-obsidian-muted'
              }`}
            >
              {running
                ? lang === 'es'
                  ? 'Activo'
                  : 'Running'
                : lang === 'es'
                ? 'En espera'
                : 'Idle'}
            </span>
            <span className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-0.5 font-mono text-[11px] text-obsidian-muted">
              {creds.length}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-obsidian-muted">{t('creds.hint')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleStart()}
            disabled={busy || running}
            className="ui-action-primary"
          >
            {busy && !running ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Play size={16} aria-hidden="true" />
            )}
            <span>{t('creds.start')}</span>
            {/* [Acción principal] Inicia o confirma la operación. */}
          </button>

          <button
            type="button"
            onClick={() => void handleStop()}
            disabled={busy || !running}
            className="ui-action-danger"
          >
            {busy && running ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Square size={16} aria-hidden="true" />
            )}
            <span>{t('creds.stop')}</span>
            {/* [Acción destructiva] Detiene o revierte la operación. */}
          </button>

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="ui-action-secondary"
          >
            {exporting ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Download size={16} className="text-obsidian-muted" aria-hidden="true" />
            )}
            <span>{t('creds.export')}</span>
            {/* [Acción secundaria] Abre o ajusta la operación actual. */}
          </button>

          <button
            type="button"
            onClick={() => void handleClear()}
            disabled={clearing}
            className="ui-action-secondary"
          >
            {clearing ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 size={16} aria-hidden="true" />
            )}
            <span>{t('creds.clear')}</span>
            {/* [Acción secundaria] Abre o ajusta la operación actual. */}
          </button>
        </div>
      </div>

      <div className="mt-4 max-h-[420px] overflow-auto border-y border-obsidian-border">
        <table className="w-full min-w-[580px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-obsidian-bg">
            <tr className="border-b border-obsidian-border text-[11px] font-semibold uppercase tracking-wider text-obsidian-muted">
              <th scope="col" className="px-3 py-2.5">{t('creds.proto')}</th>
              <th scope="col" className="px-3 py-2.5">{t('creds.data')}</th>
              <th scope="col" className="px-3 py-2.5">{t('creds.flow')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-obsidian-border/70">
            {creds.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-left sm:text-center text-xs text-obsidian-muted">
                  {lang === 'es'
                    ? 'Sin credenciales capturadas en memoria.'
                    : 'No credentials captured in memory yet.'}
                </td>
              </tr>
            ) : (
              creds.map((item, idx) => {
                const flowText = `${item.src || '-'} -> ${item.dst || '-'}`;
                return (
                  <tr
                    key={item.id || `${item.proto}-${idx}`}
                    className="transition-colors hover:bg-obsidian-surface/70"
                  >
                    <td className="px-3 py-2.5 font-mono font-semibold text-obsidian-text whitespace-nowrap">
                      {item.proto || '-'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-obsidian-text break-all">
                      {item.data || '-'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-obsidian-muted whitespace-nowrap">
                      {flowText}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
