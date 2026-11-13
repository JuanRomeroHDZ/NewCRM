import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, Shield, Mail, Globe, Lock, Sparkles, Network, ArrowRight,
  X, Briefcase, Plus, MapPin, BookOpen, AlertCircle, RefreshCw
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
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
      color: 'text-indigo-300',
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
      color: 'text-indigo-400',
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
      color: 'text-amber-400',
      action: () => {
        closeCommandPalette();
        setActiveSection('prospects');
      }
    },
    {
      id: 'cmd_writeups_view',
      title: 'Ir a informes de seguridad',
      subtitle: 'Editor Markdown, pizarras de ataque y reportes cifrados',
      icon: BookOpen,
      color: 'text-emerald-400',
      action: () => {
        closeCommandPalette();
        setActiveSection('writeups');
        if (!isUnlocked) openUnlockModal();
      }
    },
    {
      id: 'cmd_gen_password',
      title: 'Generar Contraseña Segura',
      subtitle: 'Crea una contraseña segura',
      icon: Sparkles,
      color: 'text-cyan-400',
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
      color: 'text-indigo-400',
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
    }
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
        className="w-full max-w-2xl bg-obsidian-panel border border-obsidian-borderLight rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85dvh]"
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
            className="w-full bg-transparent text-sm text-white placeholder-obsidian-muted/60 focus:outline-none min-w-0"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono bg-obsidian-surface border border-obsidian-border rounded text-obsidian-muted">
              ESC
            </kbd>
            <button
              type="button"
              onClick={closeCommandPalette}
              aria-label="Cerrar paleta de comandos"
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-obsidian-border bg-obsidian-surface px-2.5 py-1 text-xs font-medium text-obsidian-muted hover:text-white hover:border-obsidian-borderLight focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
            >
              <X size={14} aria-hidden="true" />
              <span>Cerrar</span>
            </button>
          </div>
        </div>

        {/* Loading / Error Banner */}
        {(loadingData || loadError) && (
          <div className="px-4 py-2 border-b border-obsidian-border bg-obsidian-surface/60 flex items-center justify-between gap-2 text-[11px]">
            {loadingData ? (
              <span className="text-obsidian-muted" role="status">Actualizando índice de búsqueda...</span>
            ) : (
              <>
                <span className="flex items-center gap-1.5 text-amber-300" role="alert">
                  <AlertCircle size={13} className="shrink-0" aria-hidden="true" />
                  <span>{loadError}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void loadSearchIndex()}
                  className="inline-flex items-center gap-1 rounded-md border border-obsidian-border bg-obsidian-panel px-2 py-1 text-white hover:bg-obsidian-surface shrink-0"
                >
                  <RefreshCw size={11} aria-hidden="true" />
                  Reintentar
                </button>
              </>
            )}
          </div>
        )}

        {/* Results List */}
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
                      className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors ${
                        isCurrent ? 'bg-indigo-600/20 text-white border border-indigo-500/30' : 'text-obsidian-text hover:bg-obsidian-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Briefcase size={16} className="text-amber-400 flex-shrink-0" aria-hidden="true" />
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
                        <ArrowRight size={13} className="text-obsidian-muted" aria-hidden="true" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Platforms */}
          {filteredPlatforms.length > 0 && (
            <div role="group" aria-label="Cuentas y servicios">
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
                      className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors ${
                        isCurrent ? 'bg-indigo-600/20 text-white border border-indigo-500/30' : 'text-obsidian-text hover:bg-obsidian-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Globe size={16} className="text-indigo-400 flex-shrink-0" aria-hidden="true" />
                        <div className="min-w-0">
                          <div className="font-medium text-white truncate">{p.name}</div>
                          <div className="text-[11px] text-obsidian-muted truncate">
                            {p.username || 'Sin usuario'} • {p.email_address || 'Sin correo'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.subscription_status === 'active' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                            ${p.subscription_cost} {p.currency}
                          </span>
                        )}
                        <ArrowRight size={13} className="text-obsidian-muted" aria-hidden="true" />
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
                      className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors ${
                        isCurrent ? 'bg-indigo-600/20 text-white border border-indigo-500/30' : 'text-obsidian-text hover:bg-obsidian-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Mail size={16} className="text-cyan-400 flex-shrink-0" aria-hidden="true" />
                        <div className="min-w-0">
                          <div className="font-medium text-white truncate">{e.address}</div>
                          <div className="text-[11px] text-obsidian-muted truncate">
                            {e.provider} • {e.platform_count} plataformas • {e.prospect_count || 0} prospectos
                          </div>
                        </div>
                      </div>
                      <ArrowRight size={13} className="text-obsidian-muted shrink-0" aria-hidden="true" />
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
                      className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors ${
                        isCurrent ? 'bg-indigo-600/20 text-white border border-indigo-500/30' : 'text-obsidian-text hover:bg-obsidian-surface'
                      }`}
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
                      <ArrowRight size={13} className="text-obsidian-muted shrink-0" aria-hidden="true" />
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
                      className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors ${
                        isCurrent ? 'bg-indigo-600/20 text-white border border-indigo-500/30' : 'text-obsidian-text hover:bg-obsidian-surface'
                      }`}
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
        <div className="px-4 py-2 bg-obsidian-surface/60 border-t border-obsidian-border flex items-center justify-between text-[11px] text-obsidian-muted">
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

