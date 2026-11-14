import React from 'react';
import {
  Wallet, Plus, Repeat, Edit3, Trash2, Server, RefreshCw,
  Receipt, CreditCard, Calendar, Mail, History, CheckCircle2, ChevronDown
} from 'lucide-react';
import {
  ClientIncome, DomainRenewal, OneTimeExpense, PaymentMethod,
  PlatformAccount, BillingRecord, IncomeCategory, RenewalServiceType
} from '../../../types';
import { InfoTooltip } from '../../common/InfoTooltip';
import { SecretField } from '../../common/SecretField';
import { PlatformIcon } from '../../common/PlatformIcon';
import { RealProfitSummary } from '../../../lib/financeUtils';
import { SectionType } from '../../../context/VaultContext';

export const INCOME_CATEGORIES: { value: IncomeCategory; label: string; badge: string }[] = [
  { value: 'anticipo', label: 'Anticipo de Proyecto', badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  { value: 'liquidacion', label: 'Liquidación de Página Web', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  { value: 'iguala_mensual', label: 'Iguala Mensual / Mantenimiento', badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  { value: 'dominio_hosting', label: 'Cobro de Dominio / Hosting', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  { value: 'otro', label: 'Otro Ingreso', badge: 'bg-obsidian-surface text-obsidian-text border-obsidian-border' },
];

export const RENEWAL_SERVICE_TYPES: { value: RenewalServiceType; label: string }[] = [
  { value: 'dominio', label: 'Dominio Web' },
  { value: 'hosting', label: 'Hosting / Alojamiento' },
  { value: 'dominio_y_hosting', label: 'Dominio + Hosting' },
  { value: 'ssl_otro', label: 'Certificado SSL / Otro' },
];

interface SubscriptionsListsProps {
  filteredIncomes: ClientIncome[];
  filteredRenewals: DomainRenewal[];
  filteredExpenses: OneTimeExpense[];
  filteredPaymentMethods: PaymentMethod[];
  platforms: PlatformAccount[];
  activeOrTrialPlatforms: PlatformAccount[];
  billingHistory: BillingRecord[];
  realProfit: RealProfitSummary;
  profitCurrencyView: string;
  baseCurrency: string;
  formatAmount: (value: number | string | undefined | null, decimals?: number) => string;
  isUnlocked: boolean;
  openUnlockModal: () => void;
  openPaymentModal: (editPayment?: PaymentMethod) => void;
  openInspector: (type: 'email' | 'platform', id: string) => void;
  setActiveSection: (sec: SectionType) => void;
  openNewIncomeModal: () => void;
  openEditIncomeModal: (inc: ClientIncome) => void;
  handleToggleIncomeStatus: (inc: ClientIncome) => void;
  handleCloneIncome: (inc: ClientIncome) => void;
  handleDeleteIncome: (inc: ClientIncome) => void;
  openNewRenewalModal: () => void;
  openEditRenewalModal: (ren: DomainRenewal) => void;
  handleOpenAdvanceRenewalModal: (ren: DomainRenewal) => void;
  handleDeleteRenewal: (ren: DomainRenewal) => void;
  openNewExpenseModal: () => void;
  openEditExpenseModal: (exp: OneTimeExpense) => void;
  handleDeleteExpense: (exp: OneTimeExpense) => void;
  handleDeletePaymentMethod: (pay: PaymentMethod) => void;
}

export const SubscriptionsLists: React.FC<SubscriptionsListsProps> = ({
  filteredIncomes,
  filteredRenewals,
  filteredExpenses,
  filteredPaymentMethods,
  platforms,
  activeOrTrialPlatforms,
  billingHistory,
  realProfit,
  profitCurrencyView,
  baseCurrency,
  formatAmount,
  isUnlocked,
  openUnlockModal,
  openPaymentModal,
  openInspector,
  setActiveSection,
  openNewIncomeModal,
  openEditIncomeModal,
  handleToggleIncomeStatus,
  handleCloneIncome,
  handleDeleteIncome,
  openNewRenewalModal,
  openEditRenewalModal,
  handleOpenAdvanceRenewalModal,
  handleDeleteRenewal,
  openNewExpenseModal,
  openEditExpenseModal,
  handleDeleteExpense,
  handleDeletePaymentMethod,
}) => {
  const isProfitBase = profitCurrencyView === baseCurrency;

  return (
    <>
      {/* MÓDULO 1: CONTROL DE INGRESOS Y PAGOS RECIBIDOS */}
      <div className="p-4 sm:p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-obsidian-border/70">
          <div className="flex items-center gap-2 min-w-0">
            <Wallet size={16} className="text-emerald-400 shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white tracking-tight truncate">
              Control de Ingresos y Pagos Recibidos ({filteredIncomes.length})
            </h3>
            <InfoTooltip content="Registra los anticipos, liquidaciones de páginas web e igualas mensuales de mantenimiento que te pagan tus clientes para calcular tu ganancia neta real." />
          </div>
          <button
            type="button"
            onClick={openNewIncomeModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all shrink-0"
          >
            <Plus size={13} aria-hidden="true" />
            <span>Registrar Pago</span>
          </button>
        </div>

        {filteredIncomes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredIncomes.map((inc) => {
              const catMeta = INCOME_CATEGORIES.find((c) => c.value === inc.category) || INCOME_CATEGORIES[0];
              const isPaid = inc.status === 'cobrado';
              return (
                <div
                  key={inc.id}
                  className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border hover:border-obsidian-borderLight transition-all space-y-2.5 min-w-0 flex flex-col justify-between"
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-white text-xs block truncate" title={inc.client_name}>
                          {inc.client_name}
                        </span>
                        <span className="text-[11px] text-obsidian-muted block truncate" title={inc.concept}>
                          {inc.concept}
                        </span>
                      </div>
                      <span className={`font-mono text-xs font-bold shrink-0 ${isPaid ? 'text-emerald-400' : 'text-amber-300'}`}>
                        ${formatAmount(inc.amount)} {inc.currency}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${catMeta.badge}`}>
                        {catMeta.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleIncomeStatus(inc)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                          isPaid
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                        }`}
                        title="Clic para cambiar entre Cobrado y Pendiente"
                      >
                        {isPaid ? 'Cobrado' : 'Pendiente por cobrar'}
                      </button>
                      {inc.is_recurring && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                          Mensual
                        </span>
                      )}
                      {inc.scope && inc.scope !== 'business' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20 capitalize">
                          {inc.scope === 'personal' ? 'Personal' : 'Compartido'}
                        </span>
                      )}
                    </div>

                    {inc.notes && (
                      <p className="text-[11px] text-obsidian-muted line-clamp-2 break-words" title={inc.notes}>
                        {inc.notes}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-obsidian-border/50 flex items-center justify-between gap-2 text-[10px] text-obsidian-muted font-mono">
                    <span className="truncate">
                      {inc.received_date} {inc.payment_method_label ? `• ${inc.payment_method_label}` : ''}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {(inc.is_recurring || inc.category === 'iguala_mensual') && (
                        <button
                          type="button"
                          onClick={() => handleCloneIncome(inc)}
                          className="px-2 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[10px] font-sans font-semibold inline-flex items-center gap-1"
                          title="Repetir cobro (+1 mes) al mes siguiente"
                        >
                          <Repeat size={10} aria-hidden="true" />
                          <span>+1 mes</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditIncomeModal(inc)}
                        className="p-1 text-obsidian-muted hover:text-white rounded hover:bg-obsidian-panel"
                        title="Editar pago"
                        aria-label={`Editar pago de ${inc.client_name}`}
                      >
                        <Edit3 size={12} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteIncome(inc)}
                        className="p-1 text-obsidian-muted hover:text-rose-400 rounded hover:bg-obsidian-panel"
                        title="Enviar a la papelera"
                        aria-label={`Eliminar pago de ${inc.client_name}`}
                      >
                        <Trash2 size={12} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 px-4 rounded-xl bg-obsidian-bg/50 border border-obsidian-border text-center space-y-2">
            <p className="text-xs text-obsidian-muted">
              Aún no has registrado pagos recibidos de clientes (anticipos, liquidaciones o igualas mensuales).
            </p>
          </div>
        )}
      </div>

      <section className="space-y-3 rounded-2xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-4" aria-labelledby="renewal-monitor-title">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-obsidian-border/70 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <Server size={16} className="shrink-0 text-cyan-400" aria-hidden="true" />
            <h3 id="renewal-monitor-title" className="truncate text-sm font-bold text-white">
              Servicios y vencimientos ({filteredRenewals.length})
            </h3>
            <InfoTooltip content="Controla servicios contratados y sus próximas fechas de renovación." />
          </div>
          <button
            type="button"
            onClick={openNewRenewalModal}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
          >
            <Plus size={13} aria-hidden="true" />
            <span>Agregar servicio</span>
          </button>
          <details className="group basis-full border-t border-obsidian-border/50 pt-2 text-[11px]">
            <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-2 text-obsidian-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 [&::-webkit-details-marker]:hidden">
              <span>Costos anuales estimados</span>
              <span className="text-[10px]">Opcional</span>
            </summary>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pb-1 font-mono">
              <span className="text-obsidian-muted">
                Por mi cuenta: <strong className="text-rose-300">${formatAmount(realProfit.myRenewalsYearlyMXN)} MXN/año</strong>
              </span>
              <span className="text-obsidian-muted">
                Por cuenta del cliente: <strong className="text-emerald-300">${formatAmount(realProfit.clientRenewalsYearlyMXN)} MXN/año</strong>
              </span>
            </div>
          </details>
        </div>

        {filteredRenewals.length > 0 ? (
          <div className="divide-y divide-obsidian-border/70">
            {filteredRenewals.map((ren) => {
              const serviceLabel = RENEWAL_SERVICE_TYPES.find((service) => service.value === ren.service_type)?.label ?? 'Servicio';
              const isUrgent = ren.expiry_semaphore === 'urgente' || ren.expiry_semaphore === 'vencido';
              const isSoon = ren.expiry_semaphore === 'proximo';
              const paidByMe = ren.paid_by === 'me';
              const daysText = ren.days_remaining < 0
                ? `Venció hace ${Math.abs(ren.days_remaining)} ${Math.abs(ren.days_remaining) === 1 ? 'día' : 'días'}`
                : ren.days_remaining === 0
                ? 'Vence hoy'
                : `Vence en ${ren.days_remaining} ${ren.days_remaining === 1 ? 'día' : 'días'}`;

              return (
                <article key={ren.id} className="min-w-0 py-3 first:pt-1 last:pb-1">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <h4 className="max-w-full truncate text-xs font-semibold text-white" title={ren.domain_or_service}>
                          {ren.domain_or_service}
                        </h4>
                        <span className="text-[10px] text-obsidian-muted">{serviceLabel}</span>
                      </div>
                      <p className="truncate text-[11px] text-obsidian-muted" title={ren.client_name}>
                        {ren.scope === 'personal' ? 'Personal' : ren.client_name}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                        isUrgent ? 'bg-rose-500/15 text-rose-300' : isSoon ? 'bg-amber-500/15 text-amber-300' : 'bg-obsidian-surface text-obsidian-muted'
                      }`}>
                        {daysText}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenAdvanceRenewalModal(ren)}
                        className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-emerald-500/30 px-2 text-[10px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
                        title="Registrar renovación y avanzar la próxima fecha"
                      >
                        <RefreshCw size={11} aria-hidden="true" />
                        <span>Renovar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditRenewalModal(ren)}
                        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg text-obsidian-muted hover:bg-obsidian-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                        title="Editar servicio"
                        aria-label={`Editar servicio ${ren.domain_or_service}`}
                      >
                        <Edit3 size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRenewal(ren)}
                        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg text-obsidian-muted hover:bg-obsidian-surface hover:text-rose-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400"
                        title="Enviar a la papelera"
                        aria-label={`Eliminar servicio ${ren.domain_or_service}`}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <details className="group mt-1.5">
                    <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 text-[10px] text-indigo-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 [&::-webkit-details-marker]:hidden">
                      <span>Ver detalles</span>
                      <ChevronDown size={12} aria-hidden="true" className="transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="grid grid-cols-1 gap-x-5 gap-y-1 border-t border-obsidian-border/50 pt-2 text-[11px] sm:grid-cols-2">
                      <span className="text-obsidian-muted">Proveedor: <strong className="font-medium text-obsidian-text">{ren.provider || 'Sin indicar'}</strong></span>
                      <span className="text-obsidian-muted">Próxima fecha: <strong className="font-mono font-medium text-obsidian-text">{ren.renewal_date}</strong></span>
                      <span className="text-obsidian-muted">Costo: <strong className="font-mono font-medium text-obsidian-text">${formatAmount(ren.renewal_cost)} {ren.currency} · {ren.billing_cycle === 'monthly' ? 'mensual' : 'anual'}</strong></span>
                      <span className="text-obsidian-muted">Pago: <strong className="font-medium text-obsidian-text">{paidByMe ? 'Por mi cuenta' : 'Por cuenta del cliente'}</strong></span>
                      {(ren.client_charge_amount ?? 0) > 0 && (
                        <span className="text-obsidian-muted">Cobro al cliente: <strong className="font-mono font-medium text-obsidian-text">${formatAmount(ren.client_charge_amount)} {ren.currency}</strong></span>
                      )}
                      {ren.scope === 'shared' && <span className="text-obsidian-muted">Ámbito: <strong className="font-medium text-obsidian-text">Compartido</strong></span>}
                      {ren.notes && <p className="break-words text-obsidian-muted sm:col-span-2">{ren.notes}</p>}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="py-5 text-center text-xs text-obsidian-muted">
            Aún no hay servicios con fecha de renovación.
          </p>
        )}
      </section>

      {/* MÓDULO 3: GASTOS ÚNICOS Y COMPRAS VARIABLES (NO RECURRENTES) */}
      <div className="p-4 sm:p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-obsidian-border/70">
          <div className="flex items-center gap-2 min-w-0">
            <Receipt size={16} className="text-purple-400 shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white tracking-tight truncate">
              Gastos Únicos y Compras Variables ({filteredExpenses.length})
            </h3>
            <InfoTooltip content="Registra compras no recurrentes (hardware, laptops, licencias vitalicias, insumos, mobiliario) para deducirlas de tu ganancia neta real sin alterar tus suscripciones mensuales." />
          </div>
          <button
            type="button"
            onClick={openNewExpenseModal}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-purple-500"
          >
            <Plus size={13} aria-hidden="true" />
            <span>Registrar gasto</span>
          </button>
          <div className="flex basis-full flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-obsidian-muted">
              Total este mes: <strong className="text-purple-300">${formatAmount(isProfitBase ? realProfit.variableMonthExpenseMXN : realProfit.variableMonthExpenseUSD)} {profitCurrencyView}</strong>
            </span>
            <span className="text-obsidian-muted">•</span>
            <span className="text-[11px] font-mono text-obsidian-muted">
              Total del año: <strong className="text-white/80">${formatAmount(isProfitBase ? realProfit.variableYearExpenseMXN : realProfit.variableYearExpenseUSD)} {profitCurrencyView}</strong>
            </span>
          </div>
        </div>

        {filteredExpenses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredExpenses.map((exp) => (
              <div
                key={exp.id}
                className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border hover:border-obsidian-borderLight transition-all space-y-2.5 min-w-0 flex flex-col justify-between"
              >
                <div className="space-y-2 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-bold text-white text-xs block truncate" title={exp.concept}>
                        {exp.concept}
                      </span>
                      <span className="text-[11px] text-obsidian-muted block truncate">
                        {exp.category}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold text-purple-300 shrink-0">
                      ${formatAmount(exp.amount)} {exp.currency}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-300 border border-purple-500/25">
                      {exp.category}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-obsidian-panel border border-obsidian-border text-obsidian-text capitalize">
                      {exp.scope === 'business' ? 'Empresa' : exp.scope === 'personal' ? 'Personal' : 'Compartido'}
                    </span>
                  </div>

                  {exp.notes && (
                    <p className="text-[11px] text-obsidian-muted line-clamp-2 break-words" title={exp.notes}>
                      {exp.notes}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-obsidian-border/50 flex items-center justify-between gap-2 text-[10px] text-obsidian-muted font-mono">
                  <span className="truncate">
                    {exp.expense_date} {exp.payment_method_label ? `• ${exp.payment_method_label}` : ''}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditExpenseModal(exp)}
                      className="p-1 text-obsidian-muted hover:text-white rounded hover:bg-obsidian-panel"
                      title="Editar gasto único"
                      aria-label={`Editar gasto ${exp.concept}`}
                    >
                      <Edit3 size={12} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteExpense(exp)}
                      className="p-1 text-obsidian-muted hover:text-rose-400 rounded hover:bg-obsidian-panel"
                      title="Enviar a la papelera"
                      aria-label={`Eliminar gasto ${exp.concept}`}
                    >
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 px-4 rounded-xl bg-obsidian-bg/50 border border-obsidian-border text-center space-y-2">
            <p className="text-xs text-obsidian-muted">
              No hay compras ni gastos únicos variables registrados (hardware, licencias vitalicias, insumos, etc.).
            </p>
          </div>
        )}
      </div>

      {/* Payment Cards Grid */}
      <div className="p-4 sm:p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-obsidian-border/70">
          <div className="flex items-center gap-2 min-w-0">
            <CreditCard size={16} className="text-cyan-400 shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white tracking-tight">Tarjetas y métodos de pago ({filteredPaymentMethods.length})</h3>
            <InfoTooltip content="Los números de tarjeta, código CVV y notas privadas se guardan encriptados en tu base de datos local." />
          </div>
          <button type="button" onClick={() => { if (!isUnlocked) openUnlockModal(); else openPaymentModal(); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold">
            <Plus size={13} aria-hidden="true" /> Agregar tarjeta
          </button>
        </div>

        {filteredPaymentMethods.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredPaymentMethods.map((pay) => {
              const linked = platforms.filter((p) => p.payment_method_id === pay.id);

              return (
                <div
                  key={pay.id}
                  className="p-5 rounded-2xl bg-gradient-to-br from-obsidian-panel to-obsidian-card border border-obsidian-border hover:border-obsidian-borderLight transition-all space-y-4 shadow-xl min-w-0 overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-bold text-white text-sm block truncate" title={pay.alias}>{pay.alias}</span>
                      <span className="text-[11px] text-obsidian-muted truncate block">{pay.issuer}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <div className="px-2.5 py-1 rounded-xl bg-obsidian-surface border border-obsidian-border text-white font-mono text-xs font-bold">
                        *{pay.last_four}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isUnlocked) openUnlockModal();
                          else openPaymentModal(pay);
                        }}
                        title="Editar tarjeta"
                        aria-label={`Editar tarjeta ${pay.alias}`}
                        className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface transition-colors"
                      >
                        <Edit3 size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePaymentMethod(pay)}
                        title="Enviar tarjeta a la papelera"
                        aria-label={`Eliminar tarjeta ${pay.alias}`}
                        className="p-1.5 text-obsidian-muted hover:text-rose-400 rounded-lg hover:bg-obsidian-surface transition-colors"
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-obsidian-surface/60 border border-obsidian-border text-xs space-y-2">
                    <div>
                      <div className="text-obsidian-muted text-[10px]">Número de Tarjeta / Cuenta</div>
                      <SecretField
                        value={pay.card_number_plain}
                        masked={pay.card_number_masked}
                        label={`Tarjeta ${pay.alias}`}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-obsidian-muted font-mono pt-1 border-t border-obsidian-border/50">
                      <span>
                        {pay.expiry_month && pay.expiry_year ? `Vence: ${pay.expiry_month}/${pay.expiry_year}` : 'Sin fecha de vencimiento'}
                      </span>
                    </div>
                  </div>

                  {pay.billing_notes && (
                    <p className="text-[11px] text-obsidian-muted line-clamp-2 break-words" title={pay.billing_notes}>
                      {pay.billing_notes}
                    </p>
                  )}

                  {/* Subscriptions tied to this card */}
                  <div>
                    <span className="text-[10px] text-obsidian-muted font-semibold uppercase tracking-wider block mb-1.5">
                      Suscripciones con esta tarjeta ({linked.length})
                    </span>
                    <div className="space-y-1">
                      {linked.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openInspector('platform', item.id)}
                          className="w-full text-left flex items-center justify-between gap-2 p-2 rounded-lg bg-obsidian-bg hover:bg-obsidian-surface border border-obsidian-border text-xs cursor-pointer transition-colors min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <PlatformIcon name={item.name} iconUrl={item.icon_url} size="sm" />
                            <div className="min-w-0">
                              <span className="text-white font-medium truncate block" title={item.name}>{item.name}</span>
                              {item.email_address && (
                                <span className="text-[10px] text-obsidian-muted font-mono truncate block" title={item.email_address}>
                                  {item.email_address}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="font-mono text-emerald-400 font-semibold flex-shrink-0">
                            ${item.subscription_cost} {item.currency}
                          </span>
                        </button>
                      ))}
                      {linked.length === 0 && (
                        <div className="text-[11px] text-obsidian-muted italic">
                          Sin suscripciones vinculadas.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 px-4 rounded-xl bg-obsidian-bg/50 border border-obsidian-border text-center">
            <p className="text-xs text-obsidian-muted">No hay tarjetas registradas.</p>
          </div>
        )}
      </div>

      {/* Next Renewals Timeline & Trial Alerts with Direct Principal Email Link */}
      <div className="space-y-4 pt-4 border-t border-obsidian-border">
        <div className="flex items-center gap-2">
          <Calendar className="text-cyan-400 w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <h3 className="text-sm font-bold text-white tracking-tight truncate">
            Calendario de Suscripciones y Pruebas Gratis ({activeOrTrialPlatforms.length})
          </h3>
          <InfoTooltip content="Cuando llega la fecha de cobro de una suscripción activa, el sistema actualiza automáticamente la fecha al siguiente mes o año." />
        </div>

        {activeOrTrialPlatforms.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {activeOrTrialPlatforms.map((p) => {
              const isTrial = p.subscription_status === 'free_trial';
              return (
                <div
                  key={p.id}
                  className="p-4 rounded-xl bg-obsidian-surface/60 hover:bg-obsidian-surface border border-obsidian-border hover:border-cyan-500/30 transition-all space-y-2.5 group min-w-0"
                >
                  <button
                    type="button"
                    onClick={() => openInspector('platform', p.id)}
                    className="w-full text-left flex items-center justify-between gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlatformIcon name={p.name} iconUrl={p.icon_url} size="sm" />
                      <div className="min-w-0">
                        <span className="font-semibold text-white text-xs block group-hover:text-cyan-300 transition-colors truncate" title={p.name}>
                          {p.name}
                        </span>
                        <span className="text-[10px] text-obsidian-muted capitalize block truncate">
                          Cobro: {p.billing_cycle === 'yearly' ? 'Anual' : p.billing_cycle === 'weekly' ? 'Semanal' : 'Mensual'}
                        </span>
                      </div>
                    </div>

                    <span className="font-mono text-xs font-bold text-emerald-400 flex-shrink-0">
                      ${p.subscription_cost} {p.currency}
                    </span>
                  </button>

                  {p.email_address && (
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (p.email_id) openInspector('email', p.email_id);
                        }}
                        title={`Ver correo principal: ${p.email_address}`}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-obsidian-panel hover:bg-indigo-500/15 border border-obsidian-border hover:border-indigo-500/30 text-[10px] font-mono text-obsidian-muted hover:text-indigo-300 transition-colors max-w-full min-w-0"
                      >
                        <Mail size={10} className="text-indigo-400 flex-shrink-0" aria-hidden="true" />
                        <span className="truncate">{p.email_address}</span>
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 text-[11px] pt-1 border-t border-obsidian-border/40">
                    <span className="text-obsidian-muted flex items-center gap-1 font-mono truncate">
                      <Calendar className="w-3 h-3 text-white/40 flex-shrink-0" aria-hidden="true" />
                      <span className="truncate">{p.next_billing_date ? `Próximo cobro: ${p.next_billing_date}` : 'Sin fecha'}</span>
                    </span>

                    {isTrial ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 flex-shrink-0">
                        Prueba Gratis
                      </span>
                    ) : (
                      <span className="text-white/40 text-[10px] truncate max-w-[120px]" title={p.payment_alias || 'Sin tarjeta'}>
                        {p.payment_alias || 'Sin tarjeta'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-10 px-4 rounded-2xl bg-obsidian-panel border border-obsidian-border text-center text-xs text-obsidian-muted">
            No hay suscripciones activas ni pruebas gratuitas registradas.
          </div>
        )}
      </div>

      {/* Historial de Cobros de Suscripciones */}
      {billingHistory.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-obsidian-border">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <History size={15} className="text-emerald-400 shrink-0" aria-hidden="true" />
              <h3 className="text-sm font-bold text-white tracking-tight truncate">
                Historial de Cobros Automáticos ({billingHistory.length})
              </h3>
              <InfoTooltip content="Registro de suscripciones que cumplieron su fecha de pago y avanzaron al siguiente periodo." />
            </div>
            <button
              type="button"
              onClick={() => setActiveSection('audit_logs')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              Ver Historial de Actividad
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {billingHistory.slice(0, 6).map((rec) => (
              <button
                key={rec.id}
                type="button"
                onClick={() => openInspector('platform', rec.platform_id)}
                className="w-full text-left p-3 rounded-xl bg-obsidian-panel border border-obsidian-border hover:border-emerald-500/30 transition-all cursor-pointer flex items-center justify-between gap-2 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <CheckCircle2 size={12} className="text-emerald-400 shrink-0" aria-hidden="true" />
                    <span className="font-bold text-white text-xs truncate">{rec.platform_name}</span>
                  </div>
                  <div className="text-[10px] text-obsidian-muted font-mono truncate mt-0.5">
                    Fecha: {rec.charged_date || rec.billing_date} • Ciclo: {rec.billing_cycle}
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-emerald-400 shrink-0">
                  ${rec.amount} {rec.currency}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
