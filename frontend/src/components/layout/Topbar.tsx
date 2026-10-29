import React, { useState } from 'react';
import { 
  Plus, RefreshCw, DollarSign, ShieldAlert, Rocket, Edit2, Check, X,
  Briefcase, User, Layers
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { InfoTooltip } from '../common/InfoTooltip';

export const Topbar: React.FC = () => {
  const { 
    activeSection, exchangeRate, refreshExchangeRate, triggerDataReload,
    openEmailModal, openPlatformModal, openProspectModal, 
    panicLock, showToast, activeScope, setActiveScope
  } = useVault();

  const [isSyncingRate, setIsSyncingRate] = useState(false);
  const [isEditingManualRate, setIsEditingManualRate] = useState(false);
  const [manualRateInput, setManualRateInput] = useState('');

  const sectionTitles: Record<string, { title: string; tooltip?: string }> = {
    dashboard: { title: 'Resumen General', tooltip: 'Vista rápida de tus correos principales, seguridad, prospectos, gastos e ingresos reales.' },
    emails: { title: 'Correos Principales', tooltip: 'Tus cuentas de correo principales, a qué teléfono o correo se recuperan y si tienen verificación en 2 pasos.' },
    platforms: { title: 'Cuentas y Servicios', tooltip: 'Todas las páginas, aplicaciones y herramientas vinculadas a tus correos principales.' },
    prospects: { title: 'Prospectos y Proyectos', tooltip: 'Control de clientes potenciales con seguimiento comercial y tus proyectos propios e infraestructura.' },
    passwords: { title: 'Contraseñas y Notas Seguras', tooltip: 'Consulta y copia rápidamente tus contraseñas, PINs, llaves API y recursos o notas cifradas.' },
    graph: { title: 'Mapa de Conexiones', tooltip: 'Diagrama visual que muestra qué servicios y clientes dependen de cada correo y tarjeta.' },
    subscriptions: { title: 'Finanzas, Ingresos y Vencimientos', tooltip: 'Control de suscripciones, gastos únicos, pagos recibidos de clientes (ganancia neta real) y vencimientos de dominios o hosting.' },
    trash: { title: 'Papelera', tooltip: 'Elementos eliminados recientemente que puedes restaurar o borrar de forma definitiva.' },
    settings: { title: 'Ajustes y Seguridad', tooltip: 'Configura tu contraseña maestra, tiempos de bloqueo automático, presupuesto y respaldos.' },
    security_audit: { title: 'Nivel de Seguridad', tooltip: 'Revisión automática para detectar cuentas con la misma contraseña, contraseñas fáciles de adivinar o correos sin protección.' },
    audit_logs: { title: 'Historial de Actividad', tooltip: 'Registro cronológico de todos los movimientos y cambios realizados en tu sistema.' },
  };

  const handleSyncRate = async () => {
    if (isSyncingRate) return;
    setIsSyncingRate(true);
    try {
      const updated = await api.syncExchangeRate();
      await refreshExchangeRate();
      triggerDataReload();
      if (updated && updated.synced === false) {
        setManualRateInput(updated.rate.toFixed(2));
        setIsEditingManualRate(true);
        showToast(updated.source === 'modo_local' ? 'Modo local activo. Puedes ajustar el tipo de cambio manualmente.' : 'Sin conexión al servidor de divisas. Puedes ajustar el tipo de cambio manualmente.', 'warning');
      } else {
        const rateStr = updated?.rate ? updated.rate.toFixed(2) : exchangeRate?.rate.toFixed(2);
        showToast(`Tipo de cambio actualizado: 1 USD = $${rateStr} MXN`, 'success');
      }
    } catch (err) {
      if (exchangeRate) {
        setManualRateInput(exchangeRate.rate.toFixed(2));
        setIsEditingManualRate(true);
      }
      showToast('No se pudo consultar el tipo de cambio en línea. Puedes editarlo manualmente.', 'warning');
    } finally {
      setIsSyncingRate(false);
    }
  };

  const handleSaveManualRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(manualRateInput);
    if (isNaN(val) || val <= 0 || val > 1000) {
      showToast('Ingresa un tipo de cambio válido mayor a 0.', 'warning');
      return;
    }
    setIsSyncingRate(true);
    try {
      const updated = await api.setManualExchangeRate(val, true);
      await refreshExchangeRate();
      triggerDataReload();
      setIsEditingManualRate(false);
      showToast(`Tipo de cambio manual guardado: 1 USD = $${updated.rate.toFixed(2)} MXN`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al guardar el tipo de cambio manual.', 'error');
    } finally {
      setIsSyncingRate(false);
    }
  };

  const currentInfo = sectionTitles[activeSection] || { title: 'EmailSaver' };

  const formattedUpdatedAt = exchangeRate?.updated_at
    ? new Date(exchangeRate.updated_at.endsWith('Z') ? exchangeRate.updated_at : `${exchangeRate.updated_at}Z`).toLocaleString('es-MX', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '';

  return (
    <header className="min-h-16 py-2.5 px-4 sm:px-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 bg-obsidian-panel/80 backdrop-blur-md border-b border-obsidian-border select-none z-20">
      {/* Title & Optional Context Tooltip */}
      <div className="min-w-0 flex items-center gap-2 mr-auto">
        <h1 className="text-sm sm:text-base font-semibold text-white tracking-tight truncate" title={currentInfo.title}>
          {currentInfo.title}
        </h1>
        {currentInfo.tooltip && (
          <InfoTooltip text={currentInfo.tooltip} position="bottom" />
        )}
      </div>

      {/* Right Controls: Scope Filter + Exchange ticker + Actions */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
        {/* Global Scope Selector (Todo | Empresa | Personal) */}
        <div
          className="flex items-center p-0.5 rounded-xl bg-obsidian-surface border border-obsidian-border shrink-0"
          title="Filtrar toda la aplicación por ámbito: Todo, Empresa o Personal"
        >
          <button
            type="button"
            onClick={() => setActiveScope('all')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
              activeScope === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-obsidian-muted hover:text-white'
            }`}
          >
            <Layers size={12} className="shrink-0" />
            <span>Todo</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveScope('business')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
              activeScope === 'business'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-obsidian-muted hover:text-white'
            }`}
          >
            <Briefcase size={12} className="shrink-0" />
            <span>Empresa</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveScope('personal')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
              activeScope === 'personal'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-obsidian-muted hover:text-white'
            }`}
          >
            <User size={12} className="shrink-0" />
            <span>Personal</span>
          </button>
        </div>
        {/* USD / MXN live pill + Manual override inline popover */}
        {exchangeRate && (
          <div className="relative flex items-center shrink-0">
            <div className="flex items-center rounded-xl bg-obsidian-surface border border-obsidian-border hover:border-obsidian-borderLight transition-all overflow-hidden">
              <button
                type="button"
                onClick={handleSyncRate}
                disabled={isSyncingRate}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-obsidian-text hover:text-white transition-colors group disabled:opacity-70"
                title={`Clic para actualizar tipo de cambio automáticamente${formattedUpdatedAt ? ` (Última actualización: ${formattedUpdatedAt})` : ''}`}
              >
                <DollarSign size={13} className="text-emerald-400 shrink-0" />
                <span className="font-mono text-white font-medium whitespace-nowrap">
                  1 USD = ${exchangeRate.rate.toFixed(2)} MXN
                </span>
                {exchangeRate.is_manual && (
                  <span className="text-[9px] px-1 bg-amber-500/20 text-amber-300 rounded font-medium">
                    Manual
                  </span>
                )}
                <RefreshCw 
                  size={12} 
                  className={`text-obsidian-muted group-hover:text-white transition-transform shrink-0 ${isSyncingRate ? 'animate-spin text-indigo-400' : ''}`} 
                />
              </button>
              <button
                type="button"
                onClick={() => {
                  setManualRateInput(exchangeRate.rate.toFixed(2));
                  setIsEditingManualRate(!isEditingManualRate);
                }}
                className="px-2 py-1.5 border-l border-obsidian-border text-obsidian-muted hover:text-white hover:bg-white/5 transition-colors"
                title="Editar tipo de cambio manualmente (útil sin internet)"
              >
                <Edit2 size={11} />
              </button>
            </div>

            {isEditingManualRate && (
              <form
                onSubmit={handleSaveManualRate}
                className="absolute right-0 top-full mt-2 z-50 w-64 p-3 rounded-xl bg-obsidian-panel border border-obsidian-borderLight shadow-2xl space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] font-semibold text-white">
                  <span>Tipo de cambio manual (MXN)</span>
                  <button
                    type="button"
                    onClick={() => setIsEditingManualRate(false)}
                    className="text-obsidian-muted hover:text-white"
                  >
                    <X size={13} />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="1000"
                    value={manualRateInput}
                    onChange={(e) => setManualRateInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-xs text-white font-mono focus:outline-none focus:border-indigo-500 min-w-0"
                    placeholder="18.50"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={isSyncingRate}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1 shrink-0"
                  >
                    <Check size={13} /> Guardar
                  </button>
                </div>
                {formattedUpdatedAt && (
                  <div className="text-[10px] text-obsidian-muted truncate">
                    Actualizado: {formattedUpdatedAt}
                  </div>
                )}
              </form>
            )}
          </div>
        )}

        {/* Panic Button */}
        <button
          type="button"
          onClick={panicLock}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-all group active:scale-95 shrink-0"
          title="Bloquear todo de inmediato y limpiar portapapeles (Ctrl + Shift + L)"
        >
          <ShieldAlert size={14} className="text-rose-400 group-hover:scale-110 transition-transform shrink-0" />
          <span className="hidden md:inline">Bloquear Todo</span>
        </button>

        {/* Action Buttons */}
        <button
          type="button"
          onClick={() => openProspectModal()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-xs font-medium text-obsidian-text hover:text-white transition-all active:scale-95 shrink-0 whitespace-nowrap"
          title="Registrar nuevo prospecto o página demo"
        >
          <Rocket size={13} className="text-indigo-400 shrink-0" />
          <span className="hidden lg:inline">Nuevo Prospecto</span>
          <span className="lg:hidden">Prospecto</span>
        </button>

        <button
          type="button"
          onClick={() => openEmailModal()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-xs font-medium text-obsidian-text hover:text-white transition-all active:scale-95 shrink-0 whitespace-nowrap"
          title="Registrar nuevo correo principal"
        >
          <Plus size={14} className="text-indigo-400 shrink-0" />
          <span className="hidden lg:inline">Nuevo Correo</span>
          <span className="lg:hidden">Correo</span>
        </button>

        <button
          type="button"
          onClick={() => openPlatformModal()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all active:scale-95 shrink-0 whitespace-nowrap"
        >
          <Plus size={14} className="shrink-0" />
          <span>Agregar Cuenta</span>
        </button>
      </div>
    </header>
  );
};

