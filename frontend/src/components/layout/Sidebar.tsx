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
    { id: 'dashboard', label: 'Resumen General', icon: LayoutDashboard },
    { id: 'emails', label: 'Correos Principales', icon: Mail, isLevel2: true },
    { id: 'platforms', label: 'Cuentas y Servicios', icon: Globe },
    { id: 'prospects', label: 'Prospectos y Demos', icon: Rocket },
    { id: 'passwords', label: 'Contraseñas y Llaves', icon: Key, isLevel2: true },
    { id: 'security_audit', label: 'Nivel de Seguridad', icon: ShieldCheck, isLevel2: true },
    { id: 'audit_logs', label: 'Historial de Actividad', icon: FileText, isLevel2: true },
    { id: 'graph', label: 'Mapa de Conexiones', icon: Network },
    { id: 'subscriptions', label: 'Finanzas e Ingresos', icon: CreditCard },
    { id: 'trash', label: 'Papelera', icon: Trash2, isLevel2: true },
    { id: 'settings', label: 'Ajustes y Seguridad', icon: Settings, isLevel2: true },
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
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-md shadow-indigo-600/30 shrink-0">
                <Network size={18} />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-sm tracking-tight text-white block truncate">EmailSaver</span>
                <span className="text-[10px] text-obsidian-muted block -mt-0.5 truncate">Control de Cuentas y Clientes</span>
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {isUnlocked ? (
                  <Unlock size={16} className="text-emerald-400 shrink-0" />
                ) : (
                  <Lock size={16} className="text-amber-400 shrink-0" />
                )}
                {!collapsed && (
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold tracking-wide text-white truncate">
                      {isUnlocked ? 'Contraseñas Visibles' : 'Contraseñas Ocultas'}
                    </div>
                    {isUnlocked ? (
                      <div className="text-[10px] text-emerald-400 font-mono truncate">
                        Se bloquea en {formatTimer(remainingSeconds)}
                      </div>
                    ) : (
                      <div className="text-[10px] text-obsidian-muted truncate">
                        Protegido con clave maestra
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!collapsed && (
                <button
                  type="button"
                  onClick={isUnlocked ? lockVault : openUnlockModal}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all shrink-0 ${
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
            <div className="flex items-center gap-2 min-w-0">
              <Search size={14} className="group-hover:text-indigo-400 transition-colors shrink-0" />
              {!collapsed && <span className="truncate">Buscador Rápido</span>}
            </div>
            {!collapsed && (
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-obsidian-panel border border-obsidian-border rounded shrink-0">
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
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon size={16} className={`shrink-0 ${isActive ? 'text-white' : 'text-obsidian-muted'}`} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </div>

                {!collapsed && item.isLevel2 && !isUnlocked && (
                  <span title="Requiere desbloquear con tu contraseña maestra" className="shrink-0">
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
          title="Descargar archivo .env con tus llaves y variables configuradas"
        >
          <Code size={14} className="text-cyan-400 shrink-0" />
          {!collapsed && <span className="font-medium text-[11px] truncate">Descargar archivo .env</span>}
        </button>

        <button
          type="button"
          onClick={openEmergencyKit}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-obsidian-surface/60 hover:bg-obsidian-surface text-xs text-obsidian-muted hover:text-white border border-obsidian-border transition-colors group"
          title="Hoja de Recuperación Imprimible"
        >
          <Shield size={14} className="text-indigo-400 shrink-0" />
          {!collapsed && <span className="font-medium text-[11px] truncate">Hoja de Recuperación</span>}
        </button>

        <button
          type="button"
          onClick={openPasswordGen}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-obsidian-surface hover:bg-obsidian-border text-xs text-obsidian-text hover:text-white border border-obsidian-border transition-colors group"
        >
          <Sparkles size={15} className="text-cyan-400 group-hover:rotate-12 transition-transform shrink-0" />
          {!collapsed && <span className="font-medium truncate">Generar Contraseña</span>}
        </button>
      </div>
    </aside>
  );
};
