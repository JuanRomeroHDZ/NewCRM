import React, { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Mail, Globe, Key, Network, CreditCard, Trash2, Settings,
  Lock, Unlock, Search, Sparkles, ChevronLeft, ChevronRight, ChevronDown,
  Shield, ShieldCheck, FileText, Code, Rocket, MapPinned, Briefcase, X, BookOpen,
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
    id: 'crm',
    label: 'CRM',
    icon: Briefcase,
    items: [
      { id: 'capture', label: 'Captación en mapa', icon: MapPinned, requiresVault: true },
      { id: 'prospects', label: 'Prospectos', icon: Rocket, requiresVault: true },
    ],
  },
  {
    id: 'cuentas',
    label: 'Cuentas',
    icon: Globe,
    items: [
      { id: 'emails', label: 'Correos principales', icon: Mail, requiresVault: true },
      { id: 'platforms', label: 'Cuentas y servicios', icon: Globe },
      { id: 'graph', label: 'Mapa de conexiones', icon: Network },
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
    label: 'Sistema y seguridad',
    icon: ShieldCheck,
    items: [
      { id: 'passwords', label: 'Contraseñas y notas', icon: Key, requiresVault: true },
      { id: 'writeups', label: 'Writeups y pizarra', icon: BookOpen, requiresVault: true },
      { id: 'security_audit', label: 'Auditoría de seguridad', icon: ShieldCheck, requiresVault: true },
      { id: 'audit_logs', label: 'Historial de actividad', icon: FileText, requiresVault: true },
      { id: 'trash', label: 'Papelera', icon: Trash2, requiresVault: true },
      { id: 'settings', label: 'Ajustes', icon: Settings, requiresVault: true },
    ],
  },
];

const groupForSection = (section: SectionType) => navGroups.find((group) => group.items.some((item) => item.id === section))?.id;

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, onCloseMobile }) => {
  const {
    activeSection, setActiveSection, isUnlocked, remainingSeconds, openUnlockModal,
    lockVault, openCommandPalette, openPasswordGen, openEmergencyKit, openEnvExport,
    searchHotkey,
  } = useVault();
  const [collapsed, setCollapsed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ inicio: true, crm: true });
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
    ));
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
      aria-label="Navegación principal"
      role={!isDesktop && isMobileOpen ? 'dialog' : undefined}
      aria-modal={!isDesktop && isMobileOpen ? true : undefined}
      aria-hidden={!isDesktop && !isMobileOpen ? true : undefined}
      onKeyDown={handleMobileTab}
      className={`responsive-sidebar fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-72 max-w-[calc(100vw-2rem)] shrink-0 flex-col border-r border-obsidian-border bg-obsidian-panel transition-transform duration-200 ease-out lg:static lg:h-[100dvh] lg:max-w-none ${collapsed ? 'lg:w-16' : 'lg:w-64'} ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-obsidian-border px-4">
        {!compact ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white shadow-md shadow-indigo-600/30">
              <Network size={18} />
            </div>
            <div className="min-w-0">
              <span className="block truncate text-sm font-bold tracking-tight text-white">Contact | LESSSO</span>
              <span className="-mt-0.5 block truncate text-[10px] text-obsidian-muted">Cuentas y clientes</span>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white" aria-label="Contact | LESSSO">
            <Network size={18} />
          </div>
        )}

        <button type="button" onClick={onCloseMobile} className="rounded-lg p-2 text-obsidian-muted hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 lg:hidden" aria-label="Cerrar menú">
          <X size={18} />
        </button>
        <button type="button" onClick={() => setCollapsed((value) => !value)} className="hidden rounded-lg p-1.5 text-obsidian-muted hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 lg:inline-flex" title={collapsed ? 'Expandir menú' : 'Colapsar menú'} aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className="shrink-0 p-3">
        <div className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-colors ${isUnlocked ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-obsidian-border bg-obsidian-surface text-obsidian-muted'}`}>
          <div className="flex min-w-0 items-center gap-2">
            {isUnlocked ? <Unlock size={16} className="shrink-0 text-emerald-400" /> : <Lock size={16} className="shrink-0 text-amber-400" />}
            {!compact && <div className="min-w-0">
              <div className="truncate text-[11px] font-semibold text-white">{isUnlocked ? 'Bóveda desbloqueada' : 'Bóveda bloqueada'}</div>
              <div className="truncate text-[10px] text-obsidian-muted">{isUnlocked ? `Se bloquea en ${formatTimer(remainingSeconds)}` : 'Protegida con contraseña de acceso'}</div>
            </div>}
          </div>
          {!compact && <button type="button" onClick={toggleVault} className={`min-h-8 shrink-0 rounded-lg px-2 text-[10px] font-semibold transition-colors ${isUnlocked ? 'bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}>
            {isUnlocked ? 'Bloquear' : 'Desbloquear'}
          </button>}
          {compact && <button type="button" onClick={toggleVault} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-obsidian-muted hover:bg-obsidian-border hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300" aria-label={isUnlocked ? 'Bloquear bóveda' : 'Desbloquear bóveda'}>{isUnlocked ? <Unlock size={15} /> : <Lock size={15} />}</button>}
        </div>
      </div>

      <div className="shrink-0 px-3 pb-2">
        <button type="button" onClick={() => { openCommandPalette(); onCloseMobile(); }} className="group flex min-h-10 w-full items-center justify-between gap-2 rounded-xl border border-obsidian-border bg-obsidian-bg px-3 text-xs text-obsidian-muted transition-colors hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300" title={compact ? 'Buscador rápido' : undefined} aria-label="Abrir buscador rápido">
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
                {!compact && <button type="button" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpandedGroups((current) => ({ ...current, [group.id]: !current[group.id] }))} className={`flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 ${groupIsActive ? 'text-indigo-200' : 'text-obsidian-muted hover:bg-obsidian-surface hover:text-white'}`}>
                  <GroupIcon size={14} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-left">{group.label}</span>
                  <ChevronDown size={13} className={`shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                </button>}
                <ul id={listId} hidden={!expanded && !compact} className={`${compact ? 'my-1' : 'ml-2 border-l border-obsidian-border pl-2'} space-y-0.5`}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeSection === item.id;
                    const locked = Boolean(item.requiresVault && !isUnlocked);
                    return <li key={item.id}>
                      <button type="button" onClick={() => selectSection(item)} aria-current={active ? 'page' : undefined} title={compact ? item.label : undefined} className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 ${active ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-950/30' : 'text-obsidian-text hover:bg-obsidian-surface hover:text-white'}`}>
                        <Icon size={15} className={`shrink-0 ${active ? 'text-white' : 'text-obsidian-muted'}`} />
                        {!compact && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                        {!compact && locked && <Lock size={11} className="shrink-0 text-amber-400/80" aria-label="Requiere desbloquear la bóveda" />}
                      </button>
                    </li>;
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={`shrink-0 space-y-1.5 border-t border-obsidian-border p-3 ${compact ? 'lg:px-2' : ''}`}>
        <button type="button" onClick={() => { openEnvExport(); onCloseMobile(); }} title={compact ? 'Descargar archivo .env' : undefined} aria-label="Descargar archivo .env" className="flex min-h-9 w-full items-center gap-2.5 rounded-lg border border-obsidian-border bg-obsidian-surface/60 px-3 text-left text-[11px] text-obsidian-muted transition-colors hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
          <Code size={14} className="shrink-0 text-cyan-300" />{!compact && <span className="truncate">Exportar configuración</span>}
        </button>
        <button type="button" onClick={() => { openEmergencyKit(); onCloseMobile(); }} title={compact ? 'Hoja de recuperación' : undefined} aria-label="Abrir hoja de recuperación" className="flex min-h-9 w-full items-center gap-2.5 rounded-lg border border-obsidian-border bg-obsidian-surface/60 px-3 text-left text-[11px] text-obsidian-muted transition-colors hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
          <Shield size={14} className="shrink-0 text-indigo-300" />{!compact && <span className="truncate">Hoja de recuperación</span>}
        </button>
        <button type="button" onClick={() => { openPasswordGen(); onCloseMobile(); }} title={compact ? 'Generar contraseña' : undefined} aria-label="Generar contraseña" className="flex min-h-10 w-full items-center gap-2.5 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 text-left text-xs text-obsidian-text transition-colors hover:bg-obsidian-border hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
          <Sparkles size={15} className="shrink-0 text-cyan-300" />{!compact && <span className="truncate font-medium">Generar contraseña</span>}
        </button>
      </div>
    </aside>
  );
};
