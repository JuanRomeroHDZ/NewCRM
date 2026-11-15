import React, { useId, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileCode2,
  KeyRound,
  Play,
  Radio,
  RefreshCw,
  ShieldAlert,
  Square,
  Wifi,
  Zap,
} from 'lucide-react';
import { useC2 } from '../../../context/C2Context';
import { useVault } from '../../../context/VaultContext';
import { c2Api } from '../../../lib/c2Api';

export const WifiPanel: React.FC = () => {
  const {
    t,
    selectedIface,
    setSelectedIface,
    moduleStatus,
    wifiIfaces,
    wifiAps,
    wifiClients,
    handshakes,
    wifiCaptures,
    deauthBssid,
    setDeauthBssid,
    deauthChannel,
    setDeauthChannel,
    deauthClient,
    setDeauthClient,
    pmkidBssid,
    setPmkidBssid,
    pmkidChannel,
    setPmkidChannel,
    clearWifiScanState,
    selectWifiApForDeauth,
    selectWifiApForPmkid,
    refreshInterfaces,
    refreshStatus,
    refreshWifiCaptures,
    refreshWifiIfaces,
    addLog,
  } = useC2();
  const { confirm, showToast } = useVault();

  const [prepare, setPrepare] = useState(false);
  const [lowNoise, setLowNoise] = useState(true);
  const [broadcast, setBroadcast] = useState(false);
  const [pmkidAuto, setPmkidAuto] = useState(false);
  const [hsChannel, setHsChannel] = useState('');
  const [hsBssid, setHsBssid] = useState('');
  const [hsAuto, setHsAuto] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const prepareId = useId();
  const deauthBssidId = useId();
  const deauthClientId = useId();
  const deauthChannelId = useId();
  const deauthLowNoiseId = useId();
  const deauthBroadcastId = useId();
  const pmkidBssidId = useId();
  const pmkidChannelId = useId();
  const pmkidAutoId = useId();
  const hsChannelId = useId();
  const hsBssidId = useId();
  const hsAutoId = useId();

  const currentWifiMode = useMemo(() => {
    if (!selectedIface) return '-';
    const match = wifiIfaces.find((item) =>
      typeof item === 'string' ? item === selectedIface : item.name === selectedIface
    );
    if (!match || typeof match === 'string') return '?';
    return match.mode || '?';
  }, [wifiIfaces, selectedIface]);

  const apByBssid = useMemo(() => {
    const map = new Map<string, (typeof wifiAps)[number]>();
    for (const ap of wifiAps) {
      map.set(ap.bssid.toLowerCase(), ap);
    }
    return map;
  }, [wifiAps]);

  const filteredClients = useMemo(() => {
    const bssid = deauthBssid.trim().toLowerCase();
    if (!bssid) return [];
    return wifiClients.filter((c) => c.bssid.toLowerCase() === bssid);
  }, [wifiClients, deauthBssid]);

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setBusyAction(key);
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Wi-Fi action failed';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleMonitorStart = () =>
    void runAction('mon-start', async () => {
      const res = await c2Api.startWifiMonitor({ interface: selectedIface, prepare: true });
      const activeName = res.interface || selectedIface;
      addLog('wifi', t('wifi.monitorOn', { iface: activeName }));
      showToast(t('wifi.monitorOn', { iface: activeName }), 'success');
      await refreshInterfaces();
      if (res.interface) setSelectedIface(res.interface);
      await refreshWifiIfaces();
    });

  const handleMonitorStop = () =>
    void runAction('mon-stop', async () => {
      const res = await c2Api.stopWifiMonitor({ interface: selectedIface, prepare: true });
      const activeName = res.interface || selectedIface;
      addLog('wifi', t('wifi.managedOn', { iface: activeName }));
      showToast(t('wifi.managedOn', { iface: activeName }), 'info');
      await refreshInterfaces();
      if (res.interface) setSelectedIface(res.interface);
      await refreshWifiIfaces();
    });

  const handleKillServices = () =>
    void runAction('kill', async () => {
      const res = await c2Api.killWifiInterferers();
      const msg = res.message || t('wifi.stoppedSvcs', { list: (res.stopped || []).join(', ') });
      addLog('wifi', msg);
      showToast(msg, 'info');
    });

  const handleRestoreServices = () =>
    void runAction('restore', async () => {
      const res = await c2Api.restoreWifiServices();
      const msg = res.message || t('wifi.restoredSvcs', { list: (res.started || []).join(', ') });
      addLog('wifi', msg);
      showToast(msg, 'info');
    });

  const handleScanStart = () =>
    void runAction('scan-start', async () => {
      clearWifiScanState();
      await c2Api.startWifiScan({ interface: selectedIface, prepare });
      await refreshStatus();
    });

  const handleScanStop = () =>
    void runAction('scan-stop', async () => {
      await c2Api.stopWifiScan();
      await refreshStatus();
    });

  const handleDeauthStart = async (e: React.FormEvent) => {
    e.preventDefault();
    let clientTarget = deauthClient;
    if (broadcast) {
      const accepted = await confirm({
        title: t('wifi.deauthTitle'),
        message: t('wifi.broadcastConfirm'),
        confirmLabel: t('wifi.deauthStart'),
        tone: 'danger',
      });
      if (!accepted) return;
      clientTarget = 'ff:ff:ff:ff:ff:ff';
    } else if (!clientTarget) {
      const msg = t('wifi.chooseDetectedClient');
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }

    await runAction('deauth-start', async () => {
      const ch = Number.parseInt(deauthChannel, 10);
      await c2Api.startWifiDeauth({
        interface: selectedIface,
        bssid: deauthBssid.trim(),
        client: clientTarget,
        channel: Number.isFinite(ch) ? ch : null,
        prepare,
        low_noise: lowNoise,
        broadcast,
      });
      await refreshStatus();
      showToast(t('wifi.deauthStart'), 'warning');
    });
  };

  const handleDeauthStop = () =>
    void runAction('deauth-stop', async () => {
      await c2Api.stopWifiDeauth();
      await refreshStatus();
    });

  const handlePmkidStart = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction('pmkid-start', async () => {
      const ch = Number.parseInt(pmkidChannel, 10);
      await c2Api.startWifiPmkid({
        interface: selectedIface,
        bssid: pmkidBssid.trim(),
        channel: Number.isFinite(ch) ? ch : null,
        auto_convert: pmkidAuto,
        prepare,
      });
      await refreshStatus();
    });
  };

  const handlePmkidStop = () =>
    void runAction('pmkid-stop', async () => {
      await c2Api.stopWifiPmkid();
      await refreshStatus();
    });

  const handleHandshakeStart = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction('hs-start', async () => {
      const ch = Number.parseInt(hsChannel, 10);
      await c2Api.startWifiHandshake({
        interface: selectedIface,
        bssid: hsBssid.trim(),
        channel: Number.isFinite(ch) ? ch : null,
        auto_convert: hsAuto,
        prepare,
      });
      await refreshStatus();
    });
  };

  const handleHandshakeStop = () =>
    void runAction('hs-stop', async () => {
      await c2Api.stopWifiHandshake();
      await refreshStatus();
    });

  const handleConvertCapture = (fileName: string) =>
    void runAction(`convert:${fileName}`, async () => {
      addLog('info', t('wifi.converting', { name: fileName }));
      const res = await c2Api.convertWifiCapture(fileName);
      if (res.ok) {
        const msg = t('wifi.converted', { file: res.file, hashes: res.hashes });
        addLog('cred', msg);
        showToast(msg, 'success');
      } else {
        const msg = t('wifi.noHs', { name: fileName, log: res.log || '' });
        addLog('error', msg);
        showToast(msg, 'warning');
      }
      await refreshWifiCaptures();
    });

  const handleDownloadCapture = (fileName: string) =>
    void runAction(`download:${fileName}`, async () => {
      await c2Api.downloadWifiCaptureBlob(fileName);
    });

  return (
    <div className="space-y-4">
      {/* Interface Mode & Scan Controls */}
      <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Wifi size={18} className="shrink-0 text-obsidian-gold" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold text-white">{t('wifi.title')}</h2>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-medium ${
              moduleStatus.wifi_scan
                ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                : 'border-obsidian-border bg-obsidian-surface text-obsidian-muted'
            }`}
          >
            <Radio size={12} aria-hidden="true" />
            <span>{moduleStatus.wifi_scan ? t('module.wifi_scan') : t('modules.none')}</span>
          </span>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-obsidian-muted">{t('wifi.hint')}</p>

        {/* Interface mode card */}
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-obsidian-border bg-obsidian-surface p-3.5 sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-obsidian-muted">
              {t('wifi.iface')}
            </span>
            <strong className="font-mono text-sm text-white">{selectedIface || '-'}</strong>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-obsidian-muted">
              {t('wifi.mode')}
            </span>
            <div>
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs font-semibold ${
                  currentWifiMode.toLowerCase() === 'monitor'
                    ? 'border-obsidian-gold/50 bg-obsidian-gold/15 text-obsidian-gold'
                    : 'border-obsidian-border bg-obsidian-panel text-slate-200'
                }`}
              >
                {currentWifiMode}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3.5 space-y-3">
          <label
            htmlFor={prepareId}
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-xs text-white transition-colors hover:border-obsidian-borderLight"
          >
            <input
              id={prepareId}
              type="checkbox"
              checked={prepare}
              onChange={(e) => setPrepare(e.target.checked)}
              className="h-4 w-4 rounded border-obsidian-border bg-obsidian-bg accent-obsidian-gold"
            />
            <span>{t('wifi.prepare')}</span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleMonitorStart}
              disabled={busyAction !== null}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-obsidian-gold/50 bg-obsidian-gold/20 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-obsidian-gold/30 disabled:opacity-50"
            >
              <Radio size={14} aria-hidden="true" />
              <span>{t('wifi.mon')}</span>
            </button>
            <button
              type="button"
              onClick={handleMonitorStop}
              disabled={busyAction !== null}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-red-500/40 bg-obsidian-dangerBg px-3.5 py-2 text-xs font-semibold text-red-300 transition-colors hover:border-red-400 hover:bg-red-950/60 disabled:opacity-50"
            >
              <Square size={14} aria-hidden="true" />
              <span>{t('wifi.managed')}</span>
            </button>
            <button
              type="button"
              onClick={handleKillServices}
              disabled={busyAction !== null}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-xs font-medium text-obsidian-muted transition-colors hover:border-obsidian-borderLight hover:text-white disabled:opacity-50"
            >
              <span>{t('wifi.kill')}</span>
            </button>
            <button
              type="button"
              onClick={handleRestoreServices}
              disabled={busyAction !== null}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-xs font-medium text-obsidian-muted transition-colors hover:border-obsidian-borderLight hover:text-white disabled:opacity-50"
            >
              <span>{t('wifi.restore')}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleScanStart}
              disabled={busyAction !== null || Boolean(moduleStatus.wifi_scan)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-4 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-950/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play size={14} aria-hidden="true" />
              <span>{t('wifi.scan')}</span>
            </button>
            <button
              type="button"
              onClick={handleScanStop}
              disabled={busyAction !== null || !moduleStatus.wifi_scan}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-red-500/40 bg-obsidian-dangerBg px-4 py-2 text-xs font-semibold text-red-300 transition-colors hover:border-red-400 hover:bg-red-950/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Square size={14} aria-hidden="true" />
              <span>{t('wifi.scanStop')}</span>
            </button>
          </div>
        </div>
      </section>

      {/* AP Scan Table */}
      <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-heading text-sm font-bold text-white">APs</h3>
          <span className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-0.5 font-mono text-[11px] text-obsidian-muted">
            {wifiAps.length}
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-obsidian-border">
          <table className="w-full min-w-[600px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-obsidian-border bg-obsidian-surface text-[11px] font-semibold uppercase tracking-wider text-obsidian-muted">
                <th className="px-3 py-2.5">SSID</th>
                <th className="px-3 py-2.5">BSSID</th>
                <th className="px-3 py-2.5">{t('wifi.channel')}</th>
                <th className="px-3 py-2.5">{t('wifi.signal')}</th>
                <th className="px-3 py-2.5">{t('wifi.enc')}</th>
                <th className="px-3 py-2.5 text-right">{t('wifi.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-obsidian-border/70">
              {wifiAps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-5 text-left sm:text-center text-xs text-obsidian-muted">
                    {t('console.empty')}
                  </td>
                </tr>
              ) : (
                wifiAps.map((ap) => (
                  <tr key={ap.bssid} className="hover:bg-obsidian-surface/60">
                    <td className="px-3 py-2 font-medium text-white">{ap.ssid || '<hidden>'}</td>
                    <td className="px-3 py-2 font-mono text-slate-200">{ap.bssid}</td>
                    <td className="px-3 py-2 font-mono text-obsidian-muted">{ap.channel ?? '?'}</td>
                    <td className="px-3 py-2 font-mono text-obsidian-muted">{ap.signal ?? '?'}</td>
                    <td className="px-3 py-2 font-mono text-obsidian-muted">{ap.enc || '-'}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => selectWifiApForDeauth(ap.bssid, ap.channel)}
                          className="min-h-[44px] lg:min-h-10 rounded-lg border border-red-500/40 bg-obsidian-dangerBg px-2.5 py-1 text-[11px] font-semibold text-red-300 transition-colors hover:border-red-400 hover:bg-red-950/60"
                        >
                          Deauth
                        </button>
                        <button
                          type="button"
                          onClick={() => selectWifiApForPmkid(ap.bssid, ap.channel, ap.ssid)}
                          className="min-h-[44px] lg:min-h-10 rounded-lg border border-obsidian-border bg-obsidian-surface px-2.5 py-1 text-[11px] font-semibold text-obsidian-gold transition-colors hover:border-obsidian-gold/60"
                        >
                          PMKID
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detected Clients Table */}
      <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-heading text-sm font-bold text-white">{t('wifi.clientsTitle')}</h3>
          <span className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-0.5 font-mono text-[11px] text-obsidian-muted">
            {wifiClients.length}
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-obsidian-border">
          <table className="w-full min-w-[560px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-obsidian-border bg-obsidian-surface text-[11px] font-semibold uppercase tracking-wider text-obsidian-muted">
                <th className="px-3 py-2.5">{t('wifi.clientAp')}</th>
                <th className="px-3 py-2.5">{t('wifi.client')}</th>
                <th className="px-3 py-2.5">{t('wifi.signal')}</th>
                <th className="px-3 py-2.5">{t('wifi.channel')}</th>
                <th className="px-3 py-2.5 text-right">{t('wifi.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-obsidian-border/70">
              {wifiClients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-5 text-left sm:text-center text-xs text-obsidian-muted">
                    {t('console.empty')}
                  </td>
                </tr>
              ) : (
                wifiClients.map((client) => {
                  const ap = apByBssid.get(client.bssid.toLowerCase());
                  const apLabel =
                    ap?.ssid && ap.ssid !== '<oculto>' ? `${ap.ssid} - ${client.bssid}` : client.bssid;
                  const channelVal = client.channel ?? ap?.channel;
                  return (
                    <tr key={`${client.bssid}-${client.client}`} className="hover:bg-obsidian-surface/60">
                      <td className="px-3 py-2 font-mono text-white">{apLabel}</td>
                      <td className="px-3 py-2 font-mono text-slate-200">{client.client}</td>
                      <td className="px-3 py-2 font-mono text-obsidian-muted">
                        {client.signal == null ? '-' : `${client.signal} dBm`}
                      </td>
                      <td className="px-3 py-2 font-mono text-obsidian-muted">{channelVal ?? '-'}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setDeauthBssid(client.bssid);
                            if (channelVal != null) setDeauthChannel(String(channelVal));
                            setDeauthClient(client.client.toLowerCase());
                          }}
                          className="min-h-[44px] lg:min-h-10 rounded-lg border border-obsidian-border bg-obsidian-surface px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:border-obsidian-gold/60 hover:text-obsidian-gold"
                        >
                          {t('wifi.selectClientAction')}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Deauth + PMKID forms */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Deauth Section */}
        <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-red-400" aria-hidden="true" />
              <h3 className="font-heading text-sm font-bold text-white">{t('wifi.deauthTitle')}</h3>
            </div>
            {moduleStatus.deauth && (
              <span className="rounded border border-red-500/40 bg-obsidian-dangerBg px-2 py-0.5 font-mono text-[10px] text-red-300">
                {t('module.deauth')}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-obsidian-muted">{t('wifi.deauthSafety')}</p>

          <form onSubmit={(e) => void handleDeauthStart(e)} className="mt-3.5 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor={deauthBssidId} className="mb-1 block text-xs font-medium text-obsidian-muted">
                  {t('wifi.bssid')}
                </label>
                <input
                  id={deauthBssidId}
                  type="text"
                  value={deauthBssid}
                  onChange={(e) => setDeauthBssid(e.target.value)}
                  placeholder="AA:BB:CC:DD:EE:FF"
                  className="min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-obsidian-gold focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor={deauthChannelId} className="mb-1 block text-xs font-medium text-obsidian-muted">
                  {t('wifi.channel')}
                </label>
                <input
                  id={deauthChannelId}
                  type="text"
                  inputMode="numeric"
                  value={deauthChannel}
                  onChange={(e) => setDeauthChannel(e.target.value)}
                  placeholder="6"
                  className="min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-obsidian-gold focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor={deauthClientId} className="mb-1 block text-xs font-medium text-obsidian-muted">
                {t('wifi.clientSelect')}
              </label>
              <select
                id={deauthClientId}
                value={deauthClient}
                onChange={(e) => setDeauthClient(e.target.value)}
                disabled={broadcast}
                className="min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white focus:border-obsidian-gold focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" className="bg-obsidian-panel">
                  {t('wifi.selectClient')}
                </option>
                {filteredClients.map((client) => (
                  <option key={client.client} value={client.client.toLowerCase()} className="bg-obsidian-panel">
                    {client.client}
                    {client.signal == null ? '' : ` (${client.signal} dBm)`}
                  </option>
                ))}
              </select>
            </div>

            <label
              htmlFor={deauthLowNoiseId}
              className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-xs text-white"
            >
              <input
                id={deauthLowNoiseId}
                type="checkbox"
                checked={lowNoise}
                onChange={(e) => setLowNoise(e.target.checked)}
                disabled={broadcast}
                className="h-4 w-4 rounded border-obsidian-border bg-obsidian-bg accent-obsidian-gold"
              />
              <span>{t('wifi.low')}</span>
            </label>

            <div className="rounded-lg border border-amber-500/35 bg-amber-950/20 p-3">
              <label htmlFor={deauthBroadcastId} className="flex cursor-pointer items-start gap-2.5 text-xs text-amber-200">
                <input
                  id={deauthBroadcastId}
                  type="checkbox"
                  checked={broadcast}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setBroadcast(checked);
                    if (checked) addLog('wifi', t('wifi.broadcastArmed'));
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-amber-500/50 bg-obsidian-bg accent-amber-500"
                />
                <span>{t('wifi.broadcastOption')}</span>
              </label>
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-300/80">
                <ShieldAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{t('wifi.broadcastWarning')}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={busyAction !== null || Boolean(moduleStatus.deauth)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-red-500/50 bg-red-950/50 px-4 py-2 text-xs font-semibold text-red-200 transition-colors hover:bg-red-900/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Zap size={14} aria-hidden="true" />
                <span>{t('wifi.deauthStart')}</span>
              </button>
              <button
                type="button"
                onClick={handleDeauthStop}
                disabled={busyAction !== null || !moduleStatus.deauth}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-red-500/40 bg-obsidian-dangerBg px-4 py-2 text-xs font-semibold text-red-300 transition-colors hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Square size={14} aria-hidden="true" />
                <span>{t('wifi.stop')}</span>
              </button>
            </div>
          </form>
        </section>

        {/* PMKID Section */}
        <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <KeyRound size={16} className="text-obsidian-gold" aria-hidden="true" />
              <h3 className="font-heading text-sm font-bold text-white">{t('wifi.pmkidTitle')}</h3>
            </div>
            {moduleStatus.pmkid && (
              <span className="rounded border border-emerald-500/40 bg-emerald-950/30 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                {t('module.pmkid')}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-obsidian-muted">{t('wifi.pmkidHint')}</p>

          <form onSubmit={(e) => void handlePmkidStart(e)} className="mt-3.5 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor={pmkidBssidId} className="mb-1 block text-xs font-medium text-obsidian-muted">
                  {t('wifi.bssid')}
                </label>
                <input
                  id={pmkidBssidId}
                  type="text"
                  value={pmkidBssid}
                  onChange={(e) => setPmkidBssid(e.target.value)}
                  placeholder="AA:BB:CC:DD:EE:FF"
                  className="min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-obsidian-gold focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor={pmkidChannelId} className="mb-1 block text-xs font-medium text-obsidian-muted">
                  {t('wifi.channel')}
                </label>
                <input
                  id={pmkidChannelId}
                  type="text"
                  inputMode="numeric"
                  value={pmkidChannel}
                  onChange={(e) => setPmkidChannel(e.target.value)}
                  placeholder="6"
                  className="min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-obsidian-gold focus:outline-none"
                />
              </div>
            </div>

            <label
              htmlFor={pmkidAutoId}
              className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-xs text-white"
            >
              <input
                id={pmkidAutoId}
                type="checkbox"
                checked={pmkidAuto}
                onChange={(e) => setPmkidAuto(e.target.checked)}
                className="h-4 w-4 rounded border-obsidian-border bg-obsidian-bg accent-obsidian-gold"
              />
              <span>{t('wifi.pmkidAuto')}</span>
            </label>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={busyAction !== null || Boolean(moduleStatus.pmkid)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-obsidian-gold/50 bg-obsidian-gold/20 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-obsidian-gold/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play size={14} aria-hidden="true" />
                <span>{t('wifi.pmkidStart')}</span>
              </button>
              <button
                type="button"
                onClick={handlePmkidStop}
                disabled={busyAction !== null || !moduleStatus.pmkid}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-red-500/40 bg-obsidian-dangerBg px-4 py-2 text-xs font-semibold text-red-300 transition-colors hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Square size={14} aria-hidden="true" />
                <span>{t('wifi.stop')}</span>
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Handshake Capture & Handshakes Table */}
      <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-sm font-bold text-white">{t('wifi.hsTitle')}</h3>
          {moduleStatus.handshake && (
            <span className="rounded border border-emerald-500/40 bg-emerald-950/30 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
              {t('module.handshake')}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-obsidian-muted">{t('wifi.hsHint')}</p>

        <form onSubmit={(e) => void handleHandshakeStart(e)} className="mt-3.5 max-w-2xl space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
            <div>
              <label htmlFor={hsBssidId} className="mb-1 block text-xs font-medium text-obsidian-muted">
                {t('wifi.hsBssid')}
              </label>
              <input
                id={hsBssidId}
                type="text"
                value={hsBssid}
                onChange={(e) => setHsBssid(e.target.value)}
                placeholder="02:00:00:00:00:01"
                required
                pattern="([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}"
                className="min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-obsidian-gold focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor={hsChannelId} className="mb-1 block text-xs font-medium text-obsidian-muted">
                {t('wifi.hsChannel')}
              </label>
              <input
                id={hsChannelId}
                type="text"
                inputMode="numeric"
                value={hsChannel}
                onChange={(e) => setHsChannel(e.target.value)}
                placeholder="6"
                className="min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-obsidian-gold focus:outline-none"
              />
            </div>

            <label
              htmlFor={hsAutoId}
              className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-xs text-white sm:col-span-2"
            >
              <input
                id={hsAutoId}
                type="checkbox"
                checked={hsAuto}
                onChange={(e) => setHsAuto(e.target.checked)}
                className="h-4 w-4 rounded border-obsidian-border bg-obsidian-bg accent-obsidian-gold"
              />
              <span>{t('wifi.hsAuto')}</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={busyAction !== null || Boolean(moduleStatus.handshake)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-obsidian-gold/50 bg-obsidian-gold/20 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-obsidian-gold/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play size={14} aria-hidden="true" />
              <span>{t('wifi.hsStart')}</span>
            </button>
            <button
              type="button"
              onClick={handleHandshakeStop}
              disabled={busyAction !== null || !moduleStatus.handshake}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-red-500/40 bg-obsidian-dangerBg px-4 py-2 text-xs font-semibold text-red-300 transition-colors hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Square size={14} aria-hidden="true" />
              <span>{t('wifi.stop')}</span>
            </button>
          </div>
        </form>

        <div className="mt-4 overflow-x-auto rounded-lg border border-obsidian-border">
          <table className="w-full min-w-[540px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-obsidian-border bg-obsidian-surface text-[11px] font-semibold uppercase tracking-wider text-obsidian-muted">
                <th className="px-3 py-2.5">{t('wifi.hsState')}</th>
                <th className="px-3 py-2.5">SSID</th>
                <th className="px-3 py-2.5">BSSID</th>
                <th className="px-3 py-2.5">{t('wifi.hsClient')}</th>
                <th className="px-3 py-2.5">{t('wifi.hsFile')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-obsidian-border/70">
              {handshakes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-5 text-left sm:text-center text-xs text-obsidian-muted">
                    {t('console.empty')}
                  </td>
                </tr>
              ) : (
                handshakes.map((row) => {
                  const msgList = [...row.msgs].sort((a, b) => a - b).map((m) => `M${m}`).join(' ');
                  return (
                    <tr key={row.key} className="hover:bg-obsidian-surface/60">
                      <td className="px-3 py-2 font-mono">
                        <span
                          className={`inline-flex items-center gap-1.5 font-semibold ${
                            row.captured ? 'text-emerald-400' : 'text-obsidian-muted'
                          }`}
                        >
                          {row.captured && <CheckCircle2 size={13} aria-hidden="true" />}
                          <span>{msgList || '-'}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-white">{row.ssid || '-'}</td>
                      <td className="px-3 py-2 font-mono text-slate-200">{row.bssid}</td>
                      <td className="px-3 py-2 font-mono text-obsidian-muted">{row.client}</td>
                      <td className="px-3 py-2 font-mono text-obsidian-gold break-all">{row.file || '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Saved Captures Table */}
      <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-sm font-bold text-white">{t('wifi.saved')}</h3>
            <span className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-0.5 font-mono text-[11px] text-obsidian-muted">
              {wifiCaptures.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void refreshWifiCaptures()}
            className="inline-flex min-h-[44px] lg:min-h-10 items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-1.5 text-xs font-medium text-obsidian-muted transition-colors hover:border-obsidian-borderLight hover:text-white"
          >
            <RefreshCw size={13} aria-hidden="true" />
            <span>{t('wifi.refresh')}</span>
          </button>
        </div>

        <p className="mt-1.5 text-xs text-obsidian-muted">{t('wifi.savedHint')}</p>

        <div className="mt-3 overflow-x-auto rounded-lg border border-obsidian-border">
          <table className="w-full min-w-[540px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-obsidian-border bg-obsidian-surface text-[11px] font-semibold uppercase tracking-wider text-obsidian-muted">
                <th className="px-3 py-2.5">{t('wifi.file')}</th>
                <th className="px-3 py-2.5">{t('wifi.kind')}</th>
                <th className="px-3 py-2.5">{t('wifi.size')}</th>
                <th className="px-3 py-2.5 text-right">{t('wifi.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-obsidian-border/70">
              {wifiCaptures.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-5 text-left sm:text-center text-xs text-obsidian-muted">
                    {t('console.empty')}
                  </td>
                </tr>
              ) : (
                wifiCaptures.map((cap) => (
                  <tr key={cap.name} className="hover:bg-obsidian-surface/60">
                    <td className="px-3 py-2 font-mono text-white break-all">{cap.name}</td>
                    <td className="px-3 py-2 font-mono text-obsidian-muted">{cap.kind}</td>
                    <td className="px-3 py-2 font-mono text-obsidian-muted">
                      {(cap.size / 1024).toFixed(1)} KB
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        {cap.kind === 'pcap' && (
                          <button
                            type="button"
                            onClick={() => handleConvertCapture(cap.name)}
                            disabled={busyAction === `convert:${cap.name}`}
                            className="inline-flex min-h-[44px] lg:min-h-10 items-center gap-1 rounded-lg border border-obsidian-gold/40 bg-obsidian-gold/15 px-2.5 py-1 text-[11px] font-semibold text-obsidian-gold transition-colors hover:bg-obsidian-gold/25 disabled:opacity-50"
                          >
                            <FileCode2 size={12} aria-hidden="true" />
                            <span>hashcat (.22000)</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDownloadCapture(cap.name)}
                          disabled={busyAction === `download:${cap.name}`}
                          className="inline-flex min-h-[44px] lg:min-h-10 items-center gap-1 rounded-lg border border-obsidian-border bg-obsidian-surface px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:border-obsidian-borderLight disabled:opacity-50"
                        >
                          <Download size={12} aria-hidden="true" />
                          <span>{t('wifi.download')}</span>
                        </button>
                      </div>
                    </td>
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
