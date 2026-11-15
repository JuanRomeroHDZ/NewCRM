import React, { useState } from 'react';
import { Bug, Loader2, Radar, ScanSearch } from 'lucide-react';
import { useVault } from '../../../context/VaultContext';
import { useC2 } from '../../../context/C2Context';
import { c2Api } from '../../../lib/c2Api';
import { ExploitsResultsList } from '../ExploitsResultsList';

export const PortsPanel: React.FC = () => {
  const { showToast } = useVault();
  const {
    lang,
    t,
    portIp,
    setPortIp,
    portScanIp,
    setPortScanIp,
    portResults,
    setPortResults,
    exploitResults,
    setExploitResults,
    addLog,
  } = useC2();

  const [portRange, setPortRange] = useState('');
  const [mode, setMode] = useState<'connect' | 'syn'>('connect');
  const [lowNoise, setLowNoise] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [checkingExploits, setCheckingExploits] = useState(false);
  const [exploitsStatus, setExploitsStatus] = useState('');
  const [exploitsVisible, setExploitsVisible] = useState(false);

  const handleRunPortscan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const ip = portIp.trim();
    if (!ip) {
      const msg = lang === 'es' ? 'Falta IP objetivo' : 'Target IP is required';
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }

    setScanning(true);
    setPortResults([]);
    setExploitResults([]);
    setExploitsVisible(false);
    setExploitsStatus('');
    addLog(
      'info',
      t('ports.scanning', { ip, mode: `${mode}${lowNoise ? '/low-noise' : ''}` })
    );

    try {
      const res = await c2Api.runPortscan({
        ip,
        ports: portRange.trim() || null,
        mode,
        low_noise: lowNoise,
      });
      const open = Array.isArray(res.open) ? res.open.map((o) => ({ ...o, ip })) : [];
      setPortScanIp(ip);
      setPortResults(open);
      addLog('info', t('ports.open', { n: open.length, ip }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Port scan failed';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleCheckExploits = async () => {
    const ip = portIp.trim();
    if (!ip) {
      const msg = lang === 'es' ? 'Falta IP objetivo' : 'Target IP is required';
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }

    const services =
      portScanIp === ip || (!portScanIp && portResults.length > 0) ? portResults : [];
    if (services.length === 0) {
      const msg =
        lang === 'es'
          ? 'No hay puertos escaneados aún para esta IP. Ejecuta el escaneo primero.'
          : 'No scanned ports cached for this IP. Run a port scan first.';
      addLog('info', msg);
      showToast(msg, 'info');
      return;
    }

    setCheckingExploits(true);
    setExploitsStatus(lang === 'es' ? 'Buscando...' : 'Searching...');
    try {
      const res = await c2Api.checkExploits({
        ip,
        services: services.map((s) => ({ ...s, ip })),
      });
      const results = res.results || [];
      setExploitResults(results);
      setExploitsVisible(true);
      if (results.length > 0) {
        setExploitsStatus(
          lang === 'es'
            ? `${results.length} grupo(s) con resultados`
            : `${results.length} matching group(s)`
        );
        addLog(
          'info',
          lang === 'es'
            ? `Exploits: ${results.length} servicio(s) con coincidencias`
            : `Exploits: ${results.length} matching service(s)`
        );
      } else {
        setExploitsStatus(lang === 'es' ? 'Sin resultados' : 'No results');
        addLog('info', lang === 'es' ? 'Sin exploits encontrados' : 'No exploits found');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Exploit check failed';
      setExploitsStatus('Error');
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setCheckingExploits(false);
    }
  };

  const showExploits = exploitsVisible || exploitResults.length > 0;

  return (
    <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <ScanSearch size={18} className="text-obsidian-gold" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold text-white">{t('ports.title')}</h2>
            {portResults.length > 0 && (
              <span className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-0.5 font-mono text-[11px] text-emerald-300">
                {portResults.length}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-obsidian-muted">{t('ports.hint')}</p>
        </div>
      </div>

      <form
        onSubmit={(e) => void handleRunPortscan(e)}
        className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-obsidian-border bg-obsidian-surface/60 p-3.5 sm:grid-cols-2 lg:grid-cols-12 lg:items-end"
      >
        <div className="lg:col-span-3">
          <label htmlFor="c2-port-ip" className="block text-[11px] font-medium text-obsidian-muted">
            {t('ports.ipPh')}
          </label>
          <input
            id="c2-port-ip"
            type="text"
            value={portIp}
            onChange={(e) => setPortIp(e.target.value)}
            placeholder="10.10.20.10"
            className="mt-1 min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-panel px-3 py-2 font-mono text-xs text-white placeholder:text-obsidian-muted focus:border-obsidian-gold focus:outline-none"
          />
        </div>

        <div className="lg:col-span-4">
          <label
            htmlFor="c2-port-range"
            className="block text-[11px] font-medium text-obsidian-muted"
          >
            {lang === 'es' ? 'Rango de puertos' : 'Port range'}
          </label>
          <input
            id="c2-port-range"
            type="text"
            value={portRange}
            onChange={(e) => setPortRange(e.target.value)}
            placeholder={t('ports.rangePh')}
            className="mt-1 min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-panel px-3 py-2 font-mono text-xs text-white placeholder:text-obsidian-muted focus:border-obsidian-gold focus:outline-none"
          />
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="c2-port-mode" className="block text-[11px] font-medium text-obsidian-muted">
            {lang === 'es' ? 'Modo' : 'Mode'}
          </label>
          <select
            id="c2-port-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'connect' | 'syn')}
            className="mt-1 min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-panel px-3 py-2 font-mono text-xs text-white focus:border-obsidian-gold focus:outline-none"
          >
            <option value="connect">connect</option>
            <option value="syn">syn</option>
          </select>
        </div>

        <div className="flex items-center lg:col-span-3 lg:pb-1">
          <label
            htmlFor="c2-port-lownoise"
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-obsidian-border bg-obsidian-panel px-3 py-2 text-xs text-obsidian-text"
          >
            <input
              id="c2-port-lownoise"
              type="checkbox"
              checked={lowNoise}
              onChange={(e) => setLowNoise(e.target.checked)}
              className="h-4 w-4 accent-amber-500"
            />
            <span>{t('ports.low')}</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-12">
          <button
            type="submit"
            disabled={scanning}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-gold"
          >
            {scanning ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <Radar size={15} aria-hidden="true" />
            )}
            <span>{scanning ? t('topo.scanning') : t('ports.go')}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleCheckExploits()}
            disabled={checkingExploits}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-obsidian-border bg-obsidian-panel px-4 py-2 text-xs font-semibold text-obsidian-text transition-colors hover:border-obsidian-gold hover:text-white disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-gold"
          >
            {checkingExploits ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <Bug size={15} className="text-obsidian-gold" aria-hidden="true" />
            )}
            <span>{lang === 'es' ? 'Buscar exploits' : 'Search exploits'}</span>
          </button>

          {exploitsStatus && (
            <span className="font-mono text-xs text-obsidian-muted" role="status">
              {exploitsStatus}
            </span>
          )}
        </div>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-obsidian-border bg-obsidian-surface/60">
        <table className="w-full min-w-[520px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-obsidian-border bg-obsidian-surface text-[11px] font-semibold uppercase tracking-wider text-obsidian-muted">
              <th scope="col" className="px-3 py-2.5">{t('ports.port')}</th>
              <th scope="col" className="px-3 py-2.5">{t('ports.service')}</th>
              <th scope="col" className="px-3 py-2.5">{t('ports.banner')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-obsidian-border/70">
            {portResults.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-left sm:text-center text-xs text-obsidian-muted">
                  {lang === 'es'
                    ? 'Sin puertos abiertos registrados aún.'
                    : 'No open ports recorded yet.'}
                </td>
              </tr>
            ) : (
              portResults.map((p, idx) => {
                const portDisplay = p.proto ? `${p.port}/${p.proto}` : String(p.port);
                const bannerDisplay =
                  p.banner || [p.product, p.version].filter(Boolean).join(' ') || '-';
                return (
                  <tr
                    key={`${p.port}-${p.proto || 'tcp'}-${idx}`}
                    className="transition-colors hover:bg-obsidian-panel/70"
                  >
                    <td className="px-3 py-2.5 font-mono font-semibold text-obsidian-gold whitespace-nowrap">
                      {portDisplay}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-white whitespace-nowrap">
                      {p.service || '-'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-obsidian-text break-all">
                      {bannerDisplay}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showExploits && (
        <ExploitsResultsList
          title={
            portScanIp || portIp.trim()
              ? `Exploit-DB (${portScanIp || portIp.trim()})`
              : 'Exploit-DB'
          }
          results={exploitResults}
          statusText={exploitsStatus || undefined}
          emptyText={
            lang === 'es'
              ? 'Sin exploits encontrados con ese producto/versión.'
              : 'No exploits found for that product/version.'
          }
          clearLabel={t('console.clear')}
          onClear={() => {
            setExploitResults([]);
            setExploitsVisible(false);
            setExploitsStatus('');
          }}
        />
      )}
    </section>
  );
};
