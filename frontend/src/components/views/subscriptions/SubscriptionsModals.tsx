import React, { useEffect, useId } from 'react';
import { Wallet, Server, RefreshCw, Receipt, Check, X } from 'lucide-react';
import {
  ClientIncome, DomainRenewal, OneTimeExpense, Prospect, PaymentMethod,
  IncomeCategory, IncomeStatus, RenewalServiceType, RenewalPaidBy, EntityScope,
  RuntimeCurrencyOption
} from '../../../types';
import { INPUT_LIMITS } from '../../../lib/validation';
import { INCOME_CATEGORIES, RENEWAL_SERVICE_TYPES } from './SubscriptionsLists';
import { InfoTooltip } from '../../common/InfoTooltip';

export const EXPENSE_CATEGORIES = [
  'Hardware / Equipos',
  'Licencias Vitalicias',
  'Servicios y Honorarios',
  'Mobiliario y Oficina',
  'Cursos y Capacitación',
  'Insumos / Consumibles',
  'Otro Gasto'
];

interface SubscriptionsModalsProps {
  supportedCurrencies: RuntimeCurrencyOption[];
  prospects: Prospect[];
  paymentMethods: PaymentMethod[];
  formatAmount: (value: number | string | undefined | null, decimals?: number) => string;

  // Income modal
  isIncomeModalOpen: boolean;
  setIsIncomeModalOpen: (open: boolean) => void;
  editingIncome: ClientIncome | null;
  incClientName: string;
  setIncClientName: (v: string) => void;
  incProspectId: string;
  setIncProspectId: (v: string) => void;
  incConcept: string;
  setIncConcept: (v: string) => void;
  incCategory: IncomeCategory;
  setIncCategory: (v: IncomeCategory) => void;
  incAmount: string;
  setIncAmount: (v: string) => void;
  incCurrency: string;
  setIncCurrency: (v: string) => void;
  incStatus: IncomeStatus;
  setIncStatus: (v: IncomeStatus) => void;
  incDate: string;
  setIncDate: (v: string) => void;
  incMethod: string;
  setIncMethod: (v: string) => void;
  incRecurring: boolean;
  setIncRecurring: (v: boolean) => void;
  incScope: EntityScope;
  setIncScope: (v: EntityScope) => void;
  incNotes: string;
  setIncNotes: (v: string) => void;
  savingIncome: boolean;
  showQuickClientInInc: boolean;
  setShowQuickClientInInc: (v: boolean) => void;
  quickClientNameInInc: string;
  setQuickClientNameInInc: (v: string) => void;
  creatingQuickClientInInc: boolean;
  handleQuickCreateClientInInc: () => void;
  handleSaveIncome: (e: React.FormEvent) => void;

  // Renewal modal
  isRenewalModalOpen: boolean;
  setIsRenewalModalOpen: (open: boolean) => void;
  editingRenewal: DomainRenewal | null;
  renClientName: string;
  setRenClientName: (v: string) => void;
  renProspectId: string;
  setRenProspectId: (v: string) => void;
  renDomainOrService: string;
  setRenDomainOrService: (v: string) => void;
  renServiceType: RenewalServiceType;
  setRenServiceType: (v: RenewalServiceType) => void;
  renProvider: string;
  setRenProvider: (v: string) => void;
  renDate: string;
  setRenDate: (v: string) => void;
  renCost: string;
  setRenCost: (v: string) => void;
  renCurrency: string;
  setRenCurrency: (v: string) => void;
  renCycle: 'yearly' | 'monthly';
  setRenCycle: (v: 'yearly' | 'monthly') => void;
  renPaidBy: RenewalPaidBy;
  setRenPaidBy: (v: RenewalPaidBy) => void;
  renClientCharge: string;
  setRenClientCharge: (v: string) => void;
  renScope: EntityScope;
  setRenScope: (v: EntityScope) => void;
  renNotes: string;
  setRenNotes: (v: string) => void;
  savingRenewal: boolean;
  showQuickClientInRen: boolean;
  setShowQuickClientInRen: (v: boolean) => void;
  quickClientNameInRen: string;
  setQuickClientNameInRen: (v: string) => void;
  creatingQuickClientInRen: boolean;
  handleQuickCreateClientInRen: () => void;
  handleSaveRenewal: (e: React.FormEvent) => void;

  // Advance renewal modal
  advanceRenewalTarget: DomainRenewal | null;
  setAdvanceRenewalTarget: (ren: DomainRenewal | null) => void;
  advanceCreateIncome: boolean;
  setAdvanceCreateIncome: (v: boolean) => void;
  advanceChargedAmount: string;
  setAdvanceChargedAmount: (v: string) => void;
  advancingRenewal: boolean;
  handleConfirmAdvanceRenewal: () => void;

  // Expense modal
  isExpenseModalOpen: boolean;
  setIsExpenseModalOpen: (open: boolean) => void;
  editingExpense: OneTimeExpense | null;
  expTitle: string;
  setExpTitle: (v: string) => void;
  expCategory: string;
  setExpCategory: (v: string) => void;
  expAmount: string;
  setExpAmount: (v: string) => void;
  expCurrency: string;
  setExpCurrency: (v: string) => void;
  expDate: string;
  setExpDate: (v: string) => void;
  expScope: EntityScope;
  setExpScope: (v: EntityScope) => void;
  expPaymentMethodId: string;
  setExpPaymentMethodId: (v: string) => void;
  expPaymentMethodLabel: string;
  setExpPaymentMethodLabel: (v: string) => void;
  expNotes: string;
  setExpNotes: (v: string) => void;
  savingExpense: boolean;
  handleSaveExpense: (e: React.FormEvent) => void;
}

export const SubscriptionsModals: React.FC<SubscriptionsModalsProps> = ({
  supportedCurrencies,
  prospects,
  paymentMethods,
  formatAmount,
  isIncomeModalOpen,
  setIsIncomeModalOpen,
  editingIncome,
  incClientName,
  setIncClientName,
  incProspectId,
  setIncProspectId,
  incConcept,
  setIncConcept,
  incCategory,
  setIncCategory,
  incAmount,
  setIncAmount,
  incCurrency,
  setIncCurrency,
  incStatus,
  setIncStatus,
  incDate,
  setIncDate,
  incMethod,
  setIncMethod,
  incRecurring,
  setIncRecurring,
  incScope,
  setIncScope,
  incNotes,
  setIncNotes,
  savingIncome,
  showQuickClientInInc,
  setShowQuickClientInInc,
  quickClientNameInInc,
  setQuickClientNameInInc,
  creatingQuickClientInInc,
  handleQuickCreateClientInInc,
  handleSaveIncome,
  isRenewalModalOpen,
  setIsRenewalModalOpen,
  editingRenewal,
  renClientName,
  setRenClientName,
  renProspectId,
  setRenProspectId,
  renDomainOrService,
  setRenDomainOrService,
  renServiceType,
  setRenServiceType,
  renProvider,
  setRenProvider,
  renDate,
  setRenDate,
  renCost,
  setRenCost,
  renCurrency,
  setRenCurrency,
  renPaidBy,
  setRenPaidBy,
  renClientCharge,
  setRenClientCharge,
  renScope,
  setRenScope,
  renNotes,
  setRenNotes,
  savingRenewal,
  showQuickClientInRen,
  setShowQuickClientInRen,
  quickClientNameInRen,
  setQuickClientNameInRen,
  creatingQuickClientInRen,
  handleQuickCreateClientInRen,
  handleSaveRenewal,
  advanceRenewalTarget,
  setAdvanceRenewalTarget,
  advanceCreateIncome,
  setAdvanceCreateIncome,
  advanceChargedAmount,
  setAdvanceChargedAmount,
  advancingRenewal,
  handleConfirmAdvanceRenewal,
  isExpenseModalOpen,
  setIsExpenseModalOpen,
  editingExpense,
  expTitle,
  setExpTitle,
  expCategory,
  setExpCategory,
  expAmount,
  setExpAmount,
  expCurrency,
  setExpCurrency,
  expDate,
  setExpDate,
  expScope,
  setExpScope,
  expPaymentMethodId,
  setExpPaymentMethodId,
  expPaymentMethodLabel,
  setExpPaymentMethodLabel,
  expNotes,
  setExpNotes,
  savingExpense,
  handleSaveExpense,
}) => {
  const uid = useId();
  const incomeTitleId = `${uid}-income-title`;
  const renewalTitleId = `${uid}-renewal-title`;
  const advanceTitleId = `${uid}-advance-title`;
  const expenseTitleId = `${uid}-expense-title`;

  const anyModalOpen = isIncomeModalOpen || isRenewalModalOpen || Boolean(advanceRenewalTarget) || isExpenseModalOpen;

  useEffect(() => {
    if (!anyModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (advanceRenewalTarget) {
        setAdvanceRenewalTarget(null);
      } else if (isExpenseModalOpen) {
        setIsExpenseModalOpen(false);
      } else if (isRenewalModalOpen) {
        setIsRenewalModalOpen(false);
      } else if (isIncomeModalOpen) {
        setIsIncomeModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    anyModalOpen,
    advanceRenewalTarget,
    isExpenseModalOpen,
    isRenewalModalOpen,
    isIncomeModalOpen,
    setAdvanceRenewalTarget,
    setIsExpenseModalOpen,
    setIsRenewalModalOpen,
    setIsIncomeModalOpen,
  ]);

  const buildCurrencyOptions = (current: string) => {
    const exists = supportedCurrencies.some((c) => c.code === current);
    if (exists) return supportedCurrencies;
    return [...supportedCurrencies, { code: current, name: current, symbol: '$' }];
  };

  return (
    <>
      {/* MODAL: REGISTRAR / EDITAR PAGO RECIBIDO DE CLIENTE */}
      {isIncomeModalOpen && (
        <div
          className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
          onClick={() => setIsIncomeModalOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={incomeTitleId}
            className="relative w-full max-w-lg bg-obsidian-panel border border-obsidian-borderLight rounded-2xl shadow-2xl p-4 sm:p-6 overflow-y-auto max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-obsidian-border gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
                  <Wallet size={18} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 id={incomeTitleId} className="text-sm font-bold text-white truncate">
                    {editingIncome ? 'Editar Pago de Cliente' : 'Registrar Pago Recibido de Cliente'}
                  </h3>
                  <p className="text-[11px] text-obsidian-muted truncate">Pagos, anticipos e igualas.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsIncomeModalOpen(false)}
                aria-label="Cerrar modal de pago"
                className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface shrink-0"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveIncome} className="space-y-4 pt-4 text-xs">
              <div className={`grid grid-cols-1 gap-3 ${incScope === 'personal' ? '' : 'sm:grid-cols-2'}`}>
                {incScope !== 'personal' && <div>
                  <label htmlFor={`${uid}-inc-prospect`} className="block text-obsidian-text font-medium mb-1">
                    Vincular cliente (opcional)
                  </label>
                  {!showQuickClientInInc ? (
                    <select
                      id={`${uid}-inc-prospect`}
                      value={incProspectId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        if (pid === '__create__') {
                          setShowQuickClientInInc(true);
                          return;
                        }
                        setIncProspectId(pid);
                        const found = prospects.find((pr) => pr.id === pid);
                        if (found && !incClientName.trim()) {
                          setIncClientName(found.company_name);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Escribir nombre manualmente --</option>
                      <option value="__create__" className="text-emerald-400 font-semibold">+ Crear nuevo cliente aquí...</option>
                      {prospects.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {pr.company_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        id={`${uid}-inc-prospect`}
                        type="text"
                        autoFocus
                        maxLength={INPUT_LIMITS.COMPANY_NAME}
                        value={quickClientNameInInc}
                        onChange={(e) => setQuickClientNameInInc(e.target.value)}
                        placeholder="Nombre del nuevo cliente"
                        aria-label="Nombre del nuevo cliente"
                        className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-obsidian-bg border border-emerald-500 text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={creatingQuickClientInInc || !quickClientNameInInc.trim()}
                        onClick={handleQuickCreateClientInInc}
                        className="px-2.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-50"
                      >
                        {creatingQuickClientInInc ? '...' : 'Crear'}
                      </button>
                      <button
                        type="button"
                        aria-label="Cancelar creación rápida de cliente"
                        onClick={() => {
                          setShowQuickClientInInc(false);
                          setQuickClientNameInInc('');
                        }}
                        className="p-2 text-obsidian-muted hover:text-white rounded-xl bg-obsidian-surface"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>}

                <div>
                  <label htmlFor={`${uid}-inc-client`} className="block text-obsidian-text font-medium mb-1">
                    {incScope === 'personal' ? 'Origen personal *' : incScope === 'shared' ? 'Cliente o gasto compartido *' : 'Cliente o negocio *'}
                  </label>
                  <input
                    id={`${uid}-inc-client`}
                    type="text"
                    required
                    maxLength={INPUT_LIMITS.COMPANY_NAME}
                    value={incClientName}
                    onChange={(e) => setIncClientName(e.target.value)}
                    placeholder={incScope === 'personal' ? 'Ej. Reembolso' : 'Ej. Mueblería Central'}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${uid}-inc-scope`} className="block text-obsidian-text font-medium mb-1">
                    Ámbito *
                  </label>
                  <select
                    id={`${uid}-inc-scope`}
                    value={incScope}
                    onChange={(e) => {
                      const scope = e.target.value as EntityScope;
                      setIncScope(scope);
                      if (scope === 'personal') {
                        if (incProspectId) setIncClientName('');
                        setIncProspectId('');
                        setShowQuickClientInInc(false);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="business">Empresa / Negocio</option>
                    <option value="personal">Personal</option>
                    <option value="shared">Compartido</option>
                  </select>
                </div>

                <div>
                  <label htmlFor={`${uid}-inc-cat`} className="block text-obsidian-text font-medium mb-1">
                    Tipo de Pago *
                  </label>
                  <select
                    id={`${uid}-inc-cat`}
                    value={incCategory}
                    onChange={(e) => {
                      const cat = e.target.value as IncomeCategory;
                      setIncCategory(cat);
                      if (cat === 'iguala_mensual') setIncRecurring(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  >
                    {INCOME_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor={`${uid}-inc-concept`} className="block text-obsidian-text font-medium mb-1">
                  Concepto / Descripción *
                </label>
                <input
                  id={`${uid}-inc-concept`}
                  type="text"
                  required
                  maxLength={INPUT_LIMITS.NAME}
                  value={incConcept}
                  onChange={(e) => setIncConcept(e.target.value)}
                  placeholder="Ej. Anticipo 50% página web"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor={`${uid}-inc-amount`} className="block text-obsidian-text font-medium mb-1">Monto *</label>
                  <input
                    id={`${uid}-inc-amount`}
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={INPUT_LIMITS.COST_AMOUNT}
                    required
                    value={incAmount}
                    onChange={(e) => setIncAmount(e.target.value)}
                    placeholder="3500"
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-inc-currency`} className="block text-obsidian-text font-medium mb-1">Moneda</label>
                  <select
                    id={`${uid}-inc-currency`}
                    value={incCurrency}
                    onChange={(e) => setIncCurrency(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  >
                    {buildCurrencyOptions(incCurrency).map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor={`${uid}-inc-status`} className="block text-obsidian-text font-medium mb-1">Estado</label>
                  <select
                    id={`${uid}-inc-status`}
                    value={incStatus}
                    onChange={(e) => setIncStatus(e.target.value as IncomeStatus)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="cobrado">Ya cobrado</option>
                    <option value="pendiente">Pendiente por cobrar</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${uid}-inc-date`} className="block text-obsidian-text font-medium mb-1">Fecha de Pago</label>
                  <input
                    id={`${uid}-inc-date`}
                    type="date"
                    required
                    value={incDate}
                    onChange={(e) => setIncDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-inc-method`} className="block text-obsidian-text font-medium mb-1">Medio de Pago</label>
                  <input
                    id={`${uid}-inc-method`}
                    type="text"
                    maxLength={INPUT_LIMITS.PAYMENT_ALIAS}
                    value={incMethod}
                    onChange={(e) => setIncMethod(e.target.value)}
                    placeholder="Transferencia SPEI, Efectivo, Tarjeta..."
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 text-obsidian-text">
                <label htmlFor={`${uid}-inc-recurring`} className="inline-flex min-h-9 cursor-pointer items-center gap-2">
                <input
                  id={`${uid}-inc-recurring`}
                  type="checkbox"
                  checked={incRecurring}
                  onChange={(e) => setIncRecurring(e.target.checked)}
                  className="rounded bg-obsidian-bg border-obsidian-border text-emerald-500 focus:ring-0"
                />
                  <span>Iguala mensual</span>
                </label>
                <span className="-ml-1 self-start"><InfoTooltip content="Activa esta opción si el cliente paga la misma cantidad cada mes por mantenimiento." /></span>
              </div>

              <details className="group rounded-lg border border-obsidian-border px-3">
                <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 text-xs text-obsidian-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 [&::-webkit-details-marker]:hidden">
                  <span>Notas privadas</span>
                  <span className="text-[10px]">Opcional</span>
                </summary>
                <textarea
                  id={`${uid}-inc-notes`}
                  rows={2}
                  maxLength={INPUT_LIMITS.NOTES}
                  value={incNotes}
                  onChange={(e) => setIncNotes(e.target.value)}
                  placeholder="Acuerdo o comprobante"
                  className="mb-3 w-full resize-none rounded-xl border border-obsidian-border bg-obsidian-bg p-2.5 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                />
              </details>

              <div className="pt-3 border-t border-obsidian-border flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsIncomeModalOpen(false)}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-obsidian-muted transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingIncome}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
                >
                  {savingIncome ? 'Guardando...' : editingIncome ? 'Guardar Cambios' : 'Registrar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REGISTRAR / EDITAR VENCIMIENTO DE DOMINIO O HOSTING */}
      {isRenewalModalOpen && (
        <div
          className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
          onClick={() => setIsRenewalModalOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={renewalTitleId}
            className="relative w-full max-w-lg bg-obsidian-panel border border-obsidian-borderLight rounded-2xl shadow-2xl p-4 sm:p-6 overflow-y-auto max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-obsidian-border gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 shrink-0">
                  <Server size={18} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 id={renewalTitleId} className="text-sm font-bold text-white truncate">
                    {editingRenewal ? 'Editar servicio' : 'Agregar servicio y vencimiento'}
                  </h3>
                  <p className="text-[11px] text-obsidian-muted truncate">Dominio, alojamiento u otro servicio.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRenewalModalOpen(false)}
                aria-label="Cerrar modal de dominio o hosting"
                className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface shrink-0"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveRenewal} className="space-y-4 pt-4 text-xs">
              <div className={`grid grid-cols-1 gap-3 ${renScope === 'personal' ? '' : 'sm:grid-cols-2'}`}>
                {renScope !== 'personal' && <div>
                  <label htmlFor={`${uid}-ren-prospect`} className="block text-obsidian-text font-medium mb-1">
                    Vincular cliente (opcional)
                  </label>
                  {!showQuickClientInRen ? (
                    <select
                      id={`${uid}-ren-prospect`}
                      value={renProspectId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        if (pid === '__create__') {
                          setShowQuickClientInRen(true);
                          return;
                        }
                        setRenProspectId(pid);
                        const found = prospects.find((pr) => pr.id === pid);
                        if (found && !renClientName.trim()) {
                          setRenClientName(found.company_name);
                        }
                        if (found && found.demo_url && !renDomainOrService.trim()) {
                          setRenDomainOrService(found.demo_url.replace(/^https?:\/\//, ''));
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Escribir cliente manualmente --</option>
                      <option value="__create__" className="text-cyan-400 font-semibold">+ Crear nuevo cliente aquí...</option>
                      {prospects.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {pr.company_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        id={`${uid}-ren-prospect`}
                        type="text"
                        autoFocus
                        maxLength={INPUT_LIMITS.COMPANY_NAME}
                        value={quickClientNameInRen}
                        onChange={(e) => setQuickClientNameInRen(e.target.value)}
                        placeholder="Nombre del nuevo cliente"
                        aria-label="Nombre del nuevo cliente"
                        className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-obsidian-bg border border-cyan-500 text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={creatingQuickClientInRen || !quickClientNameInRen.trim()}
                        onClick={handleQuickCreateClientInRen}
                        className="px-2.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold disabled:opacity-50"
                      >
                        {creatingQuickClientInRen ? '...' : 'Crear'}
                      </button>
                      <button
                        type="button"
                        aria-label="Cancelar creación rápida de cliente"
                        onClick={() => {
                          setShowQuickClientInRen(false);
                          setQuickClientNameInRen('');
                        }}
                        className="p-2 text-obsidian-muted hover:text-white rounded-xl bg-obsidian-surface"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>}

                <div>
                  <label htmlFor={`${uid}-ren-client`} className="block text-obsidian-text font-medium mb-1">
                    {renScope === 'personal' ? 'Cuenta personal *' : renScope === 'shared' ? 'Cliente o cuenta compartida *' : 'Cliente o proyecto *'}
                  </label>
                  <input
                    id={`${uid}-ren-client`}
                    type="text"
                    required
                    maxLength={INPUT_LIMITS.COMPANY_NAME}
                    value={renClientName}
                    onChange={(e) => setRenClientName(e.target.value)}
                    placeholder={renScope === 'personal' ? 'Ej. Dominio personal' : 'Ej. Clínica Dental Sonrisa'}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${uid}-ren-domain`} className="block text-obsidian-text font-medium mb-1">
                    Dominio o Servicio *
                  </label>
                  <input
                    id={`${uid}-ren-domain`}
                    type="text"
                    required
                    maxLength={255}
                    value={renDomainOrService}
                    onChange={(e) => setRenDomainOrService(e.target.value)}
                    placeholder="Ej. clinicasonrisa.com.mx"
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-ren-scope`} className="block text-obsidian-text font-medium mb-1">
                    Ámbito *
                  </label>
                  <select
                    id={`${uid}-ren-scope`}
                    value={renScope}
                    onChange={(e) => {
                      const scope = e.target.value as EntityScope;
                      setRenScope(scope);
                      if (scope === 'personal') {
                        if (renProspectId) setRenClientName('');
                        setRenProspectId('');
                        setShowQuickClientInRen(false);
                        setRenPaidBy('me');
                        setRenClientCharge('');
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="business">Empresa / Negocio</option>
                    <option value="personal">Personal</option>
                    <option value="shared">Compartido</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${uid}-ren-type`} className="block text-obsidian-text font-medium mb-1">
                    Tipo de Servicio
                  </label>
                  <select
                    id={`${uid}-ren-type`}
                    value={renServiceType}
                    onChange={(e) => setRenServiceType(e.target.value as RenewalServiceType)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  >
                    {RENEWAL_SERVICE_TYPES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor={`${uid}-ren-date`} className="block text-obsidian-text font-medium mb-1">
                    Fecha de Vencimiento *
                  </label>
                  <input
                    id={`${uid}-ren-date`}
                    type="date"
                    required
                    value={renDate}
                    onChange={(e) => setRenDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-ren-cost`} className="block text-obsidian-text font-medium mb-1">Costo Renovación</label>
                  <input
                    id={`${uid}-ren-cost`}
                    type="number"
                    step="0.01"
                    min="0"
                    max={INPUT_LIMITS.COST_AMOUNT}
                    required
                    value={renCost}
                    onChange={(e) => setRenCost(e.target.value)}
                    placeholder="350"
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-ren-currency`} className="block text-obsidian-text font-medium mb-1">Moneda</label>
                  <select
                    id={`${uid}-ren-currency`}
                    value={renCurrency}
                    onChange={(e) => setRenCurrency(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  >
                    {buildCurrencyOptions(renCurrency).map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {renScope !== 'personal' && <div>
                <span className="block text-obsidian-text font-medium mb-1.5">
                  ¿Quién cubre el pago de la renovación? *
                </span>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setRenPaidBy('client')}
                    aria-pressed={renPaidBy === 'client'}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      renPaidBy === 'client'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200 font-semibold'
                        : 'bg-obsidian-bg border-obsidian-border text-obsidian-muted hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Check size={13} className={renPaidBy === 'client' ? 'text-emerald-400' : 'opacity-0'} aria-hidden="true" />
                      <span>Por cuenta del cliente</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRenPaidBy('me')}
                    aria-pressed={renPaidBy === 'me'}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      renPaidBy === 'me'
                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-200 font-semibold'
                        : 'bg-obsidian-bg border-obsidian-border text-obsidian-muted hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Check size={13} className={renPaidBy === 'me' ? 'text-rose-400' : 'opacity-0'} aria-hidden="true" />
                      <span>Por mi cuenta</span>
                    </div>
                  </button>
                </div>
              </div>}

              {renScope !== 'personal' && renPaidBy === 'client' && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1.5">
                  <label htmlFor={`${uid}-ren-client-charge`} className="block text-emerald-300 font-semibold text-[11px]">
                    Cobro al cliente
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-white/60 font-mono">$</span>
                    <input
                      id={`${uid}-ren-client-charge`}
                      type="number"
                      step="0.01"
                      min="0"
                      max={INPUT_LIMITS.COST_AMOUNT}
                      value={renClientCharge}
                      onChange={(e) => setRenClientCharge(e.target.value)}
                      placeholder={renCost || '500'}
                      className="w-36 px-2.5 py-1.5 rounded-lg bg-obsidian-bg border border-emerald-500/40 text-white font-mono focus:outline-none focus:border-emerald-400"
                    />
                    <span className="text-emerald-300 font-mono font-semibold">{renCurrency}</span>
                    {renCost && renClientCharge && parseFloat(renClientCharge) > parseFloat(renCost) && (
                      <span className="text-[10px] font-mono text-emerald-400 ml-auto">
                        Margen: +${formatAmount(parseFloat(renClientCharge) - parseFloat(renCost))} {renCurrency}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <details className="group rounded-lg border border-obsidian-border px-3">
                <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 text-xs text-obsidian-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 [&::-webkit-details-marker]:hidden">
                  <span>Datos adicionales</span>
                  <span className="text-[10px]">Proveedor y notas</span>
                </summary>
                <div className="space-y-3 pb-3">
                  <div>
                    <label htmlFor={`${uid}-ren-provider`} className="mb-1 block font-medium text-obsidian-text">
                      Proveedor
                    </label>
                    <input
                      id={`${uid}-ren-provider`}
                      type="text"
                      maxLength={INPUT_LIMITS.PLATFORM_NAME}
                      value={renProvider}
                      onChange={(e) => setRenProvider(e.target.value)}
                      placeholder="Ej. Hostinger"
                      className="w-full rounded-xl border border-obsidian-border bg-obsidian-bg px-3 py-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-ren-notes`} className="mb-1 block font-medium text-obsidian-text">
                      Notas privadas
                    </label>
                    <textarea
                      id={`${uid}-ren-notes`}
                      rows={2}
                      maxLength={INPUT_LIMITS.NOTES}
                      value={renNotes}
                      onChange={(e) => setRenNotes(e.target.value)}
                      placeholder="Cuenta, DNS o recordatorio"
                      className="w-full resize-none rounded-xl border border-obsidian-border bg-obsidian-bg p-2.5 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                    />
                  </div>
                </div>
              </details>

              <div className="pt-3 border-t border-obsidian-border flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsRenewalModalOpen(false)}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-obsidian-muted transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingRenewal}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
                >
                  {savingRenewal ? 'Guardando...' : editingRenewal ? 'Guardar Cambios' : 'Registrar Vencimiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ATÓMICO: CONFIRMAR RENOVACIÓN DE CICLO (+1 CICLO) */}
      {advanceRenewalTarget && (
        <div
          className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
          onClick={() => setAdvanceRenewalTarget(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={advanceTitleId}
            className="relative w-full max-w-md bg-obsidian-panel border border-emerald-500/40 rounded-2xl shadow-2xl p-4 sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-obsidian-border gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
                  <RefreshCw size={18} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 id={advanceTitleId} className="text-sm font-bold text-white truncate">Renovar Ciclo (+1 Ciclo)</h3>
                  <p className="text-[11px] text-obsidian-muted truncate">{advanceRenewalTarget.domain_or_service}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdvanceRenewalTarget(null)}
                aria-label="Cerrar modal de renovación"
                className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface shrink-0"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-obsidian-bg/80 border border-obsidian-border space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-obsidian-muted">{advanceRenewalTarget.scope === 'personal' ? 'Cuenta:' : 'Cliente:'}</span>
                  <strong className="text-white truncate">{advanceRenewalTarget.client_name}</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-obsidian-muted">Costo de renovación propio:</span>
                  <span className="font-mono text-white">${formatAmount(advanceRenewalTarget.renewal_cost)} {advanceRenewalTarget.currency}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-obsidian-muted">Periodo:</span>
                  <span className="capitalize text-white/80">{advanceRenewalTarget.billing_cycle === 'monthly' ? 'Mensual (+1 mes)' : 'Anual (+1 año)'}</span>
                </div>
              </div>

              {advanceRenewalTarget.scope !== 'personal' && <label htmlFor={`${uid}-adv-create-inc`} className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 cursor-pointer">
                <input
                  id={`${uid}-adv-create-inc`}
                  type="checkbox"
                  checked={advanceCreateIncome}
                  onChange={(e) => setAdvanceCreateIncome(e.target.checked)}
                  className="mt-0.5 rounded bg-obsidian-bg border-obsidian-border text-emerald-500 focus:ring-0"
                />
                <div className="min-w-0">
                  <span className="text-emerald-200 font-semibold block">Generar registro automático en Ingresos</span>
                  <span className="text-[10px] text-obsidian-muted block mt-0.5">
                    Registra el cobro en Ingresos y suma la ganancia del servicio.
                  </span>
                </div>
              </label>}

              {advanceCreateIncome && (
                <div className="space-y-2">
                  <label htmlFor={`${uid}-adv-charge`} className="block text-obsidian-text font-medium">
                    Monto cobrado al cliente *
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-white/60">$</span>
                    <input
                      id={`${uid}-adv-charge`}
                      type="number"
                      step="0.01"
                      min="0"
                      max={INPUT_LIMITS.COST_AMOUNT}
                      autoFocus
                      required
                      value={advanceChargedAmount}
                      onChange={(e) => setAdvanceChargedAmount(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-obsidian-bg border border-emerald-500/40 text-white font-mono focus:outline-none focus:border-emerald-400"
                    />
                    <span className="font-mono text-emerald-300 font-semibold shrink-0">{advanceRenewalTarget.currency}</span>
                  </div>

                  {parseFloat(advanceChargedAmount || '0') > 0 && (
                    <div className="p-2.5 rounded-lg bg-obsidian-surface border border-obsidian-border flex items-center justify-between font-mono text-[11px]">
                      <span className="text-obsidian-muted">Margen de ganancia:</span>
                      <strong className={`font-bold ${parseFloat(advanceChargedAmount || '0') >= advanceRenewalTarget.renewal_cost ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ${formatAmount(parseFloat(advanceChargedAmount || '0') - advanceRenewalTarget.renewal_cost)} {advanceRenewalTarget.currency}
                      </strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-obsidian-border flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setAdvanceRenewalTarget(null)}
                className="inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-obsidian-muted transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={advancingRenewal}
                onClick={handleConfirmAdvanceRenewal}
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
              >
                {advancingRenewal ? 'Renovando...' : 'Confirmar y Renovar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REGISTRAR / EDITAR GASTO ÚNICO VARIABLE */}
      {isExpenseModalOpen && (
        <div
          className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
          onClick={() => setIsExpenseModalOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={expenseTitleId}
            className="relative w-full max-w-lg bg-obsidian-panel border border-obsidian-borderLight rounded-2xl shadow-2xl p-4 sm:p-6 overflow-y-auto max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-obsidian-border gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 shrink-0">
                  <Receipt size={18} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 id={expenseTitleId} className="text-sm font-bold text-white truncate">
                    {editingExpense ? 'Editar gasto' : 'Registrar gasto'}
                  </h3>
                  <p className="text-[11px] text-obsidian-muted truncate">Compra no recurrente.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExpenseModalOpen(false)}
                aria-label="Cerrar modal de gasto único"
                className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface shrink-0"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-4 pt-4 text-xs">
              <div>
                <label htmlFor={`${uid}-exp-title`} className="block text-obsidian-text font-medium mb-1">
                  Título o Concepto del Gasto *
                </label>
                <input
                  id={`${uid}-exp-title`}
                  type="text"
                  required
                  autoFocus
                  maxLength={INPUT_LIMITS.NAME}
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  placeholder="Ej. MacBook Pro M3, Licencia vitalicia JetBrains, Impresora..."
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${uid}-exp-cat`} className="block text-obsidian-text font-medium mb-1">Categoría *</label>
                  <select
                    id={`${uid}-exp-cat`}
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor={`${uid}-exp-scope`} className="block text-obsidian-text font-medium mb-1">
                    Ámbito *
                  </label>
                  <select
                    id={`${uid}-exp-scope`}
                    value={expScope}
                    onChange={(e) => setExpScope(e.target.value as EntityScope)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="business">Empresa / Negocio</option>
                    <option value="personal">Personal</option>
                    <option value="shared">Compartido</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor={`${uid}-exp-amount`} className="block text-obsidian-text font-medium mb-1">Monto *</label>
                  <input
                    id={`${uid}-exp-amount`}
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={INPUT_LIMITS.COST_AMOUNT}
                    required
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="1200"
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-exp-currency`} className="block text-obsidian-text font-medium mb-1">Moneda</label>
                  <select
                    id={`${uid}-exp-currency`}
                    value={expCurrency}
                    onChange={(e) => setExpCurrency(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  >
                    {buildCurrencyOptions(expCurrency).map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor={`${uid}-exp-date`} className="block text-obsidian-text font-medium mb-1">Fecha</label>
                  <input
                    id={`${uid}-exp-date`}
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor={`${uid}-exp-pay-select`} className="block text-obsidian-text font-medium mb-1">
                  Medio o Tarjeta de Pago
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    id={`${uid}-exp-pay-select`}
                    value={expPaymentMethodId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      setExpPaymentMethodId(pid);
                      const found = paymentMethods.find((p) => p.id === pid);
                      if (found) {
                        setExpPaymentMethodLabel(`${found.alias} (*${found.last_four})`);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-- Seleccionar tarjeta registrada --</option>
                    {paymentMethods.map((pm) => (
                      <option key={pm.id} value={pm.id}>
                        {pm.alias} (*{pm.last_four})
                      </option>
                    ))}
                  </select>
                  <input
                    id={`${uid}-exp-pay-label`}
                    type="text"
                    maxLength={INPUT_LIMITS.PAYMENT_ALIAS}
                    value={expPaymentMethodLabel}
                    onChange={(e) => setExpPaymentMethodLabel(e.target.value)}
                    aria-label="Etiqueta manual del medio de pago"
                    placeholder="O escribir: SPEI, Efectivo, BBVA..."
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <details className="group rounded-lg border border-obsidian-border px-3">
                <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 text-xs text-obsidian-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 [&::-webkit-details-marker]:hidden">
                  <span>Notas privadas</span>
                  <span className="text-[10px]">Opcional</span>
                </summary>
                <textarea
                  id={`${uid}-exp-notes`}
                  rows={2}
                  maxLength={INPUT_LIMITS.NOTES}
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                  placeholder="Factura, proveedor o garantía"
                  className="mb-3 w-full resize-none rounded-xl border border-obsidian-border bg-obsidian-bg p-2.5 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                />
              </details>

              <div className="pt-3 border-t border-obsidian-border flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-obsidian-muted transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingExpense}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300"
                >
                  {savingExpense ? 'Guardando...' : editingExpense ? 'Guardar Cambios' : 'Registrar Gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
