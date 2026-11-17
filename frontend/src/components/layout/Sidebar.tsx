import React, { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Mail, Globe, Key, Network, CreditCard, Trash2, Settings, UserRound,
  Lock, Unlock, Search, ChevronLeft, ChevronRight, ChevronDown, Clock,
  Shield, ShieldCheck, FileText, Rocket, MapPinned, Briefcase, X, BookOpen,
  Radar, Server, ScanSearch, ArrowLeftRight, Activity, Route, KeyRound,
  Code2, Radio, Waypoints, Wifi, Camera, UserCheck, RotateCcw,
} from 'lucide-react';
import { useVault, SectionType } from '../../context/VaultContext';

interface SidebarProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  id: SectionType;
  label: string;
  icon: LucideIcon;
  requiresVault?: boolean;
  subgroup?: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  overview: SectionType;
  overviewRequiresVault?: boolean;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    id: 'inicio',
    label: 'Inicio',
    icon: LayoutDashboard,
    overview: 'dashboard',
    items: [{ id: 'help', label: 'Guía y primeros pasos', icon: BookOpen }],
  },
  {
    id: 'prospeccion',
    label: 'Prospección',
    icon: Briefcase,
    overview: 'overview_prospection',
    overviewRequiresVault: true,
    items: [
      { id: 'capture', label: 'Captación en mapa', icon: MapPinned, requiresVault: true },
      { id: 'prospects', label: 'Prospectos', icon: Rocket, requiresVault: true },
    ],
  },
  {
    id: 'correo-servicios',
    label: 'Correo y servicios',
    icon: Globe,
    overview: 'overview_communications',
    overviewRequiresVault: true,
    items: [
      { id: 'emails', label: 'Correos principales', icon: Mail, requiresVault: true },
      { id: 'platforms', label: 'Servicios vinculados', icon: Globe },
      { id: 'graph', label: 'Conexiones', icon: Network, requiresVault: true },
    ],
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    icon: CreditCard,
    overview: 'overview_finances',
    overviewRequiresVault: true,
    items: [
      { id: 'finance_income', label: 'Ingresos y pagos', icon: CreditCard, requiresVault: true },
      { id: 'finance_services', label: 'Servicios y vencimientos', icon: Globe, requiresVault: true },
      { id: 'finance_expenses', label: 'Gastos', icon: FileText, requiresVault: true },
      { id: 'finance_cards', label: 'Tarjetas y métodos', icon: CreditCard, requiresVault: true },
    ],
  },
  {
    id: 'seguridad',
    label: 'Seguridad',
    icon: ShieldCheck,
    overview: 'overview_security',
    overviewRequiresVault: true,
    items: [
      { id: 'passwords', label: 'Contraseñas y notas', icon: Key, requiresVault: true },
      { id: 'writeups', label: 'Informes de seguridad', icon: BookOpen, requiresVault: true },
      { id: 'security_audit', label: 'Auditoría de seguridad', icon: ShieldCheck, requiresVault: true },
    ],
  },
  {
    id: 'c2',
    label: 'Red y Lab (C2)',
    icon: Radar,
    overview: 'overview_c2',
    overviewRequiresVault: true,
    items: [
      { id: 'c2_hosts', label: 'Hosts', icon: Server, requiresVault: true, subgroup: 'Reconocimiento' },
      { id: 'c2_topo', label: 'Topología', icon: Network, requiresVault: true },
      { id: 'c2_ports', label: 'Puertos', icon: ScanSearch, requiresVault: true },
      { id: 'c2_mitm', label: 'MITM (ARP)', icon: ArrowLeftRight, requiresVault: true, subgroup: 'MITM y Tráfico' },
      { id: 'c2_sniff', label: 'Sniffer', icon: Activity, requiresVault: true },
      { id: 'c2_dns', label: 'DNS Spoof', icon: Route, requiresVault: true },
      { id: 'c2_creds', label: 'Credenciales', icon: KeyRound, requiresVault: true },
      { id: 'c2_http', label: 'HTTP Inject', icon: Code2, requiresVault: true },
      { id: 'c2_poison', label: 'Poisoners', icon: Radio, requiresVault: true },
      { id: 'c2_mitm6', label: 'mitm6', icon: Waypoints, requiresVault: true },
      { id: 'c2_wifi', label: 'Wi-Fi', icon: Wifi, requiresVault: true, subgroup: 'Wireless y OPSEC' },
      { id: 'c2_camera', label: 'Cámaras', icon: Camera, requiresVault: true },
      { id: 'c2_opsec', label: 'OPSEC', icon: UserCheck, requiresVault: true },
    ],
  },
  {
    id: 'actividad',
    label: 'Actividad y papelera',
    icon: FileText,
    overview: 'overview_activity',
    overviewRequiresVault: true,
    items: [
      { id: 'audit_logs', label: 'Historial de actividad', icon: FileText, requiresVault: true },
      { id: 'trash', label: 'Papelera', icon: Trash2, requiresVault: true },
    ],
  },
  {
    id: 'ajustes',
    label: 'Ajustes',
    icon: Settings,
    overview: 'overview_settings',
    overviewRequiresVault: true,
    items: [
      { id: 'settings', label: 'Preferencias', icon: Settings, requiresVault: true },
      { id: 'settings_appearance', label: 'Apariencia', icon: Globe, requiresVault: true },
      { id: 'settings_session', label: 'Sesión y portapapeles', icon: Lock, requiresVault: true },
      { id: 'settings_limits', label: 'Recordatorios y límites', icon: Clock, requiresVault: true },
      { id: 'settings_access', label: 'Contraseña de acceso', icon: Key, requiresVault: true },
      { id: 'settings_network', label: 'Red y servicios', icon: Network, requiresVault: true },
      { id: 'settings_writeups', label: 'Informes de seguridad', icon: BookOpen, requiresVault: true },
      { id: 'settings_tools', label: 'Herramientas', icon: Settings, requiresVault: true },
      { id: 'settings_backup', label: 'Importación y respaldos', icon: FileText, requiresVault: true },
      { id: 'settings_team', label: 'Accesos del equipo', icon: Shield, requiresVault: true },
    ],
  },
];

const groupForSection = (section: SectionType) => navGroups.find((group) => group.overview === section || group.items.some((item) => item.id === section))?.id;
const PROFILE_IMAGE_STORAGE_KEY = 'lessso-profile-image';

const prepareProfileImage = async (file: File): Promise<string> => {
  const bitmap = await createImageBitmap(file);
  try {
    const maxDimension = 256;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo procesar la imagen.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('No se pudo procesar la imagen.')), 'image/webp', 0.86);
    });
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No se pudo leer la imagen procesada.'));
      reader.onerror = () => reject(new Error('No se pudo leer la imagen procesada.'));
      reader.readAsDataURL(blob);
    });
  } finally {
    bitmap.close();
  }
};

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, onCloseMobile }) => {
  const {
    activeSection, setActiveSection, isUnlocked, remainingSeconds, openUnlockModal,
    lockVault, openCommandPalette, recordVaultActivity, showToast,
    searchHotkey,
  } = useVault();
  const [collapsed, setCollapsed] = useState(false);
  const [profileImage, setProfileImage] = useState(() => {
    try { return localStorage.getItem(PROFILE_IMAGE_STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [imageError, setImageError] = useState('');
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [resettingTimer, setResettingTimer] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const profileMenu = useRef<HTMLDetailsElement>(null);
  const chooseImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) {
      setImageError('Elige una imagen PNG, JPEG o WebP de hasta 1 MB.');
      return;
    }
    setImageError('');
    setImageProcessing(true);
    try {
      const imageData = await prepareProfileImage(file);
      localStorage.setItem(PROFILE_IMAGE_STORAGE_KEY, imageData);
      setProfileImage(imageData);
      setImageUnavailable(false);
      if (profileMenu.current) profileMenu.current.open = false;
    } catch {
      setImageError('No se pudo guardar la imagen. Elige otra imagen e inténtalo de nuevo.');
    } finally {
      setImageProcessing(false);
    }
  };
  const removeProfileImage = () => {
    try {
      localStorage.removeItem(PROFILE_IMAGE_STORAGE_KEY);
      setProfileImage('');
      setImageUnavailable(false);
      setImageError('');
      if (profileMenu.current) profileMenu.current.open = false;
    } catch {
      setImageError('No se pudo quitar la foto. Inténtalo de nuevo.');
    }
  };
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ inicio: true, prospeccion: true });
  const asideRef = useRef<HTMLElement>(null);
  const compact = collapsed && isDesktop;

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const activeGroup = groupForSection(activeSection);
    if (activeGroup) setExpandedGroups((current) => ({ ...current, [activeGroup]: true }));
  }, [activeSection]);

  useEffect(() => {
    const aside = asideRef.current;
    if (!aside) return;
    const modalOpen = isMobileOpen && !isDesktop;
    aside.inert = !isDesktop && !isMobileOpen;
    if (modalOpen) aside.querySelector<HTMLElement>('button:not([disabled])')?.focus();
  }, [isDesktop, isMobileOpen]);

  const formatTimerParts = (secs: number) => {
    const totalSeconds = Math.max(0, Math.floor(secs));
    return {
      hours: String(Math.floor(totalSeconds / 3600)).padStart(2, '0'),
      minutes: String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0'),
      seconds: String(totalSeconds % 60).padStart(2, '0'),
    };
  };

  const formatTimer = (secs: number) => {
    const { hours, minutes, seconds } = formatTimerParts(secs);
    return `${hours}:${minutes}:${seconds}`;
  };

  const resetVaultTimer = async () => {
    if (!isUnlocked || resettingTimer) return;
    setResettingTimer(true);
    try {
      const result = await recordVaultActivity();
      showToast(
        result.account_active === false
          ? 'La cuenta ya no está activa. Revisa tu sesión.'
          : 'Temporizador de la bóveda reiniciado.',
        result.account_active === false ? 'warning' : 'success',
      );
    } catch {
      showToast('No se pudo reiniciar el temporizador. La bóveda permanece abierta.', 'error');
    } finally {
      setResettingTimer(false);
    }
  };

  const selectSection = (item: NavItem) => {
    setActiveSection(item.id);
    if (item.requiresVault && !isUnlocked) openUnlockModal();
    onCloseMobile();
  };

  const toggleVault = () => isUnlocked ? lockVault() : openUnlockModal();

  const handleMobileTab = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!isMobileOpen || isDesktop || event.key !== 'Tab' || !asideRef.current) return;
    const focusable = Array.from(asideRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <aside
      ref={asideRef}
      id="primary-navigation"
      data-collapsed={compact ? 'true' : undefined}
      aria-label="Navegación principal"
      role={!isDesktop && isMobileOpen ? "dialog" : undefined}
      aria-modal={!isDesktop && isMobileOpen ? true : undefined}
      aria-hidden={!isDesktop && !isMobileOpen ? true : undefined}
      onKeyDown={handleMobileTab}
      className={`responsive-sidebar fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-72 max-w-[calc(100vw-2rem)] shrink-0 flex-col border-r border-obsidian-border bg-obsidian-panel transition-transform duration-200 ease-out lg:max-w-none ${compact ? 'lg:relative lg:h-0 lg:w-0 lg:border-r-0 lg:bg-transparent' : 'lg:static lg:h-[100dvh] lg:w-64'} ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
    >
      <div className={`sidebar-heading flex min-h-16 shrink-0 items-center justify-between ${compact ? 'fixed left-0 top-0 z-50 w-10 px-1' : 'border-b border-obsidian-border px-4'}`}>
        {!compact ? (
          <div className="flex min-w-0 items-center gap-3">
            {/* [Menú y selector] Gestionar la imagen de perfil. */}
            <details ref={profileMenu} className="relative shrink-0">
              <summary
                data-caret="manual"
                aria-label="Opciones de foto de perfil"
                title={profileImage ? 'Opciones de foto de perfil' : 'Agregar foto de perfil'}
                className="ui-action-icon cursor-pointer list-none overflow-hidden [&::-webkit-details-marker]:hidden"
              >
                {profileImage && !imageUnavailable ? (
                  <img
                    src={profileImage}
                    alt=""
                    aria-hidden="true"
                    width={44}
                    height={44}
                    onError={() => setImageUnavailable(true)}
                    className="h-full w-full object-cover"
                  />
                ) : <UserRound size={18} aria-hidden="true" />}
              </summary>
              <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-obsidian-border bg-obsidian-panel p-1 shadow-xl">
                <button
                  type="button"
                  disabled={imageProcessing}
                  onClick={() => imageInput.current?.click()}
                  className="ui-menu-item disabled:cursor-wait"
                >
                  <Camera size={16} className="text-obsidian-muted" aria-hidden="true" />
                  {imageProcessing ? 'Procesando foto…' : profileImage ? 'Cambiar foto' : 'Agregar foto'}
                </button>
                {profileImage && (
                  <button
                    type="button"
                    onClick={removeProfileImage}
                    className="ui-menu-item ui-action-danger"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    Quitar foto
                  </button>
                )}
              </div>
            </details>
            <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label="Seleccionar foto de perfil" onChange={chooseImage} />
            <div className="sidebar-brand-label min-w-0">
              <span className="block truncate text-sm font-bold tracking-tight text-white">LESSSO</span>
              <span className="-mt-0.5 block truncate text-[10px] text-obsidian-muted">Just a leap of faith</span>
            </div>
          </div>
        ) : (
          <span className="sr-only">LESSSO</span>
        )}

        {/* [Icono] Cerrar o compactar la navegación. */}
        <button type="button" onClick={onCloseMobile} className="ui-action-icon lg:hidden" aria-label="Cerrar menú">
          <X size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed} className={`ui-action-icon hidden lg:inline-flex ${compact ? 'mx-auto shrink-0' : ''}`} title={collapsed ? 'Expandir menú' : 'Colapsar menú'} aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {!compact && <>
      {imageError && <p role="alert" className="px-4 pb-2 text-xs leading-relaxed text-rose-300">{imageError}</p>}

      <div className="shrink-0 pb-2">
        {/* [Navegación] Abre la búsqueda global sin cambiar de sección. */}
        <button type="button" onClick={() => { openCommandPalette(); onCloseMobile(); }} className="ui-nav-action group w-full justify-between border-y border-obsidian-border bg-obsidian-bg px-4" aria-label="Buscador rápido">
          <span className="flex min-w-0 items-center gap-2"><Search size={16} className="shrink-0 group-hover:text-white" aria-hidden="true" />{!compact && <span className="truncate">Buscar en LESSSO</span>}</span>
          {!compact && <kbd className="shrink-0 rounded border border-obsidian-border bg-obsidian-panel px-1.5 py-0.5 font-mono text-[10px]">{searchHotkey.toUpperCase()}</kbd>}
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Secciones">
        {/* [Navegación] El grupo abre su resumen; el chevrón despliega sus secciones. */}
        <ul className="space-y-1">
          {navGroups.map((group) => {
            const GroupIcon = group.icon;
            const expanded = Boolean(expandedGroups[group.id]);
            const groupIsActive = group.overview === activeSection || group.items.some((item) => item.id === activeSection);
            const listId = `nav-group-${group.id}`;
            const groupOverviewItem: NavItem = { id: group.overview, label: `${group.label} · Vista general`, icon: group.icon, requiresVault: group.overviewRequiresVault };
            return (
              <li key={group.id}>
                <div className="flex min-w-0 items-center">
                  <button type="button" onClick={() => selectSection(groupOverviewItem)} aria-current={activeSection === group.overview ? 'page' : undefined} title={compact ? `${group.label} · Vista general` : undefined} aria-label={compact ? `${group.label} · Vista general` : undefined} className={`ui-nav-action min-w-0 flex-1 ${compact ? 'justify-center px-2' : ''} ${groupIsActive ? 'text-obsidian-text' : ''}`}>
                    <GroupIcon size={16} className="shrink-0" />
                    {!compact && <span className="min-w-0 flex-1 truncate">{group.label}</span>}
                  </button>
                  {!compact && <button type="button" aria-label={`${expanded ? 'Contraer' : 'Expandir'} ${group.label}`} aria-expanded={expanded} aria-controls={listId} onClick={() => setExpandedGroups((current) => ({ ...current, [group.id]: !current[group.id] }))} className="ui-action-icon">
                    <ChevronDown size={16} className={`shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                  </button>}
                </div>
                <ul id={listId} hidden={!expanded && !compact} className={`${compact ? 'my-1' : 'ml-2 border-l border-obsidian-border pl-2'} space-y-1`}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeSection === item.id;
                    const locked = Boolean(item.requiresVault && !isUnlocked);
                    return (
                      <React.Fragment key={item.id}>
                        {!compact && item.subgroup && (
                          <li role="presentation" className="px-3 pt-2 pb-0.5 text-xs font-medium text-obsidian-muted">
                            {item.subgroup}
                          </li>
                        )}
                        <li>
                          <button type="button" onClick={() => selectSection(item)} aria-current={active ? 'page' : undefined} title={locked ? `${item.label}: requiere desbloquear la bóveda` : compact ? item.label : undefined} aria-label={locked ? `${item.label}. Requiere desbloquear la bóveda` : compact ? item.label : undefined} className={`ui-nav-action w-full ${compact ? 'justify-center px-2' : ''} ${active ? 'text-white' : 'text-obsidian-text'}`}>
                            <Icon size={16} className={`shrink-0 ${active ? 'text-white' : 'text-obsidian-muted'}`} />
                            {!compact && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                            {!compact && locked && <Lock size={16} className="shrink-0 text-amber-400/80" aria-hidden="true" />}
                          </button>
                        </li>
                      </React.Fragment>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </nav>

      <footer className={`shrink-0 border-t border-obsidian-border ${compact ? 'p-2' : 'p-3'}`}>
        {compact ? (
          <div className="flex items-center justify-center text-obsidian-muted">
            <button
              type="button"
              onClick={toggleVault}
              className="ui-action-icon shrink-0"
              title={isUnlocked ? `Bóveda activa (${formatTimer(remainingSeconds)})` : 'Bóveda bloqueada'}
              aria-label={isUnlocked ? 'Bloquear bóveda' : 'Desbloquear bóveda'}
            >
              {isUnlocked ? <Unlock size={16} className="text-emerald-400" aria-hidden="true" /> : <Lock size={16} className="text-obsidian-muted" aria-hidden="true" />}
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-obsidian-border bg-obsidian-panel p-3 text-obsidian-muted">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-white">{isUnlocked ? 'Bóveda activa' : 'Bóveda bloqueada'}</div>
                {isUnlocked ? (
                  <div className="sidebar-timer mt-2 grid grid-cols-3 gap-1" aria-label={`Tiempo restante: ${formatTimer(remainingSeconds)}`}>
                    {(['Horas', 'Minutos', 'Segundos'] as const).map((label, index) => {
                      const parts = formatTimerParts(remainingSeconds);
                      const value = [parts.hours, parts.minutes, parts.seconds][index];
                      return (
                        <div key={label} className="min-w-0 text-center">
                          <span className="block text-[10px] text-obsidian-muted">{label}</span>
                          <span className="font-mono text-xs tabular-nums text-obsidian-text">{value}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="mt-1 truncate text-[11px] text-obsidian-muted">Acceso cifrado</div>}
              </div>
              {/* [Icono] Bloquear o desbloquear la bóveda. */}
              <button type="button" onClick={toggleVault} aria-label={isUnlocked ? 'Bloquear bóveda' : 'Desbloquear bóveda'} title={isUnlocked ? 'Bloquear bóveda' : 'Desbloquear bóveda'} className="ui-action-icon shrink-0">
                {isUnlocked ? <Unlock size={16} className="text-emerald-400" aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
              </button>
            </div>
            {isUnlocked && (
              <button
                type="button"
                onClick={() => void resetVaultTimer()}
                disabled={resettingTimer}
                className="ui-action-secondary mt-2 w-full whitespace-nowrap px-2 disabled:cursor-wait"
              >
                <RotateCcw size={16} className={resettingTimer ? 'animate-spin' : ''} aria-hidden="true" />
                {resettingTimer ? 'Reiniciando…' : 'Reiniciar temporizador'}
              </button>
            )}
          </div>
        )}
      </footer>
      </>}

    </aside>
  );
};
