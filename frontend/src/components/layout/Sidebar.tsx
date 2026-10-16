import React, { useState } from 'react';
import { 
  LayoutDashboard, Mail, Globe, Key, Network, 
  CreditCard, Trash2, Settings, Lock, Unlock, 
  Search, Sparkles, ChevronLeft, ChevronRight, Shield, ShieldCheck,
  FileText, Code, Rocket
} from 'lucide-react';
import { useVault, SectionType } from '../../context/VaultContext';

export const Sidebar: React.FC = () => {
  const { 
    activeSection, setActiveSection, isUnlocked, 
    remainingSeconds, openUnlockModal, lockVault, 
    openCommandPalette, openPasswordGen, openEmergencyKit, 
    openEnvExport, openEncryptedBackup, searchHotkey 
  } = useVault();

  const [collapsed, setCollapsed] = useState(false);

  // Format remaining seconds MM:SS
  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const menuItems: { id: SectionType; label: string; icon: any; isLevel2?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'emails', label: 'Correos Raíz', icon: Mail, isLevel2: true },
    { id: 'platforms', label: 'Cuentas & Servicios', icon: Globe },
    { id: 'prospects', label: 'Prospectos & Demos', icon: Rocket },
    { id: 'passwords', label: 'Contraseñas & APIs', icon: Key, isLevel2: true },
    { id: 'security_audit', label: 'Auditoría & Salud', icon: ShieldCheck, isLevel2: true },
    { id: 'audit_logs', label: 'Historial de Eventos', icon: FileText, isLevel2: true },
    { id: 'graph', label: 'Grafo Relacional', icon: Network },
    { id: 'subscriptions', label: 'Suscripciones & Pagos', icon: CreditCard },
    { id: 'trash', label: 'Papelera', icon: Trash2, isLevel2: true },
    { id: 'settings', label: 'Configuración & Bóveda', icon: Settings, isLevel2: true },
  ];

  return (
    <aside
      className={`h-screen flex flex-col justify-between bg-obsidian-panel border-r border-obsidian-border select-none transition-all duration-300 z-30 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Top Header */}
      <div>
        <div className="h-16 flex items-center justify-between px-4 border-b border-obsidian-border">
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
                <Network size={18} />
              </div>
              <div>
                <span className="font-bold text-sm tracking-tight text-white block">EmailSaver</span>
                <span className="text-[10px] text-obsidian-muted block -mt-0.5">Relational Vault</span>
              </div>
            </div>
          )}

          {collapsed && (
            <div className="w-8 h-8 mx-auto rounded-xl bg-indigo-600 flex items-center justify-center text-white">
              <Network size={18} />
            </div>
          )}

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded-lg text-obsidian-muted hover:text-white hover:bg-obsidian-surface transition-colors"
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Live Vault Lock Status Card */}
        <div className="p-3">
          <div
            className={`p-2.5 rounded-xl border transition-all ${
              isUnlocked
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-obsidian-surface border-obsidian-border text-obsidian-muted'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isUnlocked ? (
                  <Unlock size={16} className="text-emerald-400" />
                ) : (
                  <Lock size={16} className="text-amber-400" />
                )}
                {!collapsed && (
                  <div>
                    <div className="text-[11px] font-semibold tracking-wide text-white">
                      {isUnlocked ? 'Bóveda Desbloqueada' : 'Bóveda Bloqueada'}
                    </div>
                    {isUnlocked ? (
                      <div className="text-[10px] text-emerald-400 font-mono">
                        Cierra en {formatTimer(remainingSeconds)}
                      </div>
                    ) : (
                      <div className="text-[10px] text-obsidian-muted">
                        Modo Nivel 1 (Restringido)
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!collapsed && (
                <button
                  type="button"
                  onClick={isUnlocked ? lockVault : openUnlockModal}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                    isUnlocked
                      ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                  }`}
                >
                  {isUnlocked ? 'Bloquear' : 'Desbloquear'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Global Quick Search Button */}
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={openCommandPalette}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-obsidian-bg hover:bg-obsidian-surface border border-obsidian-border text-obsidian-muted hover:text-white transition-all text-xs group"
          >
            <div className="flex items-center gap-2">
              <Search size={14} className="group-hover:text-indigo-400 transition-colors" />
              {!collapsed && <span>Buscador Global</span>}
            </div>
            {!collapsed && (
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-obsidian-panel border border-obsidian-border rounded">
                {searchHotkey.toUpperCase()}
              </kbd>
            )}
          </button>
        </div>

        {/* Navigation Sections */}
        <nav className="px-2 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.isLevel2 && !isUnlocked) {
                    openUnlockModal();
                  } else {
                    setActiveSection(item.id);
                  }
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                    : 'text-obsidian-text hover:bg-obsidian-surface hover:text-white'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={16} className={isActive ? 'text-white' : 'text-obsidian-muted'} />
                  {!collapsed && <span>{item.label}</span>}
                </div>

                {!collapsed && item.isLevel2 && !isUnlocked && (
                  <span title="Requiere Nivel 2">
                    <Lock size={12} className="text-amber-400 opacity-70" />
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Tool: Quick Password Generator, .env & Emergency Kit */}
      <div className="p-3 border-t border-obsidian-border space-y-1.5">
        <button
          type="button"
          onClick={openEnvExport}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-obsidian-surface/60 hover:bg-obsidian-surface text-xs text-obsidian-muted hover:text-white border border-obsidian-border transition-colors group"
          title="Exportar Bóveda de Variables de Entorno (.env)"
        >
          <Code size={14} className="text-cyan-400" />
          {!collapsed && <span className="font-medium text-[11px]">Exportar .env</span>}
        </button>

        <button
          type="button"
          onClick={openEmergencyKit}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-obsidian-surface/60 hover:bg-obsidian-surface text-xs text-obsidian-muted hover:text-white border border-obsidian-border transition-colors group"
          title="Hoja de Emergencia Imprimible"
        >
          <Shield size={14} className="text-indigo-400" />
          {!collapsed && <span className="font-medium text-[11px]">Emergency Kit</span>}
        </button>

        <button
          type="button"
          onClick={openPasswordGen}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-obsidian-surface hover:bg-obsidian-border text-xs text-obsidian-text hover:text-white border border-obsidian-border transition-colors group"
        >
          <Sparkles size={15} className="text-cyan-400 group-hover:rotate-12 transition-transform" />
          {!collapsed && <span className="font-medium">Generar Clave</span>}
        </button>
      </div>
    </aside>
  );
};
