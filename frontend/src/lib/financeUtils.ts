import type { PlatformAccount, DomainRenewal, ClientIncome, OneTimeExpense } from '../types';

export interface CriticalRenewalItem {
  platform: PlatformAccount;
  daysUntil: number;
  isTrial: boolean;
  costMXN?: number;
  amountMXN: number;
}

export interface ExpiringRenewalItem {
  id: string | number;
  domain_or_service: string;
  client_name: string;
  days_remaining: number;
  renewal_cost: number | string;
  currency: string;
  [key: string]: any;
}

export interface MonthSummary {
  month?: string;
  monthName?: string;
  shortName?: string;
  totalMXN: number;
  totalUSD?: number;
}

export interface WeekSummary {
  week?: string;
  label?: string;
  rangeLabel?: string;
  totalMXN: number;
  totalUSD?: number;
}

export interface TopServiceSummary {
  platform: PlatformAccount;
  monthlyMXN: number;
  monthlyUSD: number;
  sharePercent: number;
}

export interface LowestPaidServiceSummary {
  platform: PlatformAccount;
  monthlyMXN: number;
  monthlyUSD: number;
}

export interface TopCategorySummary {
  name: string;
  count: number;
  monthlyMXN: number;
  monthlyUSD: number;
  sharePercent: number;
}

export interface FinancialExecutiveSummary {
  activeCount: number;
  paidActiveCount: number;
  pausedCount: number;
  cancelledCount: number;
  pausedOrCancelledCount: number;
  freeTrialCount: number;
  monthlyMXN: number;
  monthlyUSD: number;
  weeklyMXN: number;
  yearlyMXN: number;
  avgMonthlyPerActiveMXN: number;
  avgMonthlyPerActiveUSD: number;
  alreadySavedMonthlyMXN: number;
  totalOptimizationPotentialYearlyMXN: number;
  usdRate: number;
  next30DaysTotalMXN: number;
  peakMonth: MonthSummary;
  lowestMonth: MonthSummary;
  peakWeek: WeekSummary;
  lowestWeek: WeekSummary;
  topCategory: TopCategorySummary | null;
  topService: TopServiceSummary | null;
  lowestPaidService: LowestPaidServiceSummary | null;
  criticalRenewals: CriticalRenewalItem[];
}

export interface RealProfitSummary {
  activeRenewalsCount: number;
  clientRenewalsYearlyMXN: number;
  expiringSoonRenewals: ExpiringRenewalItem[];
  fixedMonthlyExpenseMXN: number;
  fixedWeeklyExpenseMXN: number;
  fixedYearlyExpenseMXN: number;
  monthIncomeMXN: number;
  monthIncomeUSD: number;
  myRenewalsYearlyMXN: number;
  netMonthMXN: number;
  netMonthUSD: number;
  netWeekMXN: number;
  netWeekUSD: number;
  netYearMXN: number;
  netYearUSD: number;
  pendingToCollectMXN: number;
  pendingToCollectUSD: number;
  recurringRetainersMonthlyMXN: number;
  totalMonthlyExpenseMXN: number;
  totalMonthlyExpenseUSD: number;
  totalWeeklyExpenseMXN: number;
  totalWeeklyExpenseUSD: number;
  totalYearlyExpenseMXN: number;
  totalYearlyExpenseUSD: number;
  variableMonthExpenseMXN: number;
  variableMonthExpenseUSD: number;
  variableWeekExpenseMXN: number;
  variableYearExpenseMXN: number;
  variableYearExpenseUSD: number;
  weekIncomeMXN: number;
  weekIncomeUSD: number;
  yearIncomeMXN: number;
  yearIncomeUSD: number;
}

export interface BudgetCapEvaluation {
  enabled: boolean;
  capMXN: number;
  capUSD: number;
  usagePercent: number;
  peakUsagePercent: number;
  level: 'normal' | 'warning' | 'danger' | 'critical';
}

export function formatMoney(val: number | string | undefined | null, decimals = 2): string {
  const num = typeof val === 'number' ? val : parseFloat(String(val ?? 0));
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function evaluateBudgetCap(
  monthlyMXN = 0,
  peakMonthMXN = 0,
  budgetCapAmount = 0,
  budgetCapCurrency = 'MXN',
  usdRate = 0
): BudgetCapEvaluation {
  const rate = usdRate > 0 ? usdRate : 0;
  const enabled = budgetCapAmount > 0;
  const capMXN = enabled
    ? budgetCapCurrency === 'USD'
      ? budgetCapAmount * rate
      : budgetCapAmount
    : 0;
  const capUSD = enabled
    ? budgetCapCurrency === 'USD'
      ? budgetCapAmount
      : rate > 0 ? budgetCapAmount / rate : 0
    : 0;

  const usagePercent = capMXN > 0 ? Math.round((monthlyMXN / capMXN) * 100) : 0;
  const peakUsagePercent = capMXN > 0 ? Math.round((peakMonthMXN / capMXN) * 100) : 0;

  let level: 'normal' | 'warning' | 'danger' | 'critical' = 'normal';
  if (usagePercent >= 100 || peakUsagePercent >= 100) {
    level = 'critical';
  } else if (usagePercent >= 80 || peakUsagePercent >= 80) {
    level = 'warning';
  }

  return {
    enabled,
    capMXN,
    capUSD,
    usagePercent,
    peakUsagePercent,
    level,
  };
}

function calculateDaysUntil(dateStr?: string): number {
  if (!dateStr) return 999;
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function toMonthlyCost(amount: number, cycle?: string): number {
  switch (cycle?.toLowerCase()) {
    case 'weekly':
      return amount * 4.33;
    case 'quarterly':
      return amount / 3;
    case 'yearly':
    case 'annual':
      return amount / 12;
    case 'monthly':
    default:
      return amount;
  }
}

export function computeFinancialExecutiveSummary(
  platforms: PlatformAccount[] = [],
  paymentMethods: any[] = [],
  usdRateInput?: number,
  activeScope = 'all',
  expenses: OneTimeExpense[] = []
): FinancialExecutiveSummary {
  const usdRate = usdRateInput && usdRateInput > 0 ? usdRateInput : 0;

  const filteredPlatforms = platforms.filter(
    (p: any) => activeScope === 'all' || !p.scope || p.scope === 'all' || p.scope === activeScope
  );

  let activeCount = 0;
  let paidActiveCount = 0;
  let pausedCount = 0;
  let cancelledCount = 0;
  let freeTrialCount = 0;
  let monthlyMXN = 0;
  let savedMonthlyMXN = 0;
  let next30DaysTotalMXN = 0;

  const categoryTotals: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const criticalRenewals: CriticalRenewalItem[] = [];
  let topServicePlatform: PlatformAccount | null = null;
  let topServiceCost = -1;
  let lowestPaidPlatform: PlatformAccount | null = null;
  let lowestPaidCost = Infinity;

  const weekTotalsMXN = [0, 0, 0, 0];
  const weekRanges = ['Días 1-7', 'Días 8-14', 'Días 15-21', 'Días 22-fin de mes'];
  const weekLabels = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'];

  const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const MONTH_SHORTS = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ];
  const monthTotalsMXN = new Array(12).fill(0);

  filteredPlatforms.forEach((p: any) => {
    const rawCost = Number(p.subscription_cost) || 0;
    const costMXN = p.currency === 'USD' ? rawCost * usdRate : rawCost;
    const normalizedMonthly = toMonthlyCost(costMXN, p.billing_cycle);
    const status = (p.subscription_status || p.status || '').toLowerCase();
    const isTrial = status === 'free_trial' || Boolean(p.is_free_trial);

    const renewalTarget = p.renewal_date || p.next_billing_date;
    const daysUntil = calculateDaysUntil(renewalTarget);

    if (daysUntil <= 30 && (status === 'active' || status === 'free_trial')) {
      next30DaysTotalMXN += costMXN;
      criticalRenewals.push({
        platform: p,
        daysUntil,
        isTrial,
        costMXN,
        amountMXN: costMXN,
      });
    }

    if (status === 'active' || status === 'free_trial') {
      activeCount++;
      if (isTrial) {
        freeTrialCount++;
      } else {
        paidActiveCount++;
        monthlyMXN += normalizedMonthly;

        if (normalizedMonthly > topServiceCost) {
          topServiceCost = normalizedMonthly;
          topServicePlatform = p;
        }
        if (normalizedMonthly > 0 && normalizedMonthly < lowestPaidCost) {
          lowestPaidCost = normalizedMonthly;
          lowestPaidPlatform = p;
        }

        const cat = p.category || 'General';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + normalizedMonthly;
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

        let dayOfMonth = 1;
        if (renewalTarget) {
          const d = new Date(renewalTarget);
          if (!isNaN(d.getTime())) {
            dayOfMonth = d.getDate();
          }
        }
        let weekIndex = 0;
        if (dayOfMonth <= 7) weekIndex = 0;
        else if (dayOfMonth <= 14) weekIndex = 1;
        else if (dayOfMonth <= 21) weekIndex = 2;
        else weekIndex = 3;
        weekTotalsMXN[weekIndex] += normalizedMonthly;

        const cycle = (p.billing_cycle || 'monthly').toLowerCase();
        if (cycle === 'yearly' || cycle === 'annual') {
          let renMonth = 0;
          if (renewalTarget) {
            const d = new Date(renewalTarget);
            if (!isNaN(d.getTime())) {
              renMonth = d.getMonth();
            }
          }
          monthTotalsMXN[renMonth] += costMXN;
        } else {
          for (let m = 0; m < 12; m++) {
            monthTotalsMXN[m] += normalizedMonthly;
          }
        }
      }
    } else if (status === 'paused') {
      pausedCount++;
      savedMonthlyMXN += normalizedMonthly;
    } else if (status === 'cancelled') {
      cancelledCount++;
      savedMonthlyMXN += normalizedMonthly;
    }
  });

  criticalRenewals.sort((a, b) => a.daysUntil - b.daysUntil);

  let topCategoryName: string | null = null;
  let maxCatTotal = -1;
  Object.entries(categoryTotals).forEach(([cat, total]) => {
    if (total > maxCatTotal) {
      maxCatTotal = total;
      topCategoryName = cat;
    }
  });

  let topCategory: TopCategorySummary | null = null;
  if (topCategoryName) {
    const catTotal = categoryTotals[topCategoryName] || 0;
    topCategory = {
      name: topCategoryName,
      count: categoryCounts[topCategoryName] || 0,
      monthlyMXN: catTotal,
      monthlyUSD: catTotal / usdRate,
      sharePercent: monthlyMXN > 0 ? Math.round((catTotal / monthlyMXN) * 100) : 0,
    };
  }

  let topService: TopServiceSummary | null = null;
  if (topServicePlatform && topServiceCost > 0) {
    topService = {
      platform: topServicePlatform,
      monthlyMXN: topServiceCost,
      monthlyUSD: topServiceCost / usdRate,
      sharePercent: monthlyMXN > 0 ? Math.round((topServiceCost / monthlyMXN) * 100) : 0,
    };
  }

  let lowestPaidService: LowestPaidServiceSummary | null = null;
  if (lowestPaidPlatform && lowestPaidCost !== Infinity) {
    lowestPaidService = {
      platform: lowestPaidPlatform,
      monthlyMXN: lowestPaidCost,
      monthlyUSD: lowestPaidCost / usdRate,
    };
  }

  let peakWeekIdx = 0;
  let lowestWeekIdx = 0;
  for (let i = 1; i < 4; i++) {
    if (weekTotalsMXN[i] > weekTotalsMXN[peakWeekIdx]) peakWeekIdx = i;
    if (weekTotalsMXN[i] < weekTotalsMXN[lowestWeekIdx]) lowestWeekIdx = i;
  }

  const peakWeek: WeekSummary = {
    week: weekLabels[peakWeekIdx],
    label: weekLabels[peakWeekIdx],
    rangeLabel: weekRanges[peakWeekIdx],
    totalMXN: weekTotalsMXN[peakWeekIdx],
    totalUSD: weekTotalsMXN[peakWeekIdx] / usdRate,
  };

  const lowestWeek: WeekSummary = {
    week: weekLabels[lowestWeekIdx],
    label: weekLabels[lowestWeekIdx],
    rangeLabel: weekRanges[lowestWeekIdx],
    totalMXN: weekTotalsMXN[lowestWeekIdx],
    totalUSD: weekTotalsMXN[lowestWeekIdx] / usdRate,
  };

  let peakMonthIdx = 0;
  let lowestMonthIdx = 0;
  for (let m = 1; m < 12; m++) {
    if (monthTotalsMXN[m] > monthTotalsMXN[peakMonthIdx]) peakMonthIdx = m;
    if (monthTotalsMXN[m] < monthTotalsMXN[lowestMonthIdx]) lowestMonthIdx = m;
  }

  const peakMonth: MonthSummary = {
    month: MONTH_NAMES[peakMonthIdx],
    monthName: MONTH_NAMES[peakMonthIdx],
    shortName: MONTH_SHORTS[peakMonthIdx],
    totalMXN: monthTotalsMXN[peakMonthIdx],
    totalUSD: monthTotalsMXN[peakMonthIdx] / usdRate,
  };

  const lowestMonth: MonthSummary = {
    month: MONTH_NAMES[lowestMonthIdx],
    monthName: MONTH_NAMES[lowestMonthIdx],
    shortName: MONTH_SHORTS[lowestMonthIdx],
    totalMXN: monthTotalsMXN[lowestMonthIdx],
    totalUSD: monthTotalsMXN[lowestMonthIdx] / usdRate,
  };

  const weeklyMXN = monthlyMXN / 4.33;
  const yearlyMXN = monthlyMXN * 12;
  const monthlyUSD = monthlyMXN / usdRate;
  const avgMonthlyPerActiveMXN = paidActiveCount > 0 ? monthlyMXN / paidActiveCount : 0;
  const avgMonthlyPerActiveUSD = paidActiveCount > 0 ? monthlyUSD / paidActiveCount : 0;

  return {
    activeCount,
    paidActiveCount,
    pausedCount,
    cancelledCount,
    pausedOrCancelledCount: pausedCount + cancelledCount,
    freeTrialCount,
    monthlyMXN,
    monthlyUSD,
    weeklyMXN,
    yearlyMXN,
    avgMonthlyPerActiveMXN,
    avgMonthlyPerActiveUSD,
    alreadySavedMonthlyMXN: savedMonthlyMXN,
    totalOptimizationPotentialYearlyMXN: savedMonthlyMXN * 12,
    usdRate,
    next30DaysTotalMXN,
    peakMonth,
    lowestMonth,
    peakWeek,
    lowestWeek,
    topCategory,
    topService,
    lowestPaidService,
    criticalRenewals,
  };
}

export function computeRealProfitAndRenewalsSummary(
  incomes: ClientIncome[] = [],
  renewals: DomainRenewal[] = [],
  fin: FinancialExecutiveSummary,
  usdRateInput?: number,
  expenses: OneTimeExpense[] = [],
  activeScope = 'all'
): RealProfitSummary {
  const usdRate = usdRateInput && usdRateInput > 0
    ? usdRateInput
    : fin?.usdRate && fin.usdRate > 0 ? fin.usdRate : 0;

  const filteredIncomes = incomes.filter(
    (i: any) => activeScope === 'all' || !i.scope || i.scope === 'all' || i.scope === activeScope
  );
  const filteredRenewals = renewals.filter(
    (r: any) => activeScope === 'all' || !r.scope || r.scope === 'all' || r.scope === activeScope
  );
  const filteredExpenses = expenses.filter(
    (e: any) => activeScope === 'all' || !e.scope || e.scope === 'all' || e.scope === activeScope
  );

  let monthIncomeMXN = 0;
  let pendingToCollectMXN = 0;
  let recurringRetainersMonthlyMXN = 0;

  filteredIncomes.forEach((inc: any) => {
    const raw = Number(inc.amount) || 0;
    const inMXN = inc.currency === 'USD' ? raw * usdRate : raw;
    const status = (inc.status || '').toLowerCase();

    if (status === 'paid') {
      monthIncomeMXN += inMXN;
      if (inc.category === 'retainer' || inc.is_recurring) {
        recurringRetainersMonthlyMXN += inMXN;
      }
    } else if (status === 'pending') {
      pendingToCollectMXN += inMXN;
    }
  });

  const weekIncomeMXN = monthIncomeMXN / 4.33;
  const yearIncomeMXN = monthIncomeMXN * 12;
  const monthIncomeUSD = monthIncomeMXN / usdRate;
  const weekIncomeUSD = weekIncomeMXN / usdRate;
  const yearIncomeUSD = yearIncomeMXN / usdRate;
  const pendingToCollectUSD = pendingToCollectMXN / usdRate;

  let variableMonthExpenseMXN = 0;
  filteredExpenses.forEach((exp: any) => {
    const raw = Number(exp.amount) || 0;
    const inMXN = exp.currency === 'USD' ? raw * usdRate : raw;
    variableMonthExpenseMXN += inMXN;
  });

  const variableMonthExpenseUSD = variableMonthExpenseMXN / usdRate;
  const variableWeekExpenseMXN = variableMonthExpenseMXN / 4.33;
  const variableYearExpenseMXN = variableMonthExpenseMXN * 12;
  const variableYearExpenseUSD = variableYearExpenseMXN / usdRate;

  const fixedMonthlyExpenseMXN = fin?.monthlyMXN || 0;
  const fixedWeeklyExpenseMXN = fin?.weeklyMXN || 0;
  const fixedYearlyExpenseMXN = fin?.yearlyMXN || 0;

  const totalMonthlyExpenseMXN = fixedMonthlyExpenseMXN + variableMonthExpenseMXN;
  const totalMonthlyExpenseUSD = totalMonthlyExpenseMXN / usdRate;
  const totalWeeklyExpenseMXN = totalMonthlyExpenseMXN / 4.33;
  const totalWeeklyExpenseUSD = totalWeeklyExpenseMXN / usdRate;
  const totalYearlyExpenseMXN = totalMonthlyExpenseMXN * 12;
  const totalYearlyExpenseUSD = totalYearlyExpenseMXN / usdRate;

  const netMonthMXN = monthIncomeMXN - totalMonthlyExpenseMXN;
  const netMonthUSD = monthIncomeUSD - totalMonthlyExpenseUSD;
  const netWeekMXN = weekIncomeMXN - totalWeeklyExpenseMXN;
  const netWeekUSD = weekIncomeUSD - totalWeeklyExpenseUSD;
  const netYearMXN = yearIncomeMXN - totalYearlyExpenseMXN;
  const netYearUSD = yearIncomeUSD - totalYearlyExpenseUSD;

  let activeRenewalsCount = 0;
  let clientRenewalsYearlyMXN = 0;
  let myRenewalsYearlyMXN = 0;
  const expiringSoonRenewals: ExpiringRenewalItem[] = [];

  filteredRenewals.forEach((r: any) => {
    activeRenewalsCount++;
    const cost = Number(r.renewal_cost) || 0;
    const costMXN = r.currency === 'USD' ? cost * usdRate : cost;
    const paidBy = (r.paid_by || '').toLowerCase();

    if (paidBy === 'client') {
      clientRenewalsYearlyMXN += costMXN;
    } else {
      myRenewalsYearlyMXN += costMXN;
    }

    const daysRemaining =
      r.days_remaining !== undefined ? Number(r.days_remaining) : calculateDaysUntil(r.renewal_date);

    if (daysRemaining <= 30) {
      expiringSoonRenewals.push({
        id: r.id,
        domain_or_service: r.domain_or_service || r.domain || r.name || 'Servicio',
        client_name: r.client_name || 'Cliente',
        days_remaining: daysRemaining,
        renewal_cost: cost,
        currency: r.currency || 'MXN',
        ...r,
      });
    }
  });

  expiringSoonRenewals.sort((a, b) => a.days_remaining - b.days_remaining);

  return {
    activeRenewalsCount,
    clientRenewalsYearlyMXN,
    expiringSoonRenewals,
    fixedMonthlyExpenseMXN,
    fixedWeeklyExpenseMXN,
    fixedYearlyExpenseMXN,
    monthIncomeMXN,
    monthIncomeUSD,
    myRenewalsYearlyMXN,
    netMonthMXN,
    netMonthUSD,
    netWeekMXN,
    netWeekUSD,
    netYearMXN,
    netYearUSD,
    pendingToCollectMXN,
    pendingToCollectUSD,
    recurringRetainersMonthlyMXN,
    totalMonthlyExpenseMXN,
    totalMonthlyExpenseUSD,
    totalWeeklyExpenseMXN,
    totalWeeklyExpenseUSD,
    totalYearlyExpenseMXN,
    totalYearlyExpenseUSD,
    variableMonthExpenseMXN,
    variableMonthExpenseUSD,
    variableWeekExpenseMXN,
    variableYearExpenseMXN,
    variableYearExpenseUSD,
    weekIncomeMXN,
    weekIncomeUSD,
    yearIncomeMXN,
    yearIncomeUSD,
  };
}
