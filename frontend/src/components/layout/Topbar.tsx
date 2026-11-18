import React, { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { InfoTooltip } from '../common/InfoTooltip';

interface TopbarProps {
  onMenuClick: () => void;
  menuTriggerRef: React.RefObject<HTMLButtonElement>;
  isMenuOpen?: boolean;
}

export const Topbar: React.FC<TopbarProps> = ({ onMenuClick, menuTriggerRef, isMenuOpen }) => {
  const { activeSection, activeScope, setActiveScope } = useVault();
  const isC2Section = activeSection.startsWith('c2_');
  const [saveNotice, setSaveNotice] = useState('');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onSaved = (event: Event) => {
      const notice = (event as CustomEvent<{ message: string; persistent?: boolean }>).detail;
      setSaveNotice(notice.message);
      if (timer) clearTimeout(timer);
      if (!notice.persistent) timer = setTimeout(() => setSaveNotice(''), 5000);
    };
    window.addEventListener('writeup_saved_notice', onSaved);
    return () => { window.removeEventListener('writeup_saved_notice', onSaved); if (timer) clearTimeout(timer); };
  }, []);

  const sectionTitles: Record<string, { title: string; compactTitle: string; tooltip?: string }> = {
    dashboard: { title: 'Resumen General', compactTitle: 'Inicio', tooltip: 'Vista rápida de tus correos principales, seguridad, prospectos, gastos e ingresos reales.' },
    help: { title: 'Guía y primeros pasos', compactTitle: 'Guía' },
    emails: { title: 'Correos Principales', compactTitle: 'Correos', tooltip: 'Tus cuentas de correo principales, a qué teléfono o correo se recuperan y si tienen verificación en 2 pasos.' },
    platforms: { title: 'Servicios vinculados', compactTitle: 'Servicios', tooltip: 'Páginas, aplicaciones y herramientas vinculadas a tus correos principales.' },
    capture: { title: 'Captación en mapa', compactTitle: 'Mapa', tooltip: 'Busca negocios publicados en OpenStreetMap y elige cuáles guardar como prospectos.' },
    prospects: { title: 'Prospectos', compactTitle: 'Prospectos', tooltip: 'Oportunidades comerciales y su seguimiento.' },
    passwords: { title: 'Contraseñas y notas', compactTitle: 'Claves', tooltip: 'Consulta tus contraseñas, PIN, llaves de acceso y notas privadas.' },
    graph: { title: 'Mapa de Conexiones', compactTitle: 'Conexiones', tooltip: 'Diagrama visual que muestra qué servicios y clientes dependen de cada correo y tarjeta.' },
    writeups: { title: 'Informes de seguridad', compactTitle: 'Informes', tooltip: 'Documenta revisiones de seguridad, dibuja esquemas y exporta informes.' },
    subscriptions: { title: 'Finanzas, Ingresos y Vencimientos', compactTitle: 'Finanzas', tooltip: 'Control de suscripciones, gastos únicos, pagos recibidos de clientes y vencimientos de dominios o hosting.' },
    overview_prospection: { title: 'Vista general · Prospección', compactTitle: 'Prospección', tooltip: 'Resumen de prospectos y captación.' },
    overview_communications: { title: 'Vista general · Correo y servicios', compactTitle: 'Correo y servicios', tooltip: 'Resumen de correos principales, servicios vinculados y relaciones.' },
    overview_finances: { title: 'Finanzas · Ingresos y vencimientos', compactTitle: 'Finanzas', tooltip: 'Resumen financiero y accesos a pagos, servicios, gastos y métodos de pago.' },
    overview_security: { title: 'Vista general · Seguridad', compactTitle: 'Seguridad', tooltip: 'Resumen de credenciales, informes y estado de seguridad.' },
    overview_c2: { title: 'Vista general · Red y Lab', compactTitle: 'Red y Lab', tooltip: 'Estado de la sesión C2 y accesos a sus herramientas.' },
    overview_activity: { title: 'Vista general · Actividad y papelera', compactTitle: 'Actividad', tooltip: 'Resumen del historial y elementos eliminados.' },
    overview_settings: { title: 'Vista general · Ajustes', compactTitle: 'Ajustes', tooltip: 'Estado de preferencias y configuración.' },
    finance_income: { title: 'Finanzas · Ingresos y pagos', compactTitle: 'Ingresos' },
    finance_services: { title: 'Finanzas · Servicios y vencimientos', compactTitle: 'Servicios' },
    finance_expenses: { title: 'Finanzas · Gastos', compactTitle: 'Gastos' },
    finance_cards: { title: 'Finanzas · Tarjetas y métodos', compactTitle: 'Tarjetas' },
    trash: { title: 'Papelera', compactTitle: 'Papelera', tooltip: 'Elementos eliminados recientemente que puedes restaurar o borrar de forma definitiva.' },
    settings: { title: 'Ajustes y Seguridad', compactTitle: 'Ajustes', tooltip: 'Configura tu contraseña de acceso, tiempos de bloqueo automático, presupuesto y respaldos.' },
    settings_appearance: { title: 'Ajustes', compactTitle: 'Ajustes' },
    settings_session: { title: 'Ajustes', compactTitle: 'Ajustes' },
    settings_limits: { title: 'Ajustes', compactTitle: 'Ajustes' },
    settings_access: { title: 'Ajustes', compactTitle: 'Ajustes' },
    settings_network: { title: 'Ajustes', compactTitle: 'Ajustes' },
    settings_writeups: { title: 'Ajustes', compactTitle: 'Ajustes' },
    settings_tools: { title: 'Ajustes', compactTitle: 'Ajustes' },
    settings_backup: { title: 'Ajustes', compactTitle: 'Ajustes' },
    settings_team: { title: 'Ajustes', compactTitle: 'Ajustes' },
    security_audit: { title: 'Nivel de Seguridad', compactTitle: 'Seguridad', tooltip: 'Revisión automática para detectar cuentas con la misma contraseña, contraseñas fáciles de adivinar o correos sin protección.' },
    audit_logs: { title: 'Historial de Actividad', compactTitle: 'Historial', tooltip: 'Registro cronológico de todos los movimientos y cambios realizados en tu sistema.' },
    c2_hosts: { title: 'C2 · Hosts y Descubrimiento', compactTitle: 'Hosts C2', tooltip: 'Barrido ARP de la red local y selección de objetivos.' },
    c2_topo: { title: 'C2 · Topología de Red', compactTitle: 'Topología C2', tooltip: 'Mapa visual de dispositivos OT/IT, routers, PLCs y enlaces de tráfico.' },
    c2_ports: { title: 'C2 · Escaneo de Puertos', compactTitle: 'Puertos C2', tooltip: 'Escaneo TCP connect / SYN stealth, banners y búsqueda de exploits.' },
    c2_mitm: { title: 'C2 · MITM (ARP Spoofing)', compactTitle: 'MITM C2', tooltip: 'Envenenamiento ARP bidireccional entre objetivo y gateway.' },
    c2_sniff: { title: 'C2 · Sniffer de Paquetes', compactTitle: 'Sniffer C2', tooltip: 'Captura de tráfico en vivo con soporte de filtros BPF.' },
    c2_dns: { title: 'C2 · DNS Spoofing', compactTitle: 'DNS C2', tooltip: 'Redirección de consultas DNS durante sesiones MITM.' },
    c2_creds: { title: 'C2 · Captura de Credenciales', compactTitle: 'Creds C2', tooltip: 'Extracción en memoria de credenciales HTTP, cookies, Bearer, FTP y NTLMSSP.' },
    c2_http: { title: 'C2 · HTTP Inject y SSLStrip', compactTitle: 'HTTP C2', tooltip: 'Proxy de inyección HTML/JS en claro y degradación de cabeceras.' },
    c2_poison: { title: 'C2 · Poisoners y WPAD', compactTitle: 'Poison C2', tooltip: 'Suplantación LLMNR, NBT-NS, mDNS y servidor WPAD/PAC.' },
    c2_mitm6: { title: 'C2 · mitm6 (IPv6)', compactTitle: 'mitm6 C2', tooltip: 'Anuncio Router Advertisement IPv6 y DNS spoofing.' },
    c2_wifi: { title: 'C2 · Wi-Fi (802.11)', compactTitle: 'Wi-Fi C2', tooltip: 'Modo monitor, escaneo, deauth dirigido, PMKID, handshakes y hashcat.' },
    c2_camera: { title: 'C2 · Auditoría de Cámaras', compactTitle: 'Cámaras C2', tooltip: 'Descubrimiento y auditoría RTSP, ONVIF, HTTP, P2P y CVEs de firmware.' },
    c2_opsec: { title: 'C2 · Identidad OPSEC', compactTitle: 'OPSEC C2', tooltip: 'Cambio reversible de hostname y dirección MAC con OUI real.' },
  };

  const currentInfo = sectionTitles[activeSection] || { title: 'LESSSO', compactTitle: 'Inicio' };

  const scopeOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'business', label: 'Negocio' },
    { value: 'personal', label: 'Personal' },
  ] as const;

  return (
    <header className="app-topbar relative z-20 flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-obsidian-border bg-obsidian-panel/95 px-3 py-2 sm:gap-3 sm:px-4 md:py-2.5">
      {/* Title & Optional Context Tooltip */}
      <div className="flex min-w-[min(100%,9rem)] flex-1 items-center gap-2">
        {/* [Icono] Abrir la navegación en pantallas estrechas. */}
        <button
          ref={menuTriggerRef}
          type="button"
          onClick={onMenuClick}
          aria-expanded={Boolean(isMenuOpen)}
          aria-controls="primary-navigation"
          className="ui-action-icon h-11 w-11 shrink-0 lg:hidden"
          aria-label={isMenuOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
        >
          {isMenuOpen ? <PanelLeftClose size={16} aria-hidden="true" /> : <PanelLeftOpen size={16} aria-hidden="true" />}
        </button>
        <h1 className="min-w-0 truncate text-sm font-semibold text-white sm:text-base" title={currentInfo.title}>
          <span className="topbar-title-full">{currentInfo.title}</span>
          <span className="topbar-title-compact">{currentInfo.compactTitle}</span>
        </h1>
        {currentInfo.tooltip && (
          <span className="hidden sm:inline-flex">
            <InfoTooltip text={currentInfo.tooltip} position="bottom" />
          </span>
        )}
      </div>

      {activeSection === 'writeups' && saveNotice && <span role="status" className="min-w-0 max-w-full break-words text-xs text-emerald-300">{saveNotice}</span>}
      {!isC2Section && (
        <label className="relative shrink-0">
          <span className="sr-only">Filtrar información por ámbito</span>
          <select
            value={activeScope}
            onChange={(event) => setActiveScope(event.target.value as typeof activeScope)}
            className="min-h-11 max-w-[120px] appearance-none rounded-md border border-obsidian-border bg-obsidian-panel pl-3 pr-8 text-xs font-medium text-obsidian-text transition-colors hover:bg-obsidian-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent sm:max-w-none"
          >
            {scopeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      )}

    </header>
  );
};

