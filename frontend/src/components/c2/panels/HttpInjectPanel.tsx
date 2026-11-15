import React, { useId, useState } from 'react';
import { Code2, Play, Square, Trash2 } from 'lucide-react';
import { useC2 } from '../../../context/C2Context';
import { useVault } from '../../../context/VaultContext';
import { c2Api } from '../../../lib/c2Api';

export const HttpInjectPanel: React.FC = () => {
  const { t, moduleStatus, httpRequests, clearHttpRequests, addLog, refreshStatus } = useC2();
  const { showToast } = useVault();

  const [injectPayload, setInjectPayload] = useState('');
  const [sslstrip, setSslstrip] = useState(true);
  const [proxyPort, setProxyPort] = useState('8080');
  const [busy, setBusy] = useState(false);

  const injectId = useId();
  const sslstripId = useId();
  const portId = useId();

  const isRunning = Boolean(moduleStatus.httpinject);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const parsedPort = Number.parseInt(proxyPort, 10);
      await c2Api.startHttpInject({
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
    <div className="space-y-4">
      <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Code2 size={18} className="shrink-0 text-obsidian-gold" aria-hidden="true" />
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
            <label htmlFor={injectId} className="mb-1.5 block text-xs font-medium text-obsidian-muted">
              {t('http.payload')}
            </label>
            <textarea
              id={injectId}
              rows={4}
              value={injectPayload}
              onChange={(e) => setInjectPayload(e.target.value)}
              placeholder="<script>alert('pwned')</script>"
              className="w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-obsidian-gold focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label
              htmlFor={sslstripId}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-xs text-white transition-colors hover:border-obsidian-borderLight"
            >
              <input
                id={sslstripId}
                type="checkbox"
                checked={sslstrip}
                onChange={(e) => setSslstrip(e.target.checked)}
                className="h-4 w-4 rounded border-obsidian-border bg-obsidian-bg accent-obsidian-gold"
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
                className="min-h-[44px] w-28 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white focus:border-obsidian-gold focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="submit"
              disabled={busy || isRunning}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-obsidian-gold/50 bg-obsidian-gold/20 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-obsidian-gold/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play size={14} aria-hidden="true" />
              <span>{t('http.start')}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleStop()}
              disabled={busy || !isRunning}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-obsidian-dangerBg px-4 py-2 text-xs font-semibold text-red-300 transition-colors hover:border-red-400 hover:bg-red-950/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Square size={14} aria-hidden="true" />
              <span>{t('http.stop')}</span>
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
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
            className="inline-flex min-h-[44px] lg:min-h-10 items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-1.5 text-xs font-medium text-obsidian-muted transition-colors hover:border-obsidian-borderLight hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold"
          >
            <Trash2 size={13} aria-hidden="true" />
            <span>{t('console.clear')}</span>
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-obsidian-border">
          <table className="w-full min-w-[520px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-obsidian-border bg-obsidian-surface text-[11px] font-semibold uppercase tracking-wider text-obsidian-muted">
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
                        <span className="mr-1.5 rounded border border-obsidian-gold/40 bg-obsidian-gold/10 px-1.5 py-0.5 text-[10px] text-obsidian-gold">
                          {req.method}
                        </span>
                      ) : null}
                      {req.host || '-'}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-200 break-all">{req.path || '/'}</td>
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
