import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Shield, Key, Mail, Globe, Lock, CreditCard, 
  Sparkles, Network, ArrowRight, X, Briefcase, Plus, MapPin
} from 'lucide-react';
import { useVault, SectionType } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { PlatformAccount, EmailAccount, Prospect } from '../../types';
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);

      // Fetch items for searching
      api.getPlatforms().then(setPlatforms).catch(() => {});
      api.getEmails().then(setEmails).catch(() => {});
      api.getProspects().then(setProspects).catch(() => {});
    }
  }, [isCommandPaletteOpen]);

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
        openProspectModal();
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
      title: 'Ir a Vista de Grafo Relacional',
      subtitle: 'Visualizar topología Obsidian y puntos de falla',
      icon: Network,
      color: 'text-indigo-400',
      action: () => {
        closeCommandPalette();
        setActiveSection('graph');
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

  const totalResultsCount = filteredProspects.length + filteredPlatforms.length + filteredEmails.length + staticCommands.length;

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
    // Check prospects
    for (const pr of filteredProspects) {
      if (cursor === selectedIndex) {
        closeCommandPalette();
        openInspector('prospect', pr.id);
        return;
      }
      cursor++;
    }
    // Check platforms
    for (const p of filteredPlatforms) {
      if (cursor === selectedIndex) {
        closeCommandPalette();
        openInspector('platform', p.id);
        return;
      }
      cursor++;
    }
    // Check emails
    for (const em of filteredEmails) {
      if (cursor === selectedIndex) {
        closeCommandPalette();
        openInspector('email', em.id);
        return;
      }
      cursor++;
    }
    // Check static
    for (const cmd of staticCommands) {
      if (cursor === selectedIndex) {
        cmd.action();
        return;
      }
      cursor++;
    }
  };

  return (
    <div className="responsive-overlay fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div 
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        className="w-full max-w-2xl bg-obsidian-panel border border-obsidian-borderLight rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-obsidian-border">
          <Search size={18} className="text-obsidian-muted mr-3 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            maxLength={INPUT_LIMITS.SEARCH}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar prospecto, página demo, plataforma, correo, alias o comando..."
            className="w-full bg-transparent text-sm text-white placeholder-obsidian-muted/60 focus:outline-none min-w-0"
          />
          <div className="flex items-center gap-1.5 ml-2">
            <kbd className="px-2 py-0.5 text-[10px] font-mono bg-obsidian-surface border border-obsidian-border rounded text-obsidian-muted">
              ESC
            </kbd>
          </div>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-4">
          {/* Prospects & Demos */}
          {filteredProspects.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[11px] font-semibold text-obsidian-muted tracking-wider uppercase">
                Prospectos & Demos (CRM)
              </div>
              <div className="space-y-1 mt-1">
                {filteredProspects.map((pr, idx) => {
                  const isCurrent = idx === selectedIndex;
                  const slaMeta = getSlaBadgeMeta(pr.sla_status);
                  return (
                    <div
                      key={pr.id}
                      onClick={() => {
                        closeCommandPalette();
                        openInspector('prospect', pr.id);
                      }}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                        isCurrent ? 'bg-indigo-600/20 text-white border border-indigo-500/30' : 'text-obsidian-text hover:bg-obsidian-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Briefcase size={16} className="text-amber-400 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-white">{pr.company_name}</div>
                          <div className="text-[11px] text-obsidian-muted">
                            {pr.contact_name || 'Sin contacto'} • {pr.email_address || 'Sin correo vinculado'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${slaMeta.badgeClass}`}>
                          {slaMeta.shortLabel}
                        </span>
                        <ArrowRight size={13} className="text-obsidian-muted" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Platforms */}
          {filteredPlatforms.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[11px] font-semibold text-obsidian-muted tracking-wider uppercase">
                Plataformas & Servicios
              </div>
              <div className="space-y-1 mt-1">
                {filteredPlatforms.map((p, idx) => {
                  const globalIdx = filteredProspects.length + idx;
                  const isCurrent = globalIdx === selectedIndex;
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        closeCommandPalette();
                        openInspector('platform', p.id);
                      }}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                        isCurrent ? 'bg-indigo-600/20 text-white border border-indigo-500/30' : 'text-obsidian-text hover:bg-obsidian-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Globe size={16} className="text-indigo-400 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-white">{p.name}</div>
                          <div className="text-[11px] text-obsidian-muted">
                            {p.username || 'Sin usuario'} • {p.email_address}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.subscription_status === 'active' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                            ${p.subscription_cost} {p.currency}
                          </span>
                        )}
                        <ArrowRight size={13} className="text-obsidian-muted" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Emails */}
          {filteredEmails.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[11px] font-semibold text-obsidian-muted tracking-wider uppercase">
                Correos Raíz
              </div>
              <div className="space-y-1 mt-1">
                {filteredEmails.map((e, idx) => {
                  const globalIdx = filteredProspects.length + filteredPlatforms.length + idx;
                  const isCurrent = globalIdx === selectedIndex;
                  return (
                    <div
                      key={e.id}
                      onClick={() => {
                        closeCommandPalette();
                        openInspector('email', e.id);
                      }}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                        isCurrent ? 'bg-indigo-600/20 text-white border border-indigo-500/30' : 'text-obsidian-text hover:bg-obsidian-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Mail size={16} className="text-cyan-400 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-white">{e.address}</div>
                          <div className="text-[11px] text-obsidian-muted">
                            {e.provider} • {e.platform_count} plataformas • {e.prospect_count || 0} prospectos
                          </div>
                        </div>
                      </div>
                      <ArrowRight size={13} className="text-obsidian-muted" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Commands */}
          {staticCommands.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[11px] font-semibold text-obsidian-muted tracking-wider uppercase">
                Acciones Rápidas
              </div>
              <div className="space-y-1 mt-1">
                {staticCommands.map((cmd, idx) => {
                  const globalIdx = filteredProspects.length + filteredPlatforms.length + filteredEmails.length + idx;
                  const isCurrent = globalIdx === selectedIndex;
                  const Icon = cmd.icon;
                  return (
                    <div
                      key={cmd.id}
                      onClick={cmd.action}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                        isCurrent ? 'bg-indigo-600/20 text-white border border-indigo-500/30' : 'text-obsidian-text hover:bg-obsidian-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon size={16} className={cmd.color} />
                        <div>
                          <div className="font-medium text-white">{cmd.title}</div>
                          <div className="text-[11px] text-obsidian-muted">{cmd.subtitle}</div>
                        </div>
                      </div>
                      <span className="text-[11px] text-obsidian-muted font-mono">↵ Ejecutar</span>
                    </div>
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
