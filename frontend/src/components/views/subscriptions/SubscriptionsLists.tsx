import React from 'react';
import {
  Wallet, Plus, Repeat, Edit3, Trash2, Server, RefreshCw,
  Receipt, CreditCard, Calendar, History, CheckCircle2, ChevronDown
} from 'lucide-react';
import {
  ClientIncome, DomainRenewal, OneTimeExpense, PaymentMethod,
  PlatformAccount, BillingRecord, IncomeCategory, RenewalServiceType
} from '../../../types';
import { InfoTooltip } from '../../common/InfoTooltip';
import { SecretField } from '../../common/SecretField';
import { PlatformIcon } from '../../common/PlatformIcon';
import { RealProfitSummary } from '../../../lib/financeUtils';
import type { ForecastEvent } from '../../../lib/cashflowForecast';
import { SectionType } from '../../../context/VaultContext';

export const INCOME_CATEGORIES: { value: IncomeCategory; label: string; badge: string }[] = [
  { value: 'anticipo', label: 'Anticipo de Proyecto', badge: 'bg-obsidian-surface text-obsidian-muted border-obsidian-border' },
  { value: 'liquidacion', label: 'Liquidación de Página Web', badge: 'bg-obsidian-surface text-obsidian-muted border-obsidian-border' },
  { value: 'iguala_mensual', label: 'Iguala Mensual / Mantenimiento', badge: 'bg-obsidian-surface text-obsidian-muted border-obsidian-border' },
  { value: 'dominio_hosting', label: 'Cobro de Dominio / Hosting', badge: 'bg-obsidian-surface text-obsidian-muted border-obsidian-border' },
  { value: 'otro', label: 'Otro Ingreso', badge: 'bg-obsidian-surface text-obsidian-text border-obsidian-border' },
];

export const RENEWAL_SERVICE_TYPES: { value: RenewalServiceType; label: string }[] = [
  { value: 'dominio', label: 'Dominio Web' },
  { value: 'hosting', label: 'Hosting / Alojamiento' },
  { value: 'dominio_y_hosting', label: 'Dominio + Hosting' },
  { value: 'ssl_otro', label: 'Certificado SSL / Otro' },
];

interface SubscriptionsListsProps {
  mode: 'all' | 'income' | 'services' | 'expenses' | 'cards';
  filteredIncomes: ClientIncome[];
  filteredRenewals: DomainRenewal[];
  filteredExpenses: OneTimeExpense[];
  filteredPaymentMethods: PaymentMethod[];
  platforms: PlatformAccount[];
  upcomingCashflowEvents: ForecastEvent[];
  billingHistory: BillingRecord[];
  realProfit: RealProfitSummary;
  profitCurrencyView: string;
  usdRate: number;
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
  mode,
  filteredIncomes,
  filteredRenewals,
  filteredExpenses,
  filteredPaymentMethods,
  platforms,
  upcomingCashflowEvents,
  billingHistory,
  realProfit,
  profitCurrencyView,
  usdRate,
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
  const isProfitBase = profitCurrencyView === 'MXN';
  const canConvertCurrency = Number.isFinite(usdRate) && usdRate > 0;
  const canShowRenewalTotals = canConvertCurrency
    || (isProfitBase && !filteredRenewals.some((renewal) => renewal.currency === 'USD' && Number(renewal.renewal_cost) !== 0));
  const canShowExpenseTotals = canConvertCurrency
    || (isProfitBase && !filteredExpenses.some((expense) => expense.currency === 'USD' && Number(expense.amount) !== 0));

  const showIncome = mode === 'all' || mode === 'income';
  const showServices = mode === 'all' || mode === 'services';
  const showExpenses = mode === 'all' || mode === 'expenses';
  const showCards = mode === 'all' || mode === 'cards';

  return (
    <>
      {/* MÓDULO 1: CONTROL DE INGRESOS Y PAGOS RECIBIDOS */}
      {showIncome && (
      <div className="p-3 sm:p-4 rounded-xl bg-obsidian-panel border border-obsidian-border space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-obsidian-border/70">
          <div className="flex items-center gap-2 min-w-0">
            <Wallet size={18} className="text-obsidian-muted shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white tracking-tight truncate">
              Control de Ingresos y Pagos Recibidos ({filteredIncomes.length})
            </h3>
            <InfoTooltip content="Registra los anticipos, liquidaciones de páginas web e igualas mensuales de mantenimiento que te pagan tus clientes para calcular tu ganancia neta real." />
          </div>
          <button
            type="button"
            onClick={openNewIncomeModal}
            className="ui-action-primary shrink-0"
          >{/* [Acción principal] Inicia o confirma la tarea de este espacio. */}
            <Plus size={16} aria-hidden="true" />
            <span>Registrar Pago</span>
          </button>
        </div>

        {filteredIncomes.length > 0 ? (
          <div className="divide-y divide-obsidian-border">
            {filteredIncomes.map((inc) => {
              const catMeta = INCOME_CATEGORIES.find((c) => c.value === inc.category) || INCOME_CATEGORIES[0];
              const isPaid = inc.status === 'cobrado';
              return (
                <div
                  key={inc.id}
                  className="min-w-0 py-3 first:pt-1 last:pb-1 space-y-3"
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

                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${catMeta.badge}`}>
                        {catMeta.label}
                      </span>
                      {/* [Estado seleccionable] El color y la etiqueta muestran el estado actual del pago; pulsar lo cambia. */}
                      <button
                        type="button"
                        onClick={() => handleToggleIncomeStatus(inc)}
                        aria-pressed={isPaid}
                        className="ui-action-toggle"
                        title="Cambiar estado del pago"
                        aria-label={`Pago ${isPaid ? 'cobrado' : 'pendiente por cobrar'} de ${inc.client_name}. Cambiar estado`}
                      >
                        {isPaid ? 'Cobrado' : 'Pendiente por cobrar'}
                        <RefreshCw size={16} aria-hidden="true" />
                      </button>
                      {inc.is_recurring && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-obsidian-surface text-obsidian-muted border border-obsidian-border">
                          Mensual
                        </span>
                      )}
                      {inc.scope && inc.scope !== 'business' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-obsidian-surface text-obsidian-muted border border-obsidian-border capitalize">
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
                          className="ui-action-secondary items-center gap-1"
                          title="Repetir cobro (+1 mes) al mes siguiente"
                        >{/* [Acción secundaria] Mantiene disponible esta acción en su contexto. */}
                          <Repeat size={16} aria-hidden="true" />
                          <span>+1 mes</span>
                        </button>
                      )}
                      {/* [Acción secundaria] Edita un pago existente. */}
                      <button
                        type="button"
                        onClick={() => openEditIncomeModal(inc)}
                        className="ui-action-icon"
                        title="Editar pago"
                        aria-label={`Editar pago de ${inc.client_name}`}
                      >
                        <Edit3 size={16} aria-hidden="true" />
                      </button>
                      {/* [Acción destructiva] Envía el pago a la papelera. */}
                      <button
                        type="button"
                        onClick={() => handleDeleteIncome(inc)}
                        className="ui-action-icon ui-action-danger"
                        title="Enviar a la papelera"
                        aria-label={`Eliminar pago de ${inc.client_name}`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center space-y-2 text-xs text-obsidian-muted">
            <p className="text-xs text-obsidian-muted">
              Aún no has registrado pagos recibidos de clientes (anticipos, liquidaciones o igualas mensuales).
            </p>
          </div>
        )}
      </div>
      )}

      {showServices && <>
      <section className="space-y-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-4" aria-labelledby="renewal-monitor-title">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-obsidian-border/70 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <Server size={18} className="shrink-0 text-obsidian-muted" aria-hidden="true" />
            <h3 id="renewal-monitor-title" className="truncate text-sm font-bold text-white">
              Servicios y vencimientos ({filteredRenewals.length})
            </h3>
            <InfoTooltip content="Controla servicios contratados y sus próximas fechas de renovación." />
          </div>
          <button
            type="button"
            onClick={openNewRenewalModal}
            className="ui-action-primary"
          >{/* [Acción principal] Inicia o confirma la tarea de este espacio. */}
            <Plus size={16} aria-hidden="true" />
            <span>Agregar servicio</span>
          </button>
          <details className="group basis-full border-t border-obsidian-border/50 pt-2 text-[11px]">
            {/* [Menú y selector] Despliega la estimación anual de costos. */}
            <summary data-caret="manual" className="ui-nav-action w-full cursor-pointer list-none text-[11px] [&::-webkit-details-marker]:hidden">
              <span>Costos anuales estimados</span>
              <span className="text-[10px]">Opcional</span>
              <ChevronDown size={16} className="ml-auto shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pb-1 font-mono">
              <span className="text-obsidian-muted">
                Por mi cuenta: <strong className="text-obsidian-text">{!canShowRenewalTotals ? 'Sin tipo de cambio' : `$${formatAmount(profitCurrencyView === 'USD' ? realProfit.myRenewalsYearlyMXN / usdRate : realProfit.myRenewalsYearlyMXN)} ${profitCurrencyView}/año`}</strong>
              </span>
              <span className="text-obsidian-muted">
                Por cuenta del cliente: <strong className="text-obsidian-text">{!canShowRenewalTotals ? 'Sin tipo de cambio' : `$${formatAmount(profitCurrencyView === 'USD' ? realProfit.clientRenewalsYearlyMXN / usdRate : realProfit.clientRenewalsYearlyMXN)} ${profitCurrencyView}/año`}</strong>
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
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                        isUrgent ? 'bg-rose-500/15 text-rose-300' : isSoon ? 'bg-amber-500/15 text-amber-300' : 'bg-obsidian-surface text-obsidian-muted'
                      }`}>
                        {daysText}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenAdvanceRenewalModal(ren)}
                        className="ui-action-secondary items-center gap-1"
                        title="Registrar renovación y avanzar la próxima fecha"
                      >{/* [Acción secundaria] Mantiene disponible esta acción en su contexto. */}
                        <RefreshCw size={16} aria-hidden="true" />
                        <span>Renovar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditRenewalModal(ren)}
                        className="ui-action-icon"
                        title="Editar servicio"
                        aria-label={`Editar servicio ${ren.domain_or_service}`}
                      >{/* [Icono] Acción identificada por su nombre accesible. */}
                        <Edit3 size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRenewal(ren)}
                        className="ui-action-icon ui-action-danger"
                        title="Enviar a la papelera"
                        aria-label={`Eliminar servicio ${ren.domain_or_service}`}
                      >{/* [Acción destructiva] Envía el elemento a la papelera. */}
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <details className="group mt-1.5">
                    {/* [Acción secundaria] Expande los detalles del servicio. */}
                    <summary data-caret="manual" className="ui-nav-action w-full cursor-pointer list-none text-xs [&::-webkit-details-marker]:hidden">
                      <span>Ver detalles</span>
                      <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" />
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
      </>}

      {/* MÓDULO 3: GASTOS PUNTUALES Y RECURRENTES */}
      {showExpenses && (
      <div className="p-3 sm:p-4 rounded-xl bg-obsidian-panel border border-obsidian-border space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-obsidian-border/70">
          <div className="flex items-center gap-2 min-w-0">
            <Receipt size={18} className="text-obsidian-muted shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white tracking-tight truncate">
              Gastos y cargos ({filteredExpenses.length})
            </h3>
            <InfoTooltip content="Registra compras puntuales o cargos recurrentes personales y de negocio. Los recurrentes se proyectan en el calendario y en los resúmenes financieros." />
          </div>
          <button
            type="button"
            onClick={openNewExpenseModal}
            className="ui-action-primary shrink-0"
          >{/* [Acción principal] Inicia o confirma la tarea de este espacio. */}
            <Plus size={16} aria-hidden="true" />
              <span>Registrar gasto</span>
          </button>
          <div className="flex basis-full flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-obsidian-muted">
              Este mes (puntuales + recurrentes): <strong className="text-white">{!canShowExpenseTotals ? 'Sin tipo de cambio' : `$${formatAmount(isProfitBase ? realProfit.variableMonthExpenseMXN : realProfit.variableMonthExpenseUSD)} ${profitCurrencyView}`}</strong>
            </span>
            <span className="text-obsidian-muted">•</span>
            <span className="text-[11px] font-mono text-obsidian-muted">
              Estimado del año: <strong className="text-white/80">{!canShowExpenseTotals ? 'Sin tipo de cambio' : `$${formatAmount(isProfitBase ? realProfit.variableYearExpenseMXN : realProfit.variableYearExpenseUSD)} ${profitCurrencyView}`}</strong>
            </span>
          </div>
        </div>

        {filteredExpenses.length > 0 ? (
          <div className="divide-y divide-obsidian-border">
            {filteredExpenses.map((exp) => (
              <div
                key={exp.id}
                className="min-w-0 py-3 first:pt-1 last:pb-1 space-y-3"
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
                    <span className="font-mono text-xs font-bold text-white shrink-0">
                      ${formatAmount(exp.amount)} {exp.currency}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-obsidian-surface text-obsidian-muted border border-obsidian-border">
                      {exp.category}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-obsidian-panel border border-obsidian-border text-obsidian-text capitalize">
                      {exp.scope === 'business' ? 'Empresa' : exp.scope === 'personal' ? 'Personal' : 'Compartido'}
                    </span>
                    {exp.recurrence_cycle && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-obsidian-panel border border-obsidian-border text-obsidian-muted">
                        {exp.recurrence_cycle === 'weekly' ? 'Semanal' : exp.recurrence_cycle === 'quarterly' ? 'Trimestral' : exp.recurrence_cycle === 'yearly' ? 'Anual' : 'Mensual'}
                      </span>
                    )}
                    {exp.platform_id && (() => {
                      const service = platforms.find((platform) => platform.id === exp.platform_id);
                      return service ? (
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-obsidian-muted" title={`Servicio: ${service.name}`}>
                          <PlatformIcon name={service.name} iconUrl={service.icon_url} size="sm" />
                          <span className="max-w-40 truncate">{service.name}</span>
                        </span>
                      ) : null;
                    })()}
                  </div>

                  {exp.notes && (
                    <p className="text-[11px] text-obsidian-muted line-clamp-2 break-words" title={exp.notes}>
                      {exp.notes}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-obsidian-border/50 flex items-center justify-between gap-2 text-[10px] text-obsidian-muted font-mono">
                  <span className="truncate">
                    {exp.recurrence_cycle ? `Desde ${exp.expense_date}` : exp.expense_date} {exp.payment_method_label ? `• ${exp.payment_method_label}` : ''}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditExpenseModal(exp)}
                      className="ui-action-icon"
                      title="Editar gasto único"
                      aria-label={`Editar gasto ${exp.concept}`}
                    >{/* [Icono] Acción identificada por su nombre accesible. */}
                      <Edit3 size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteExpense(exp)}
                      className="ui-action-icon ui-action-danger"
                      title="Enviar a la papelera"
                      aria-label={`Eliminar gasto ${exp.concept}`}
                    >{/* [Acción destructiva] Envía el elemento a la papelera. */}
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center space-y-2 text-xs text-obsidian-muted">
            <p className="text-xs text-obsidian-muted">
              No hay gastos registrados para este ámbito.
            </p>
          </div>
        )}
      </div>
      )}

      {/* Payment Cards Grid */}
      {showCards && (
      <div className="p-3 sm:p-4 rounded-xl bg-obsidian-panel border border-obsidian-border space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-obsidian-border/70">
          <div className="flex items-center gap-2 min-w-0">
            <CreditCard size={18} className="text-obsidian-muted shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white tracking-tight">Tarjetas y métodos de pago ({filteredPaymentMethods.length})</h3>
            <InfoTooltip content="Los números de tarjeta, código CVV y notas privadas se guardan encriptados en tu base de datos local." />
          </div>
          <button type="button" onClick={() => { if (!isUnlocked) openUnlockModal(); else openPaymentModal(); }} className="ui-action-primary">{/* [Acción principal] Inicia o confirma la tarea de este espacio. */}
            <Plus size={16} aria-hidden="true" /> Agregar tarjeta
          </button>
        </div>

        {filteredPaymentMethods.length > 0 ? (
          <div className="divide-y divide-obsidian-border">
            {filteredPaymentMethods.map((pay) => {
              const linked = platforms.filter((p) => p.payment_method_id === pay.id);
              const linkedExpenses = filteredExpenses.filter((expense) => expense.payment_method_id === pay.id);

              return (
                <div
                  key={pay.id}
                  className="min-w-0 space-y-3 py-4 first:pt-1 last:pb-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-bold text-white text-sm block truncate" title={pay.alias}>{pay.alias}</span>
                      <span className="text-[11px] text-obsidian-muted truncate block">{pay.issuer}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <div className="px-3 py-1 rounded-md border border-obsidian-border text-white font-mono text-xs font-bold">
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
                        className="ui-action-icon"
                      >{/* [Icono] Acción identificada por su nombre accesible. */}
                        <Edit3 size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePaymentMethod(pay)}
                        title="Enviar tarjeta a la papelera"
                        aria-label={`Eliminar tarjeta ${pay.alias}`}
                        className="ui-action-icon ui-action-danger"
                      >{/* [Acción destructiva] Envía el elemento a la papelera. */}
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-obsidian-border pt-2 text-xs space-y-2">
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
                        className="ui-nav-action w-full items-center justify-between gap-2 py-2 min-w-0"
                        >{/* [Navegación] Mantiene disponible esta acción en su contexto. */}
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
                          <span className="font-mono text-obsidian-text font-semibold flex-shrink-0">
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

                  <div className="mt-3 border-t border-obsidian-border pt-3">
                    <span className="text-[10px] text-obsidian-muted font-semibold block mb-1.5">
                      Gastos con esta tarjeta ({linkedExpenses.length})
                    </span>
                    <div className="divide-y divide-obsidian-border">
                      {linkedExpenses.map((expense) => {
                        const service = platforms.find((platform) => platform.id === expense.platform_id);
                        return (
                          <div key={expense.id} className="flex min-w-0 items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                            <div className="flex min-w-0 items-center gap-2">
                              {service
                                ? <PlatformIcon name={service.name} iconUrl={service.icon_url} size="sm" />
                                : <Receipt size={16} className="shrink-0 text-obsidian-muted" aria-hidden="true" />}
                              <div className="min-w-0">
                                <span className="block truncate text-xs text-obsidian-text" title={expense.concept}>{expense.concept}</span>
                                <span className="block truncate text-[10px] text-obsidian-muted">
                                  {service ? service.name : expense.category} · {expense.recurrence_cycle === 'weekly' ? 'semanal' : expense.recurrence_cycle === 'quarterly' ? 'trimestral' : expense.recurrence_cycle === 'monthly' ? 'mensual' : expense.recurrence_cycle === 'yearly' ? 'anual' : 'puntual'}
                                </span>
                              </div>
                            </div>
                            <span className="shrink-0 font-mono text-xs text-obsidian-text">
                              ${formatAmount(expense.amount)} {expense.currency}
                            </span>
                          </div>
                        );
                      })}
                      {linkedExpenses.length === 0 && (
                        <span className="text-[11px] text-obsidian-muted">Sin gastos vinculados.</span>
                      )}
                    </div>
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-obsidian-muted">
            <p className="text-xs text-obsidian-muted">No hay tarjetas registradas.</p>
          </div>
        )}
      </div>
      )}

      {/* Próximos cargos recurrentes y compras programadas */}
      {showServices && <>
      <div className="space-y-4 pt-4 border-t border-obsidian-border">
        <div className="flex items-center gap-2">
          <Calendar className="text-obsidian-muted w-[18px] h-[18px] flex-shrink-0" aria-hidden="true" />
          <h3 className="text-sm font-bold text-white tracking-tight truncate">
            Calendario de servicios y gastos · 90 días ({upcomingCashflowEvents.length})
          </h3>
          <InfoTooltip content="Proyecta suscripciones activas, pruebas con fecha de fin y gastos recurrentes o puntuales. Los cargos de dominio y hosting se muestran en el monitor de renovaciones." />
        </div>

        {upcomingCashflowEvents.length > 0 ? (
          <div className="divide-y divide-obsidian-border">
            {upcomingCashflowEvents.map((event) => {
              const service = event.platformId ? platforms.find((platform) => platform.id === event.platformId) : undefined;
              const paymentMethod = event.paymentMethodId ? filteredPaymentMethods.find((payment) => payment.id === event.paymentMethodId) : undefined;
              const displayAmount = isProfitBase ? event.amountMXN : usdRate > 0 ? event.amountMXN / usdRate : null;
              const eventLabel = event.kind === 'subscription' ? 'Servicio' : 'Gasto';
              const expense = event.kind === 'expense' ? filteredExpenses.find((item) => item.id === event.sourceId) : undefined;
              const recurring = event.kind === 'subscription' || Boolean(expense?.recurrence_cycle);
              return (
                <div
                  key={event.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {service ? (
                      <button
                        type="button"
                        onClick={() => openInspector('platform', service.id)}
                        className="ui-action-icon shrink-0"
                        aria-label={`Abrir servicio ${service.name}`}
                        title={`Abrir servicio ${service.name}`}
                      >{/* [Navegación] Abre el servicio relacionado con este cargo. */}
                        <PlatformIcon name={service.name} iconUrl={service.icon_url} size="sm" />
                      </button>
                    ) : expense?.platform_id ? (
                      (() => {
                        const expenseService = platforms.find((platform) => platform.id === expense.platform_id);
                        return expenseService ? <PlatformIcon name={expenseService.name} iconUrl={expenseService.icon_url} size="sm" /> : <Receipt size={16} className="shrink-0 text-obsidian-muted" aria-hidden="true" />;
                      })()
                    ) : event.kind === 'expense' ? (
                      <Receipt size={16} className="shrink-0 text-obsidian-muted" aria-hidden="true" />
                    ) : (
                      <Server size={16} className="shrink-0 text-obsidian-muted" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <span className="block truncate text-xs font-medium text-obsidian-text" title={event.title}>{event.title}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-obsidian-muted">
                        {eventLabel}{service ? ` · ${service.name}` : ''}{paymentMethod ? ` · ${paymentMethod.alias}` : ''}{expense?.scope === 'personal' ? ' · Personal' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-[11px] text-obsidian-muted">
                      {event.date.slice(8, 10)}/{event.date.slice(5, 7)}/{event.date.slice(0, 4)}
                    </span>
                    {recurring && <span className="text-[10px] text-obsidian-muted">Recurrente</span>}
                    <span className="font-mono text-xs font-semibold text-obsidian-text">
                      {displayAmount === null ? '—' : `$${formatAmount(displayAmount)}`} {profitCurrencyView}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-obsidian-muted">
            No hay cargos de servicios ni gastos próximos en este ámbito durante los siguientes 90 días.
          </div>
        )}
      </div>

      {/* Historial de Cobros de Suscripciones */}
      {billingHistory.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-obsidian-border">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <History size={18} className="text-obsidian-muted shrink-0" aria-hidden="true" />
              <h3 className="text-sm font-bold text-white tracking-tight truncate">
                Historial de Cobros Automáticos ({billingHistory.length})
              </h3>
              <InfoTooltip content="Registro de suscripciones que cumplieron su fecha de pago y avanzaron al siguiente periodo." />
            </div>
            <button
              type="button"
              onClick={() => setActiveSection('audit_logs')}
              className="ui-nav-action"
            >{/* [Navegación] Mantiene disponible esta acción en su contexto. */}
              Ver Historial de Actividad
            </button>
          </div>

          <div className="divide-y divide-obsidian-border">
            {billingHistory.slice(0, 6).map((rec) => (
              <button
                key={rec.id}
                type="button"
                onClick={() => openInspector('platform', rec.platform_id)}
                className="ui-nav-action w-full py-3 items-center justify-between gap-2 min-w-0"
              >{/* [Navegación] Mantiene disponible esta acción en su contexto. */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0" aria-hidden="true" />
                    <span className="font-bold text-white text-xs truncate">{rec.platform_name}</span>
                  </div>
                  <div className="text-[10px] text-obsidian-muted font-mono truncate mt-0.5">
                    Fecha: {rec.charged_date || rec.billing_date} • Ciclo: {rec.billing_cycle}
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-obsidian-text shrink-0">
                  ${rec.amount} {rec.currency}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      </>}
    </>
  );
};
