import React from 'react';
import { 
  Briefcase, User, Layers, ChevronLeft, ChevronRight, ChevronDown
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { InfoTooltip } from '../common/InfoTooltip';

interface TopbarProps {
  onMenuClick: () => void;
  menuTriggerRef: React.RefObject<HTMLButtonElement>;
  isMenuOpen?: boolean;
}

export const Topbar: React.FC<TopbarProps> = ({ onMenuClick, menuTriggerRef, isMenuOpen }) => {
  const { activeSection, activeScope, setActiveScope } = useVault();

  const sectionTitles: Record<string, { title: string; compactTitle: string; tooltip?: string }> = {
    dashboard: { title: 'Resumen General', compactTitle: 'Inicio', tooltip: 'Vista rápida de tus correos principales, seguridad, prospectos, gastos e ingresos reales.' },
    emails: { title: 'Correos Principales', compactTitle: 'Correos', tooltip: 'Tus cuentas de correo principales, a qué teléfono o correo se recuperan y si tienen verificación en 2 pasos.' },
    platforms: { title: 'Servicios vinculados', compactTitle: 'Servicios', tooltip: 'Páginas, aplicaciones y herramientas vinculadas a tus correos principales.' },
    capture: { title: 'Captación en mapa', compactTitle: 'Mapa', tooltip: 'Busca negocios publicados en OpenStreetMap y elige cuáles guardar como prospectos.' },
    prospects: { title: 'Prospectos', compactTitle: 'Prospectos', tooltip: 'Oportunidades comerciales y su seguimiento.' },
    passwords: { title: 'Contraseñas y notas', compactTitle: 'Claves', tooltip: 'Consulta tus contraseñas, PIN, llaves de acceso y notas privadas.' },
    graph: { title: 'Mapa de Conexiones', compactTitle: 'Conexiones', tooltip: 'Diagrama visual que muestra qué servicios y clientes dependen de cada correo y tarjeta.' },
    writeups: { title: 'Informes de seguridad', compactTitle: 'Informes', tooltip: 'Documenta revisiones de seguridad, dibuja esquemas y exporta informes.' },
    subscriptions: { title: 'Finanzas, Ingresos y Vencimientos', compactTitle: 'Finanzas', tooltip: 'Control de suscripciones, gastos únicos, pagos recibidos de clientes y vencimientos de dominios o hosting.' },
    trash: { title: 'Papelera', compactTitle: 'Papelera', tooltip: 'Elementos eliminados recientemente que puedes restaurar o borrar de forma definitiva.' },
    settings: { title: 'Ajustes y Seguridad', compactTitle: 'Ajustes', tooltip: 'Configura tu contraseña de acceso, tiempos de bloqueo automático, presupuesto y respaldos.' },
    settings_appearance: { title: 'Ajustes', compactTitle: 'Ajustes' },
    settings_session: { title: 'Ajustes', compactTitle: 'Ajustes' },
    settings_limits: { title: 'Ajustes', compactTitle: 'Ajustes' },
    settings_access: { title: 'Ajustes', compactTitle: 'Ajustes' },
    settings_network: { title: 'Ajustes', compactTitle: 'Ajustes' },
    settings_tools: { title: 'Ajustes', compactTitle: 'Ajustes' },
    settings_backup: { title: 'Ajustes', compactTitle: 'Ajustes' },
    settings_team: { title: 'Ajustes', compactTitle: 'Ajustes' },
    security_audit: { title: 'Nivel de Seguridad', compactTitle: 'Seguridad', tooltip: 'Revisión automática para detectar cuentas con la misma contraseña, contraseñas fáciles de adivinar o correos sin protección.' },
    audit_logs: { title: 'Historial de Actividad', compactTitle: 'Historial', tooltip: 'Registro cronológico de todos los movimientos y cambios realizados en tu sistema.' },
  };

  const currentInfo = sectionTitles[activeSection] || { title: 'LESSSO', compactTitle: 'Inicio' };

  const scopeOptions = [
    { value: 'all', label: 'Todos', icon: Layers },
    { value: 'business', label: 'Negocio', icon: Briefcase },
    { value: 'personal', label: 'Personal', icon: User },
  ] as const;

  return (
    <header className="relative z-20 flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-obsidian-border bg-obsidian-panel/95 px-3 py-2 sm:flex-nowrap sm:gap-3 sm:px-4 md:py-2.5">
      {/* Title & Optional Context Tooltip */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          ref={menuTriggerRef}
          type="button"
          onClick={onMenuClick}
          aria-expanded={Boolean(isMenuOpen)}
          aria-controls="primary-navigation"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-obsidian-border bg-obsidian-surface text-obsidian-text hover:bg-obsidian-border hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 lg:hidden"
          aria-label={isMenuOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
        >
          {isMenuOpen ? <ChevronLeft size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
        </button>
        <h1 className="text-sm sm:text-base font-semibold text-white tracking-tight truncate" title={currentInfo.title}>
          <span className="topbar-title-full">{currentInfo.title}</span>
          <span className="topbar-title-compact">{currentInfo.compactTitle}</span>
        </h1>
        {currentInfo.tooltip && (
          <span className="hidden sm:inline-flex">
            <InfoTooltip text={currentInfo.tooltip} position="bottom" />
          </span>
        )}
      </div>

      <label className="relative shrink-0">
        <span className="sr-only">Filtrar información por ámbito</span>
        <select
          value={activeScope}
          onChange={(event) => setActiveScope(event.target.value as typeof activeScope)}
          className="min-h-10 max-w-[120px] appearance-none rounded-xl border border-obsidian-border bg-obsidian-surface pl-3 pr-8 text-xs font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 sm:max-w-none"
        >
          {scopeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
      </label>

    </header>
  );
};

