import React from 'react';
import {
  Wallet, Plus, Repeat, Edit3, Trash2, Server, RefreshCw,
  Receipt, CreditCard, Calendar, Mail, History, CheckCircle2
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
            <button
              type="button"
              onClick={openNewIncomeModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold"
            >
              <Plus size={13} aria-hidden="true" />
              <span>Registrar Primer Pago de Cliente</span>
            </button>
          </div>
        )}
      </div>

      {/* MÓDULO 2: MONITOR DE VENCIMIENTOS (DOMINIOS Y HOSTING DE CLIENTES) */}
      <div className="p-4 sm:p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-obsidian-border/70">
          <div className="flex items-center gap-2 min-w-0">
            <Server size={16} className="text-cyan-400 shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white tracking-tight truncate">
              Monitor de Vencimientos: Dominios y Hosting ({filteredRenewals.length})
            </h3>
            <InfoTooltip content="Controla cuándo vence el dominio o alojamiento de cada página web creada, cuánto cuesta renovarlo y si el pago corre por tu cuenta o por cuenta del cliente." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-obsidian-muted">
              Por mi cuenta: <strong className="text-rose-300">${formatAmount(realProfit.myRenewalsYearlyMXN)} {baseCurrency}/año</strong>
            </span>
            <span className="text-obsidian-muted">•</span>
            <span className="text-[11px] font-mono text-obsidian-muted">
              Paga el cliente: <strong className="text-emerald-300">${formatAmount(realProfit.clientRenewalsYearlyMXN)} {baseCurrency}/año</strong>
            </span>
            <button
              type="button"
              onClick={openNewRenewalModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-all shrink-0"
            >
              <Plus size={13} aria-hidden="true" />
              <span>Agregar Dominio / Hosting</span>
            </button>
          </div>
        </div>

        {filteredRenewals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredRenewals.map((ren) => {
              const srvMeta = RENEWAL_SERVICE_TYPES.find((s) => s.value === ren.service_type) || RENEWAL_SERVICE_TYPES[0];
              const isUrgent = ren.expiry_semaphore === 'urgente' || ren.expiry_semaphore === 'vencido';
              const isSoon = ren.expiry_semaphore === 'proximo';
              const paidByMe = ren.paid_by === 'me';

              const daysText =
                ren.days_remaining < 0
                  ? `Venció hace ${Math.abs(ren.days_remaining)} día(s)`
                  : ren.days_remaining === 0
                  ? 'Vence HOY'
                  : `Vence en ${ren.days_remaining} día(s)`;

              return (
                <div
                  key={ren.id}
                  className={`p-4 rounded-xl border transition-all space-y-2.5 min-w-0 flex flex-col justify-between ${
                    isUrgent
                      ? 'bg-rose-500/5 border-rose-500/30'
                      : isSoon
                      ? 'bg-amber-500/5 border-amber-500/30'
                      : 'bg-obsidian-surface/60 border-obsidian-border hover:border-obsidian-borderLight'
                  }`}
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-white text-xs block truncate" title={ren.domain_or_service}>
                          {ren.domain_or_service}
                        </span>
                        <span className="text-[11px] text-obsidian-muted block truncate" title={ren.client_name}>
                          Cliente: <strong className="text-white/80">{ren.client_name}</strong>
                          {ren.provider ? ` • ${ren.provider}` : ''}
                        </span>
                      </div>
                      <div className="text-right font-mono shrink-0">
                        <span className="text-xs font-bold text-white block">
                          ${formatAmount(ren.renewal_cost)} {ren.currency}
                        </span>
                        <span className="text-[10px] text-obsidian-muted block">
                          {ren.billing_cycle === 'monthly' ? 'Mensual' : 'Anual'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-obsidian-panel border border-obsidian-border text-obsidian-text">
                        {srvMeta.label}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          paidByMe
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        }`}
                      >
                        {paidByMe ? 'Pago por mi cuenta' : 'Pago por cuenta del cliente'}
                      </span>
                      {ren.client_charge_amount && ren.client_charge_amount > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                          Cobro al cliente: ${formatAmount(ren.client_charge_amount)}
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                          isUrgent
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : isSoon
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                        }`}
                      >
                        {daysText}
                      </span>
                      {ren.scope && ren.scope !== 'business' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20 capitalize">
                          {ren.scope === 'personal' ? 'Personal' : 'Compartido'}
                        </span>
                      )}
                    </div>

                    {ren.notes && (
                      <p className="text-[11px] text-obsidian-muted line-clamp-2 break-words" title={ren.notes}>
                        {ren.notes}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-obsidian-border/50 flex flex-wrap items-center justify-between gap-2 text-[10px] text-obsidian-muted font-mono">
                    <span className="truncate">Fecha: {ren.renewal_date}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenAdvanceRenewalModal(ren)}
                        className="px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[10px] font-sans font-semibold inline-flex items-center gap-1"
                        title="Marcar como renovado y registrar cobro en ingresos si aplica"
                      >
                        <RefreshCw size={10} aria-hidden="true" />
                        <span>Renovar +1 ciclo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditRenewalModal(ren)}
                        className="p-1 text-obsidian-muted hover:text-white rounded hover:bg-obsidian-panel"
                        title="Editar vencimiento"
                        aria-label={`Editar vencimiento ${ren.domain_or_service}`}
                      >
                        <Edit3 size={12} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRenewal(ren)}
                        className="p-1 text-obsidian-muted hover:text-rose-400 rounded hover:bg-obsidian-panel"
                        title="Enviar a la papelera"
                        aria-label={`Eliminar vencimiento ${ren.domain_or_service}`}
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
              No hay dominios ni hostings de clientes registrados en el monitor de vencimientos.
            </p>
            <button
              type="button"
              onClick={openNewRenewalModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-semibold"
            >
              <Plus size={13} aria-hidden="true" />
              <span>Registrar Primer Dominio o Hosting</span>
            </button>
          </div>
        )}
      </div>

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
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-obsidian-muted">
              Total este mes: <strong className="text-purple-300">${formatAmount(isProfitBase ? realProfit.variableMonthExpenseMXN : realProfit.variableMonthExpenseUSD)} {profitCurrencyView}</strong>
            </span>
            <span className="text-obsidian-muted">•</span>
            <span className="text-[11px] font-mono text-obsidian-muted">
              Total del año: <strong className="text-white/80">${formatAmount(isProfitBase ? realProfit.variableYearExpenseMXN : realProfit.variableYearExpenseUSD)} {profitCurrencyView}</strong>
            </span>
            <button
              type="button"
              onClick={openNewExpenseModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition-all shrink-0"
            >
              <Plus size={13} aria-hidden="true" />
              <span>Registrar Gasto Único</span>
            </button>
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
            <button
              type="button"
              onClick={openNewExpenseModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs font-semibold"
            >
              <Plus size={13} aria-hidden="true" />
              <span>Registrar Primer Gasto Único</span>
            </button>
          </div>
        )}
      </div>

      {/* Payment Cards Grid */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-bold text-white tracking-tight">
            Tarjetas y Métodos de Pago ({filteredPaymentMethods.length})
          </h3>
          <InfoTooltip content="Los números de tarjeta, código CVV y notas privadas se guardan encriptados en tu base de datos local." />
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
          <div className="py-10 px-4 rounded-2xl bg-obsidian-panel border border-obsidian-border text-center space-y-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
              <CreditCard size={20} aria-hidden="true" />
            </div>
            <h4 className="text-sm font-semibold text-white">No hay tarjetas registradas</h4>
            <button
              type="button"
              onClick={() => {
                if (!isUnlocked) openUnlockModal();
                else openPaymentModal();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
            >
              <Plus size={14} aria-hidden="true" />
              <span>Registrar Primera Tarjeta</span>
            </button>
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
