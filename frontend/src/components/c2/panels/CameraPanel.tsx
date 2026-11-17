import React, { useId, useState } from 'react';
import { Camera, Radar, ShieldCheck, Trash2 } from 'lucide-react';
import { useC2 } from '../../../context/C2Context';
import { useVault } from '../../../context/VaultContext';
import { c2Api } from '../../../lib/c2Api';

type AuditModuleId = 'creds' | 'rtsp' | 'onvif' | 'http' | 'wifi' | 'modern' | 'cloud' | 'vuln';

const AUDIT_MODULES: Array<{ id: AuditModuleId; labelKey: string; defaultChecked: boolean }> = [
  { id: 'creds', labelKey: 'cam.creds', defaultChecked: true },
  { id: 'rtsp', labelKey: 'cam.rtsp', defaultChecked: true },
  { id: 'onvif', labelKey: 'cam.onvif', defaultChecked: true },
  { id: 'http', labelKey: 'cam.http', defaultChecked: false },
  { id: 'wifi', labelKey: 'cam.wifi', defaultChecked: false },
  { id: 'modern', labelKey: 'cam.modern', defaultChecked: false },
  { id: 'cloud', labelKey: 'cam.cloud', defaultChecked: false },
  { id: 'vuln', labelKey: 'cam.vuln', defaultChecked: false },
];

function severityBadgeClass(severity?: string): string {
  const key = (severity || 'info').toLowerCase();
  switch (key) {
    case 'critical':
      return 'border-red-500/45 bg-obsidian-dangerBg text-red-300';
    case 'high':
      return 'border-amber-500/45 bg-amber-950/40 text-amber-300';
    case 'medium':
      return 'border-amber-500/30 bg-amber-950/20 text-amber-200';
    case 'low':
      return 'border-obsidian-border bg-obsidian-surface text-obsidian-muted';
    default:
      return 'border-obsidian-border bg-obsidian-surface text-obsidian-muted';
  }
}

export const CameraPanel: React.FC = () => {
  const {
    t,
    selectedIface,
    camTarget,
    setCamTarget,
    cameraDiscovered,
    setCameraDiscovered,
    cameraFindings,
    setCameraFindings,
    clearCameraState,
    addLog,
  } = useC2();
  const { showToast } = useVault();

  const [selectedModules, setSelectedModules] = useState<Record<AuditModuleId, boolean>>({
    creds: true,
    rtsp: true,
    onvif: true,
    http: false,
    wifi: false,
    modern: false,
    cloud: false,
    vuln: false,
  });
  const [discovering, setDiscovering] = useState(false);
  const [auditing, setAuditing] = useState(false);

  const targetInputId = useId();

  const toggleModule = (mod: AuditModuleId) => {
    setSelectedModules((prev) => ({ ...prev, [mod]: !prev[mod] }));
  };

  const activeModules = AUDIT_MODULES.filter((m) => selectedModules[m.id]).map((m) => m.id);

  const handleDiscover = async () => {
    const target = camTarget.trim();
    if (!target || !target.includes('/')) {
      const msg = 'CIDR required (e.g. 192.168.1.0/24)';
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }

    setDiscovering(true);
    setCameraFindings([]);
    setCameraDiscovered([]);
    addLog('camera', `${t('cam.discovering')} ${target}`);

    try {
      const cams = await c2Api.discoverCameras({ target, timeout: 3 });
      const list = Array.isArray(cams) ? cams : [];
      setCameraDiscovered(list);
      addLog('camera', `${list.length} cameras`);
      showToast(`${list.length} cameras`, list.length > 0 ? 'success' : 'info');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera discovery failed';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setDiscovering(false);
    }
  };

  const runAudit = async (overrideTarget?: string) => {
    const target = (overrideTarget ?? camTarget).trim();
    if (!target || !target.includes('.')) {
      const msg = 'Invalid camera target IP';
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }
    if (activeModules.length === 0) {
      const msg = 'Select at least one audit module';
      addLog('error', msg);
      showToast(msg, 'warning');
      return;
    }

    setAuditing(true);
    setCameraFindings([]);
    addLog('camera', `Audit ${target}: ${activeModules.join(', ')}...`);

    try {
      const res = await c2Api.auditCameras({
        target,
        modules: activeModules,
        timeout: 5,
        depth: 2,
        interface: selectedIface || undefined,
      });
      if (Array.isArray(res.findings) && res.findings.length > 0) {
        setCameraFindings((prev) => (prev.length === 0 ? res.findings : prev));
      }
      const errSuffix = res.errors?.length ? ` (${res.errors.join('; ')})` : '';
      addLog('camera', `${res.findings?.length ?? 0} findings${errSuffix}`);
      showToast(`${res.findings?.length ?? 0} findings`, 'info');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera audit failed';
      addLog('error', msg);
      showToast(msg, 'error');
    } finally {
      setAuditing(false);
    }
  };

  return (
    <div className="min-w-0">
      <section className="border-t border-obsidian-border py-4 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <Camera size={18} className="shrink-0 text-obsidian-muted" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold text-white">{t('cam.title')}</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDiscover()}
              disabled={discovering || auditing}
              className="ui-action-primary"
            >
              <Radar size={16} aria-hidden="true" />
              <span>{discovering ? t('cam.discovering') : t('cam.discover')}</span>
              {/* [Acción principal] Inicia o confirma la operación. */}
            </button>
            <button
              type="button"
              onClick={clearCameraState}
              disabled={discovering || auditing}
              className="ui-action-secondary"
            >
              <Trash2 size={16} aria-hidden="true" />
              <span>{t('cam.clear')}</span>
              {/* [Acción secundaria] Abre o ajusta la operación actual. */}
            </button>
          </div>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-obsidian-muted">{t('cam.hint')}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runAudit();
          }}
          className="mt-4 max-w-3xl space-y-3.5"
        >
          <div>
            <label htmlFor={targetInputId} className="mb-1.5 block text-xs font-medium text-obsidian-muted">
              {t('cam.target')}
            </label>
            <input
              id={targetInputId}
              type="text"
              value={camTarget}
              onChange={(e) => setCamTarget(e.target.value)}
              placeholder="192.168.1.50 / 192.168.1.0/24"
              className="min-h-[44px] w-full rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-2 font-mono text-xs text-white placeholder:text-obsidian-muted focus:border-obsidian-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIT_MODULES.map((mod) => {
              const checkboxId = `${targetInputId}-${mod.id}`;
              return (
                <label
                  key={mod.id}
                  htmlFor={checkboxId}
                  className="flex min-h-[44px] cursor-pointer items-center gap-2 border-b border-obsidian-border px-1 py-2 text-xs text-white transition-colors hover:text-white"
                >
                  <input
                    id={checkboxId}
                    type="checkbox"
                    checked={selectedModules[mod.id]}
                    onChange={() => toggleModule(mod.id)}
                    className="h-4 w-4 rounded border-obsidian-border bg-obsidian-bg accent-obsidian-accent"
                  />
                  <span>{t(mod.labelKey)}</span>
                </label>
              );
            })}
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={auditing || discovering}
              className="ui-action-primary"
            >
              <ShieldCheck size={16} aria-hidden="true" />
              <span>{auditing ? t('cam.auditing') : t('cam.audit')}</span>
              {/* [Acción principal] Inicia o confirma la operación. */}
            </button>
          </div>
        </form>
      </section>

      {/* Findings Table */}
      <section className="border-t border-obsidian-border py-4 sm:py-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-heading text-sm font-bold text-white">{t('cam.finding')}</h3>
          <span className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-0.5 font-mono text-[11px] text-obsidian-muted">
            {cameraFindings.length}
          </span>
        </div>

        <div className="overflow-x-auto border-y border-obsidian-border">
          <table className="w-full min-w-[600px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-obsidian-border text-xs font-semibold text-obsidian-muted">
                <th className="px-3 py-2.5">{t('cam.severity')}</th>
                <th className="px-3 py-2.5">{t('cam.module')}</th>
                <th className="px-3 py-2.5">{t('cam.finding')}</th>
                <th className="px-3 py-2.5">{t('cam.detail')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-obsidian-border/70">
              {cameraFindings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-left sm:text-center text-xs text-obsidian-muted">
                    {t('console.empty')}
                  </td>
                </tr>
              ) : (
                cameraFindings.map((finding, idx) => {
                  const sev = (finding.severity || 'info').toUpperCase();
                  return (
                    <tr
                      key={`${finding.module || 'mod'}-${finding.description || finding.title || idx}-${idx}`}
                      className="hover:bg-obsidian-surface/60"
                    >
                      <td className="px-3 py-2 font-mono">
                        <span
                          className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold tracking-wide ${severityBadgeClass(
                            finding.severity
                          )}`}
                        >
                          {sev}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-obsidian-text">
                        {finding.module || finding.category || '-'}
                      </td>
                      <td className="px-3 py-2 text-white">
                        {finding.description || finding.title || '-'}
                      </td>
                      <td className="px-3 py-2 font-mono text-obsidian-muted break-all">
                        {finding.detail || finding.evidence || finding.url || '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Discovered Devices Table */}
      <section className="border-t border-obsidian-border py-4 sm:py-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-heading text-sm font-bold text-white">{t('nav.camera')}</h3>
          <span className="rounded border border-obsidian-border bg-obsidian-surface px-2 py-0.5 font-mono text-[11px] text-obsidian-muted">
            {cameraDiscovered.length}
          </span>
        </div>

        <div className="overflow-x-auto border-y border-obsidian-border">
          <table className="w-full min-w-[480px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-obsidian-border text-xs font-semibold text-obsidian-muted">
                <th className="px-3 py-2.5">IP</th>
                <th className="px-3 py-2.5">Port</th>
                <th className="px-3 py-2.5">Device</th>
                <th className="px-3 py-2.5 text-right">{t('wifi.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-obsidian-border/70">
              {cameraDiscovered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-left sm:text-center text-xs text-obsidian-muted">
                    {t('console.empty')}
                  </td>
                </tr>
              ) : (
                cameraDiscovered.map((cam) => (
                  <tr key={`${cam.ip}:${cam.port}`} className="hover:bg-obsidian-surface/60">
                    <td className="px-3 py-2 font-mono text-white">{cam.ip}</td>
                    <td className="px-3 py-2 font-mono text-obsidian-muted">{cam.port}</td>
                    <td className="px-3 py-2 text-obsidian-text">{cam.vendor || cam.service || '-'}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setCamTarget(cam.ip);
                          void runAudit(cam.ip);
                        }}
                        disabled={auditing || discovering}
                        className="ui-action-secondary"
                      >
                        {t('cam.auditAction')}
                        {/* [Acción secundaria] Abre o ajusta la operación actual. */}
                      </button>
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
