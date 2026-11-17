import React, { useEffect, useId, useMemo, useState } from 'react';
import { RefreshCw, RotateCcw, Shield, Sparkles, UserCheck } from 'lucide-react';
import { useC2 } from '../../../context/C2Context';
import { useVault } from '../../../context/VaultContext';
import { c2Api } from '../../../lib/c2Api';

export const OpsecPanel: React.FC = () => {
  const {
    t,
    selectedIface,
    activeEngagementId,
    engagements,
    opsecState,
    refreshOpsec,
    refreshInterfaces,
    addLog,
  } = useC2();
  const { confirm, showToast } = useVault();

  const [hostnameInput, setHostnameInput] = useState('');
  const [prettyInput, setPrettyInput] = useState('');
  const [macInput, setMacInput] = useState('');
  const [vendor, setVendor] = useState('');
  const [busy, setBusy] = useState(false);
  const [macError, setMacError] = useState('');

  const hostnameId = useId();
  const prettyId = useId();
  const macId = useId();
  const macHelpId = useId();
  const macErrorId = useId();
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
  const activeEngagement = engagements.find(
    (engagement) => engagement.id === activeEngagementId && engagement.active_now
  ) || null;
  const canApplyIdentity = Boolean(activeEngagement && activeIfaceName && opsecState);
  const applyBlockReason = !activeEngagement
    ? t('opsec.scopeRequired')
    : !activeIfaceName
    ? t('opsec.needIface')
    : !opsecState
    ? t('opsec.stateUnavailable')
    : '';

  const validateMacInput = () => {
    const mac = macInput.trim();
    const valid = !mac || /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac);
    setMacError(valid ? '' : t('opsec.macFormatError'));
    return valid;
  };

  const confirmChange = (title: string, message: string, confirmLabel = t('opsec.confirmApply')) =>
    confirm({
      title,
      message,
      confirmLabel,
      cancelLabel: t('opsec.confirmCancel'),
      tone: 'danger',
    });

  const requireApplyScope = () => {
    if (canApplyIdentity) return true;
    const message = applyBlockReason || t('opsec.scopeRequired');
    addLog('error', message);
    showToast(message, 'warning');
    return false;
  };

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
    void (async () => {
      const accepted = await confirmChange(
        t('opsec.restoreConfirmTitle'),
        t('opsec.restoreConfirmMessage'),
        t('opsec.restore')
      );
      if (!accepted) return;
      await runOpsecAction(async () => {
        await c2Api.restoreOpsec({});
        await Promise.all([refreshOpsec(), refreshInterfaces()]);
        showToast(t('opsec.restore'), 'info');
      });
    })();

  const handleApplyProfile = (profileId: string) =>
    void (async () => {
      if (!requireApplyScope()) return;
      const profile = profiles.find((item) => item.id === profileId);
      if (!profile) return;
      const accepted = await confirmChange(
        t('opsec.profileConfirmTitle'),
        t('opsec.profileConfirmMessage', { profile: profile.label, iface: activeIfaceName })
      );
      if (!accepted) return;
      await runOpsecAction(async () => {
        addLog('opsec', t('opsec.applying', { id: profileId, iface: activeIfaceName }));
        await c2Api.applyOpsecProfile({
          interface: activeIfaceName,
          profile: profileId,
          dhcp: false,
        });
        await Promise.all([refreshOpsec(), refreshInterfaces()]);
        showToast(t('opsec.covered'), 'success');
      });
    })();

  const handleGenerateMac = () =>
    void runOpsecAction(async () => {
      const res = await c2Api.generateOpsec({ vendor: vendor || null });
      setMacInput(res.mac);
      setMacError('');
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
    if (!validateMacInput() || !requireApplyScope()) return;
    void (async () => {
      const plannedMac = macInput.trim() || t('opsec.generatedMac', { vendor: vendor || '-' });
      const accepted = await confirmChange(
        t('opsec.identityConfirmTitle'),
        t('opsec.identityConfirmMessage', { host, mac: plannedMac, iface: activeIfaceName })
      );
      if (!accepted) return;
      await runOpsecAction(async () => {
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
    })();
  };

  const handleHostnameOnly = () => {
    const host = hostnameInput.trim();
    if (!host) {
      const msg = t('opsec.needHost');
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }
    if (!requireApplyScope()) return;
    void (async () => {
      const accepted = await confirmChange(
        t('opsec.hostnameConfirmTitle'),
        t('opsec.hostnameConfirmMessage', { host }),
        t('opsec.hostOnly')
      );
      if (!accepted) return;
      await runOpsecAction(async () => {
        await c2Api.setOpsecHostname({
          hostname: host,
          pretty: prettyInput.trim() || null,
        });
        await refreshOpsec();
        showToast(t('opsec.hostOnly'), 'success');
      });
    })();
  };

  const handleMacOnly = () => {
    if (!activeIfaceName) {
      const msg = t('opsec.needIface');
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }
    if (!validateMacInput() || !requireApplyScope()) return;
    void (async () => {
      const plannedMac = macInput.trim() || t('opsec.generatedMac', { vendor: vendor || '-' });
      const accepted = await confirmChange(
        t('opsec.macConfirmTitle'),
        t('opsec.macConfirmMessage', { mac: plannedMac, iface: activeIfaceName }),
        t('opsec.macOnly')
      );
      if (!accepted) return;
      await runOpsecAction(async () => {
        await c2Api.setOpsecMac({
          interface: activeIfaceName,
          mac: macInput.trim() || null,
          vendor: vendor || null,
          dhcp: false,
        });
        await Promise.all([refreshOpsec(), refreshInterfaces()]);
        showToast(t('opsec.macOnly'), 'success');
      });
    })();
  };

  return (
    <div className="space-y-4">
      {/* Identity Status Card */}
      <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <UserCheck size={18} className="shrink-0 text-obsidian-muted" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold text-white">{t('opsec.title')}</h2>
          </div>

          <button
            type="button"
            onClick={handleRestore}
            disabled={busy}
            className="ui-action-danger"
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>{t('opsec.restore')}</span>
            {/* [Acción destructiva] Detiene o revierte la operación. */}
          </button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-obsidian-muted">{t('opsec.hint')}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          {activeEngagement ? (
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-950/30 px-2.5 text-emerald-200">
              {t('scope.label')}
              <strong className="font-medium">{activeEngagement.title}</strong>
            </span>
          ) : (
            <p role="status" className="inline-flex min-h-9 items-center rounded-md border border-amber-500/40 bg-amber-950/25 px-2.5 text-amber-200">
              {t('opsec.scopeRequired')}
            </p>
          )}
        </div>

        {busy && <p role="status" aria-live="polite" className="mt-3 text-xs font-medium text-amber-200">{t('opsec.busy')}</p>}

        <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-obsidian-border bg-obsidian-surface p-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-obsidian-muted">
              {t('opsec.activeInterface')}
            </span>
            <strong className="font-mono text-sm text-white break-all">
              {activeIfaceName || t('opsec.noInterface')}
            </strong>
          </div>

          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-obsidian-muted">
              {t('opsec.host')}
            </span>
            <strong className="font-mono text-sm text-white break-all">
              {!opsecState ? t('opsec.stateUnavailable') : opsecState.hostname || t('opsec.notReported')}
            </strong>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-obsidian-muted">
              {t('opsec.mac')}
            </span>
            <strong className="font-mono text-sm text-white break-all">
              {!opsecState ? t('opsec.stateUnavailable') : activeLink?.mac || t('opsec.notReported')}
            </strong>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-obsidian-muted">
              {t('opsec.perm')}
            </span>
            <strong className="font-mono text-sm text-obsidian-muted">
              {!opsecState ? t('opsec.stateUnavailable') : activeLink?.permanent || t('opsec.notReported')}
            </strong>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-obsidian-muted">
              {t('opsec.state')}
            </span>
            <div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-xs font-semibold ${
                  !opsecState
                    ? 'border-amber-500/40 bg-amber-950/25 text-amber-200'
                    : isSpoofed
                    ? 'border-obsidian-accent bg-obsidian-surface text-white'
                    : 'border-obsidian-border bg-obsidian-panel text-obsidian-muted'
                }`}
              >
                <Shield size={12} aria-hidden="true" />
                <span>{!opsecState ? t('opsec.identityUnknown') : isSpoofed ? t('opsec.covered') : t('opsec.real')}</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Profiles */}
      <section className="rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5 shadow-obsidian">
        <h3 className="font-heading text-sm font-bold text-white">{t('opsec.profiles')}</h3>
        <p className="mt-1 text-xs leading-relaxed text-obsidian-muted">{t('opsec.profilesHint')}</p>

        {applyBlockReason && <p role="status" className="mt-3 rounded-lg border border-amber-500/40 bg-amber-950/25 px-3 py-2 text-xs leading-relaxed text-amber-200">{applyBlockReason}</p>}

        {profiles.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-obsidian-border px-3 py-4 text-xs text-obsidian-muted">{t('opsec.noProfiles')}</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => handleApplyProfile(profile.id)}
                disabled={busy || !canApplyIdentity}
                aria-label={`${t('opsec.applyProfile')}: ${profile.label}`}
                className="ui-action-secondary min-h-[72px] flex-col items-start gap-1 p-3.5 text-left"
              >
                <span className="text-xs font-semibold text-white">{profile.label}</span>
                <span className="text-[11px] leading-snug text-obsidian-muted">{profile.blurb}</span>
                <span className="mt-1 text-[11px] font-semibold text-obsidian-muted">{t('opsec.applyProfile')}</span>
                {/* [Acción principal] Aplica el perfil tras su confirmación. */}
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
                className="min-h-[44px] w-full rounded-lg border border-slate-600 bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-obsidian-borderLight focus:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian-panel"
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
                className="min-h-[44px] w-full rounded-lg border border-slate-600 bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-obsidian-borderLight focus:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian-panel"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={macId} className="mb-1.5 block text-xs font-medium text-obsidian-muted">
                {t('opsec.macIn')}
              </label>
              <input
                id={macId}
                type="text"
                value={macInput}
                onChange={(e) => { setMacInput(e.target.value); setMacError(''); }}
                onBlur={validateMacInput}
                aria-invalid={Boolean(macError)}
                aria-describedby={`${macHelpId}${macError ? ` ${macErrorId}` : ''}`}
                placeholder="aa:bb:cc:dd:ee:ff"
                className="min-h-[44px] w-full rounded-lg border border-slate-600 bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-obsidian-borderLight focus:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian-panel aria-[invalid=true]:border-rose-400"
              />
              <p id={macHelpId} className="mt-1.5 text-[11px] leading-relaxed text-obsidian-muted">{t('opsec.macFormatHelp')}</p>
              {macError && <p id={macErrorId} role="alert" className="mt-1 text-xs text-rose-300">{macError}</p>}
            </div>
            <div>
              <label htmlFor={vendorId} className="mb-1.5 block text-xs font-medium text-obsidian-muted">
                {t('opsec.vendor')}
              </label>
              <select
                id={vendorId}
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-600 bg-obsidian-surface px-3 py-2 font-mono text-xs text-white focus:border-obsidian-borderLight focus:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian-panel"
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
                className="ui-action-secondary"
              >
                <RefreshCw size={13} aria-hidden="true" />
                <span>{t('opsec.genMac')}</span>
                {/* [Acción secundaria] Abre o ajusta la operación actual. */}
              </button>
              <button
                type="button"
                onClick={handleGenerateHostname}
                disabled={busy}
                className="ui-action-secondary"
              >
                <Sparkles size={13} aria-hidden="true" />
                <span>{t('opsec.genHost')}</span>
                {/* [Acción secundaria] Abre o ajusta la operación actual. */}
              </button>
            </div>
          </div>

            <p className="rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 text-xs leading-relaxed text-obsidian-muted">
            {t('opsec.networkHint')}
          </p>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="submit"
              disabled={busy || !canApplyIdentity}
              className="ui-action-primary"
            >
              <Shield size={14} aria-hidden="true" />
              <span>{t('opsec.apply')}</span>
              {/* [Acción principal] Inicia o confirma la operación. */}
            </button>
          </div>

          <details className="rounded-lg border border-obsidian-border bg-obsidian-surface">
            <summary className="flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-[13px] font-medium text-obsidian-muted hover:bg-obsidian-panel hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent">
              {t('opsec.advancedChanges')}
            </summary>
            <div className="space-y-2 border-t border-obsidian-border px-3 py-3">
              <p className="text-xs leading-relaxed text-obsidian-muted">{t('opsec.advancedHint')}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleHostnameOnly}
                  disabled={busy || !canApplyIdentity}
                  className="ui-action-secondary"
                >
                  <span>{t('opsec.hostOnly')}</span>
                  {/* [Acción secundaria] Abre o ajusta la operación actual. */}
                </button>
                <button
                  type="button"
                  onClick={handleMacOnly}
                  disabled={busy || !canApplyIdentity}
                  className="ui-action-secondary"
                >
                  <span>{t('opsec.macOnly')}</span>
                  {/* [Acción secundaria] Abre o ajusta la operación actual. */}
                </button>
              </div>
            </div>
          </details>
        </form>
      </section>
    </div>
  );
};
