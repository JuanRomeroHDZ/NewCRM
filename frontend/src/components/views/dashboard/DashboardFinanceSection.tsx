import React from 'react';
import { ArrowRight, BarChart3, Briefcase, Server, Target, TrendingUp, Wallet } from 'lucide-react';
import { InfoTooltip } from '../../common/InfoTooltip';
import { evaluateBudgetCap } from '../../../lib/financeUtils';
import { computeCommercialPipelineSummary } from '../../../lib/prospectUtils';
import type { FinancialExecutiveSummary, RealProfitSummary } from '../../../lib/financeUtils';

type PipelineSummary = ReturnType<typeof computeCommercialPipelineSummary>;
type BudgetCapEvaluation = ReturnType<typeof evaluateBudgetCap>;

type DashboardFinanceSectionProps = {
  fin: FinancialExecutiveSummary;
  realProfit: RealProfitSummary;
  pipelineSummary: PipelineSummary;
  budgetCapEval: BudgetCapEvaluation;
  pipelineCurrency: string;
  pipelineCurrencyOptions: string[];
  activePipelineAmount: number;
  closedWonAmount: number;
  formatAmount: (value: number | string | null | undefined, decimals?: number) => string;
  onCurrencyChange: (currency: string) => void;
  onOpenSubscriptions: () => void;
};

export const DashboardFinanceSection: React.FC<DashboardFinanceSectionProps> = ({
  fin,
  realProfit,
  pipelineSummary,
  budgetCapEval,
  pipelineCurrency,
  pipelineCurrencyOptions,
  activePipelineAmount,
  closedWonAmount,
  formatAmount,
  onCurrencyChange,
  onOpenSubscriptions,
}) => (
  <section aria-labelledby="dashboard-finance-heading" className="min-w-0 space-y-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <BarChart3 size={16} className="shrink-0 text-emerald-400" aria-hidden="true" />
        <h2 id="dashboard-finance-heading" className="min-w-0 break-words text-sm font-bold tracking-tight text-white">
          Finanzas y vencimientos
        </h2>
        <InfoTooltip content="Compara ingresos cobrados con gastos de suscripciones y revisa los vencimientos próximos." />
      </div>
      <button type="button" onClick={onOpenSubscriptions} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300">
        Ver suscripciones <ArrowRight size={12} aria-hidden="true" />
      </button>
    </div>

    <div className="grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
      <div className="min-w-0 border-b border-obsidian-border pb-3 min-[420px]:border-b-0 min-[420px]:pb-0">
        <h3 className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase text-emerald-300">
          <Wallet size={11} className="shrink-0 text-emerald-400" aria-hidden="true" />
          Ganancia neta
        </h3>
        <MetricRow label="Semana" value={`${realProfit.netWeekMXN >= 0 ? '+' : '-'}$${formatAmount(Math.abs(realProfit.netWeekMXN))} MXN`} color={realProfit.netWeekMXN >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
        <MetricRow label="Mes" value={`${realProfit.netMonthMXN >= 0 ? '+' : '-'}$${formatAmount(Math.abs(realProfit.netMonthMXN))} MXN`} color={realProfit.netMonthMXN >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
        <MetricRow label="Año" value={`${realProfit.netYearMXN >= 0 ? '+' : '-'}$${formatAmount(Math.abs(realProfit.netYearMXN))} MXN`} color={realProfit.netYearMXN >= 0 ? 'text-indigo-300' : 'text-rose-400'} />
      </div>

      <div className="min-w-0 border-b border-obsidian-border pb-3 min-[420px]:border-b-0 min-[420px]:pb-0">
        <h3 className="mb-2 text-[10px] font-semibold uppercase text-obsidian-muted">Gasto en suscripciones</h3>
        <MetricRow label="Semana" value={`$${formatAmount(fin.weeklyMXN)} MXN`} />
        <MetricRow label="Mes" value={`$${formatAmount(fin.monthlyMXN)} MXN`} color="text-emerald-400" />
        <MetricRow label="Año" value={`$${formatAmount(fin.yearlyMXN)} MXN`} color="text-indigo-300" />
      </div>

      <div className="min-w-0 border-b border-obsidian-border pb-3 min-[420px]:border-b-0 min-[420px]:pb-0">
        <h3 className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase text-obsidian-muted">
          <TrendingUp size={11} className="shrink-0 text-rose-400" aria-hidden="true" />
          Meses con más y menos gasto
        </h3>
        <MetricRow label={`Más alto (${fin.peakMonth.shortName})`} value={`$${formatAmount(fin.peakMonth.totalMXN)} MXN`} color="text-rose-300" />
        <MetricRow label={`Más bajo (${fin.lowestMonth.shortName})`} value={`$${formatAmount(fin.lowestMonth.totalMXN)} MXN`} color="text-emerald-300" />
        <MetricRow label="Semana más alta" value={`${fin.peakWeek.label} · $${formatAmount(fin.peakWeek.totalMXN, 0)}`} />
      </div>

      <div className="min-w-0">
        <h3 className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase text-obsidian-muted">
          <Server size={11} className="shrink-0 text-cyan-400" aria-hidden="true" />
          Dominios y hosting ({realProfit.activeRenewalsCount})
        </h3>
        <MetricRow label="Por vencer (30 días)" value={`${realProfit.expiringSoonRenewals.length} servicios`} color={realProfit.expiringSoonRenewals.length ? 'text-amber-300' : 'text-emerald-400'} />
        <MetricRow label="Pago propio" value={`$${formatAmount(realProfit.myRenewalsYearlyMXN, 0)} MXN/año`} color="text-rose-300" />
        <MetricRow label="Paga cliente" value={`$${formatAmount(realProfit.clientRenewalsYearlyMXN, 0)} MXN/año`} color="text-emerald-300" />
      </div>
    </div>

    <div className="grid min-w-0 items-start grid-cols-1 gap-4 border-t border-obsidian-border/70 pt-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(13rem,0.6fr)]">
      <div className="min-w-0 space-y-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Briefcase size={13} className="shrink-0 text-emerald-400" aria-hidden="true" />
          <h3 className="min-w-0 break-words text-xs font-bold text-white">Cotizaciones frente al gasto mensual</h3>
          <InfoTooltip content="Compara cotizaciones activas y proyectos cerrados con el gasto mensual en herramientas." />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono">
          <span>En negociación: <strong className="text-indigo-300">${formatAmount(activePipelineAmount)} {pipelineCurrency}</strong></span>
          <span>Respondidos: <strong className="text-emerald-400">${formatAmount(closedWonAmount)} {pipelineCurrency}</strong></span>
          <span className="text-emerald-300">{pipelineSummary.monthlyCostCoverageRatio.toFixed(1)} meses cubiertos</span>
          <div className="flex items-center rounded-md border border-obsidian-border bg-obsidian-bg p-0.5 text-[10px]">
            {pipelineCurrencyOptions.map((currency) => (
              <button
                key={currency}
                type="button"
                onClick={() => onCurrencyChange(currency)}
                aria-pressed={pipelineCurrency === currency}
                className={`rounded px-1.5 py-0.5 ${pipelineCurrency === currency ? 'bg-indigo-600 text-white' : 'text-obsidian-muted hover:text-white'}`}
              >
                {currency}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-w-0 self-start lg:border-l lg:border-obsidian-border/70 lg:pl-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-white">
            <Target size={13} className="shrink-0 text-indigo-400" aria-hidden="true" />
            Límite de gasto mensual
          </h3>
          {budgetCapEval.enabled ? (
            <span className={`text-[10px] font-semibold ${budgetCapEval.level === 'critical' ? 'text-rose-300' : budgetCapEval.level === 'warning' ? 'text-amber-300' : 'text-emerald-300'}`}>
              {budgetCapEval.usagePercent.toFixed(0)}% · ${formatAmount(budgetCapEval.capMXN, 0)} MXN
            </span>
          ) : (
            <button type="button" onClick={onOpenSubscriptions} className="inline-flex min-h-8 items-center text-[11px] font-medium text-indigo-400 hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
              Definir límite
            </button>
          )}
        </div>
        {budgetCapEval.enabled && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-obsidian-bg" role="progressbar" aria-label="Uso del límite mensual" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, budgetCapEval.usagePercent)}>
            <div className={`h-full ${budgetCapEval.level === 'critical' ? 'bg-rose-500' : budgetCapEval.level === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, budgetCapEval.usagePercent)}%` }} />
          </div>
        )}
      </div>
    </div>
  </section>
);

const MetricRow: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = 'text-white' }) => (
  <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 py-0.5 text-xs font-mono">
    <span className="min-w-0 flex-[1_1_8rem] break-words text-obsidian-muted">{label}</span>
    <span className={`min-w-0 max-w-full flex-[0_1_auto] break-words text-right font-semibold ${color}`}>{value}</span>
  </div>
);
