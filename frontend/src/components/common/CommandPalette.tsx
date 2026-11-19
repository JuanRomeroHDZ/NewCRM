import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, Shield, Mail, Globe, Lock, Sparkles, Network, ArrowRight,
  X, Briefcase, Plus, MapPin, BookOpen, AlertCircle, RefreshCw,
  Server, ScanSearch, ArrowLeftRight, Activity, Route, KeyRound,
  Code2, Radio, Waypoints, Wifi, Camera, UserCheck, AlertOctagon, FileText, PenTool,
  Wallet, Receipt, CreditCard, ShieldCheck,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { useC2 } from '../../context/C2Context';
import { api } from '../../lib/api';
import { PlatformAccount, EmailAccount, Prospect, WriteupSummary } from '../../types';
import { getSlaBadgeMeta } from '../../lib/prospectUtils';
import { INPUT_LIMITS } from '../../lib/validation';

export const CommandPalette: React.FC = () => {
  const { 
    isCommandPaletteOpen, closeCommandPalette, setActiveSection, 
    openInspector, openPasswordGen, openProspectModal, isUnlocked, openUnlockModal, 
    lockVault, searchHotkey 
  } = useVault();
  const { triggerPanic } = useC2();

  const [query, setQuery] = useState('');
  const [platforms, setPlatforms] = useState<PlatformAccount[]>([]);
  const [emails, setEmails] = useState<EmailAccount[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [writeups, setWriteups] = useState<WriteupSummary[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const loadSearchIndex = useCallback(async () => {
    if (!isUnlocked) {
      setPlatforms([]);
      setEmails([]);
      setProspects([]);
      setWriteups([]);
      setLoadError(null);
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    setLoadError(null);
    const results = await Promise.allSettled([
      api.getPlatforms(),
      api.getEmails(),
      api.getProspects(),
      isUnlocked ? api.listWriteups() : Promise.resolve([] as WriteupSummary[]),
    ]);

    const errors: string[] = [];
    if (results[0].status === 'fulfilled') setPlatforms(results[0].value);
    else errors.push('plataformas');

    if (results[1].status === 'fulfilled') setEmails(results[1].value);
    else errors.push('correos');

    if (results[2].status === 'fulfilled') setProspects(results[2].value);
    else errors.push('prospectos');

    if (results[3].status === 'fulfilled') setWriteups(results[3].value);
    else if (isUnlocked) errors.push('writeups');

    if (errors.length > 0) {
      setLoadError(`No se pudieron cargar: ${errors.join(', ')}.`);
    }
    setLoadingData(false);
  }, [isUnlocked]);

  useEffect(() => {
    if (!isCommandPaletteOpen) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery('');
    setSelectedIndex(0);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50);
    void loadSearchIndex();

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCommandPalette();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleEscape);
      const previousFocus = restoreFocusRef.current;
      const focusIsUnavailable = previousFocus && (
        !previousFocus.isConnected ||
        previousFocus.closest('[aria-hidden="true"], [inert]') !== null
      );
      if (!focusIsUnavailable && previousFocus) {
        previousFocus.focus();
      } else {
        const pageTarget = document.querySelector<HTMLElement>(
          'main button:not([disabled]), main input:not([disabled]), main a[href], main [tabindex]:not([tabindex="-1"])'
        );
        pageTarget?.focus();
      }
    };
  }, [isCommandPaletteOpen, loadSearchIndex, closeCommandPalette]);

  if (!isCommandPaletteOpen) return null;

  // Filter items
  const cleanQ = query.trim().toLowerCase();

  const filteredProspects = prospects.filter(pr =>
    pr.company_name.toLowerCase().includes(cleanQ) ||
    (pr.contact_name && pr.contact_name.toLowerCase().includes(cleanQ)) ||
    (pr.demo_url && pr.demo_url.toLowerCase().includes(cleanQ)) ||
    (pr.whatsapp && pr.whatsapp.toLowerCase().includes(cleanQ)) ||
    (pr.email_address && pr.email_address.toLowerCase().includes(cleanQ)) ||
    (pr.tags && pr.tags.some(t => t.name.toLowerCase().includes(cleanQ)))
  ).slice(0, 4);

  const filteredPlatforms = platforms.filter(p => 
    p.name.toLowerCase().includes(cleanQ) || 
    (p.username && p.username.toLowerCase().includes(cleanQ)) ||
    (p.tags && p.tags.some(t => t.name.toLowerCase().includes(cleanQ)))
  ).slice(0, 4);

  const filteredEmails = emails.filter(e => 
    e.address.toLowerCase().includes(cleanQ) ||
    e.provider.toLowerCase().includes(cleanQ) ||
    e.aliases.some(a => a.toLowerCase().includes(cleanQ))
  ).slice(0, 4);

  const filteredWriteups = writeups.filter(w =>
    w.title.toLowerCase().includes(cleanQ) ||
    (w.target_scope && w.target_scope.toLowerCase().includes(cleanQ)) ||
    (w.cwe_id && w.cwe_id.toLowerCase().includes(cleanQ)) ||
    (w.cve_id && w.cve_id.toLowerCase().includes(cleanQ)) ||
    w.severity.toLowerCase().includes(cleanQ) ||
    (w.tags && w.tags.some(t => t.toLowerCase().includes(cleanQ)))
  ).slice(0, 4);

  // Global static commands
  const staticCommands = [
    {
      id: 'cmd_capture_map',
      title: 'Captación en mapa',
      subtitle: 'Buscar negocios publicados en OpenStreetMap',
      icon: MapPin,
      color: 'text-obsidian-muted',
      action: () => {
        closeCommandPalette();
        setActiveSection('capture');
      }
    },
    {
      id: 'cmd_new_prospect',
      title: 'Nuevo Prospecto / Demo',
      subtitle: 'Registrar un prospecto y dar seguimiento a su respuesta',
      icon: Plus,
      color: 'text-obsidian-muted',
      action: () => {
        closeCommandPalette();
        if (isUnlocked) openProspectModal();
        else openUnlockModal();
      }
    },
    {
      id: 'cmd_prospects_view',
      title: 'Ir a Prospectos & Demos (CRM)',
      subtitle: 'Revisar prospectos, mensajes y páginas de muestra',
      icon: Briefcase,
      color: 'text-obsidian-muted',
      action: () => {
        closeCommandPalette();
        setActiveSection('prospects');
      }
    },
    {
      id: 'cmd_overview_finances',
      title: 'Ir a Finanzas · Resumen',
      subtitle: 'Balance mensual, proyección anual, egresos a 90 días y tipo de cambio',
      icon: Wallet,
      color: 'text-obsidian-muted',
      action: () => {
        closeCommandPalette();
        setActiveSection('overview_finances');
      }
    },
    {
      id: 'cmd_finance_income',
      title: 'Ir a Finanzas · Ingresos y pagos',
      subtitle: 'Registrar cobros, igualas y anticipos de clientes',
      icon: Wallet,
      color: 'text-obsidian-muted',
      action: () => {
        closeCommandPalette();
        setActiveSection('finance_income');
      }
    },
    {
      id: 'cmd_finance_services',
      title: 'Ir a Finanzas · Servicios y vencimientos',
      subtitle: 'Monitor de renovaciones próximas, dominios, hostings y APIs',
      icon: Server,
      color: 'text-obsidian-muted',
      action: () => {
        closeCommandPalette();
        setActiveSection('finance_services');
      }
    },
    {
      id: 'cmd_finance_expenses',
      title: 'Ir a Finanzas · Gastos',
      subtitle: 'Registro y control de gastos puntuales y recurrentes',
      icon: Receipt,
      color: 'text-obsidian-muted',
      action: () => {
        closeCommandPalette();
        setActiveSection('finance_expenses');
      }
    },
    {
      id: 'cmd_finance_cards',
      title: 'Ir a Finanzas · Tarjetas y métodos',
      subtitle: 'Tarjetas protegidas en bóveda y suscripciones vinculadas',
      icon: CreditCard,
      color: 'text-obsidian-muted',
      action: () => {
        closeCommandPalette();
        setActiveSection('finance_cards');
        if (!isUnlocked) openUnlockModal();
      }
    },
    {
      id: 'cmd_security_audit',
      title: 'Ir a Seguridad · Diagnóstico',
      subtitle: 'Revisar contraseñas débiles, reutilizadas y cobertura 2FA',
      icon: ShieldCheck,
      color: 'text-obsidian-muted',
      action: () => {
        closeCommandPalette();
        setActiveSection('security_audit');
        if (!isUnlocked) openUnlockModal();
      }
    },
    {
      id: 'cmd_overview_reports',
      title: 'Ir a Reportes · Resumen',
      subtitle: 'Resumen de documentos Typst, palabras compiladas y lienzos',
      icon: BookOpen,
      color: 'text-obsidian-muted',
      action: () => {
        closeCommandPalette();
        setActiveSection('overview_reports');
        if (!isUnlocked) openUnlockModal();
      }
    },
    {
      id: 'cmd_reports_documents',
      title: 'Ir a Reportes · Documentos',
      subtitle: 'Editor Typst con vista previa en vivo y exportación PDF',
      icon: FileText,
      color: 'text-obsidian-muted',
      action: () => {
        closeCommandPalette();
        setActiveSection('reports_documents');
        if (!isUnlocked) openUnlockModal();
      }
    },
    {
      id: 'cmd_reports_canvases',
      title: 'Ir a Reportes · Lienzos',
      subtitle: 'Diagramas y esquemas visuales con Excalidraw',
      icon: PenTool,
      color: 'text-obsidian-muted',
      action: () => {
        closeCommandPalette();
        setActiveSection('reports_canvases');
        if (!isUnlocked) openUnlockModal();
      }
    },
    {
      id: 'cmd_gen_password',
      title: 'Generar Contraseña Segura',
      subtitle: 'Crea una contraseña segura',
      icon: Sparkles,
      color: 'text-obsidian-muted',
      action: () => {
        closeCommandPalette();
        openPasswordGen();
      }
    },
    {
      id: 'cmd_graph_view',
      title: 'Ir a Mapa de conexiones',
      subtitle: 'Ver relaciones entre correos, cuentas, prospectos y pagos',
      icon: Network,
      color: 'text-obsidian-muted',
      action: () => {
        closeCommandPalette();
        setActiveSection('graph');
        if (!isUnlocked) openUnlockModal();
      }
    },
    {
      id: 'cmd_lock_vault',
      title: isUnlocked ? 'Bloquear Bóveda Inmediatamente' : 'Desbloquear espacio seguro',
      subtitle: isUnlocked ? 'Cierra el acceso a tus datos' : 'Ingresar contraseña de acceso',
      icon: isUnlocked ? Lock : Shield,
      color: isUnlocked ? 'text-rose-400' : 'text-emerald-400',
      action: () => {
        closeCommandPalette();
        if (isUnlocked) {
          lockVault();
        } else {
          openUnlockModal();
        }
      }
    },
    ...(
      [
        ['c2_hosts', 'C2 · Hosts y Descubrimiento', 'Barrido ARP y selección de objetivo en red', Server],
        ['c2_topo', 'C2 · Topología de Red', 'Mapa visual de planta OT/IT y enlaces', Network],
        ['c2_ports', 'C2 · Escaneo de Puertos', 'Puertos TCP/SYN stealth, banners y exploits', ScanSearch],
        ['c2_mitm', 'C2 · MITM (ARP Spoofing)', 'Interceptación ARP entre objetivo y gateway', ArrowLeftRight],
        ['c2_sniff', 'C2 · Sniffer de Paquetes', 'Captura en vivo con filtros BPF', Activity],
        ['c2_dns', 'C2 · DNS Spoofing', 'Redirección de consultas DNS', Route],
        ['c2_creds', 'C2 · Captura de Credenciales', 'Buffer en memoria de credenciales HTTP/FTP/NTLM', KeyRound],
        ['c2_http', 'C2 · HTTP Inject y SSLStrip', 'Inyección HTML/JS y degradación HTTPS', Code2],
        ['c2_poison', 'C2 · Poisoners y WPAD', 'LLMNR, NBT-NS, mDNS y proxy WPAD', Radio],
        ['c2_mitm6', 'C2 · mitm6 (IPv6)', 'Anuncio Router Advertisement y DNS IPv6', Waypoints],
        ['c2_wifi', 'C2 · Wi-Fi (802.11)', 'Monitor, escaneo, deauth, PMKID y handshakes', Wifi],
        ['c2_camera', 'C2 · Auditoría de Cámaras', 'Descubrimiento y auditoría RTSP/ONVIF/CVEs', Camera],
        ['c2_opsec', 'C2 · Identidad OPSEC', 'Hostname y MAC reversible con OUI real', UserCheck],
      ] as const
    ).map(([sectionId, title, subtitle, Icon]) => ({
      id: `cmd_${sectionId}`,
      title,
      subtitle,
      icon: Icon,
      color: 'text-obsidian-muted',
      action: () => {
        closeCommandPalette();
        setActiveSection(sectionId);
        if (!isUnlocked) openUnlockModal();
      },
    })),
    {
      id: 'cmd_c2_panic',
      title: 'C2 · PÁNICO (Kill Switch)',
      subtitle: 'Detener todos los módulos, limpiar iptables y restaurar identidad OPSEC',
      icon: AlertOctagon,
      color: 'text-red-400',
      action: () => {
        closeCommandPalette();
        if (!isUnlocked) {
          openUnlockModal();
          return;
        }
        void triggerPanic();
      },
    },
  ].filter(c => cleanQ === '' || c.title.toLowerCase().includes(cleanQ) || c.subtitle.toLowerCase().includes(cleanQ));

  const totalResultsCount =
    filteredProspects.length +
    filteredPlatforms.length +
    filteredEmails.length +
    filteredWriteups.length +
    staticCommands.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, totalResultsCount));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + Math.max(1, totalResultsCount)) % Math.max(1, totalResultsCount));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      executeCurrentSelection();
    } else if (e.key === 'Escape') {
      closeCommandPalette();
    }
  };

  const executeCurrentSelection = () => {
    let cursor = 0;
    for (const pr of filteredProspects) {
      if (cursor === selectedIndex) {
        closeCommandPalette();
        openInspector('prospect', pr.id);
        return;
      }
      cursor++;
    }
    for (const p of filteredPlatforms) {
      if (cursor === selectedIndex) {
        closeCommandPalette();
        openInspector('platform', p.id);
        return;
      }
      cursor++;
    }
    for (const em of filteredEmails) {
      if (cursor === selectedIndex) {
        closeCommandPalette();
        openInspector('email', em.id);
        return;
      }
      cursor++;
    }
    for (const w of filteredWriteups) {
      if (cursor === selectedIndex) {
        closeCommandPalette();
        setActiveSection('writeups');
        if (!isUnlocked) openUnlockModal();
        return;
      }
      cursor++;
    }
    for (const cmd of staticCommands) {
      if (cursor === selectedIndex) {
        cmd.action();
        return;
      }
      cursor++;
    }
  };

  const writeupsOffset = filteredProspects.length + filteredPlatforms.length + filteredEmails.length;
  const commandsOffset = writeupsOffset + filteredWriteups.length;

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.getAttribute('aria-hidden') !== 'true');
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
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
    <div
      className="responsive-overlay fixed inset-0 z-50 flex items-start justify-center pt-14 sm:pt-20 p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
      onClick={closeCommandPalette}
    >
      <div 
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        className="w-full max-w-2xl bg-obsidian-panel border border-obsidian-border rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[85dvh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        {/* Search Input */}
        <div className="relative flex items-center gap-2 px-3 sm:px-4 py-3 border-b border-obsidian-border">
          <Search size={18} className="text-obsidian-muted flex-shrink-0" aria-hidden="true" />
          <label htmlFor="command-palette-search" className="sr-only">
            Buscar en LESSSO
          </label>
          <input
            id="command-palette-search"
            ref={inputRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="command-palette-results"
            aria-expanded={totalResultsCount > 0}
            aria-activedescendant={totalResultsCount > 0 ? `command-option-${selectedIndex}` : undefined}
            aria-label="Buscar prospecto, cuenta, correo, informe o acción"
            maxLength={INPUT_LIMITS.SEARCH}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar prospecto, cuenta, correo, informe o acción..."
            className="w-full bg-transparent text-sm text-white placeholder:text-obsidian-muted focus:outline-none min-w-0"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono bg-obsidian-surface border border-obsidian-border rounded text-obsidian-muted">
              ESC
            </kbd>
            <button
              type="button"
              onClick={closeCommandPalette}
              aria-label="Cerrar paleta de comandos"
              className="ui-action-secondary"
            >
              <X size={16} aria-hidden="true" />
              <span>Cerrar</span>
            </button>
          </div>
        </div>

        {/* Loading / Error Banner */}
        {(loadingData || loadError) && (
          <div className="flex items-center justify-between gap-2 border-b border-obsidian-border px-4 py-2 text-[11px]">
            {loadingData ? (
              <span className="text-obsidian-muted" role="status">Actualizando índice de búsqueda...</span>
            ) : (
              <>
                <span className="flex items-center gap-1.5 text-obsidian-muted" role="alert">
                  <AlertCircle size={16} className="shrink-0 text-rose-400" aria-hidden="true" />
                  <span>{loadError}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void loadSearchIndex()}
                  className="ui-action-secondary shrink-0"
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  Reintentar
                </button>
              </>
            )}
          </div>
        )}

        {/* [Navegación] Los resultados abren la sección o el detalle seleccionado. */}
        <div id="command-palette-results" role="listbox" aria-label="Resultados de búsqueda" className="max-h-96 overflow-y-auto p-2 space-y-4">
          {/* Prospects & Demos */}
          {filteredProspects.length > 0 && (
            <div role="group" aria-label="Prospectos y demostraciones">
              <div className="px-3 py-1 text-[11px] font-semibold text-obsidian-muted tracking-wider uppercase">
                Prospectos & Demos (CRM)
              </div>
              <div className="space-y-1 mt-1">
                {filteredProspects.map((pr, idx) => {
                  const isCurrent = idx === selectedIndex;
                  const slaMeta = getSlaBadgeMeta(pr.sla_status);
                  return (
                    <button
                      key={pr.id}
                      id={`command-option-${idx}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={isCurrent}
                      onClick={() => {
                        closeCommandPalette();
                        openInspector('prospect', pr.id);
                      }}
                      className="ui-action-toggle ui-menu-item justify-between py-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Briefcase size={16} className="text-obsidian-muted flex-shrink-0" aria-hidden="true" />
                        <div className="min-w-0">
                          <div className="font-medium text-white truncate">{pr.company_name}</div>
                          <div className="text-[11px] text-obsidian-muted truncate">
                            {pr.contact_name || 'Sin contacto'} • {pr.email_address || 'Sin correo vinculado'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${slaMeta.badgeClass}`}>
                          {slaMeta.shortLabel}
                        </span>
                        <ArrowRight size={16} className="text-obsidian-muted" aria-hidden="true" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Platforms */}
          {filteredPlatforms.length > 0 && (
            <div role="group" aria-label="Correo y servicios">
              <div className="px-3 py-1 text-[11px] font-semibold text-obsidian-muted tracking-wider uppercase">
                Plataformas & Servicios
              </div>
              <div className="space-y-1 mt-1">
                {filteredPlatforms.map((p, idx) => {
                  const globalIdx = filteredProspects.length + idx;
                  const isCurrent = globalIdx === selectedIndex;
                  return (
                    <button
                      key={p.id}
                      id={`command-option-${filteredProspects.length + idx}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={isCurrent}
                      onClick={() => {
                        closeCommandPalette();
                        openInspector('platform', p.id);
                      }}
                      className="ui-action-toggle ui-menu-item justify-between py-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Globe size={16} className="text-obsidian-muted flex-shrink-0" aria-hidden="true" />
                        <div className="min-w-0">
                          <div className="font-medium text-white truncate">{p.name}</div>
                          <div className="text-[11px] text-obsidian-muted truncate">
                            {p.username || 'Sin usuario'} • {p.email_address || 'Sin correo'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.subscription_status === 'active' && (
                          <span className="rounded border border-obsidian-border bg-obsidian-surface px-1.5 py-0.5 font-mono text-[10px] text-obsidian-muted">
                            ${p.subscription_cost} {p.currency}
                          </span>
                        )}
                        <ArrowRight size={16} className="text-obsidian-muted" aria-hidden="true" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Emails */}
          {filteredEmails.length > 0 && (
            <div role="group" aria-label="Correos principales">
              <div className="px-3 py-1 text-[11px] font-semibold text-obsidian-muted tracking-wider uppercase">
                Correos Raíz
              </div>
              <div className="space-y-1 mt-1">
                {filteredEmails.map((e, idx) => {
                  const globalIdx = filteredProspects.length + filteredPlatforms.length + idx;
                  const isCurrent = globalIdx === selectedIndex;
                  return (
                    <button
                      key={e.id}
                      id={`command-option-${filteredProspects.length + filteredPlatforms.length + idx}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={isCurrent}
                      onClick={() => {
                        closeCommandPalette();
                        openInspector('email', e.id);
                      }}
                      className="ui-action-toggle ui-menu-item justify-between py-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Mail size={16} className="text-obsidian-muted flex-shrink-0" aria-hidden="true" />
                        <div className="min-w-0">
                          <div className="font-medium text-white truncate">{e.address}</div>
                          <div className="text-[11px] text-obsidian-muted truncate">
                            {e.provider} • {e.platform_count} plataformas • {e.prospect_count || 0} prospectos
                          </div>
                        </div>
                      </div>
                      <ArrowRight size={16} className="text-obsidian-muted shrink-0" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Writeups */}
          {filteredWriteups.length > 0 && (
            <div role="group" aria-label="Informes de seguridad">
              <div className="px-3 py-1 text-[11px] font-semibold text-obsidian-muted tracking-wider uppercase">
                Informes de seguridad
              </div>
              <div className="space-y-1 mt-1">
                {filteredWriteups.map((w, idx) => {
                  const globalIdx = writeupsOffset + idx;
                  const isCurrent = globalIdx === selectedIndex;
                  return (
                    <button
                      key={w.id}
                      id={`command-option-${writeupsOffset + idx}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={isCurrent}
                      onClick={() => {
                        closeCommandPalette();
                        setActiveSection('writeups');
                        if (!isUnlocked) openUnlockModal();
                      }}
                      className="ui-action-toggle ui-menu-item justify-between py-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BookOpen size={16} className="text-emerald-400 flex-shrink-0" aria-hidden="true" />
                        <div className="min-w-0">
                          <div className="font-medium text-white truncate">{w.title}</div>
                          <div className="text-[11px] text-obsidian-muted truncate">
                            {w.severity.toUpperCase()} • {w.status} {w.target_scope ? `• ${w.target_scope}` : ''}
                          </div>
                        </div>
                      </div>
                      <ArrowRight size={16} className="text-obsidian-muted shrink-0" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Commands */}
          {staticCommands.length > 0 && (
            <div role="group" aria-label="Acciones rápidas">
              <div className="px-3 py-1 text-[11px] font-semibold text-obsidian-muted tracking-wider uppercase">
                Acciones Rápidas
              </div>
              <div className="space-y-1 mt-1">
                {staticCommands.map((cmd, idx) => {
                  const globalIdx = commandsOffset + idx;
                  const isCurrent = globalIdx === selectedIndex;
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      id={`command-option-${commandsOffset + idx}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={isCurrent}
                      onClick={cmd.action}
                      className="ui-action-toggle ui-menu-item justify-between py-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon size={16} className={`${cmd.color} shrink-0`} aria-hidden="true" />
                        <div className="min-w-0">
                          <div className="font-medium text-white truncate">{cmd.title}</div>
                          <div className="text-[11px] text-obsidian-muted truncate">{cmd.subtitle}</div>
                        </div>
                      </div>
                      <span className="text-[11px] text-obsidian-muted font-mono shrink-0">Ejecutar</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {totalResultsCount === 0 && (
            <div className="py-8 text-center text-xs text-obsidian-muted">
              No se encontraron coincidencias para "{query}".
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-obsidian-border px-4 py-2 text-[11px] text-obsidian-muted">
          <div className="flex items-center gap-3">
            <span><kbd className="font-mono">↑↓</kbd> navegar</span>
            <span><kbd className="font-mono">↵</kbd> seleccionar</span>
          </div>
          <span>Atajo global: <kbd className="font-mono">{searchHotkey.toUpperCase()}</kbd></span>
        </div>
      </div>
    </div>
  );
};

