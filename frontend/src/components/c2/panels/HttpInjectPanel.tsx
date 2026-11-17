import React, { useId, useState } from 'react';
import { Code2, Play, Square, Trash2 } from 'lucide-react';
import { useC2 } from '../../../context/C2Context';
import { useVault } from '../../../context/VaultContext';
import { c2Api } from '../../../lib/c2Api';

export const HttpInjectPanel: React.FC = () => {
  const { t, moduleStatus, httpRequests, clearHttpRequests, addLog, refreshStatus, arpTarget, setArpTarget } = useC2();
  const { showToast } = useVault();

  const [injectPayload, setInjectPayload] = useState('');
  const [sslstrip, setSslstrip] = useState(false);
  const [proxyPort, setProxyPort] = useState('8080');
  const [busy, setBusy] = useState(false);

  const injectId = useId();
  const targetId = useId();
  const sslstripId = useId();
  const portId = useId();

  const isRunning = Boolean(moduleStatus.httpinject);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const parsedPort = Number.parseInt(proxyPort, 10);
      await c2Api.startHttpInject({
        target_ip: arpTarget,
        inject: injectPayload,
        sslstrip,
        port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 8080,
      });
      await refreshStatus();
      showToast(t('http.start'), 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start HTTP inject';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await c2Api.stopHttpInject();
      await refreshStatus();
      showToast(t('http.stop'), 'info');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to stop HTTP inject';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-w-0">
      <section className="border-t border-obsidian-border py-4 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Code2 size={18} className="shrink-0 text-obsidian-muted" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold text-white">{t('http.title')}</h2>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-medium ${
              isRunning
                ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                : 'border-obsidian-border bg-obsidian-surface text-obsidian-muted'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}
              aria-hidden="true"
            />
            <span>{isRunning ? t('module.httpinject') : t('modules.none')}</span>
          </span>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-obsidian-muted">{t('http.hint')}</p>

        <form onSubmit={(e) => void handleStart(e)} className="mt-4 max-w-2xl space-y-3.5">
          <div>
            <label htmlFor={targetId} className="mb-1.5 block text-xs font-medium text-obsidian-muted">
              {t('http.target')}
            </label>
            <input
              id={targetId}
              type="text"
              inputMode="decimal"
              required
              value={arpTarget}
              onChange={(e) => setArpTarget(e.target.value)}
              placeholder="192.168.100.17"
              className="min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-obsidian-muted focus:border-obsidian-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent"
            />
            <p className="mt-1 text-[11px] text-obsidian-muted">{t('http.targetHint')}</p>
          </div>
          <div>
            <label htmlFor={injectId} className="mb-1.5 block text-xs font-medium text-obsidian-muted">
              {t('http.payload')}
            </label>
            <textarea
              id={injectId}
              rows={4}
              value={injectPayload}
              onChange={(e) => setInjectPayload(e.target.value)}
              placeholder="<script>alert('pwned')</script>"
              className="w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-obsidian-muted focus:border-obsidian-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label
              htmlFor={sslstripId}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 border-b border-obsidian-border px-1 py-2 text-xs text-white transition-colors hover:text-white"
            >
              <input
                id={sslstripId}
                type="checkbox"
                checked={sslstrip}
                onChange={(e) => setSslstrip(e.target.checked)}
                className="h-4 w-4 rounded border-obsidian-border bg-obsidian-bg accent-obsidian-accent"
              />
              <span>{t('http.sslstrip')}</span>
            </label>

            <div className="flex items-center gap-2">
              <label htmlFor={portId} className="text-xs font-medium text-obsidian-muted whitespace-nowrap">
                {t('http.port')}
              </label>
              <input
                id={portId}
                type="text"
                inputMode="numeric"
                value={proxyPort}
                onChange={(e) => setProxyPort(e.target.value)}
                className="min-h-[44px] w-28 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white focus:border-obsidian-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="submit"
              disabled={busy || isRunning}
              className="ui-action-primary"
            >
              <Play size={16} aria-hidden="true" />
              <span>{t('http.start')}</span>
              {/* [Acción principal] Inicia o confirma la operación. */}
            </button>
            <button
              type="button"
              onClick={() => void handleStop()}
              disabled={busy || !isRunning}
              className="ui-action-danger"
            >
              <Square size={16} aria-hidden="true" />
              <span>{t('http.stop')}</span>
              {/* [Acción destructiva] Detiene o revierte la operación. */}
            </button>
          </div>
        </form>
      </section>

      <section className="border-t border-obsidian-border py-4 sm:py-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-sm font-bold text-white">HTTP</h3>
            <span className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-0.5 font-mono text-[11px] text-obsidian-muted">
              {httpRequests.length}
            </span>
          </div>
          <button
            type="button"
            onClick={clearHttpRequests}
            disabled={httpRequests.length === 0}
            className="ui-action-secondary"
          >
            <Trash2 size={16} aria-hidden="true" />
            <span>{t('console.clear')}</span>
            {/* [Acción secundaria] Abre o ajusta la operación actual. */}
          </button>
        </div>

        <div className="overflow-x-auto border-y border-obsidian-border">
          <table className="w-full min-w-[520px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-obsidian-border text-xs font-semibold text-obsidian-muted">
                <th className="px-3 py-2.5">{t('http.host')}</th>
                <th className="px-3 py-2.5">{t('http.path')}</th>
                <th className="px-3 py-2.5">{t('http.dst')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-obsidian-border/70">
              {httpRequests.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-left sm:text-center text-xs text-obsidian-muted">
                    {t('console.empty')}
                  </td>
                </tr>
              ) : (
                httpRequests.map((req, idx) => (
                  <tr key={req.id || `${req.host}-${req.path}-${idx}`} className="hover:bg-obsidian-surface/60">
                    <td className="px-3 py-2 font-mono text-white">
                      {req.method ? (
                        <span className="mr-1.5 rounded border border-obsidian-border bg-obsidian-surface px-1.5 py-0.5 text-[10px] text-obsidian-muted">
                          {req.method}
                        </span>
                      ) : null}
                      {req.host || '-'}
                    </td>
                    <td className="px-3 py-2 font-mono text-obsidian-text break-all">{req.path || '/'}</td>
                    <td className="px-3 py-2 font-mono text-obsidian-muted">{req.dst || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
