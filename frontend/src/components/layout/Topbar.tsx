import React, { useEffect, useRef, useState } from 'react';
import { 
  Plus, RefreshCw, DollarSign, ShieldAlert, Rocket, Edit2, Check, X,
  Briefcase, User, Layers, Menu
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { InfoTooltip } from '../common/InfoTooltip';

interface TopbarProps {
  onMenuClick: () => void;
  menuTriggerRef: React.RefObject<HTMLButtonElement>;
  isMenuOpen?: boolean;
}

export const Topbar: React.FC<TopbarProps> = ({ onMenuClick, menuTriggerRef, isMenuOpen }) => {
  const { 
    activeSection, exchangeRate, refreshExchangeRate, triggerDataReload,
    openEmailModal, openPlatformModal, openProspectModal, openUnlockModal, isUnlocked,
    panicLock, showToast, activeScope, setActiveScope,
    supportedCurrencies, baseCurrency, systemLocale,
  } = useVault();

  const [isSyncingRate, setIsSyncingRate] = useState(false);
  const [isEditingManualRate, setIsEditingManualRate] = useState(false);
  const [manualRateInput, setManualRateInput] = useState('');
  const ratePopoverRef = useRef<HTMLDivElement>(null);

  const exchangeBase = exchangeRate?.base_currency || 'USD';
  const exchangeTarget = exchangeRate?.target_currency || baseCurrency || 'MXN';
  const targetCurrencyMeta = supportedCurrencies.find((c) => c.code === exchangeTarget);
  const targetSymbol = targetCurrencyMeta?.symbol || (exchangeTarget === 'MXN' || exchangeTarget === 'USD' ? '$' : '');
  const locale = systemLocale || 'es-MX';

  useEffect(() => {
    if (!isEditingManualRate) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsEditingManualRate(false);
      }
    };
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (ratePopoverRef.current && !ratePopoverRef.current.contains(e.target as Node)) {
        setIsEditingManualRate(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isEditingManualRate]);

  const sectionTitles: Record<string, { title: string; compactTitle: string; tooltip?: string }> = {
    dashboard: { title: 'Resumen General', compactTitle: 'Inicio', tooltip: 'Vista rápida de tus correos principales, seguridad, prospectos, gastos e ingresos reales.' },
    emails: { title: 'Correos Principales', compactTitle: 'Correos', tooltip: 'Tus cuentas de correo principales, a qué teléfono o correo se recuperan y si tienen verificación en 2 pasos.' },
    platforms: { title: 'Servicios vinculados', compactTitle: 'Servicios', tooltip: 'Páginas, aplicaciones y herramientas vinculadas a tus correos principales.' },
    capture: { title: 'Captación en mapa', compactTitle: 'Mapa', tooltip: 'Busca negocios publicados en OpenStreetMap y elige cuáles guardar como prospectos.' },
    prospects: { title: 'Prospectos', compactTitle: 'Prospectos', tooltip: 'Oportunidades comerciales y su seguimiento.' },
    passwords: { title: 'Contraseñas y Notas Seguras', compactTitle: 'Claves', tooltip: 'Consulta y copia rápidamente tus contraseñas, PIN, llaves de acceso y notas seguras.' },
    graph: { title: 'Mapa de Conexiones', compactTitle: 'Conexiones', tooltip: 'Diagrama visual que muestra qué servicios y clientes dependen de cada correo y tarjeta.' },
    writeups: { title: 'Informes de seguridad', compactTitle: 'Informes', tooltip: 'Documenta revisiones de seguridad, dibuja esquemas y exporta informes.' },
    subscriptions: { title: 'Finanzas, Ingresos y Vencimientos', compactTitle: 'Finanzas', tooltip: 'Control de suscripciones, gastos únicos, pagos recibidos de clientes y vencimientos de dominios o hosting.' },
    trash: { title: 'Papelera', compactTitle: 'Papelera', tooltip: 'Elementos eliminados recientemente que puedes restaurar o borrar de forma definitiva.' },
    settings: { title: 'Ajustes y Seguridad', compactTitle: 'Ajustes', tooltip: 'Configura tu contraseña de acceso, tiempos de bloqueo automático, presupuesto y respaldos.' },
    security_audit: { title: 'Nivel de Seguridad', compactTitle: 'Seguridad', tooltip: 'Revisión automática para detectar cuentas con la misma contraseña, contraseñas fáciles de adivinar o correos sin protección.' },
    audit_logs: { title: 'Historial de Actividad', compactTitle: 'Historial', tooltip: 'Registro cronológico de todos los movimientos y cambios realizados en tu sistema.' },
  };

  const handleSyncRate = async () => {
    if (isSyncingRate) return;
    setIsSyncingRate(true);
    try {
      const updated = await api.syncExchangeRate();
      await refreshExchangeRate();
      triggerDataReload();
      const nextBase = updated?.base_currency || exchangeBase;
      const nextTarget = updated?.target_currency || exchangeTarget;
      const nextSymbol = supportedCurrencies.find((c) => c.code === nextTarget)?.symbol || targetSymbol;
      if (updated && updated.synced === false) {
        setManualRateInput(updated.rate.toFixed(2));
        setIsEditingManualRate(true);
        showToast(updated.source === 'modo_local' ? 'Modo local activo. Puedes ajustar el tipo de cambio manualmente.' : 'Sin conexión al servidor de divisas. Puedes ajustar el tipo de cambio manualmente.', 'warning');
      } else {
        const rateStr = updated?.rate ? updated.rate.toFixed(2) : exchangeRate?.rate.toFixed(2);
        showToast(`Tipo de cambio actualizado: 1 ${nextBase} = ${nextSymbol}${rateStr} ${nextTarget}`, 'success');
      }
    } catch {
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
      const nextBase = updated.base_currency || exchangeBase;
      const nextTarget = updated.target_currency || exchangeTarget;
      const nextSymbol = supportedCurrencies.find((c) => c.code === nextTarget)?.symbol || targetSymbol;
      showToast(`Tipo de cambio manual guardado: 1 ${nextBase} = ${nextSymbol}${updated.rate.toFixed(2)} ${nextTarget}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al guardar el tipo de cambio manual.', 'error');
    } finally {
      setIsSyncingRate(false);
    }
  };

  const currentInfo = sectionTitles[activeSection] || { title: 'LESSSO', compactTitle: 'Inicio' };

  const formattedUpdatedAt = exchangeRate?.updated_at
    ? new Date(exchangeRate.updated_at.endsWith('Z') ? exchangeRate.updated_at : `${exchangeRate.updated_at}Z`).toLocaleString(locale, {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '';

  const scopeOptions = [
    { value: 'all', label: 'Todos', icon: Layers },
    { value: 'business', label: 'Negocio', icon: Briefcase },
    { value: 'personal', label: 'Personal', icon: User },
  ] as const;

  return (
    <header className="relative z-20 flex flex-wrap min-w-0 shrink-0 items-center justify-between gap-2 border-b border-obsidian-border bg-obsidian-panel/95 px-3 py-2 sm:flex-nowrap sm:gap-3 sm:px-4 md:py-2.5">
      {/* Title & Optional Context Tooltip */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          ref={menuTriggerRef}
          type="button"
          onClick={onMenuClick}
          aria-expanded={Boolean(isMenuOpen)}
          aria-controls="primary-navigation"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-obsidian-border bg-obsidian-surface text-obsidian-text hover:bg-obsidian-border hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 lg:hidden"
          aria-label="Abrir menú de navegación"
        >
          <Menu size={18} />
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

      {/* Global Scope Selector (Todos | Negocio | Personal) - visible on mobile, tablet & desktop */}
      <div
        role="group"
        aria-label="Mostrar información de todos, negocio o personal"
        className="topbar-scope-full order-3 grid w-full grid-cols-3 items-center rounded-xl border border-obsidian-border bg-obsidian-surface p-0.5 sm:order-none sm:flex sm:w-auto sm:shrink-0"
        title="Mostrar información: todos, negocio o personal"
      >
        {scopeOptions.map((opt) => {
          const Icon = opt.icon;
          const isActive = activeScope === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setActiveScope(opt.value)}
              aria-pressed={isActive}
              className={`inline-flex min-h-[30px] items-center justify-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-obsidian-muted hover:text-white'
              }`}
            >
              <Icon size={12} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{opt.label}</span>
            </button>
          );
        })}
      </div>
      <label className="topbar-scope-compact order-3 w-full">
        <span className="sr-only">Mostrar información de todos, negocio o personal</span>
        <select
          value={activeScope}
          onChange={(event) => setActiveScope(event.target.value as typeof activeScope)}
          className="min-h-11 w-full rounded-xl border border-obsidian-border bg-obsidian-surface px-3 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
        >
          {scopeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      {/* Right Controls: Exchange ticker + Actions */}
      <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2.5">
        {/* Dynamic Exchange pair live pill + Manual override inline popover */}
        {exchangeRate && (
          <div ref={ratePopoverRef} className="relative hidden shrink-0 items-center 2xl:flex">
            <div className="flex items-center rounded-xl bg-obsidian-surface border border-obsidian-border hover:border-obsidian-borderLight transition-all overflow-hidden">
              <button
                type="button"
                onClick={handleSyncRate}
                disabled={isSyncingRate}
                aria-label={`Actualizar tipo de cambio ${exchangeBase} a ${exchangeTarget}`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-obsidian-text hover:text-white transition-colors group disabled:opacity-70"
                title={`Clic para actualizar tipo de cambio automáticamente${formattedUpdatedAt ? ` (Última actualización: ${formattedUpdatedAt})` : ''}`}
              >
                <DollarSign size={13} className="text-emerald-400 shrink-0" aria-hidden="true" />
                <span className="font-mono text-white font-medium whitespace-nowrap">
                  1 {exchangeBase} = {targetSymbol}{exchangeRate.rate.toFixed(2)} {exchangeTarget}
                </span>
                {exchangeRate.is_manual && (
                  <span className="text-[9px] px-1 bg-amber-500/20 text-amber-300 rounded font-medium">
                    Manual
                  </span>
                )}
                <RefreshCw 
                  size={12} 
                  aria-hidden="true"
                  className={`text-obsidian-muted group-hover:text-white transition-transform shrink-0 ${isSyncingRate ? 'animate-spin text-indigo-400' : ''}`} 
                />
              </button>
              <button
                type="button"
                onClick={() => {
                  setManualRateInput(exchangeRate.rate.toFixed(2));
                  setIsEditingManualRate(!isEditingManualRate);
                }}
                aria-label="Editar tipo de cambio manualmente"
                aria-expanded={isEditingManualRate}
                className="px-2 py-1.5 border-l border-obsidian-border text-obsidian-muted hover:text-white hover:bg-white/5 transition-colors"
                title="Editar tipo de cambio manualmente (útil sin internet)"
              >
                <Edit2 size={11} aria-hidden="true" />
              </button>
            </div>

            {isEditingManualRate && (
              <form
                onSubmit={handleSaveManualRate}
                role="dialog"
                aria-label={`Editar tipo de cambio manual (${exchangeTarget})`}
                className="absolute right-0 top-full mt-2 z-50 w-64 p-3 rounded-xl bg-obsidian-panel border border-obsidian-borderLight shadow-2xl space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] font-semibold text-white">
                  <span>Tipo de cambio manual ({exchangeTarget})</span>
                  <button
                    type="button"
                    onClick={() => setIsEditingManualRate(false)}
                    aria-label="Cerrar editor de tipo de cambio"
                    className="p-1 text-obsidian-muted hover:text-white rounded"
                  >
                    <X size={13} aria-hidden="true" />
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
                    aria-label={`Tipo de cambio manual de ${exchangeBase} a ${exchangeTarget}`}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-xs text-white font-mono focus:outline-none focus:border-indigo-500 min-w-0"
                    placeholder="Tipo de cambio"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={isSyncingRate}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1 shrink-0"
                  >
                    <Check size={13} aria-hidden="true" /> Guardar
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
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-300"
          title="Bloquear todo de inmediato y limpiar portapapeles (Ctrl + Shift + L)"
          aria-label="Bloquear todo de inmediato"
        >
          <ShieldAlert size={14} className="shrink-0 text-rose-400" aria-hidden="true" />
          <span className="hidden md:inline">Bloquear Todo</span>
        </button>

        {/* Action Buttons */}
        <button
          type="button"
          onClick={() => isUnlocked ? openProspectModal() : openUnlockModal()}
          aria-label="Nuevo prospecto"
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-obsidian-border bg-obsidian-surface px-2.5 py-1.5 text-xs font-medium text-obsidian-text transition-colors hover:bg-obsidian-border hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
          title="Registrar nuevo prospecto o página demo"
        >
          <Rocket size={13} className="text-indigo-400 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">Nuevo prospecto</span>
        </button>

        <button
          type="button"
          onClick={() => openEmailModal()}
          className="hidden min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-obsidian-border bg-obsidian-surface px-2.5 py-1.5 text-xs font-medium text-obsidian-text transition-colors hover:bg-obsidian-border hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 md:inline-flex"
          title="Registrar nuevo correo principal"
        >
          <Plus size={14} className="text-indigo-400 shrink-0" aria-hidden="true" />
          <span className="hidden lg:inline">Nuevo Correo</span>
          <span className="lg:hidden">Correo</span>
        </button>

        <button
          type="button"
          onClick={() => openPlatformModal()}
          className="hidden min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 2xl:inline-flex"
        >
          <Plus size={14} className="shrink-0" aria-hidden="true" />
          <span>Agregar Cuenta</span>
        </button>
      </div>
    </header>
  );
};

