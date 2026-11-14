import React, { useId } from 'react';
import {
  BarChart3, Wallet, Clock, PiggyBank, TrendingUp, Activity,
  Layers, AlertTriangle, Target, Briefcase, TrendingDown
} from 'lucide-react';
import { InfoTooltip } from '../../common/InfoTooltip';
import {
  FinancialExecutiveSummary as FinancialSummaryData,
  RealProfitSummary,
  BudgetCapEvaluation
} from '../../../lib/financeUtils';
import { computeCommercialPipelineSummary } from '../../../lib/prospectUtils';
import { RuntimeCurrencyOption } from '../../../types';
import { SectionType } from '../../../context/VaultContext';
import { INPUT_LIMITS } from '../../../lib/validation';

interface FinancialExecutiveSummaryProps {
  fin: FinancialSummaryData;
  realProfit: RealProfitSummary;
  budgetCapEval: BudgetCapEvaluation;
  pipelineSummary: ReturnType<typeof computeCommercialPipelineSummary>;
  profitCurrencyView: string;
  setProfitCurrencyView: (currency: string) => void;
  pipelineCurrencyView: string;
  setPipelineCurrencyView: (currency: string) => void;
  currencyOptions: string[];
  baseCurrency: string;
  secondaryCurrency: string;
  supportedCurrencies: RuntimeCurrencyOption[];
  formatAmount: (value: number | string | undefined | null, decimals?: number) => string;
  isEditingCap: boolean;
  setIsEditingCap: (editing: boolean) => void;
  capAmountInput: string;
  setCapAmountInput: (value: string) => void;
  capCurrencyInput: string;
  setCapCurrencyInput: (currency: string) => void;
  handleSaveBudgetCap: () => void;
  isUnlocked: boolean;
  openUnlockModal: () => void;
  openInspector: (type: 'platform', id: string) => void;
  setActiveSection: (section: SectionType) => void;
}

export const FinancialExecutiveSummary: React.FC<FinancialExecutiveSummaryProps> = ({
  fin,
  realProfit,
  budgetCapEval,
  pipelineSummary,
  profitCurrencyView,
  setProfitCurrencyView,
  pipelineCurrencyView,
  setPipelineCurrencyView,
  currencyOptions,
  baseCurrency,
  secondaryCurrency,
  supportedCurrencies,
  formatAmount,
  isEditingCap,
  setIsEditingCap,
  capAmountInput,
  setCapAmountInput,
  capCurrencyInput,
  setCapCurrencyInput,
  handleSaveBudgetCap,
  isUnlocked,
  openUnlockModal,
  openInspector,
  setActiveSection,
}) => {
  const capAmountId = useId();
  const capCurrencyId = useId();

  const isProfitBase = profitCurrencyView === baseCurrency;
  const isPipelineBase = pipelineCurrencyView === baseCurrency;

  return (
    <div className="min-w-0 rounded-2xl border border-obsidian-border bg-obsidian-panel p-3 shadow-xl sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-obsidian-border/70">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 size={16} className="text-indigo-400 flex-shrink-0" aria-hidden="true" />
          <h3 className="text-sm font-bold text-white tracking-tight truncate">
            Resumen financiero
          </h3>
          <InfoTooltip
            title="Cómo se calcula este resumen"
            content="Cruza lo que realmente ya te pagaron tus clientes contra tus gastos de suscripciones y dominios/hosting propios para mostrarte tu ganancia libre real por semana, mes y año."
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-obsidian-muted">
          <span>Suscripciones activas: <strong className="text-emerald-400">{fin.activeCount}</strong></span>
          <span>•</span>
          <span>En prueba gratis: <strong className="text-amber-300">{fin.freeTrialCount}</strong></span>
          <span>•</span>
          <span>Pausadas/Canceladas: <strong className="text-white/70">{fin.pausedOrCancelledCount}</strong></span>
        </div>
      </div>

      {/* GANANCIA NETA REAL (INGRESOS COBRADOS VS GASTOS) */}
      <div className="min-w-0 space-y-3 border-b border-obsidian-border pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Wallet size={15} className="text-emerald-400 shrink-0" aria-hidden="true" />
            <span className="text-xs font-bold text-white truncate">
              Ganancia neta
            </span>
            <InfoTooltip content="Resta tus gastos de suscripciones (más dominios/hosting que pagas por tu cuenta) a los pagos ya cobrados de tus clientes en los últimos 7 días, este mes y este año." />
          </div>
          <div className="flex items-center p-0.5 rounded-lg bg-obsidian-surface border border-obsidian-border text-[10px] font-mono shrink-0">
            {currencyOptions.map((curr) => (
              <button
                key={curr}
                type="button"
                onClick={() => setProfitCurrencyView(curr)}
                aria-pressed={profitCurrencyView === curr}
                className={`px-2 py-0.5 rounded transition-colors ${
                  profitCurrencyView === curr
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-obsidian-muted hover:text-white'
                }`}
              >
                {curr}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 min-[380px]:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Ganancia Neta Semanal */}
          <div className="min-w-0 space-y-1 border-b border-obsidian-border pb-3 min-[380px]:border-b-0 min-[380px]:pb-0 min-[380px]:even:border-l min-[380px]:even:pl-3 lg:border-l lg:pl-3 lg:first:border-l-0 lg:first:pl-0">
            <div className="flex items-center justify-between gap-1 text-[10px] text-obsidian-muted uppercase font-semibold">
              <span className="truncate">Ganancia Neta (Semana)</span>
              <span className="font-mono text-white/50">7 días</span>
            </div>
            <div className={`text-base font-bold font-mono truncate ${realProfit.netWeekMXN >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {realProfit.netWeekMXN >= 0 ? '+' : '-'}$
              {formatAmount(Math.abs(isProfitBase ? realProfit.netWeekMXN : realProfit.netWeekUSD))} {profitCurrencyView}
            </div>
            <div className="text-[11px] font-mono text-obsidian-muted truncate">
              Cobrado: ${formatAmount(isProfitBase ? realProfit.weekIncomeMXN : realProfit.weekIncomeUSD)} • Gasto: ${formatAmount(isProfitBase ? realProfit.totalWeeklyExpenseMXN : realProfit.totalWeeklyExpenseUSD)}
            </div>
          </div>

          {/* Ganancia Neta Mensual */}
          <div className="min-w-0 space-y-1 border-b border-obsidian-border pb-3 min-[380px]:border-b-0 min-[380px]:pb-0 min-[380px]:even:border-l min-[380px]:even:border-emerald-500/30 min-[380px]:even:pl-3 lg:border-l lg:border-emerald-500/30 lg:pl-3">
            <div className="flex items-center justify-between gap-1 text-[10px] text-emerald-300 uppercase font-semibold">
              <span className="truncate">Ganancia Neta (Mes Actual)</span>
              <span className="font-mono">Mes</span>
            </div>
            <div className={`text-base font-bold font-mono truncate ${realProfit.netMonthMXN >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {realProfit.netMonthMXN >= 0 ? '+' : '-'}$
              {formatAmount(Math.abs(isProfitBase ? realProfit.netMonthMXN : realProfit.netMonthUSD))} {profitCurrencyView}
            </div>
            <div className="text-[11px] font-mono text-obsidian-muted truncate">
              Cobrado: ${formatAmount(isProfitBase ? realProfit.monthIncomeMXN : realProfit.monthIncomeUSD)} • Gasto: ${formatAmount(isProfitBase ? realProfit.totalMonthlyExpenseMXN : realProfit.totalMonthlyExpenseUSD)}
            </div>
          </div>

          {/* Ganancia Neta Anual */}
          <div className="min-w-0 space-y-1 border-b border-obsidian-border pb-3 min-[380px]:border-b-0 min-[380px]:pb-0 min-[380px]:even:border-l min-[380px]:even:pl-3 lg:border-l lg:pl-3">
            <div className="flex items-center justify-between gap-1 text-[10px] text-obsidian-muted uppercase font-semibold">
              <span className="truncate">Ganancia Neta (Año Actual)</span>
              <span className="font-mono">Año</span>
            </div>
            <div className={`text-base font-bold font-mono truncate ${realProfit.netYearMXN >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {realProfit.netYearMXN >= 0 ? '+' : '-'}$
              {formatAmount(Math.abs(isProfitBase ? realProfit.netYearMXN : realProfit.netYearUSD))} {profitCurrencyView}
            </div>
            <div className="text-[11px] font-mono text-obsidian-muted truncate">
              Cobrado: ${formatAmount(isProfitBase ? realProfit.yearIncomeMXN : realProfit.yearIncomeUSD)} • Gasto: ${formatAmount(isProfitBase ? realProfit.totalYearlyExpenseMXN : realProfit.totalYearlyExpenseUSD)}
            </div>
          </div>

          {/* Pendiente por Cobrar e Igualas */}
          <div className="min-w-0 space-y-1 min-[380px]:even:border-l min-[380px]:even:border-obsidian-border min-[380px]:even:pl-3 lg:border-l lg:border-obsidian-border lg:pl-3">
            <div className="flex items-center justify-between gap-1 text-[10px] text-amber-300 uppercase font-semibold">
              <span className="truncate">Pagos Pendientes por Cobrar</span>
              <Clock size={12} className="text-amber-400 shrink-0" aria-hidden="true" />
            </div>
            <div className="text-base font-bold font-mono text-amber-300 truncate">
              ${formatAmount(isProfitBase ? realProfit.pendingToCollectMXN : realProfit.pendingToCollectUSD)} {profitCurrencyView}
            </div>
            <div className="text-[11px] font-mono text-obsidian-muted truncate">
              Igualas mensuales: ${formatAmount(isProfitBase ? realProfit.recurringRetainersMonthlyMXN : fin.usdRate > 0 ? realProfit.recurringRetainersMonthlyMXN / fin.usdRate : 0)}/mes
            </div>
          </div>
        </div>
      </div>

      {/* 1. Temporal Analysis: Weekly, Monthly, Annual + Key Metrics */}
      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Weekly Spend */}
        <div className="min-w-0 space-y-1 border-b border-obsidian-border pb-3 min-[380px]:border-b-0 min-[380px]:pb-0 min-[380px]:even:border-l min-[380px]:even:pl-3 lg:border-l lg:pl-3 lg:first:border-l-0 lg:first:pl-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-obsidian-muted uppercase tracking-wider truncate">
              Gasto semanal
            </span>
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
              7 Días
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-white truncate" title={`$${formatAmount(realProfit.totalWeeklyExpenseMXN)} ${baseCurrency}`}>
            ${formatAmount(realProfit.totalWeeklyExpenseMXN)} <span className="text-[11px] font-sans text-obsidian-muted">{baseCurrency}</span>
          </div>
          <div className="text-xs font-mono text-emerald-400 truncate">
            ${formatAmount(realProfit.totalWeeklyExpenseUSD)} {secondaryCurrency}
          </div>
          <div className="text-[10px] font-mono text-obsidian-muted truncate pt-1 border-t border-obsidian-border/40">
            Fijo: ${formatAmount(realProfit.fixedWeeklyExpenseMXN)} • Variable: ${formatAmount(realProfit.variableWeekExpenseMXN)}
          </div>
        </div>

        {/* Monthly Spend */}
        <div className="min-w-0 space-y-1 border-b border-obsidian-border pb-3 min-[380px]:border-b-0 min-[380px]:pb-0 min-[380px]:even:border-l min-[380px]:even:border-indigo-500/30 min-[380px]:even:pl-3 lg:border-l lg:border-indigo-500/30 lg:pl-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-indigo-300 uppercase tracking-wider truncate">
              Gasto mensual
            </span>
            <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/25">
              Mensual
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-white truncate" title={`$${formatAmount(realProfit.totalMonthlyExpenseMXN)} ${baseCurrency}`}>
            ${formatAmount(realProfit.totalMonthlyExpenseMXN)} <span className="text-[11px] font-sans text-obsidian-muted">{baseCurrency}</span>
          </div>
          <div className="text-xs font-mono text-emerald-400 truncate">
            ${formatAmount(realProfit.totalMonthlyExpenseUSD)} {secondaryCurrency}
          </div>
          <div className="text-[10px] font-mono text-obsidian-muted truncate pt-1 border-t border-obsidian-border/40">
            Fijo: ${formatAmount(realProfit.fixedMonthlyExpenseMXN)} • Compras: ${formatAmount(realProfit.variableMonthExpenseMXN)}
          </div>
        </div>

        {/* Annual Spend */}
        <div className="min-w-0 space-y-1 border-b border-obsidian-border pb-3 min-[380px]:border-b-0 min-[380px]:pb-0 min-[380px]:even:border-l min-[380px]:even:pl-3 lg:border-l lg:pl-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-obsidian-muted uppercase tracking-wider truncate">
              Gasto anual
            </span>
            <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
              12 Meses
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-white truncate" title={`$${formatAmount(realProfit.totalYearlyExpenseMXN)} ${baseCurrency}`}>
            ${formatAmount(realProfit.totalYearlyExpenseMXN)} <span className="text-[11px] font-sans text-obsidian-muted">{baseCurrency}</span>
          </div>
          <div className="text-xs font-mono text-emerald-400 truncate">
            ${formatAmount(realProfit.totalYearlyExpenseUSD)} {secondaryCurrency}
          </div>
          <div className="text-[10px] font-mono text-obsidian-muted truncate pt-1 border-t border-obsidian-border/40">
            Fijo: ${formatAmount(realProfit.fixedYearlyExpenseMXN)} • Compras: ${formatAmount(realProfit.variableYearExpenseMXN)}
          </div>
        </div>

        {/* Key Metric: Avg Cost & Potential Savings */}
        <div className="min-w-0 space-y-1 min-[380px]:even:border-l min-[380px]:even:border-emerald-500/25 min-[380px]:even:pl-3 lg:border-l lg:border-emerald-500/25 lg:pl-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider truncate">
              Promedio y ahorro
            </span>
            <PiggyBank size={14} className="text-emerald-400 flex-shrink-0" aria-hidden="true" />
          </div>
          <div
            className="break-words text-sm font-bold font-mono text-white"
            title={`Promedio: $${formatAmount(fin.avgMonthlyPerActiveMXN)} ${baseCurrency} ($${formatAmount(fin.avgMonthlyPerActiveUSD)} ${secondaryCurrency})`}
          >
            Prom: ${formatAmount(fin.avgMonthlyPerActiveMXN)} {baseCurrency} <span className="text-[10px] text-obsidian-muted">(${formatAmount(fin.avgMonthlyPerActiveUSD)} {secondaryCurrency})</span>
          </div>
          <div className="text-[11px] font-mono text-emerald-400 truncate" title={`Ahorro potencial anual: $${formatAmount(fin.totalOptimizationPotentialYearlyMXN)} ${baseCurrency}`}>
            Ahorro posible: ${formatAmount(fin.totalOptimizationPotentialYearlyMXN)} {baseCurrency}/año
          </div>
          {fin.alreadySavedMonthlyMXN > 0 && (
            <div className="text-[10px] font-mono text-obsidian-muted truncate">
              Ya ahorrado en pausadas: ${formatAmount(fin.alreadySavedMonthlyMXN)} {baseCurrency}/mes
            </div>
          )}
        </div>
      </div>

      {/* 2. Spend Peaks (Max & Min) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* Peak vs Lowest Month */}
        <div className="p-4 rounded-xl bg-obsidian-bg/60 border border-obsidian-border space-y-2.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
              <TrendingUp size={13} className="text-rose-400 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">Mes con Más y Menos Gasto</span>
            </span>
            <InfoTooltip content="Muestra en qué mes del año tendrás más cobros acumulados (incluyendo pagos anuales) y en cuál pagarás menos." />
          </div>

          <div className="divide-y divide-obsidian-border/50 text-xs">
            <div className="py-2 flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <div className="text-[10px] text-rose-300 font-semibold uppercase">Mes Más Alto</div>
                <div className="font-bold text-white truncate">{fin.peakMonth.monthName}</div>
              </div>
              <div className="text-right font-mono flex-shrink-0">
                <div className="text-rose-300 font-bold">${formatAmount(fin.peakMonth.totalMXN)} {baseCurrency}</div>
                <div className="text-[10px] text-obsidian-muted">${formatAmount(fin.peakMonth.totalUSD)} {secondaryCurrency}</div>
              </div>
            </div>

            <div className="py-2 flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <div className="text-[10px] text-emerald-300 font-semibold uppercase">Mes Más Bajo</div>
                <div className="font-bold text-white truncate">{fin.lowestMonth.monthName}</div>
              </div>
              <div className="text-right font-mono flex-shrink-0">
                <div className="text-emerald-300 font-bold">${formatAmount(fin.lowestMonth.totalMXN)} {baseCurrency}</div>
                <div className="text-[10px] text-obsidian-muted">${formatAmount(fin.lowestMonth.totalUSD)} {secondaryCurrency}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Peak vs Lowest Week of Month */}
        <div className="p-4 rounded-xl bg-obsidian-bg/60 border border-obsidian-border space-y-2.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
              <Activity size={13} className="text-amber-400 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">Semana del Mes con Más Cobros</span>
            </span>
            <InfoTooltip content="Agrupa tus cobros según el día del mes en que se pagan (Semanas 1 a 4) para saber cuándo necesitas más saldo disponible." />
          </div>

          <div className="divide-y divide-obsidian-border/50 text-xs">
            <div className="py-2 flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <div className="text-[10px] text-amber-300 font-semibold uppercase">Semana Más Pesada ({fin.peakWeek.rangeLabel})</div>
                <div className="font-bold text-white truncate">{fin.peakWeek.label}</div>
              </div>
              <div className="text-right font-mono flex-shrink-0">
                <div className="text-amber-300 font-bold">${formatAmount(fin.peakWeek.totalMXN)} {baseCurrency}</div>
                <div className="text-[10px] text-obsidian-muted">${formatAmount(fin.peakWeek.totalUSD)} {secondaryCurrency}</div>
              </div>
            </div>

            <div className="py-2 flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <div className="text-[10px] text-cyan-300 font-semibold uppercase">Semana Más Ligera ({fin.lowestWeek.rangeLabel})</div>
                <div className="font-bold text-white truncate">{fin.lowestWeek.label}</div>
              </div>
              <div className="text-right font-mono flex-shrink-0">
                <div className="text-cyan-300 font-bold">${formatAmount(fin.lowestWeek.totalMXN)} {baseCurrency}</div>
                <div className="text-[10px] text-obsidian-muted">${formatAmount(fin.lowestWeek.totalUSD)} {secondaryCurrency}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Highest Financial Burden Service & Category */}
        <div className="p-4 rounded-xl bg-obsidian-bg/60 border border-obsidian-border space-y-2.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
              <Layers size={13} className="text-indigo-400 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">Servicio Donde Más Gastas</span>
            </span>
            <InfoTooltip content="Muestra la suscripción y la categoría que representan el mayor porcentaje de tu gasto mensual." />
          </div>

          {fin.topService ? (
            <div className="divide-y divide-obsidian-border/50 text-xs">
              <button
                type="button"
                onClick={() => openInspector('platform', fin.topService!.platform.id)}
                className="w-full text-left py-2 flex items-center justify-between gap-2 cursor-pointer hover:bg-indigo-500/10 rounded px-1.5 -mx-1.5 transition-colors min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                <div className="min-w-0">
                  <div className="text-[10px] text-indigo-300 font-semibold uppercase">
                    Mayor Gasto ({fin.topService.sharePercent}% del total)
                  </div>
                  <div className="font-bold text-white truncate" title={fin.topService.platform.name}>
                    {fin.topService.platform.name}
                  </div>
                </div>
                <div className="text-right font-mono flex-shrink-0">
                  <div className="text-white font-bold">${formatAmount(fin.topService.monthlyMXN)} {baseCurrency}</div>
                  <div className="text-[10px] text-obsidian-muted">${formatAmount(fin.topService.monthlyUSD)} {secondaryCurrency}/mes</div>
                </div>
              </button>

              {fin.topCategory && (
                <div className="py-2 flex items-center justify-between gap-2 min-w-0">
                  <div className="min-w-0">
                    <div className="text-[10px] text-obsidian-muted font-semibold uppercase">
                      Categoría Principal ({fin.topCategory.sharePercent}%)
                    </div>
                    <div className="font-bold text-white truncate" title={fin.topCategory.name}>
                      {fin.topCategory.name} ({fin.topCategory.count})
                    </div>
                  </div>
                  <div className="text-right font-mono flex-shrink-0">
                    <div className="text-emerald-400 font-bold">${formatAmount(fin.topCategory.monthlyMXN)} {baseCurrency}</div>
                    <div className="text-[10px] text-obsidian-muted">${formatAmount(fin.topCategory.monthlyUSD)} {secondaryCurrency}</div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-obsidian-muted py-4 text-center">
              Sin servicios de pago activos.
            </div>
          )}
        </div>

        {/* Upcoming Critical Charges (Next 30 days) */}
        <div className="p-4 rounded-xl bg-obsidian-bg/60 border border-obsidian-border space-y-2.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
              <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">Próximos Cobros de Suscripciones</span>
            </span>
            <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 flex-shrink-0">
              30 días: ${formatAmount(fin.next30DaysTotalMXN, 0)} {baseCurrency}
            </span>
          </div>

          {fin.criticalRenewals.length > 0 ? (
            <div className="space-y-1.5">
              {fin.criticalRenewals.slice(0, 2).map((item) => {
                const isUrgent = item.daysUntil <= 7;
                const daysLabel =
                  item.daysUntil < 0
                    ? `Venció hace ${Math.abs(item.daysUntil)}d`
                    : item.daysUntil === 0
                    ? 'Se cobra HOY'
                    : `En ${item.daysUntil} día(s)`;

                return (
                  <button
                    key={item.platform.id}
                    type="button"
                    onClick={() => openInspector('platform', item.platform.id)}
                    className={`w-full text-left p-2 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition-colors min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                      isUrgent || item.isTrial
                        ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15'
                        : 'bg-obsidian-surface/80 border-obsidian-border hover:bg-obsidian-surface'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-white text-xs truncate" title={item.platform.name}>
                        {item.platform.name}
                      </div>
                      <div className={`text-[10px] font-mono ${isUrgent || item.isTrial ? 'text-amber-300' : 'text-obsidian-muted'}`}>
                        {daysLabel} {item.isTrial ? '• Prueba gratis' : ''}
                      </div>
                    </div>
                    <div className="text-right font-mono flex-shrink-0">
                      <div className="text-xs font-bold text-emerald-400">
                        ${item.platform.subscription_cost} {item.platform.currency}
                      </div>
                      <div className="text-[10px] text-obsidian-muted">
                        ${formatAmount(item.amountMXN)} {baseCurrency}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-obsidian-muted py-4 text-center">
              Sin cobros próximos programados.
            </div>
          )}
        </div>
      </div>

      {/* 3. Tope de Gasto Mensual & Cotizaciones vs. Gasto Operativo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-obsidian-border/60">
        {/* Tope de Gasto Mensual */}
        <div className="p-4 rounded-xl bg-obsidian-bg/70 border border-obsidian-border space-y-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Target size={14} className="text-indigo-400 shrink-0" aria-hidden="true" />
              <span className="text-xs font-bold text-white truncate">
                Límite de Gasto Mensual
              </span>
              <InfoTooltip
                title="Límite de Presupuesto"
                content="Te avisa cuando tus suscripciones se acercan (80%) o superan (100%) el monto máximo que definiste para gastar al mes."
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {budgetCapEval.enabled && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                    budgetCapEval.level === 'critical'
                      ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                      : budgetCapEval.level === 'warning'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                  }`}
                >
                  {budgetCapEval.level === 'critical'
                    ? 'Límite Superado'
                    : budgetCapEval.level === 'warning'
                    ? 'Cerca del Límite'
                    : 'Dentro del Límite'}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!isUnlocked) openUnlockModal();
                  else setIsEditingCap(!isEditingCap);
                }}
                className="px-2 py-0.5 rounded-lg bg-obsidian-surface hover:bg-obsidian-border text-[10px] text-obsidian-text font-medium border border-obsidian-border"
              >
                {isEditingCap ? 'Cancelar' : budgetCapEval.enabled ? 'Cambiar Límite' : 'Definir Límite'}
              </button>
            </div>
          </div>

          {isEditingCap && (
            <div className="p-2.5 rounded-xl bg-obsidian-surface border border-indigo-500/30 flex flex-wrap items-center gap-2 text-xs">
              <label htmlFor={capAmountId} className="sr-only">
                Monto del límite mensual
              </label>
              <input
                id={capAmountId}
                type="number"
                inputMode="decimal"
                min={0}
                max={INPUT_LIMITS.BUDGET_CAP}
                step="0.01"
                required
                value={capAmountInput}
                onChange={(e) => setCapAmountInput(e.target.value)}
                placeholder="Ej. 5000 (0 = desactivar)"
                className="w-32 px-2.5 py-1 rounded-lg bg-obsidian-bg border border-obsidian-border text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
              />
              <label htmlFor={capCurrencyId} className="sr-only">
                Moneda del límite mensual
              </label>
              <select
                id={capCurrencyId}
                value={capCurrencyInput}
                onChange={(e) => setCapCurrencyInput(e.target.value)}
                className="px-2 py-1 rounded-lg bg-obsidian-bg border border-obsidian-border text-white text-xs"
              >
                {supportedCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleSaveBudgetCap}
                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold"
              >
                Guardar
              </button>
            </div>
          )}

          {budgetCapEval.enabled ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <span className="text-obsidian-muted">
                  Gastando: <strong className="text-white">${formatAmount(fin.monthlyMXN)} {baseCurrency}</strong> ({budgetCapEval.usagePercent.toFixed(1)}%)
                </span>
                <span className="text-indigo-300 font-semibold">
                  Límite: ${formatAmount(budgetCapEval.capMXN)} {baseCurrency} (${formatAmount(budgetCapEval.capUSD)} {secondaryCurrency})
                </span>
              </div>

              <div className="w-full h-2.5 rounded-full bg-obsidian-surface overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    budgetCapEval.level === 'critical'
                      ? 'bg-rose-500'
                      : budgetCapEval.level === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, budgetCapEval.usagePercent)}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-obsidian-muted font-mono">
                <span>
                  Mes más alto ({fin.peakMonth.shortName}):{' '}
                  <strong className={budgetCapEval.peakUsagePercent >= 100 ? 'text-rose-400' : 'text-white'}>
                    {budgetCapEval.peakUsagePercent.toFixed(1)}% del límite
                  </strong>
                </span>
                <span>
                  {budgetCapEval.usagePercent >= 100
                    ? `Excedido por $${formatAmount(fin.monthlyMXN - budgetCapEval.capMXN)} ${baseCurrency}`
                    : `Disponible: $${formatAmount(budgetCapEval.capMXN - fin.monthlyMXN)} ${baseCurrency}`}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-obsidian-muted py-2">
              Sin límite mensual activo. Define un tope para recibir avisos si tus suscripciones suben demasiado.
            </div>
          )}
        </div>

        {/* Cotizaciones vs. Gasto Operativo */}
        <div className="p-4 rounded-xl bg-obsidian-bg/70 border border-obsidian-border space-y-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Briefcase size={14} className="text-emerald-400 shrink-0" aria-hidden="true" />
              <span className="text-xs font-bold text-white truncate">
                Cotizaciones de Prospectos vs. Gasto Operativo
              </span>
              <InfoTooltip
                title="Proyección Comercial"
                content="Compara el valor estimado de tus prospectos en negociación y cerrados frente a lo que pagas mensualmente en herramientas."
              />
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <div className="flex items-center p-0.5 rounded-lg bg-obsidian-surface border border-obsidian-border text-[10px] font-mono">
                {currencyOptions.map((curr) => (
                  <button
                    key={curr}
                    type="button"
                    onClick={() => setPipelineCurrencyView(curr)}
                    aria-pressed={pipelineCurrencyView === curr}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      pipelineCurrencyView === curr
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'text-obsidian-muted hover:text-white'
                    }`}
                  >
                    {curr}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('prospects')}
                className="px-2 py-0.5 rounded-lg bg-obsidian-surface hover:bg-obsidian-border text-[10px] text-indigo-300 border border-obsidian-border font-medium"
              >
                Ver Prospectos
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-obsidian-surface/80 border border-obsidian-border min-w-0">
              <div className="text-[10px] text-obsidian-muted font-sans uppercase truncate">En Negociación ({pipelineSummary.activeCount})</div>
              <div className="font-bold text-indigo-300 truncate mt-0.5">
                ${formatAmount(isPipelineBase ? pipelineSummary.activePipelineMXN : pipelineSummary.activePipelineUSD)} {pipelineCurrencyView}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-obsidian-surface/80 border border-obsidian-border min-w-0">
              <div className="text-[10px] text-obsidian-muted font-sans uppercase truncate">Respondidos ({pipelineSummary.closedWonCount})</div>
              <div className="font-bold text-emerald-400 truncate mt-0.5">
                ${formatAmount(isPipelineBase ? pipelineSummary.closedWonMXN : pipelineSummary.closedWonUSD)} {pipelineCurrencyView}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 min-w-0">
              <div className="text-[10px] text-emerald-300 font-sans uppercase truncate">Meses Cubiertos</div>
              <div className="font-bold text-white truncate mt-0.5">
                {pipelineSummary.monthlyCostCoverageRatio > 0
                  ? `${pipelineSummary.monthlyCostCoverageRatio.toFixed(1)} meses`
                  : '0 meses'}
              </div>
              <div className="text-[10px] text-obsidian-muted truncate">
                {pipelineSummary.annualCostCoverageRatio.toFixed(2)}x del gasto anual
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Distribution & Lowest Cost Service Footer Bar */}
      <div className="pt-3 border-t border-obsidian-border/60 flex flex-wrap items-center justify-between gap-3 text-xs text-obsidian-muted">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Suscripciones: <strong className="text-emerald-400">{fin.paidActiveCount} Activas de Pago</strong>
          </span>
          <span>•</span>
          <span>
            <strong className="text-amber-300">{fin.freeTrialCount} Pruebas Gratis</strong>
          </span>
          <span>•</span>
          <span>
            <strong className="text-white/80">{fin.pausedCount} Pausadas</strong> / <strong className="text-rose-400">{fin.cancelledCount} Canceladas</strong>
          </span>
        </div>

        {fin.lowestPaidService && (
          <div className="flex items-center gap-1.5 font-mono text-[11px] min-w-0">
            <TrendingDown size={13} className="text-emerald-400 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">
              Suscripción más económica: <strong className="text-white">{fin.lowestPaidService.platform.name}</strong> (${formatAmount(fin.lowestPaidService.monthlyMXN)} {baseCurrency} / ${formatAmount(fin.lowestPaidService.monthlyUSD)} {secondaryCurrency})
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
