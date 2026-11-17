import React, { useId, useState } from 'react';
import { Play, Square, Trash2, Waypoints } from 'lucide-react';
import { useC2 } from '../../../context/C2Context';
import { useVault } from '../../../context/VaultContext';
import { c2Api } from '../../../lib/c2Api';

function parseDomainMapping(raw: string): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const domain = line.slice(0, eqIndex).trim();
    const ip = line.slice(eqIndex + 1).trim();
    if (domain && ip) {
      mapping[domain] = ip;
    }
  }
  return mapping;
}

export const Mitm6Panel: React.FC = () => {
  const {
    t,
    selectedIface,
    moduleStatus,
    mitm6Events,
    clearMitm6Events,
    addLog,
    refreshStatus,
  } = useC2();
  const { showToast } = useVault();

  const [redirectHttp, setRedirectHttp] = useState(false);
  const [redirectPort, setRedirectPort] = useState('8080');
  const [mappingText, setMappingText] = useState('');
  const [busy, setBusy] = useState(false);

  const redirectId = useId();
  const redirectPortId = useId();
  const mapId = useId();

  const isRunning = Boolean(moduleStatus.mitm6);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIface) {
      const msg = t('poison.needIface');
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }

    setBusy(true);
    try {
      const parsedPort = Number.parseInt(redirectPort, 10);
      await c2Api.startMitm6({
        interface: selectedIface,
        mapping: parseDomainMapping(mappingText),
        redirect_http_port: redirectHttp
          ? Number.isFinite(parsedPort) && parsedPort > 0
            ? parsedPort
            : 8080
          : null,
      });
      await refreshStatus();
      showToast(t('mitm6.start'), 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start mitm6';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await c2Api.stopMitm6();
      await refreshStatus();
      showToast(t('mitm6.stop'), 'info');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to stop mitm6';
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
            <Waypoints size={18} className="shrink-0 text-obsidian-muted" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold text-white">{t('mitm6.title')}</h2>
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
            <span>{isRunning ? t('module.mitm6') : t('modules.none')}</span>
          </span>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-obsidian-muted">{t('mitm6.hint')}</p>

        <form onSubmit={(e) => void handleStart(e)} className="mt-4 max-w-2xl space-y-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label
              htmlFor={redirectId}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 border-b border-obsidian-border px-1 py-2 text-xs text-white transition-colors hover:text-white"
            >
              <input
                id={redirectId}
                type="checkbox"
                checked={redirectHttp}
                onChange={(e) => setRedirectHttp(e.target.checked)}
                className="h-4 w-4 rounded border-obsidian-border bg-obsidian-bg accent-obsidian-accent"
              />
              <span>{t('mitm6.redirect')}</span>
            </label>

            {redirectHttp && (
              <div className="flex items-center gap-2">
                <label htmlFor={redirectPortId} className="text-xs font-medium text-obsidian-muted whitespace-nowrap">
                  {t('http.port')}
                </label>
                <input
                  id={redirectPortId}
                  type="text"
                  inputMode="numeric"
                  value={redirectPort}
                  onChange={(e) => setRedirectPort(e.target.value)}
                  className="min-h-[44px] w-24 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white focus:border-obsidian-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent"
                />
              </div>
            )}
          </div>

          <div>
            <label htmlFor={mapId} className="mb-1.5 block text-xs font-medium text-obsidian-muted">
              {t('mitm6.map')}
            </label>
            <textarea
              id={mapId}
              rows={3}
              value={mappingText}
              onChange={(e) => setMappingText(e.target.value)}
              placeholder="intranet.corp=fe80::1"
              className="w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-obsidian-muted focus:border-obsidian-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="submit"
              disabled={busy || isRunning}
              className="ui-action-primary"
            >
              <Play size={16} aria-hidden="true" />
              <span>{t('mitm6.start')}</span>
              {/* [Acción principal] Inicia o confirma la operación. */}
            </button>
            <button
              type="button"
              onClick={() => void handleStop()}
              disabled={busy || !isRunning}
              className="ui-action-danger"
            >
              <Square size={16} aria-hidden="true" />
              <span>{t('mitm6.stop')}</span>
              {/* [Acción destructiva] Detiene o revierte la operación. */}
            </button>
          </div>
        </form>
      </section>

      <section className="border-t border-obsidian-border py-4 sm:py-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-sm font-bold text-white">{t('nav.mitm6')}</h3>
            <span className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-0.5 font-mono text-[11px] text-obsidian-muted">
              {mitm6Events.length}
            </span>
          </div>
            <button
            type="button"
            onClick={clearMitm6Events}
            disabled={mitm6Events.length === 0}
            className="ui-action-secondary"
          >
            <Trash2 size={16} aria-hidden="true" />
            <span>{t('console.clear')}</span>
              {/* [Acción secundaria] Abre o ajusta la operación actual. */}
            </button>
        </div>

        <div className="overflow-x-auto border-y border-obsidian-border">
          <table className="w-full min-w-[480px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-obsidian-border text-xs font-semibold text-obsidian-muted">
                <th className="px-3 py-2.5">{t('mitm6.kind')}</th>
                <th className="px-3 py-2.5">{t('mitm6.domain')}</th>
                <th className="px-3 py-2.5">{t('mitm6.src')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-obsidian-border/70">
              {mitm6Events.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-left sm:text-center text-xs text-obsidian-muted">
                    {t('console.empty')}
                  </td>
                </tr>
              ) : (
                mitm6Events.map((ev, idx) => (
                  <tr key={ev.id || `${ev.qtype}-${ev.name}-${ev.src}-${idx}`} className="hover:bg-obsidian-surface/60">
                    <td className="px-3 py-2 font-mono">
                      <span className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-0.5 text-[11px] font-semibold text-obsidian-muted">
                        {ev.qtype}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-white break-all">{ev.name}</td>
                    <td className="px-3 py-2 font-mono text-obsidian-muted break-all">{ev.src}</td>
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
