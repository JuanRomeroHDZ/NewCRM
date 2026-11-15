import React, { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Mail, Globe, Key, Network, CreditCard, Trash2, Settings, UserRound,
  Lock, Unlock, Search, ChevronLeft, ChevronRight, ChevronDown, Clock,
  Shield, ShieldCheck, FileText, Rocket, MapPinned, Briefcase, X, BookOpen,
  Radar, Server, ScanSearch, ArrowLeftRight, Activity, Route, KeyRound,
  Code2, Radio, Waypoints, Wifi, Camera, UserCheck,
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
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    id: 'inicio',
    label: 'Inicio',
    icon: LayoutDashboard,
    items: [{ id: 'dashboard', label: 'Resumen general', icon: LayoutDashboard }],
  },
  {
    id: 'prospeccion',
    label: 'Prospección',
    icon: Briefcase,
    items: [
      { id: 'capture', label: 'Captación en mapa', icon: MapPinned, requiresVault: true },
      { id: 'prospects', label: 'Prospectos', icon: Rocket, requiresVault: true },
    ],
  },
  {
    id: 'correo-servicios',
    label: 'Correo y servicios',
    icon: Globe,
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
    items: [{ id: 'subscriptions', label: 'Ingresos y gastos', icon: CreditCard }],
  },
  {
    id: 'seguridad',
    label: 'Seguridad',
    icon: ShieldCheck,
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
    items: [
      { id: 'audit_logs', label: 'Historial de actividad', icon: FileText, requiresVault: true },
      { id: 'trash', label: 'Papelera', icon: Trash2, requiresVault: true },
    ],
  },
  {
    id: 'ajustes',
    label: 'Ajustes',
    icon: Settings,
    items: [
      { id: 'settings', label: 'Preferencias', icon: Settings, requiresVault: true },
      { id: 'settings_appearance', label: 'Apariencia', icon: Globe, requiresVault: true },
      { id: 'settings_session', label: 'Sesión y portapapeles', icon: Lock, requiresVault: true },
      { id: 'settings_limits', label: 'Recordatorios y límites', icon: Clock, requiresVault: true },
      { id: 'settings_access', label: 'Contraseña de acceso', icon: Key, requiresVault: true },
      { id: 'settings_network', label: 'Red y servicios', icon: Network, requiresVault: true },
      { id: 'settings_tools', label: 'Herramientas', icon: Settings, requiresVault: true },
      { id: 'settings_backup', label: 'Importación y respaldos', icon: FileText, requiresVault: true },
      { id: 'settings_team', label: 'Accesos del equipo', icon: Shield, requiresVault: true },
    ],
  },
];

const groupForSection = (section: SectionType) => navGroups.find((group) => group.items.some((item) => item.id === section))?.id;

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, onCloseMobile }) => {
  const {
    activeSection, setActiveSection, isUnlocked, remainingSeconds, openUnlockModal,
    lockVault, openCommandPalette,
    searchHotkey,
  } = useVault();
  const [collapsed, setCollapsed] = useState(false);
  const [profileImage, setProfileImage] = useState(() => {
    try { return localStorage.getItem('lessso-profile-image') || ''; } catch { return ''; }
  });
  const [imageError, setImageError] = useState('');
  const imageInput = useRef<HTMLInputElement>(null);
  const chooseImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) {
      setImageError('Elige una imagen PNG, JPEG o WebP de hasta 1 MB.');
      return;
    }
    setImageError('');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      try { localStorage.setItem('lessso-profile-image', reader.result); setProfileImage(reader.result); }
      catch { setImageError('No se pudo guardar la imagen. Revisa el espacio disponible.'); }
    };
    reader.onerror = () => setImageError('No se pudo leer la imagen. Inténtalo de nuevo.');
    reader.readAsDataURL(file);
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

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const seconds = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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
      aria-label="Navegación principal"
      role={!isDesktop && isMobileOpen ? "dialog" : undefined}
      aria-modal={!isDesktop && isMobileOpen ? true : undefined}
      aria-hidden={!isDesktop && !isMobileOpen ? true : undefined}
      onKeyDown={handleMobileTab}
      className={`responsive-sidebar fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-72 max-w-[calc(100vw-2rem)] shrink-0 flex-col border-r border-obsidian-border bg-obsidian-panel transition-transform duration-200 ease-out lg:static lg:h-[100dvh] lg:max-w-none ${compact ? 'lg:w-10 lg:border-r-0 lg:bg-transparent' : 'lg:w-64'} ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
    >
      <div className={`flex h-16 shrink-0 items-center justify-between border-b border-obsidian-border ${compact ? 'bg-obsidian-panel/95 px-1' : 'px-4'}`}>
        {!compact ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" onClick={() => imageInput.current?.click()} className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-indigo-400/20 bg-indigo-600 text-white" title="Cambiar foto de perfil" aria-label="Cambiar foto de perfil">
              {profileImage ? <img src={profileImage} alt="" className="h-full w-full object-cover" /> : <UserRound size={18} aria-hidden="true" />}
            </button>
            <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label="Seleccionar foto de perfil" onChange={chooseImage} />
            <div className="min-w-0">
              <span className="block truncate text-sm font-bold tracking-tight text-white">LESSSO</span>
              <span className="-mt-0.5 block truncate text-[10px] text-obsidian-muted">Just a leap of faith</span>
            </div>
          </div>
        ) : (
          <span className="sr-only">LESSSO</span>
        )}

        <button type="button" onClick={onCloseMobile} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-obsidian-muted hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 lg:hidden" aria-label="Cerrar menú">
          <X size={18} />
        </button>
        <button type="button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed} className={`hidden min-h-10 min-w-8 items-center justify-center rounded-lg p-1.5 text-obsidian-muted hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 lg:inline-flex ${compact ? 'mx-auto shrink-0' : ''}`} title={collapsed ? 'Expandir menú' : 'Colapsar menú'} aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {!compact && <>
      {imageError && <p role="alert" className="px-4 pb-2 text-xs leading-relaxed text-rose-300">{imageError}</p>}

      <div className={`shrink-0 pb-2 ${compact ? 'px-2' : 'px-3'}`}>
        <button type="button" onClick={() => { openCommandPalette(); onCloseMobile(); }} className={`group flex min-h-10 w-full items-center rounded-xl border border-obsidian-border bg-obsidian-bg text-xs text-obsidian-muted transition-colors hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 ${compact ? 'justify-center px-2' : 'justify-between gap-2 px-3'}`} title={compact ? 'Buscador rápido' : undefined} aria-label={compact ? 'Buscador rápido' : undefined}>
          <span className="flex min-w-0 items-center gap-2"><Search size={14} className="shrink-0 group-hover:text-indigo-300" />{!compact && <span className="truncate">Buscar en LESSSO</span>}</span>
          {!compact && <kbd className="shrink-0 rounded border border-obsidian-border bg-obsidian-panel px-1.5 py-0.5 font-mono text-[10px]">{searchHotkey.toUpperCase()}</kbd>}
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Secciones">
        <ul className="space-y-1">
          {navGroups.map((group) => {
            const GroupIcon = group.icon;
            const expanded = Boolean(expandedGroups[group.id]);
            const groupIsActive = group.items.some((item) => item.id === activeSection);
            const listId = `nav-group-${group.id}`;
            return (
              <li key={group.id}>
                {!compact && <button type="button" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpandedGroups((current) => ({ ...current, [group.id]: !current[group.id] }))} className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 lg:min-h-9 ${groupIsActive ? 'text-indigo-200' : 'text-obsidian-muted hover:bg-obsidian-surface hover:text-white'}`}>
                  <GroupIcon size={14} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-left">{group.label}</span>
                  <ChevronDown size={13} className={`shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                </button>}
                <ul id={listId} hidden={!expanded && !compact} className={`${compact ? 'my-1' : 'ml-2 border-l border-obsidian-border pl-2'} space-y-0.5`}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeSection === item.id;
                    const locked = Boolean(item.requiresVault && !isUnlocked);
                    return (
                      <React.Fragment key={item.id}>
                        {!compact && item.subgroup && (
                          <li role="presentation" className="px-3 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-obsidian-muted">
                            {item.subgroup}
                          </li>
                        )}
                        <li>
                          <button type="button" onClick={() => selectSection(item)} aria-current={active ? 'page' : undefined} title={locked ? `${item.label}: requiere desbloquear la bóveda` : compact ? item.label : undefined} aria-label={locked ? `${item.label}. Requiere desbloquear la bóveda` : compact ? item.label : undefined} className={`flex min-h-11 w-full items-center rounded-lg text-left text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 lg:min-h-10 ${compact ? 'justify-center px-2' : 'gap-2.5 px-3'} ${active ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-950/30' : 'text-obsidian-text hover:bg-obsidian-surface hover:text-white'}`}>
                            <Icon size={15} className={`shrink-0 ${active ? 'text-white' : 'text-obsidian-muted'}`} />
                            {!compact && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                            {!compact && locked && <Lock size={12} className="shrink-0 text-amber-400/80" aria-hidden="true" />}
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
          <div className={`flex items-center justify-center rounded-xl border p-1 transition-colors ${isUnlocked ? 'border-obsidian-border bg-obsidian-panel text-obsidian-muted' : 'border-obsidian-border bg-obsidian-surface text-obsidian-muted'}`}>
            <button
              type="button"
              onClick={toggleVault}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-current hover:bg-obsidian-border/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
              title={isUnlocked ? `Bóveda activa (${formatTimer(remainingSeconds)})` : 'Bóveda bloqueada'}
              aria-label={isUnlocked ? 'Bloquear bóveda' : 'Desbloquear bóveda'}
            >
              {isUnlocked ? <Unlock size={15} className="text-emerald-400" /> : <Lock size={15} className="text-obsidian-muted" />}
            </button>
          </div>
        ) : (
          <div className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-colors ${isUnlocked ? 'border-obsidian-border bg-obsidian-panel text-obsidian-muted' : 'border-obsidian-border bg-obsidian-surface text-obsidian-muted'}`}>
            <div className="flex min-w-0 items-center gap-2">
              {isUnlocked ? <Unlock size={15} className="shrink-0 text-emerald-400" /> : <Lock size={15} className="shrink-0 text-obsidian-muted" />}
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-white">{isUnlocked ? 'Bóveda activa' : 'Bóveda bloqueada'}</div>
                <div className="truncate font-mono text-[11px] text-obsidian-muted">{isUnlocked ? `Cierre ${formatTimer(remainingSeconds)}` : 'Acceso cifrado'}</div>
              </div>
            </div>
            <button type="button" onClick={toggleVault} className="min-h-[44px] lg:min-h-9 shrink-0 rounded-lg bg-obsidian-surface px-2.5 text-[10px] font-semibold text-white transition-colors hover:bg-obsidian-borderLight focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
              {isUnlocked ? 'Bloquear' : 'Desbloquear'}
            </button>
          </div>
        )}
      </footer>
      </>}

    </aside>
  );
};
