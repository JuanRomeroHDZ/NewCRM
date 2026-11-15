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

  const [llmnr, setLlmnr] = useState(true);
  const [nbtns, setNbtns] = useState(true);
  const [mdns, setMdns] = useState(false);
  const [wpad, setWpad] = useState(true);
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
    <div className="space-y-4">
      <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Radio size={18} className="shrink-0 text-obsidian-gold" aria-hidden="true" />
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
              className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-xs text-white transition-colors hover:border-obsidian-borderLight"
            >
              <input
                id={llmnrId}
                type="checkbox"
                checked={llmnr}
                onChange={(e) => setLlmnr(e.target.checked)}
                className="h-4 w-4 rounded border-obsidian-border bg-obsidian-bg accent-obsidian-gold"
              />
              <span>{t('poison.llmnr')}</span>
            </label>

            <label
              htmlFor={nbtnsId}
              className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-xs text-white transition-colors hover:border-obsidian-borderLight"
            >
              <input
                id={nbtnsId}
                type="checkbox"
                checked={nbtns}
                onChange={(e) => setNbtns(e.target.checked)}
                className="h-4 w-4 rounded border-obsidian-border bg-obsidian-bg accent-obsidian-gold"
              />
              <span>{t('poison.nbtns')}</span>
            </label>

            <label
              htmlFor={mdnsId}
              className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-xs text-white transition-colors hover:border-obsidian-borderLight"
            >
              <input
                id={mdnsId}
                type="checkbox"
                checked={mdns}
                onChange={(e) => setMdns(e.target.checked)}
                className="h-4 w-4 rounded border-obsidian-border bg-obsidian-bg accent-obsidian-gold"
              />
              <span>{t('poison.mdns')}</span>
            </label>

            <label
              htmlFor={wpadId}
              className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-xs text-white transition-colors hover:border-obsidian-borderLight"
            >
              <input
                id={wpadId}
                type="checkbox"
                checked={wpad}
                onChange={(e) => setWpad(e.target.checked)}
                className="h-4 w-4 rounded border-obsidian-border bg-obsidian-bg accent-obsidian-gold"
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
                className="min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-obsidian-gold focus:outline-none"
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
                className="min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white focus:border-obsidian-gold focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="submit"
              disabled={busy || isAnyRunning}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-obsidian-gold/50 bg-obsidian-gold/20 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-obsidian-gold/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play size={14} aria-hidden="true" />
              <span>{t('poison.start')}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleStop()}
              disabled={busy || !isAnyRunning}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-obsidian-dangerBg px-4 py-2 text-xs font-semibold text-red-300 transition-colors hover:border-red-400 hover:bg-red-950/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Square size={14} aria-hidden="true" />
              <span>{t('poison.stop')}</span>
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
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
            className="inline-flex min-h-[44px] lg:min-h-10 items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-1.5 text-xs font-medium text-obsidian-muted transition-colors hover:border-obsidian-borderLight hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold"
          >
            <Trash2 size={13} aria-hidden="true" />
            <span>{t('console.clear')}</span>
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-obsidian-border">
          <table className="w-full min-w-[480px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-obsidian-border bg-obsidian-surface text-[11px] font-semibold uppercase tracking-wider text-obsidian-muted">
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
                      <span className="rounded border border-obsidian-gold/35 bg-obsidian-gold/10 px-2 py-0.5 text-[11px] font-semibold text-obsidian-gold">
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
