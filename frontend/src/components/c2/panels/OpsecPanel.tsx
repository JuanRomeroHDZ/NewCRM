import React, { useEffect, useId, useMemo, useState } from 'react';
import { RefreshCw, RotateCcw, Shield, Sparkles, UserCheck } from 'lucide-react';
import { useC2 } from '../../../context/C2Context';
import { useVault } from '../../../context/VaultContext';
import { c2Api } from '../../../lib/c2Api';

export const OpsecPanel: React.FC = () => {
  const { t, selectedIface, opsecState, refreshOpsec, refreshInterfaces, addLog } = useC2();
  const { showToast } = useVault();

  const [hostnameInput, setHostnameInput] = useState('');
  const [prettyInput, setPrettyInput] = useState('');
  const [macInput, setMacInput] = useState('');
  const [vendor, setVendor] = useState('');
  const [busy, setBusy] = useState(false);

  const hostnameId = useId();
  const prettyId = useId();
  const macId = useId();
  const vendorId = useId();

  const vendors = opsecState?.vendors ?? [];
  const profiles = opsecState?.profiles ?? [];

  useEffect(() => {
    if (!vendor && vendors.length > 0) {
      setVendor(vendors[0]);
    }
  }, [vendor, vendors]);

  const activeIfaceName = useMemo(
    () => selectedIface || opsecState?.interfaces?.[0]?.name || '',
    [selectedIface, opsecState]
  );

  const activeLink = useMemo(
    () => opsecState?.interfaces?.find((i) => i.name === activeIfaceName) || null,
    [opsecState, activeIfaceName]
  );

  const isSpoofed = Boolean(opsecState?.spoofed || activeLink?.spoofed);

  const runOpsecAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OPSEC operation failed';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = () =>
    void runOpsecAction(async () => {
      await c2Api.restoreOpsec({});
      await Promise.all([refreshOpsec(), refreshInterfaces()]);
      showToast(t('opsec.restore'), 'info');
    });

  const handleApplyProfile = (profileId: string) =>
    void runOpsecAction(async () => {
      if (!activeIfaceName) {
        const msg = t('opsec.needIface');
        addLog('error', msg);
        showToast(msg, 'warning');
        return;
      }
      addLog('opsec', t('opsec.applying', { id: profileId, iface: activeIfaceName }));
      await c2Api.applyOpsecProfile({
        interface: activeIfaceName,
        profile: profileId,
        dhcp: false,
      });
      await Promise.all([refreshOpsec(), refreshInterfaces()]);
      showToast(t('opsec.covered'), 'success');
    });

  const handleGenerateMac = () =>
    void runOpsecAction(async () => {
      const res = await c2Api.generateOpsec({ vendor: vendor || null });
      setMacInput(res.mac);
      addLog('opsec', t('opsec.macGen', { vendor: res.vendor, mac: res.mac }));
    });

  const handleGenerateHostname = () =>
    void runOpsecAction(async () => {
      const res = await c2Api.generateOpsec({ kind: 'windows' });
      setHostnameInput(res.hostname);
      setPrettyInput('DESKTOP');
    });

  const handleApplyIdentity = (e: React.FormEvent) => {
    e.preventDefault();
    const host = hostnameInput.trim();
    if (!host) {
      const msg = t('opsec.needHostGen');
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }
    if (!activeIfaceName) {
      const msg = t('opsec.needIface');
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }
    void runOpsecAction(async () => {
      await c2Api.applyOpsecIdentity({
        interface: activeIfaceName,
        hostname: host,
        pretty: prettyInput.trim() || null,
        mac: macInput.trim() || null,
        vendor: vendor || null,
        dhcp: false,
      });
      await Promise.all([refreshOpsec(), refreshInterfaces()]);
      showToast(t('opsec.apply'), 'success');
    });
  };

  const handleHostnameOnly = () => {
    const host = hostnameInput.trim();
    if (!host) {
      const msg = t('opsec.needHost');
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }
    void runOpsecAction(async () => {
      await c2Api.setOpsecHostname({
        hostname: host,
        pretty: prettyInput.trim() || null,
      });
      await refreshOpsec();
      showToast(t('opsec.hostOnly'), 'success');
    });
  };

  const handleMacOnly = () => {
    if (!activeIfaceName) {
      const msg = t('opsec.needIface');
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }
    void runOpsecAction(async () => {
      await c2Api.setOpsecMac({
        interface: activeIfaceName,
        mac: macInput.trim() || null,
        vendor: vendor || null,
        dhcp: false,
      });
      await Promise.all([refreshOpsec(), refreshInterfaces()]);
      showToast(t('opsec.macOnly'), 'success');
    });
  };

  return (
    <div className="space-y-4">
      {/* Identity Status Card */}
      <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <UserCheck size={18} className="shrink-0 text-obsidian-gold" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold text-white">{t('opsec.title')}</h2>
          </div>

          <button
            type="button"
            onClick={handleRestore}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-red-500/40 bg-obsidian-dangerBg px-3.5 py-2 text-xs font-semibold text-red-300 transition-colors hover:border-red-400 hover:bg-red-950/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>{t('opsec.restore')}</span>
          </button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-obsidian-muted">{t('opsec.hint')}</p>

        <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-obsidian-border bg-obsidian-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-obsidian-muted">
              {t('opsec.host')}
            </span>
            <strong className="font-mono text-sm text-white break-all">
              {opsecState?.hostname || '-'}
            </strong>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-obsidian-muted">
              {t('opsec.mac')}
            </span>
            <strong className="font-mono text-sm text-white">{activeLink?.mac || '-'}</strong>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-obsidian-muted">
              {t('opsec.perm')}
            </span>
            <strong className="font-mono text-sm text-obsidian-muted">
              {activeLink?.permanent || '-'}
            </strong>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-obsidian-muted">
              {t('opsec.state')}
            </span>
            <div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-xs font-semibold ${
                  isSpoofed
                    ? 'border-obsidian-gold/50 bg-obsidian-gold/15 text-obsidian-gold'
                    : 'border-obsidian-border bg-obsidian-panel text-obsidian-muted'
                }`}
              >
                <Shield size={12} aria-hidden="true" />
                <span>{isSpoofed ? t('opsec.covered') : t('opsec.real')}</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Profiles */}
      <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
        <h3 className="font-heading text-sm font-bold text-white">{t('opsec.profiles')}</h3>
        <p className="mt-1 text-xs text-obsidian-muted">{t('opsec.profilesHint')}</p>

        {profiles.length === 0 ? (
          <p className="mt-3 text-xs text-obsidian-muted">-</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => handleApplyProfile(profile.id)}
                disabled={busy}
                className="flex min-h-[56px] flex-col items-start justify-center gap-1 rounded-xl border border-obsidian-border bg-obsidian-surface p-3.5 text-left transition-colors hover:border-obsidian-gold/60 hover:bg-obsidian-gold/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-xs font-semibold text-white">{profile.label}</span>
                <span className="text-[11px] leading-snug text-obsidian-muted">{profile.blurb}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Custom Identity Form */}
      <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
        <h3 className="font-heading text-sm font-bold text-white">{t('opsec.custom')}</h3>

        <form onSubmit={handleApplyIdentity} className="mt-3.5 max-w-2xl space-y-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={hostnameId} className="mb-1.5 block text-xs font-medium text-obsidian-muted">
                {t('opsec.host')}
              </label>
              <input
                id={hostnameId}
                type="text"
                value={hostnameInput}
                onChange={(e) => setHostnameInput(e.target.value)}
                placeholder="DESKTOP-7K2M9XQ"
                className="min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-obsidian-gold focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor={prettyId} className="mb-1.5 block text-xs font-medium text-obsidian-muted">
                {t('opsec.pretty')}
              </label>
              <input
                id={prettyId}
                type="text"
                value={prettyInput}
                onChange={(e) => setPrettyInput(e.target.value)}
                placeholder="DESKTOP"
                className="min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-obsidian-gold focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor={macId} className="block text-xs font-medium text-obsidian-muted">
              {t('opsec.macIn')}
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                id={macId}
                type="text"
                value={macInput}
                onChange={(e) => setMacInput(e.target.value)}
                placeholder="aa:bb:cc:dd:ee:ff"
                className="min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-obsidian-gold focus:outline-none"
              />
              <select
                id={vendorId}
                aria-label="Vendor OUI"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white focus:border-obsidian-gold focus:outline-none"
              >
                {vendors.length === 0 ? (
                  <option value="" className="bg-obsidian-panel">
                    --
                  </option>
                ) : (
                  vendors.map((v) => (
                    <option key={v} value={v} className="bg-obsidian-panel">
                      {v}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleGenerateMac}
                disabled={busy}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-xs font-medium text-white transition-colors hover:border-obsidian-borderLight disabled:opacity-50"
              >
                <RefreshCw size={13} aria-hidden="true" />
                <span>{t('opsec.genMac')}</span>
              </button>
              <button
                type="button"
                onClick={handleGenerateHostname}
                disabled={busy}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-xs font-medium text-white transition-colors hover:border-obsidian-borderLight disabled:opacity-50"
              >
                <Sparkles size={13} aria-hidden="true" />
                <span>{t('opsec.genHost')}</span>
              </button>
            </div>
          </div>

          <p className="rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-xs text-obsidian-muted">
            {t('opsec.networkHint')}
          </p>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-obsidian-gold/50 bg-obsidian-gold/20 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-obsidian-gold/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Shield size={14} aria-hidden="true" />
              <span>{t('opsec.apply')}</span>
            </button>
            <button
              type="button"
              onClick={handleHostnameOnly}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3.5 py-2 text-xs font-medium text-obsidian-muted transition-colors hover:border-obsidian-borderLight hover:text-white disabled:opacity-50"
            >
              <span>{t('opsec.hostOnly')}</span>
            </button>
            <button
              type="button"
              onClick={handleMacOnly}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3.5 py-2 text-xs font-medium text-obsidian-muted transition-colors hover:border-obsidian-borderLight hover:text-white disabled:opacity-50"
            >
              <span>{t('opsec.macOnly')}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
