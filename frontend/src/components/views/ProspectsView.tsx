import React from 'react';
import { 
  Briefcase, Clock, Sparkles, Rocket, 
  Layers, MessageSquare, ShieldAlert, CheckCircle2,
  Users, Timer, ArrowUpRight
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';

export const ProspectsView: React.FC = () => {
  const { setActiveSection } = useVault();

  const plannedModules = [
    {
      title: 'Pipeline Comercial & Embudo de Ventas',
      description: 'Gestión por etapas personalizadas (Demos, Cotizaciones, Negociación, Cierre) con métricas de conversión y valor estimado.',
      icon: Layers,
      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
    },
    {
      title: 'Acuerdos de Nivel de Servicio (SLA) & Alertas',
      description: 'Temporizadores visuales de respuesta rápida, alertas de recontacto automático y control de tiempos por canal.',
      icon: Timer,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    },
    {
      title: 'Showcase de Demos & Enlaces Interactivos',
      description: 'Vinculación de demostraciones funcionales, seguimiento de accesos de clientes y catálogo de proyectos demo.',
      icon: Rocket,
      color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
    },
    {
      title: 'Historial de Contactos & Omnicanalidad',
      description: 'Registro cronológico de llamadas, mensajes de WhatsApp, correos de cotización y notas comerciales compartidas.',
      icon: MessageSquare,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    }
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto animate-fadeIn">
      {/* Top Banner / Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-obsidian-card via-obsidian-panel to-obsidian-surface border border-obsidian-borderLight p-6 sm:p-8 shadow-xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 shadow-inner flex-shrink-0">
              <Briefcase size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Módulo CRM & Prospectos
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  En Definición
                </span>
              </div>
              <p className="text-xs sm:text-sm text-obsidian-muted mt-1 max-w-xl leading-relaxed">
                Este apartado está reservado arquitectónicamente. La lógica de negocio, reglas comerciales y flujos de seguimiento se integrarán en una fase posterior una vez definidas las especificaciones funcionales.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSection('dashboard')}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-obsidian-muted hover:text-white bg-obsidian-surface border border-obsidian-border hover:border-obsidian-borderLight transition-all"
            >
              Ir al Dashboard
            </button>
            <button
              onClick={() => setActiveSection('subscriptions')}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/25 transition-all flex items-center gap-1.5"
            >
              <span>Ver Finanzas</span>
              <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Notice Card */}
      <div className="p-4 rounded-xl bg-obsidian-card border border-obsidian-border flex items-start gap-3 text-xs">
        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 flex-shrink-0 mt-0.5">
          <Clock size={16} />
        </div>
        <div className="space-y-1">
          <h2 className="text-xs font-semibold text-white">Estado actual de la sección</h2>
          <p className="text-[11px] text-obsidian-muted leading-relaxed">
            Todas las rutas y modelos backend correspondientes al CRM se encuentran debidamente asegurados y aislados bajo la bóveda cifrada. Las funcionalidades interactivas (creación de prospectos, contadores de SLA y automatizaciones) permanecen desactivadas en la interfaz de usuario para garantizar la estabilidad y consistencia del producto hasta que se definan sus reglas.
          </p>
        </div>
      </div>

      {/* Planned Feature Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Sparkles size={16} className="text-amber-400" />
            <span>Capacidades Planificadas para Integración</span>
          </h2>
          <span className="text-[11px] text-obsidian-muted font-mono">Fase 4 — Roadmap</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plannedModules.map((mod, i) => {
            const Icon = mod.icon;
            return (
              <div 
                key={i}
                className="p-5 rounded-2xl bg-obsidian-card border border-obsidian-border hover:border-obsidian-borderLight transition-all flex items-start gap-4"
              >
                <div className={`p-3 rounded-xl border flex-shrink-0 ${mod.color}`}>
                  <Icon size={20} />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <h3 className="text-sm font-semibold text-white tracking-tight truncate">
                    {mod.title}
                  </h3>
                  <p className="text-xs text-obsidian-muted leading-relaxed">
                    {mod.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Integration readiness Checklist */}
      <div className="p-6 rounded-2xl bg-obsidian-card/60 border border-obsidian-border space-y-4">
        <h2 className="text-xs font-bold text-white uppercase tracking-wider text-obsidian-muted">
          Criterios Técnicos Preparados
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-obsidian-bg border border-obsidian-border flex items-center gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
            <span className="text-obsidian-text">Autenticación de Nivel 2 vinculada</span>
          </div>
          <div className="p-3 rounded-xl bg-obsidian-bg border border-obsidian-border flex items-center gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
            <span className="text-obsidian-text">Modelos relacionales en base de datos</span>
          </div>
          <div className="p-3 rounded-xl bg-obsidian-bg border border-obsidian-border flex items-center gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
            <span className="text-obsidian-text">Aislamiento por Scope (Empresa/Personal)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
