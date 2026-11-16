import type { ClientIncome, DomainRenewal, OneTimeExpense, PlatformAccount, ScopeFilter } from '../types';

export type ForecastKind = 'income' | 'subscription' | 'renewal' | 'expense';

export interface ForecastEvent {
  id: string;
  date: string;
  title: string;
  amountMXN: number;
  direction: 'inflow' | 'outflow';
  kind: ForecastKind;
  estimated: boolean;
}

export interface CashflowForecast {
  events: ForecastEvent[];
  inflow30MXN: number;
  outflow30MXN: number;
  inflow60MXN: number;
  outflow60MXN: number;
  inflow90MXN: number;
  outflow90MXN: number;
  excludedCurrencyCount: number;
  undatedRecurringCount: number;
}

const DAY_MS = 86_400_000;
const FORECAST_DAYS = 90;

function parseDate(value?: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const datePart = value.slice(0, 10);
  const parsed = new Date(`${datePart}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== datePart ? null : parsed;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonthOffset(date: Date, offset: number, anchorDay = date.getUTCDate()): Date {
  const monthIndex = date.getUTCFullYear() * 12 + date.getUTCMonth() + offset;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchorDay, lastDay)));
}

function addYearOffset(date: Date, offset: number, anchorDay = date.getUTCDate(), anchorMonth = date.getUTCMonth()): Date {
  const year = date.getUTCFullYear() + offset;
  const lastDay = new Date(Date.UTC(year, anchorMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, anchorMonth, Math.min(anchorDay, lastDay)));
}

function nextCycle(date: Date, cycle: string, anchorDay = date.getUTCDate(), anchorMonth = date.getUTCMonth()): Date | null {
  const normalized = cycle.toLowerCase();
  if (normalized === 'daily') return new Date(date.getTime() + DAY_MS);
  if (normalized === 'weekly') return new Date(date.getTime() + 7 * DAY_MS);
  if (normalized === 'monthly') return addMonthOffset(date, 1, anchorDay);
  if (normalized === 'yearly' || normalized === 'annual') {
    return addYearOffset(date, 1, anchorDay, anchorMonth);
  }
  return null;
}

function firstOnOrAfter(date: Date, today: Date, cycle: string): Date {
  if (date >= today) return date;
  const normalized = cycle.toLowerCase();
  const daysBehind = Math.ceil((today.getTime() - date.getTime()) / DAY_MS);
  if (normalized === 'daily') return new Date(date.getTime() + daysBehind * DAY_MS);
  if (normalized === 'weekly') return new Date(date.getTime() + Math.ceil(daysBehind / 7) * 7 * DAY_MS);
  if (normalized === 'monthly') {
    const monthOffset = Math.max(0, (today.getUTCFullYear() - date.getUTCFullYear()) * 12 + today.getUTCMonth() - date.getUTCMonth());
    let occurrence = addMonthOffset(date, monthOffset, date.getUTCDate());
    if (occurrence < today) occurrence = addMonthOffset(date, monthOffset + 1, date.getUTCDate());
    return occurrence;
  }
  if (normalized === 'yearly' || normalized === 'annual') {
    const yearOffset = Math.max(0, today.getUTCFullYear() - date.getUTCFullYear());
    let occurrence = addYearOffset(date, yearOffset, date.getUTCDate(), date.getUTCMonth());
    if (occurrence < today) occurrence = addYearOffset(date, yearOffset + 1, date.getUTCDate(), date.getUTCMonth());
    return occurrence;
  }
  return date;
}

function amountToMXN(amount: number, currency: string, usdRate: number): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (currency === 'MXN') return amount;
  if (currency === 'USD' && usdRate > 0) return amount * usdRate;
  return null;
}

function inScope(scope: string | undefined, activeScope: ScopeFilter): boolean {
  return activeScope === 'all' || !scope || scope === 'shared' || scope === activeScope;
}

export function projectCashflow90Days(
  input: {
    platforms: PlatformAccount[];
    incomes: ClientIncome[];
    renewals: DomainRenewal[];
    expenses: OneTimeExpense[];
    usdRate?: number;
    activeScope?: ScopeFilter;
    today?: Date;
  }
): CashflowForecast {
  const { platforms, incomes, renewals, expenses } = input;
  const usdRate = input.usdRate ?? 0;
  const activeScope = input.activeScope ?? 'all';
  const today = input.today
    ? new Date(Date.UTC(input.today.getUTCFullYear(), input.today.getUTCMonth(), input.today.getUTCDate()))
    : (() => { const now = new Date(); return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())); })();
  const end = new Date(today.getTime() + (FORECAST_DAYS - 1) * DAY_MS);
  const events: ForecastEvent[] = [];
  let excludedCurrencyCount = 0;
  let undatedRecurringCount = 0;
  let sequence = 0;

  const addEvent = (date: Date, title: string, amount: number, currency: string, kind: ForecastKind, direction: 'inflow' | 'outflow', estimated: boolean) => {
    if (date < today || date > end) return;
    const amountMXN = amountToMXN(amount, currency, usdRate);
    if (amountMXN === null) {
      excludedCurrencyCount += 1;
      return;
    }
    if (amountMXN <= 0) return;
    events.push({ id: `${kind}-${sequence++}`, date: toDateString(date), title, amountMXN, direction, kind, estimated });
  };

  platforms.forEach((platform) => {
    if (!inScope(platform.scope, activeScope) || !['active', 'free_trial'].includes(platform.subscription_status)) return;
    const amount = Number(platform.subscription_cost) || 0;
    if (amount <= 0 || !['daily', 'weekly', 'monthly', 'yearly', 'annual'].includes(platform.billing_cycle)) return;
    const nextBillingDate = parseDate(platform.next_billing_date);
    const trialEndDate = parseDate(platform.trial_end_date);
    const dueDate = platform.subscription_status === 'free_trial'
      ? nextBillingDate || trialEndDate
      : nextBillingDate;
    if (!dueDate) { undatedRecurringCount += 1; return; }
    if (platform.subscription_status === 'free_trial' && dueDate < today && (!nextBillingDate || nextBillingDate < today)) return;
    let occurrence = firstOnOrAfter(dueDate, today, platform.billing_cycle);
    const anchorDay = dueDate.getUTCDate();
    const anchorMonth = dueDate.getUTCMonth();
    for (let i = 0; i < 370 && occurrence <= end; i += 1) {
      if (occurrence >= today) {
        addEvent(occurrence, platform.subscription_status === 'free_trial' ? `${platform.name} · termina la prueba` : platform.name, amount, platform.currency, 'subscription', 'outflow', occurrence > dueDate);
      }
      const next = nextCycle(occurrence, platform.billing_cycle, anchorDay, anchorMonth);
      if (!next || next <= occurrence) break;
      occurrence = next;
    }
  });

  incomes.forEach((income) => {
    if (income.is_deleted || !inScope(income.scope, activeScope)) return;
    const amount = Number(income.amount) || 0;
    const anchor = parseDate(income.received_date);
    if (income.status === 'pendiente' && anchor && anchor >= today) {
      addEvent(anchor, `${income.client_name} · ${income.concept}`, amount, income.currency, 'income', 'inflow', false);
    }
    if (!income.is_recurring || !anchor) return;
    const anchorDay = anchor.getUTCDate();
    let occurrence = firstOnOrAfter(nextCycle(anchor, 'monthly', anchorDay) || end, today, 'monthly');
    for (let guard = 0; occurrence <= end && guard < 4; occurrence = addMonthOffset(occurrence, 1, anchorDay), guard += 1) {
      addEvent(occurrence, `${income.client_name} · ${income.concept}`, amount, income.currency, 'income', 'inflow', true);
    }
  });

  renewals.forEach((renewal) => {
    if (renewal.is_deleted || renewal.status !== 'activo' || !inScope(renewal.scope, activeScope)) return;
    const date = parseDate(renewal.renewal_date);
    if (!date) return;
    const isClientPaid = renewal.paid_by === 'client';
    const amount = isClientPaid ? Number(renewal.client_charge_amount) || 0 : Number(renewal.renewal_cost) || 0;
    if (!amount) return;
    const cycle = renewal.billing_cycle === 'monthly' ? 'monthly' : 'yearly';
    let occurrence = firstOnOrAfter(date, today, renewal.billing_cycle === 'monthly' ? 'monthly' : 'yearly');
    const anchorDay = date.getUTCDate();
    const anchorMonth = date.getUTCMonth();
    for (let i = 0; i < 5 && occurrence <= end; i += 1) {
      if (occurrence >= today) {
        addEvent(occurrence, `${renewal.domain_or_service} · ${isClientPaid ? 'cobro al cliente' : 'renovación'}`, amount, renewal.currency, 'renewal', isClientPaid ? 'inflow' : 'outflow', occurrence > date);
      }
      const next = nextCycle(occurrence, cycle, anchorDay, anchorMonth);
      if (!next || next <= occurrence) break;
      occurrence = next;
    }
  });

  expenses.forEach((expense) => {
    if (expense.is_deleted || !inScope(expense.scope, activeScope)) return;
    const date = parseDate(expense.expense_date);
    if (date && date >= today) addEvent(date, expense.concept, Number(expense.amount) || 0, expense.currency, 'expense', 'outflow', false);
  });

  events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  const totalsTo = (days: number, kind: 'income' | 'outflow') => events
    .filter((event) => (new Date(`${event.date}T00:00:00.000Z`).getTime() - today.getTime()) / DAY_MS < days)
    .filter((event) => kind === 'income' ? event.direction === 'inflow' : event.direction === 'outflow')
    .reduce((total, event) => total + event.amountMXN, 0);

  return {
    events,
    inflow30MXN: totalsTo(30, 'income'),
    outflow30MXN: totalsTo(30, 'outflow'),
    inflow60MXN: totalsTo(60, 'income'),
    outflow60MXN: totalsTo(60, 'outflow'),
    inflow90MXN: totalsTo(90, 'income'),
    outflow90MXN: totalsTo(90, 'outflow'),
    excludedCurrencyCount,
    undatedRecurringCount,
  };
}
