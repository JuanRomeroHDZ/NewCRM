import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Cpu,
  Globe,
  Lock,
  Network,
  Radio,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Terminal,
  Trash2,
  Unlock,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { useC2 } from '../../context/C2Context';
import { api, getApiUserToken } from '../../lib/api';
import type { C2LogType, C2SectionId } from '../../types/c2';

const HostsPanel = lazy(() => import('./panels/HostsPanel').then((m) => ({ default: m.HostsPanel })));
const TopologyPanel = lazy(() => import('./panels/TopologyPanel').then((m) => ({ default: m.TopologyPanel })));
const PortsPanel = lazy(() => import('./panels/PortsPanel').then((m) => ({ default: m.PortsPanel })));
const MitmPanel = lazy(() => import('./panels/MitmPanel').then((m) => ({ default: m.MitmPanel })));
const SniffPanel = lazy(() => import('./panels/SniffPanel').then((m) => ({ default: m.SniffPanel })));
const DnsPanel = lazy(() => import('./panels/DnsPanel').then((m) => ({ default: m.DnsPanel })));
const CredsPanel = lazy(() => import('./panels/CredsPanel').then((m) => ({ default: m.CredsPanel })));
const HttpInjectPanel = lazy(() => import('./panels/HttpInjectPanel').then((m) => ({ default: m.HttpInjectPanel })));
const PoisonersPanel = lazy(() => import('./panels/PoisonersPanel').then((m) => ({ default: m.PoisonersPanel })));
const Mitm6Panel = lazy(() => import('./panels/Mitm6Panel').then((m) => ({ default: m.Mitm6Panel })));
const WifiPanel = lazy(() => import('./panels/WifiPanel').then((m) => ({ default: m.WifiPanel })));
const CameraPanel = lazy(() => import('./panels/CameraPanel').then((m) => ({ default: m.CameraPanel })));
const OpsecPanel = lazy(() => import('./panels/OpsecPanel').then((m) => ({ default: m.OpsecPanel })));

const PANEL_COMPONENTS: Record<C2SectionId, React.LazyExoticComponent<React.ComponentType>> = {
  c2_hosts: HostsPanel,
  c2_topo: TopologyPanel,
  c2_ports: PortsPanel,
  c2_mitm: MitmPanel,
  c2_sniff: SniffPanel,
  c2_dns: DnsPanel,
  c2_creds: CredsPanel,
  c2_http: HttpInjectPanel,
  c2_poison: PoisonersPanel,
  c2_mitm6: Mitm6Panel,
  c2_wifi: WifiPanel,
  c2_camera: CameraPanel,
  c2_opsec: OpsecPanel,
};

const LOG_TYPE_COLORS: Record<C2LogType, string> = {
  info: 'text-slate-300',
  error: 'text-red-400',
  cred: 'text-emerald-400',
  arp: 'text-amber-300',
  dns: 'text-sky-300',
  sniff: 'text-cyan-300',
  inject: 'text-orange-300',
  wifi: 'text-teal-300',
  poison: 'text-yellow-300',
  wpad: 'text-lime-300',
  dns6: 'text-violet-300',
  opsec: 'text-obsidian-gold',
  camera: 'text-rose-300',
};

const LOG_FILTER_TYPES: C2LogType[] = [
  'info',
  'error',
  'cred',
  'arp',
  'dns',
  'sniff',
  'inject',
  'wifi',
  'poison',
  'wpad',
  'dns6',
  'opsec',
  'camera',
];

export const C2WorkspaceShell: React.FC = () => {
  const { isUnlocked, openUnlockModal, activeSection, setActiveSection } = useVault();
  const {
    lang,
    setLang,
    t,
    demoMode,
    wsConnected,
    serviceState,
    retryService,
    interfaces,
    gateway,
    selectedIface,
    setSelectedIface,
    activeModuleCount,
    activeModuleNames,
    opsecState,
    envWarnings,
    consoleLogs,
    clearLogs,
    triggerPanic,
  } = useC2();

  const [consoleOpen, setConsoleOpen] = useState(true);
  const [logFilter, setLogFilter] = useState<'all' | C2LogType>('all');
  const [modulesOpen, setModulesOpen] = useState(false);
  const [mobileOpsOpen, setMobileOpsOpen] = useState(false);
  const [accountStatus, setAccountStatus] = useState<'unknown' | 'checking' | 'signed_out' | 'owner' | 'other' | 'password_change' | 'error'>('unknown');
  const logContainerRef = useRef<HTMLDivElement>(null);
  const modulesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isUnlocked) { setAccountStatus('unknown'); return; }
    let active = true;
    const check = async () => {
      if (!getApiUserToken()) { if (active) setAccountStatus('signed_out'); return; }
      setAccountStatus('checking');
      try {
        const user = await api.getCurrentUser();
        if (active) setAccountStatus(user.must_change_password ? 'password_change' : user.role === 'owner' ? 'owner' : 'other');
      } catch {
        if (active) setAccountStatus(getApiUserToken() ? 'error' : 'signed_out');
      }
    };
    void check();
    const expired = () => { active = false; setAccountStatus('signed_out'); };
    window.addEventListener('core_user_session_expired', expired);
    return () => { active = false; window.removeEventListener('core_user_session_expired', expired); };
  }, [isUnlocked]);

  const selectedLink = useMemo(
    () => opsecState?.interfaces?.find((i) => i.name === selectedIface) || opsecState?.interfaces?.[0] || null,
    [opsecState, selectedIface]
  );

  const opsecHost = opsecState?.hostname || '-';
  const opsecMac = selectedLink?.mac || '-';
  const isSpoofed = Boolean(opsecState?.spoofed || selectedLink?.spoofed);

  const filteredLogs = useMemo(() => {
    if (logFilter === 'all') return consoleLogs;
    return consoleLogs.filter((entry) => entry.type === logFilter);
  }, [consoleLogs, logFilter]);

  useEffect(() => {
    if (!consoleOpen || !logContainerRef.current) return;
    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [filteredLogs.length, consoleOpen]);

  useEffect(() => {
    if (!modulesOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (modulesContainerRef.current && !modulesContainerRef.current.contains(event.target as Node)) {
        setModulesOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [modulesOpen]);

  const ActivePanel = PANEL_COMPONENTS[activeSection as C2SectionId] || HostsPanel;
  const accountLabel = {
    unknown: 'Se comprueba al desbloquear', checking: 'Comprobando', signed_out: 'Sin sesión de cuenta',
    owner: 'Propietario', other: 'Sin rol de propietario', password_change: 'Cambiar contraseña de cuenta', error: 'No se pudo comprobar',
  }[accountStatus];
  const serviceLabel = !isUnlocked ? 'Se comprueba al desbloquear' : serviceState === 'running' ? 'Disponible' : serviceState === 'forbidden' ? 'Acceso restringido' : serviceState === 'checking' || serviceState === 'idle' ? 'Comprobando' : 'No disponible';
  const accessStatus = (
    <dl aria-label="Estado de acceso a Red y Lab" className="mt-5 grid gap-2 rounded-lg border border-obsidian-border bg-obsidian-bg/50 p-3 text-xs sm:grid-cols-3">
      <div><dt className="text-obsidian-muted">Bóveda</dt><dd className="mt-1 font-medium text-white">{isUnlocked ? 'Desbloqueada' : 'Bloqueada'}</dd></div>
      <div><dt className="text-obsidian-muted">Cuenta</dt><dd className="mt-1 font-medium text-white">{accountLabel}</dd></div>
      <div><dt className="text-obsidian-muted">Servicio C2</dt><dd className="mt-1 font-medium text-white">{serviceLabel}</dd></div>
    </dl>
  );

  if (!isUnlocked) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-xl border border-obsidian-border bg-obsidian-panel p-8 text-center shadow-obsidian">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-obsidian-gold/30 bg-obsidian-surface text-obsidian-gold">
            <Lock size={22} aria-hidden="true" />
          </div>
          <h2 className="font-heading text-lg font-bold text-white">
            Bóveda requerida para Red y Lab (C2)
          </h2>
          <p className="mt-2 text-xs text-obsidian-muted">
            Desbloquea tu bóveda para habilitar los módulos de red, el flujo WebSocket en vivo y los controles OPSEC.
          </p>
          {accessStatus}
          <button
            type="button"
            onClick={openUnlockModal}
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-obsidian-gold/40 bg-obsidian-surface px-4 py-2 text-xs font-semibold text-white transition-colors hover:border-obsidian-gold hover:bg-obsidian-gold/15"
          >
            <Unlock size={14} aria-hidden="true" />
            <span>Desbloquear bóveda</span>
          </button>
        </div>
      </div>
    );
  }

  if (serviceState !== 'running') {
    const checking = serviceState === 'idle' || serviceState === 'checking';
    const forbidden = serviceState === 'forbidden';
    return (
      <div className="mx-auto max-w-2xl p-6">
        <section aria-labelledby="c2-service-title" className="rounded-xl border border-obsidian-border bg-obsidian-panel p-6 shadow-obsidian sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-obsidian-border bg-obsidian-surface text-obsidian-gold">
              <Network size={21} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="c2-service-title" className="font-heading text-lg font-bold text-white">
                {checking ? 'Comprobando servicio C2' : forbidden ? 'Acceso restringido a C2' : 'Servicio C2 no disponible'}
              </h2>
              <p role="status" className="mt-2 text-sm leading-relaxed text-obsidian-muted">
                {checking ? 'Estamos comprobando la conexión con el servicio de red.' : forbidden ? 'Red y Lab requiere una cuenta con rol Propietario. Si estás usando una cuenta de Ventas, cierra esa sesión en Cuentas del equipo e inicia sesión como propietario.' : 'Para usar Red y Lab, inicia C2 en la computadora donde está instalado LESSSO.'}
              </p>
              {accessStatus}
              {accountStatus === 'signed_out' && !checking && <p className="mt-3 text-xs leading-relaxed text-obsidian-muted">Inicia sesión con una cuenta propietaria en Cuentas del equipo para acceder al servicio.</p>}
              {accountStatus === 'password_change' && <p className="mt-3 text-xs leading-relaxed text-obsidian-muted">Cambia la contraseña temporal de la cuenta en Cuentas del equipo antes de continuar.</p>}
              {forbidden && <p className="mt-3 text-xs leading-relaxed text-obsidian-muted">Si es tu primer acceso como propietario, cambia la contraseña temporal antes de volver a Red y Lab.</p>}
              {!checking && !forbidden && (
                <div className="mt-4 space-y-4 text-sm leading-relaxed text-obsidian-muted">
                  <div>
                    <h3 className="font-semibold text-white">Si C2 está apagado</h3>
                    <p className="mt-1">Abre una terminal en la carpeta del proyecto, ejecuta <code className="break-all text-obsidian-gold">./lessso</code> y elige «Abrir CRM y activar C2 real». Escribe tu contraseña del sistema si se solicita y deja la terminal abierta.</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Si es la primera vez</h3>
                    <p className="mt-1">El mismo menú prepara C2 automáticamente la primera vez que eliges el modo real o de demostración.</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Si ya lo iniciaste</h3>
                    <p className="mt-1">Comprueba que la terminal siga abierta y que C2 esté ejecutándose en la misma computadora que el CRM. Después, pulsa «Volver a comprobar».</p>
                  </div>
                </div>
              )}
              {(forbidden || accountStatus === 'signed_out' || accountStatus === 'password_change' || accountStatus === 'other') && !checking && (
                <button type="button" onClick={() => setActiveSection('settings_team')} className="mt-5 inline-flex min-h-[44px] items-center rounded-lg bg-obsidian-gold px-4 text-sm font-semibold text-black hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold">
                  Ir a Cuentas del equipo
                </button>
              )}
              {!checking && !forbidden && (
                <button type="button" onClick={() => void retryService()} className="mt-5 mr-2 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-obsidian-gold/40 bg-obsidian-surface px-4 text-sm font-semibold text-white transition-colors hover:border-obsidian-gold hover:bg-obsidian-gold/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold">
                  <RefreshCw size={15} aria-hidden="true" /> Volver a comprobar
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 sm:p-4">
      {/* Compact C2 Operations Bar */}
      <div className="rounded-xl border border-obsidian-border bg-obsidian-panel px-3 py-2 shadow-obsidian">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Primary operational row (always visible on mobile and desktop) */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {/* Interface selector (interactive) */}
            <label className="flex min-h-[44px] lg:min-h-9 min-w-0 max-w-full flex-1 sm:flex-initial items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-2.5 py-1.5 text-xs focus-within:border-obsidian-gold">
              <Network size={13} className="shrink-0 text-obsidian-gold" aria-hidden="true" />
              <span className="hidden sm:inline text-[11px] font-medium text-obsidian-muted">{t('iface.label')}:</span>
              <select
                value={selectedIface}
                onChange={(e) => setSelectedIface(e.target.value)}
                aria-label={t('iface.label')}
                className="min-w-0 flex-1 bg-transparent font-mono text-xs text-white focus:outline-none"
              >
                {interfaces.length === 0 ? (
                  <option value="" className="bg-obsidian-panel text-obsidian-muted">
                    --
                  </option>
                ) : (
                  interfaces.map((iface) => {
                    const tag = iface.ip || (iface.wireless ? 'wifi' : t('iface.noIp'));
                    return (
                      <option key={iface.name} value={iface.name} className="bg-obsidian-panel text-white">
                        {iface.name} ({tag})
                      </option>
                    );
                  })
                )}
              </select>
            </label>

            {/* Static telemetry pills on desktop */}
            {gateway?.ip && (
              <span className="hidden md:inline-flex items-center gap-1.5 rounded-md bg-obsidian-bg/60 px-2 py-1 font-mono text-[11px] text-obsidian-muted">
                <Globe size={12} className="text-emerald-400" aria-hidden="true" />
                <span>gw {gateway.ip}</span>
              </span>
            )}

            {/* Interactive OPSEC identity action button on desktop */}
            <button
              type="button"
              onClick={() => setActiveSection('c2_opsec')}
              title={t('opsec.pill')}
              className={`hidden md:inline-flex lg:min-h-9 min-h-[44px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold ${
                isSpoofed
                  ? 'border-obsidian-gold/50 bg-obsidian-gold/15 text-amber-200 hover:bg-obsidian-gold/25'
                  : 'border-obsidian-borderLight bg-obsidian-surface text-obsidian-text hover:border-obsidian-gold/60 hover:text-white'
              }`}
            >
              <Shield size={12} className={isSpoofed ? 'text-obsidian-gold' : 'text-obsidian-muted'} aria-hidden="true" />
              <span className="max-w-[190px] truncate">
                {opsecHost} | {opsecMac}
              </span>
              <ChevronRight size={11} className="text-obsidian-muted shrink-0" aria-hidden="true" />
            </button>

            {/* Interactive active modules popover on desktop */}
            <div ref={modulesContainerRef} className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setModulesOpen((prev) => !prev)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setModulesOpen(false);
                }}
                aria-expanded={modulesOpen}
                aria-haspopup="true"
                title={activeModuleNames.length ? activeModuleNames.join(', ') : t('modules.none')}
                className={`inline-flex min-h-[44px] lg:min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold ${
                  activeModuleCount > 0
                    ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-950/50'
                    : 'border-obsidian-borderLight bg-obsidian-surface text-obsidian-text hover:border-obsidian-gold/60 hover:text-white'
                }`}
              >
                <Cpu size={12} aria-hidden="true" />
                <span>
                  {activeModuleCount > 0 ? t('modules.active', { n: activeModuleCount }) : t('modules.none')}
                </span>
                <ChevronDown size={12} className="text-obsidian-muted" aria-hidden="true" />
              </button>
              {modulesOpen && (
                <div
                  role="region"
                  aria-label={t('modules.active', { n: activeModuleCount })}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setModulesOpen(false);
                  }}
                  className="absolute left-0 top-full z-30 mt-1.5 w-60 rounded-xl border border-obsidian-borderLight bg-obsidian-panel p-2.5 shadow-obsidian"
                >
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-obsidian-muted">
                    {activeModuleCount > 0 ? t('modules.active', { n: activeModuleCount }) : t('modules.none')}
                  </div>
                  {activeModuleNames.length > 0 ? (
                    <ul className="space-y-1">
                      {activeModuleNames.map((name) => (
                        <li key={name} className="flex items-center gap-1.5 text-xs text-emerald-300">
                          <Activity size={11} aria-hidden="true" />
                          <span className="truncate">{name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-obsidian-muted">{t('modules.none')}</p>
                  )}
                </div>
              )}
            </div>

            {/* Static DEMO badge on desktop */}
            {demoMode && (
              <span className="hidden md:inline-flex items-center rounded-md bg-amber-950/35 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                {t('mode.demo')}
              </span>
            )}
          </div>

          {/* Right cluster: WS status + Mobile drawer toggle + Language + isolated PANIC */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Read-only WS status indicator (borderless so it reads clearly as telemetry) */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] ${
                wsConnected ? 'bg-emerald-950/30 text-emerald-300' : 'bg-amber-950/30 text-amber-300'
              }`}
              title={wsConnected ? t('ws.connected') : t('ws.disconnected')}
            >
              <Radio size={12} className={wsConnected ? 'animate-pulse text-emerald-400' : 'text-amber-400'} aria-hidden="true" />
              <span className="hidden sm:inline">{wsConnected ? t('ws.connected') : t('ws.disconnected')}</span>
              <span className="sm:hidden">{wsConnected ? 'WS' : 'WS...'}</span>
            </span>

            {/* Mobile secondary controls toggle (< md only) */}
            <button
              type="button"
              onClick={() => setMobileOpsOpen((prev) => !prev)}
              aria-expanded={mobileOpsOpen}
              aria-label="Estado y opciones C2"
              className="md:hidden inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg border border-obsidian-border bg-obsidian-surface px-2.5 text-xs font-medium text-obsidian-text hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold"
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
              {activeModuleCount > 0 && (
                <span className="rounded bg-emerald-500/20 px-1 font-mono text-[10px] text-emerald-300">
                  {activeModuleCount}
                </span>
              )}
            </button>

            {/* Desktop language toggle */}
            <div
              role="group"
              aria-label={t('lang.label')}
              className="hidden md:inline-flex overflow-hidden rounded-lg border border-obsidian-border bg-obsidian-surface"
            >
              <button
                type="button"
                onClick={() => setLang('es')}
                aria-pressed={lang === 'es'}
                className={`min-h-9 px-2.5 py-1.5 font-mono text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold ${
                  lang === 'es' ? 'bg-obsidian-gold text-obsidian-bg' : 'text-obsidian-muted hover:text-white'
                }`}
              >
                ES
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                aria-pressed={lang === 'en'}
                className={`min-h-9 px-2.5 py-1.5 font-mono text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold ${
                  lang === 'en' ? 'bg-obsidian-gold text-obsidian-bg' : 'text-obsidian-muted hover:text-white'
                }`}
              >
                EN
              </button>
            </div>

            {/* Visual separator before destructive PANIC action */}
            <span className="hidden md:block h-5 w-px bg-obsidian-borderLight/60 mx-0.5" aria-hidden="true" />

            {/* Isolated PANIC kill switch */}
            <button
              type="button"
              onClick={() => void triggerPanic()}
              title={t('panic.title')}
              className="inline-flex min-h-[44px] lg:min-h-9 items-center gap-1.5 rounded-lg border border-red-500/45 bg-obsidian-dangerBg px-3 py-1.5 text-xs font-semibold tracking-wide text-red-200 transition-colors hover:border-red-400 hover:bg-red-950/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <AlertOctagon size={14} aria-hidden="true" />
              <span>{t('panic.btn')}</span>
            </button>
          </div>
        </div>

        {/* Collapsible secondary telemetry & controls drawer for < md mobile screens */}
        {mobileOpsOpen && (
          <div className="md:hidden mt-2.5 pt-2.5 border-t border-obsidian-border/80 flex flex-wrap items-center gap-2 text-xs">
            {gateway?.ip && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-obsidian-bg/60 px-2.5 py-1.5 font-mono text-[11px] text-obsidian-muted">
                <Globe size={12} className="text-emerald-400" aria-hidden="true" />
                <span>gw {gateway.ip}</span>
              </span>
            )}
            {demoMode && (
              <span className="inline-flex items-center rounded-md bg-amber-950/35 px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                {t('mode.demo')}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setMobileOpsOpen(false);
                setActiveSection('c2_opsec');
              }}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] ${
                isSpoofed
                  ? 'border-obsidian-gold/50 bg-obsidian-gold/15 text-amber-200'
                  : 'border-obsidian-border bg-obsidian-surface text-obsidian-text'
              }`}
            >
              <Shield size={12} aria-hidden="true" />
              <span className="max-w-[180px] truncate">{opsecHost} | {opsecMac}</span>
            </button>
            <div className="inline-flex overflow-hidden rounded-lg border border-obsidian-border bg-obsidian-surface">
              <button
                type="button"
                onClick={() => setLang('es')}
                aria-pressed={lang === 'es'}
                className={`min-h-[44px] min-w-[44px] px-2.5 font-mono text-[11px] font-semibold ${
                  lang === 'es' ? 'bg-obsidian-gold text-obsidian-bg' : 'text-obsidian-muted'
                }`}
              >
                ES
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                aria-pressed={lang === 'en'}
                className={`min-h-[44px] min-w-[44px] px-2.5 font-mono text-[11px] font-semibold ${
                  lang === 'en' ? 'bg-obsidian-gold text-obsidian-bg' : 'text-obsidian-muted'
                }`}
              >
                EN
              </button>
            </div>
            <div className="w-full rounded-lg bg-obsidian-bg/60 px-2.5 py-2 text-[11px] text-obsidian-muted">
              {activeModuleCount > 0
                ? `${t('modules.active', { n: activeModuleCount })}: ${activeModuleNames.join(', ')}`
                : t('modules.none')}
            </div>
          </div>
        )}
      </div>

      {/* Environment check warning strip when warnings exist */}
      {envWarnings.some((w) => w.level !== 'ok') && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
          {envWarnings
            .filter((w) => w.level !== 'ok')
            .map((warning, idx) => (
              <span key={`${warning.level}-${idx}`} className="font-mono text-[11px]">
                [{warning.level.toUpperCase()}] {warning.msg}
              </span>
            ))}
        </div>
      )}

      {/* Active C2 Panel Body */}
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div role="status" className="rounded-xl border border-obsidian-border bg-obsidian-panel p-6 text-xs text-obsidian-muted shadow-obsidian">
              Cargando módulo C2...
            </div>
          }
        >
          <ActivePanel />
        </Suspense>
      </div>

      {/* Docked collapsible Event Console */}
      <section className="rounded-xl border border-obsidian-border bg-obsidian-panel shadow-obsidian">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-obsidian-border px-3 py-2">
          <button
            type="button"
            onClick={() => setConsoleOpen((prev) => !prev)}
            aria-expanded={consoleOpen}
            className="flex min-h-[44px] lg:min-h-9 items-center gap-2 text-xs font-semibold text-white hover:text-obsidian-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold rounded-lg px-1"
          >
            <Terminal size={14} className="text-obsidian-gold" aria-hidden="true" />
            <span>{t('console.title')}</span>
            <span className="rounded border border-obsidian-border bg-obsidian-surface px-1.5 py-0.5 font-mono text-[10px] text-obsidian-muted">
              {filteredLogs.length}
            </span>
            {consoleOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronUp size={14} aria-hidden="true" />}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-obsidian-muted">
              <span>{t('console.filter')}:</span>
              <select
                aria-label={t('console.filter')}
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value as 'all' | C2LogType)}
                className="min-h-[44px] lg:min-h-9 rounded border border-obsidian-border bg-obsidian-surface px-2 py-1 font-mono text-[11px] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold"
              >
                <option value="all" className="bg-obsidian-panel">
                  {t('console.all')}
                </option>
                {LOG_FILTER_TYPES.map((type) => (
                  <option key={type} value={type} className="bg-obsidian-panel">
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={clearLogs}
              className="inline-flex min-h-[44px] lg:min-h-9 items-center gap-1 rounded border border-obsidian-border bg-obsidian-surface px-2.5 py-1 text-[11px] text-obsidian-muted transition-colors hover:border-obsidian-borderLight hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian-gold"
            >
              <Trash2 size={12} aria-hidden="true" />
              <span>{t('console.clear')}</span>
            </button>
          </div>
        </div>

        {consoleOpen && (
          <div
            ref={logContainerRef}
            role="log"
            aria-live="polite"
            aria-label={t('console.title')}
            className="max-h-48 overflow-y-auto bg-obsidian-bg/80 px-3 py-2 font-mono text-[11px] leading-relaxed"
          >
            {filteredLogs.length === 0 ? (
              <div className="py-2 text-obsidian-muted">{t('console.empty')}</div>
            ) : (
              filteredLogs.map((entry) => (
                <div key={entry.id} className="flex gap-2 whitespace-pre-wrap break-all">
                  <span className="shrink-0 text-obsidian-muted">[{entry.ts}]</span>
                  <span className={`shrink-0 uppercase ${LOG_TYPE_COLORS[entry.type] || 'text-slate-300'}`}>
                    [{entry.type}]
                  </span>
                  <span className={LOG_TYPE_COLORS[entry.type] || 'text-slate-200'}>{entry.msg}</span>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
};
