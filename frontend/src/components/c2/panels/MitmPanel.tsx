import React, { useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
  KeyRound,
  Loader2,
  Play,
  Route,
  Square,
} from 'lucide-react';
import { useVault } from '../../../context/VaultContext';
import { useC2 } from '../../../context/C2Context';
import { c2Api } from '../../../lib/c2Api';

export const MitmPanel: React.FC = () => {
  const { showToast, setActiveSection } = useVault();
  const {
    lang,
    t,
    selectedIface,
    moduleStatus,
    arpTarget,
    setArpTarget,
    arpGateway,
    setArpGateway,
    refreshStatus,
    addLog,
  } = useC2();

  const [busy, setBusy] = useState(false);
  const running = Boolean(moduleStatus.arp);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIface) {
      const msg = t('poison.needIface');
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }
    const targetIp = arpTarget.trim();
    const gatewayIp = arpGateway.trim();
    if (!targetIp || !gatewayIp) {
      const msg =
        lang === 'es'
          ? 'Introduce la IP objetivo y la IP del gateway.'
          : 'Enter both target IP and gateway IP.';
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }

    setBusy(true);
    try {
      await c2Api.startArp({
        interface: selectedIface,
        target_ip: targetIp,
        gateway_ip: gatewayIp,
      });
      await refreshStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start ARP MITM';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await c2Api.stopArp();
      await refreshStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to stop ARP MITM';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <ArrowLeftRight size={18} className="text-obsidian-gold" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold text-white">{t('mitm.title')}</h2>
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
          </div>
          <p className="mt-1.5 text-xs text-obsidian-muted">{t('mitm.hint')}</p>
        </div>
      </div>

      <form
        onSubmit={(e) => void handleStart(e)}
        className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-obsidian-border bg-obsidian-surface/60 p-4 sm:grid-cols-2"
      >
        <div>
          <label
            htmlFor="c2-arp-target"
            className="block text-[11px] font-medium text-obsidian-muted"
          >
            {t('mitm.target')}
          </label>
          <input
            id="c2-arp-target"
            type="text"
            value={arpTarget}
            onChange={(e) => setArpTarget(e.target.value)}
            placeholder="10.10.20.10"
            className="mt-1 min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-panel px-3 py-2 font-mono text-xs text-white placeholder:text-obsidian-muted focus:border-obsidian-gold focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="c2-arp-gateway"
            className="block text-[11px] font-medium text-obsidian-muted"
          >
            {t('mitm.gateway')}
          </label>
          <input
            id="c2-arp-gateway"
            type="text"
            value={arpGateway}
            onChange={(e) => setArpGateway(e.target.value)}
            placeholder="10.10.20.1"
            className="mt-1 min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-panel px-3 py-2 font-mono text-xs text-white placeholder:text-obsidian-muted focus:border-obsidian-gold focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 pt-1">
          <button
            type="submit"
            disabled={busy || running}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-gold"
          >
            {busy && !running ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <Play size={15} aria-hidden="true" />
            )}
            <span>{t('mitm.start')}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleStop()}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-red-500/40 bg-obsidian-dangerBg px-4 py-2 text-xs font-semibold text-red-200 transition-colors hover:border-red-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-gold"
          >
            {busy && running ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <Square size={14} aria-hidden="true" />
            )}
            <span>{t('mitm.stop')}</span>
          </button>
        </div>
      </form>

      {/* Companion module shortcuts */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-obsidian-border bg-obsidian-surface/40 px-3.5 py-3">
        <span className="text-[11px] font-medium text-obsidian-muted">
          {lang === 'es' ? 'Combinar con:' : 'Combine with:'}
        </span>
        <button
          type="button"
          onClick={() => setActiveSection('c2_sniff')}
          className="inline-flex min-h-[44px] lg:min-h-9 items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-panel px-3 py-1.5 text-xs text-obsidian-text transition-colors hover:border-obsidian-gold hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold"
        >
          <Activity size={13} className="text-obsidian-gold" aria-hidden="true" />
          <span>{t('nav.sniff')}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('c2_dns')}
          className="inline-flex min-h-[44px] lg:min-h-9 items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-panel px-3 py-1.5 text-xs text-obsidian-text transition-colors hover:border-obsidian-gold hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold"
        >
          <Route size={13} className="text-obsidian-gold" aria-hidden="true" />
          <span>{t('nav.dns')}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('c2_creds')}
          className="inline-flex min-h-[44px] lg:min-h-9 items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-panel px-3 py-1.5 text-xs text-obsidian-text transition-colors hover:border-obsidian-gold hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold"
        >
          <KeyRound size={13} className="text-obsidian-gold" aria-hidden="true" />
          <span>{t('nav.creds')}</span>
        </button>
      </div>
    </section>
  );
};
