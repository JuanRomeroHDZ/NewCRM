import React, { useState } from 'react';
import { Loader2, Play, Route, Square } from 'lucide-react';
import { useVault } from '../../../context/VaultContext';
import { useC2 } from '../../../context/C2Context';
import { c2Api } from '../../../lib/c2Api';

function parseDomainMapping(raw: string): Record<string, string> {
  const mapping: Record<string, string> = {};
  raw.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) return;
    const domain = trimmed.slice(0, eqIndex).trim();
    const ip = trimmed.slice(eqIndex + 1).trim();
    if (domain && ip) {
      mapping[domain] = ip;
    }
  });
  return mapping;
}

export const DnsPanel: React.FC = () => {
  const { showToast } = useVault();
  const { lang, t, selectedIface, moduleStatus, refreshStatus, addLog } = useC2();

  const [redirectsText, setRedirectsText] = useState('');
  const [spoofAllIp, setSpoofAllIp] = useState('');
  const [busy, setBusy] = useState(false);
  const running = Boolean(moduleStatus.dns);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIface) {
      const msg = t('poison.needIface');
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }

    const mapping = parseDomainMapping(redirectsText);
    const spoofAll = spoofAllIp.trim() || null;

    if (Object.keys(mapping).length === 0 && !spoofAll) {
      const msg =
        lang === 'es'
          ? 'Define al menos una redirección (dominio=IP) o una IP global.'
          : 'Define at least one redirect rule (domain=IP) or a global spoof IP.';
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }

    setBusy(true);
    try {
      await c2Api.startDns({
        interface: selectedIface,
        mapping,
        spoof_all_to: spoofAll,
      });
      await refreshStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start DNS spoofing';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await c2Api.stopDns();
      await refreshStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to stop DNS spoofing';
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
            <Route size={18} className="text-obsidian-gold" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold text-white">{t('dns.title')}</h2>
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
          <p className="mt-1.5 text-xs text-obsidian-muted">{t('dns.hint')}</p>
        </div>
      </div>

      <form
        onSubmit={(e) => void handleStart(e)}
        className="mt-4 space-y-4 rounded-xl border border-obsidian-border bg-obsidian-surface/60 p-4"
      >
        <div>
          <label
            htmlFor="c2-dns-map"
            className="block text-[11px] font-medium text-obsidian-muted"
          >
            {t('dns.map')}
          </label>
          <textarea
            id="c2-dns-map"
            rows={5}
            value={redirectsText}
            onChange={(e) => setRedirectsText(e.target.value)}
            placeholder={'portal.planta.local=10.10.20.50\nscada.local=10.10.20.50'}
            className="mt-1 w-full rounded-lg border border-obsidian-border bg-obsidian-panel p-3 font-mono text-xs text-white placeholder:text-obsidian-muted focus:border-obsidian-gold focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="c2-dns-all"
            className="block text-[11px] font-medium text-obsidian-muted"
          >
            {t('dns.all')}
          </label>
          <input
            id="c2-dns-all"
            type="text"
            value={spoofAllIp}
            onChange={(e) => setSpoofAllIp(e.target.value)}
            placeholder="10.10.20.50"
            className="mt-1 min-h-[44px] w-full max-w-md rounded-lg border border-obsidian-border bg-obsidian-panel px-3 py-2 font-mono text-xs text-white placeholder:text-obsidian-muted focus:border-obsidian-gold focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
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
            <span>{t('dns.start')}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleStop()}
            disabled={busy || !running}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-red-500/40 bg-obsidian-dangerBg px-4 py-2 text-xs font-semibold text-red-200 transition-colors hover:border-red-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-gold"
          >
            {busy && running ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <Square size={14} aria-hidden="true" />
            )}
            <span>{t('dns.stop')}</span>
          </button>
        </div>
      </form>
    </section>
  );
};
