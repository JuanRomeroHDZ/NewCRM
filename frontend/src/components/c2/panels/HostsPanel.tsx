import React, { useState } from 'react';
import {
  Bug,
  Crosshair,
  Cpu,
  Loader2,
  Radar,
  ScanSearch,
  Server,
} from 'lucide-react';
import { useVault } from '../../../context/VaultContext';
import { useC2 } from '../../../context/C2Context';
import { c2Api } from '../../../lib/c2Api';
import type { C2Host } from '../../../types/c2';
import { ExploitsResultsList } from '../ExploitsResultsList';

export const HostsPanel: React.FC = () => {
  const { showToast } = useVault();
  const {
    lang,
    t,
    currentInterface,
    hosts,
    setHosts,
    hostOsMap,
    portResults,
    portScanIp,
    exploitResults,
    setExploitResults,
    arpTarget,
    pinHostTarget,
    scanHostPorts,
    addLog,
  } = useC2();

  const [scanning, setScanning] = useState(false);
  const [fingerprintingIp, setFingerprintingIp] = useState<string | null>(null);
  const [checkingExploitsIp, setCheckingExploitsIp] = useState<string | null>(null);
  const [exploitsCheckedIp, setExploitsCheckedIp] = useState<string | null>(null);

  const handleScanNetwork = async () => {
    if (!currentInterface || !currentInterface.cidr) {
      const msg = t('hosts.noCidr');
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }

    setScanning(true);
    addLog('info', t('hosts.scanning', { cidr: currentInterface.cidr, name: currentInterface.name }));
    try {
      const res = await c2Api.runDiscovery({
        interface: currentInterface.name,
        cidr: currentInterface.cidr,
      });
      const list = res.hosts || [];
      setHosts(list);
      addLog('info', t('hosts.found', { n: list.length }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network discovery failed';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleFingerprint = async (host: C2Host) => {
    setFingerprintingIp(host.ip);
    try {
      const res = await c2Api.runFingerprint({ ip: host.ip, mac: host.mac });
      setHosts((prev) =>
        prev.map((item) =>
          item.ip === host.ip ? { ...item, os: res.os, ttl: res.ttl } : item
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OS fingerprint failed';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setFingerprintingIp(null);
    }
  };

  const handleCheckExploits = async (ip: string) => {
    const cachedPorts = portScanIp === ip ? portResults : [];
    if (cachedPorts.length === 0) {
      const infoMsg =
        lang === 'es'
          ? `Sin puertos guardados para ${ip}. Haz un escaneo de puertos primero.`
          : `No cached ports for ${ip}. Run a port scan first.`;
      addLog('info', infoMsg);
      showToast(infoMsg, 'info');
      scanHostPorts(ip);
      return;
    }

    setCheckingExploitsIp(ip);
    addLog(
      'info',
      lang === 'es'
        ? `Buscando exploits para ${ip} con ${cachedPorts.length} puertos...`
        : `Searching exploits for ${ip} with ${cachedPorts.length} ports...`
    );

    try {
      const res = await c2Api.checkExploits({
        ip,
        services: cachedPorts.map((p) => ({ ...p, ip })),
      });
      const results = res.results || [];
      setExploitResults(results);
      setExploitsCheckedIp(ip);
      if (results.length > 0) {
        addLog(
          'info',
          lang === 'es'
            ? `Exploits encontrados: ${results.length} servicio(s) con coincidencias`
            : `Exploits found: ${results.length} matching service(s)`
        );
      } else {
        addLog(
          'info',
          lang === 'es'
            ? 'Sin exploits encontrados con service+version/banners'
            : 'No exploits found for detected service+version/banners'
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Exploit check failed';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setCheckingExploitsIp(null);
    }
  };

  const handlePinTarget = (ip: string) => {
    pinHostTarget(ip);
    showToast(t('hosts.targetSet', { ip }), 'info');
  };

  const handleClearExploits = () => {
    setExploitResults([]);
    setExploitsCheckedIp(null);
  };

  const showExploitsSection = exploitsCheckedIp !== null || exploitResults.length > 0;

  return (
    <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <Server size={18} className="text-obsidian-gold" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold text-white">{t('hosts.title')}</h2>
            <span className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-0.5 font-mono text-[11px] text-obsidian-muted">
              {hosts.length}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-obsidian-muted">{t('hosts.hint')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentInterface?.cidr && (
            <span className="rounded-lg border border-obsidian-border bg-obsidian-surface px-2.5 py-2 font-mono text-[11px] text-obsidian-muted">
              {currentInterface.name}: {currentInterface.cidr}
            </span>
          )}
          <button
            type="button"
            onClick={() => void handleScanNetwork()}
            disabled={scanning}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-gold"
          >
            {scanning ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <Radar size={15} aria-hidden="true" />
            )}
            <span>{scanning ? t('topo.scanning') : t('hosts.scan')}</span>
          </button>
        </div>
      </div>

      {/* Mobile card list (< md): zero horizontal clipping */}
      <div className="mt-4 space-y-2.5 md:hidden">
        {hosts.length === 0 ? (
          <div className="rounded-xl border border-obsidian-border bg-obsidian-surface/60 px-3 py-5 text-xs text-obsidian-muted">
            {lang === 'es'
              ? 'Sin hosts descubiertos aún. Pulsa Escanear red para lanzar un barrido ARP.'
              : 'No hosts discovered yet. Click Scan network to run an ARP sweep.'}
          </div>
        ) : (
          hosts.map((h) => {
            const liveOs = hostOsMap[h.ip];
            const osName = liveOs?.os || h.os || '-';
            const osTtl = liveOs?.ttl ?? h.ttl;
            const osDisplay =
              osName !== '-' && osTtl !== undefined && osTtl !== null && !/\(TTL\b/i.test(osName)
                ? `${osName} (TTL ${osTtl})`
                : osName;
            const isPinned = arpTarget === h.ip;
            const isFpBusy = fingerprintingIp === h.ip;
            const isExpBusy = checkingExploitsIp === h.ip;

            return (
              <article
                key={`card-${h.ip}-${h.mac}`}
                className={`rounded-xl border p-3 transition-colors ${
                  isPinned
                    ? 'border-obsidian-gold/50 bg-obsidian-gold/5'
                    : 'border-obsidian-border bg-obsidian-surface/70'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-white">{h.ip}</span>
                  <span className="rounded-md bg-emerald-950/40 px-2 py-0.5 font-mono text-[11px] text-emerald-300">
                    {osDisplay}
                  </span>
                </div>
                <div className="mt-1.5 space-y-0.5 text-[11px]">
                  <div className="font-mono text-obsidian-muted">{h.mac}</div>
                  <div className="text-obsidian-text">{h.vendor || '-'}</div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handlePinTarget(h.ip)}
                    aria-pressed={isPinned}
                    className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                      isPinned
                        ? 'border-obsidian-gold bg-obsidian-gold/20 text-amber-200'
                        : 'border-indigo-500/40 bg-indigo-600/20 text-white hover:border-obsidian-gold'
                    }`}
                  >
                    <Crosshair size={13} aria-hidden="true" />
                    <span>{t('hosts.target')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => scanHostPorts(h.ip)}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-panel px-2.5 text-xs font-medium text-obsidian-text hover:border-obsidian-gold hover:text-white"
                  >
                    <ScanSearch size={13} aria-hidden="true" />
                    <span>{t('hosts.ports')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleFingerprint(h)}
                    disabled={isFpBusy}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-panel px-2.5 text-xs font-medium text-obsidian-text hover:border-obsidian-gold hover:text-white disabled:opacity-60"
                  >
                    {isFpBusy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Cpu size={13} aria-hidden="true" />}
                    <span>{t('hosts.osBtn')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCheckExploits(h.ip)}
                    disabled={isExpBusy}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-panel px-2.5 text-xs font-medium text-obsidian-text hover:border-obsidian-gold hover:text-white disabled:opacity-60"
                  >
                    {isExpBusy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Bug size={13} aria-hidden="true" />}
                    <span>Exploits</span>
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Desktop data table (>= md) */}
      <div className="mt-4 hidden md:block overflow-x-auto rounded-xl border border-obsidian-border bg-obsidian-surface/60">
        <table className="w-full min-w-[660px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-obsidian-border bg-obsidian-surface text-[11px] font-semibold uppercase tracking-wider text-obsidian-muted">
              <th scope="col" className="px-3 py-2.5">IP</th>
              <th scope="col" className="px-3 py-2.5">MAC</th>
              <th scope="col" className="px-3 py-2.5">{t('hosts.vendor')}</th>
              <th scope="col" className="px-3 py-2.5">{t('hosts.os')}</th>
              <th scope="col" className="px-3 py-2.5 text-right">{t('hosts.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-obsidian-border/70">
            {hosts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-left sm:text-center text-xs text-obsidian-muted">
                  {lang === 'es'
                    ? 'Sin hosts descubiertos aún. Pulsa Escanear red para lanzar un barrido ARP.'
                    : 'No hosts discovered yet. Click Scan network to run an ARP sweep.'}
                </td>
              </tr>
            ) : (
              hosts.map((h) => {
                const liveOs = hostOsMap[h.ip];
                const osName = liveOs?.os || h.os || '-';
                const osTtl = liveOs?.ttl ?? h.ttl;
                const osDisplay =
                  osName !== '-' && osTtl !== undefined && osTtl !== null && !/\(TTL\b/i.test(osName)
                    ? `${osName} (TTL ${osTtl})`
                    : osName;
                const isPinned = arpTarget === h.ip;
                const isFpBusy = fingerprintingIp === h.ip;
                const isExpBusy = checkingExploitsIp === h.ip;
                const hasCachedPorts = portScanIp === h.ip && portResults.length > 0;

                return (
                  <tr
                    key={`${h.ip}-${h.mac}`}
                    className={`transition-colors hover:bg-obsidian-panel/70 ${
                      isPinned ? 'bg-obsidian-gold/5' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 font-mono text-white whitespace-nowrap">{h.ip}</td>
                    <td className="px-3 py-2.5 font-mono text-obsidian-muted whitespace-nowrap">{h.mac}</td>
                    <td className="px-3 py-2.5 text-obsidian-text">{h.vendor || '-'}</td>
                    <td className="px-3 py-2.5 font-mono text-emerald-300">{osDisplay}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handlePinTarget(h.ip)}
                          aria-pressed={isPinned}
                          className={`inline-flex min-h-[44px] lg:min-h-9 items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold ${
                            isPinned
                              ? 'border-obsidian-gold bg-obsidian-gold/20 text-amber-200'
                              : 'border-indigo-500/40 bg-indigo-600/20 text-white hover:border-obsidian-gold hover:bg-obsidian-surface'
                          }`}
                        >
                          <Crosshair size={12} aria-hidden="true" />
                          <span>{t('hosts.target')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => scanHostPorts(h.ip)}
                          className="inline-flex min-h-[44px] lg:min-h-9 items-center gap-1 rounded-lg border border-obsidian-border bg-obsidian-panel px-2.5 py-1 text-[11px] font-medium text-obsidian-text transition-colors hover:border-obsidian-gold hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold"
                        >
                          <ScanSearch size={12} aria-hidden="true" />
                          <span>{t('hosts.ports')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleFingerprint(h)}
                          disabled={isFpBusy}
                          className="inline-flex min-h-[44px] lg:min-h-9 items-center gap-1 rounded-lg border border-obsidian-border bg-obsidian-panel px-2.5 py-1 text-[11px] font-medium text-obsidian-text transition-colors hover:border-obsidian-gold hover:text-white disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold"
                        >
                          {isFpBusy ? (
                            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                          ) : (
                            <Cpu size={12} aria-hidden="true" />
                          )}
                          <span>{t('hosts.osBtn')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleCheckExploits(h.ip)}
                          disabled={isExpBusy}
                          title={
                            hasCachedPorts
                              ? `${portResults.length} cached ports`
                              : lang === 'es'
                              ? 'Ir a Puertos si no hay escaneo previo'
                              : 'Switches to Ports if not scanned yet'
                          }
                          className="inline-flex min-h-[44px] lg:min-h-9 items-center gap-1 rounded-lg border border-obsidian-border bg-obsidian-panel px-2.5 py-1 text-[11px] font-medium text-obsidian-text transition-colors hover:border-obsidian-gold hover:text-white disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold"
                        >
                          {isExpBusy ? (
                            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                          ) : (
                            <Bug size={12} aria-hidden="true" />
                          )}
                          <span>Exploits</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showExploitsSection && (
        <ExploitsResultsList
          title={
            exploitsCheckedIp
              ? `Exploit-DB / Searchsploit (${exploitsCheckedIp})`
              : 'Exploit-DB / Searchsploit'
          }
          results={exploitResults}
          emptyText={
            lang === 'es'
              ? 'Sin exploits encontrados con ese producto/versión.'
              : 'No exploits found for that product/version.'
          }
          clearLabel={t('console.clear')}
          onClear={handleClearExploits}
        />
      )}
    </section>
  );
};
