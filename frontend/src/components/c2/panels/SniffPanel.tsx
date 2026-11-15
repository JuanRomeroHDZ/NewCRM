import React, { useState } from 'react';
import { Activity, Loader2, Play, Square, Trash2 } from 'lucide-react';
import { useVault } from '../../../context/VaultContext';
import { useC2 } from '../../../context/C2Context';
import { c2Api } from '../../../lib/c2Api';

export const SniffPanel: React.FC = () => {
  const { showToast } = useVault();
  const {
    lang,
    t,
    selectedIface,
    moduleStatus,
    sniffPackets,
    clearSniffPackets,
    refreshStatus,
    addLog,
  } = useC2();

  const [bpf, setBpf] = useState('');
  const [busy, setBusy] = useState(false);
  const running = Boolean(moduleStatus.sniffer);

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
      await c2Api.startSniff({
        interface: selectedIface,
        bpf: bpf.trim() || null,
      });
      await refreshStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start packet sniffer';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await c2Api.stopSniff();
      await refreshStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to stop packet sniffer';
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
            <Activity size={18} className="text-obsidian-gold" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold text-white">{t('sniff.title')}</h2>
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
              {sniffPackets.length}/200
            </span>
          </div>
        </div>
      </div>

      <form
        onSubmit={(e) => void handleStart(e)}
        className="mt-4 flex flex-col gap-3 rounded-xl border border-obsidian-border bg-obsidian-surface/60 p-3.5 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label
            htmlFor="c2-sniff-bpf"
            className="block text-[11px] font-medium text-obsidian-muted"
          >
            {t('sniff.bpf')}
          </label>
          <input
            id="c2-sniff-bpf"
            type="text"
            value={bpf}
            onChange={(e) => setBpf(e.target.value)}
            placeholder={t('sniff.bpfPh')}
            className="mt-1 min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-panel px-3 py-2 font-mono text-xs text-white placeholder:text-obsidian-muted focus:border-obsidian-gold focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
            <span>{t('sniff.start')}</span>
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
            <span>{t('sniff.stop')}</span>
          </button>

          <button
            type="button"
            onClick={clearSniffPackets}
            disabled={sniffPackets.length === 0}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-panel px-3 py-2 text-xs font-medium text-obsidian-muted transition-colors hover:border-obsidian-gold hover:text-white disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-gold"
          >
            <Trash2 size={14} aria-hidden="true" />
            <span>{t('console.clear')}</span>
          </button>
        </div>
      </form>

      <div className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-obsidian-border bg-obsidian-surface/60">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-obsidian-surface">
            <tr className="border-b border-obsidian-border text-[11px] font-semibold uppercase tracking-wider text-obsidian-muted">
              <th scope="col" className="px-3 py-2.5">
                {lang === 'es' ? 'Proto' : 'Proto'}
              </th>
              <th scope="col" className="px-3 py-2.5">{t('sniff.src')}</th>
              <th scope="col" className="px-3 py-2.5">{t('sniff.dst')}</th>
              <th scope="col" className="px-3 py-2.5">{t('sniff.ports')}</th>
              <th scope="col" className="px-3 py-2.5">Info</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-obsidian-border/70">
            {sniffPackets.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-left sm:text-center text-xs text-obsidian-muted">
                  {lang === 'es'
                    ? 'Sin paquetes capturados aún.'
                    : 'No packets captured yet.'}
                </td>
              </tr>
            ) : (
              sniffPackets.map((pkt, idx) => {
                const hasPorts =
                  (pkt.sport !== undefined && pkt.sport !== null && pkt.sport !== '') ||
                  (pkt.dport !== undefined && pkt.dport !== null && pkt.dport !== '');
                const portsText = hasPorts
                  ? `${pkt.sport ?? ''} -> ${pkt.dport ?? ''}`.trim()
                  : '-';
                return (
                  <tr
                    key={pkt.id || `${pkt.proto}-${pkt.src}-${pkt.dst}-${idx}`}
                    className="transition-colors hover:bg-obsidian-panel/70"
                  >
                    <td className="px-3 py-2 font-mono font-semibold text-obsidian-gold whitespace-nowrap">
                      {pkt.proto || '-'}
                    </td>
                    <td className="px-3 py-2 font-mono text-white whitespace-nowrap">
                      {pkt.src || '-'}
                    </td>
                    <td className="px-3 py-2 font-mono text-obsidian-text whitespace-nowrap">
                      {pkt.dst || '-'}
                    </td>
                    <td className="px-3 py-2 font-mono text-emerald-300 whitespace-nowrap">
                      {portsText}
                    </td>
                    <td className="px-3 py-2 font-mono text-obsidian-muted break-all">
                      {pkt.info || '-'}
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
