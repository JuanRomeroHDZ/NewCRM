import React, { useId, useState } from 'react';
import { Play, Radio, Square, Trash2 } from 'lucide-react';
import { useC2 } from '../../../context/C2Context';
import { useVault } from '../../../context/VaultContext';
import { c2Api } from '../../../lib/c2Api';

export const PoisonersPanel: React.FC = () => {
  const {
    t,
    selectedIface,
    moduleStatus,
    poisonEvents,
    clearPoisonEvents,
    addLog,
    refreshStatus,
  } = useC2();
  const { showToast } = useVault();

  const [llmnr, setLlmnr] = useState(false);
  const [nbtns, setNbtns] = useState(false);
  const [mdns, setMdns] = useState(false);
  const [wpad, setWpad] = useState(false);
  const [spoofIp, setSpoofIp] = useState('');
  const [proxyPort, setProxyPort] = useState('3128');
  const [busy, setBusy] = useState(false);

  const llmnrId = useId();
  const nbtnsId = useId();
  const mdnsId = useId();
  const wpadId = useId();
  const spoofIpId = useId();
  const proxyPortId = useId();

  const isPoisonRunning = Boolean(moduleStatus.poison);
  const isWpadRunning = Boolean(moduleStatus.wpad);
  const isAnyRunning = isPoisonRunning || isWpadRunning;

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
      await c2Api.startPoison({
        interface: selectedIface,
        spoof_ip: spoofIp.trim() || null,
        llmnr,
        nbtns,
        mdns,
      });
      if (wpad) {
        const parsedPort = Number.parseInt(proxyPort, 10);
        await c2Api.startWpad({
          interface: selectedIface,
          proxy_port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3128,
        });
      }
      addLog('poison', t('poison.started'));
      showToast(t('poison.started'), 'success');
      await refreshStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start poisoners';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      const results = await Promise.allSettled([c2Api.stopPoison(), c2Api.stopWpad()]);
      for (const result of results) {
        if (result.status === 'rejected') {
          const msg = result.reason instanceof Error ? result.reason.message : 'Error stopping poisoner';
          addLog('error', msg);
        }
      }
      addLog('poison', t('poison.stopped'));
      showToast(t('poison.stopped'), 'info');
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-w-0">
      <section className="border-t border-obsidian-border py-4 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Radio size={18} className="shrink-0 text-obsidian-muted" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold text-white">{t('poison.title')}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-medium ${
                isPoisonRunning
                  ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                  : 'border-obsidian-border bg-obsidian-surface text-obsidian-muted'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${isPoisonRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}
                aria-hidden="true"
              />
              <span>{t('module.poison')}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-medium ${
                isWpadRunning
                  ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                  : 'border-obsidian-border bg-obsidian-surface text-obsidian-muted'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${isWpadRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}
                aria-hidden="true"
              />
              <span>{t('module.wpad')}</span>
            </span>
          </div>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-obsidian-muted">{t('poison.hint')}</p>

        <form onSubmit={(e) => void handleStart(e)} className="mt-4 max-w-2xl space-y-3.5">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label
              htmlFor={llmnrId}
              className="flex min-h-[44px] cursor-pointer items-center gap-2.5 border-b border-obsidian-border px-1 py-2 text-xs text-white transition-colors hover:text-white"
            >
              <input
                id={llmnrId}
                type="checkbox"
                checked={llmnr}
                onChange={(e) => setLlmnr(e.target.checked)}
                className="h-4 w-4 rounded border-obsidian-border bg-obsidian-bg accent-obsidian-accent"
              />
              <span>{t('poison.llmnr')}</span>
            </label>

            <label
              htmlFor={nbtnsId}
              className="flex min-h-[44px] cursor-pointer items-center gap-2.5 border-b border-obsidian-border px-1 py-2 text-xs text-white transition-colors hover:text-white"
            >
              <input
                id={nbtnsId}
                type="checkbox"
                checked={nbtns}
                onChange={(e) => setNbtns(e.target.checked)}
                className="h-4 w-4 rounded border-obsidian-border bg-obsidian-bg accent-obsidian-accent"
              />
              <span>{t('poison.nbtns')}</span>
            </label>

            <label
              htmlFor={mdnsId}
              className="flex min-h-[44px] cursor-pointer items-center gap-2.5 border-b border-obsidian-border px-1 py-2 text-xs text-white transition-colors hover:text-white"
            >
              <input
                id={mdnsId}
                type="checkbox"
                checked={mdns}
                onChange={(e) => setMdns(e.target.checked)}
                className="h-4 w-4 rounded border-obsidian-border bg-obsidian-bg accent-obsidian-accent"
              />
              <span>{t('poison.mdns')}</span>
            </label>

            <label
              htmlFor={wpadId}
              className="flex min-h-[44px] cursor-pointer items-center gap-2.5 border-b border-obsidian-border px-1 py-2 text-xs text-white transition-colors hover:text-white"
            >
              <input
                id={wpadId}
                type="checkbox"
                checked={wpad}
                onChange={(e) => setWpad(e.target.checked)}
                className="h-4 w-4 rounded border-obsidian-border bg-obsidian-bg accent-obsidian-accent"
              />
              <span>{t('poison.wpad')}</span>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={spoofIpId} className="mb-1.5 block text-xs font-medium text-obsidian-muted">
                {t('poison.ip')}
              </label>
              <input
                id={spoofIpId}
                type="text"
                value={spoofIp}
                onChange={(e) => setSpoofIp(e.target.value)}
                placeholder="192.168.1.50"
                className="min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-obsidian-muted focus:border-obsidian-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent"
              />
            </div>

            <div>
              <label htmlFor={proxyPortId} className="mb-1.5 block text-xs font-medium text-obsidian-muted">
                {t('poison.port')}
              </label>
              <input
                id={proxyPortId}
                type="text"
                inputMode="numeric"
                value={proxyPort}
                onChange={(e) => setProxyPort(e.target.value)}
                disabled={!wpad}
                className="min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white focus:border-obsidian-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="submit"
              disabled={busy || isAnyRunning}
              className="ui-action-primary"
            >
              <Play size={16} aria-hidden="true" />
              <span>{t('poison.start')}</span>
              {/* [Acción principal] Inicia o confirma la operación. */}
            </button>
            <button
              type="button"
              onClick={() => void handleStop()}
              disabled={busy || !isAnyRunning}
              className="ui-action-danger"
            >
              <Square size={16} aria-hidden="true" />
              <span>{t('poison.stop')}</span>
              {/* [Acción destructiva] Detiene o revierte la operación. */}
            </button>
          </div>
        </form>
      </section>

      <section className="border-t border-obsidian-border py-4 sm:py-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-sm font-bold text-white">{t('nav.poison')}</h3>
            <span className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-0.5 font-mono text-[11px] text-obsidian-muted">
              {poisonEvents.length}
            </span>
          </div>
          <button
            type="button"
            onClick={clearPoisonEvents}
            disabled={poisonEvents.length === 0}
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
                <th className="px-3 py-2.5">Proto</th>
                <th className="px-3 py-2.5">{t('poison.name')}</th>
                <th className="px-3 py-2.5">{t('poison.src')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-obsidian-border/70">
              {poisonEvents.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-left sm:text-center text-xs text-obsidian-muted">
                    {t('console.empty')}
                  </td>
                </tr>
              ) : (
                poisonEvents.map((ev, idx) => (
                  <tr key={ev.id || `${ev.proto}-${ev.name}-${ev.src}-${idx}`} className="hover:bg-obsidian-surface/60">
                    <td className="px-3 py-2 font-mono">
                      <span className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-0.5 text-[11px] font-semibold text-obsidian-muted">
                        {ev.proto}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-white break-all">{ev.name}</td>
                    <td className="px-3 py-2 font-mono text-obsidian-muted">{ev.src}</td>
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
