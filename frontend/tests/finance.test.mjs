import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({
  entryPoints: ['src/lib/financeUtils.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
});
const source = Buffer.from(compiled.outputFiles[0].contents).toString('base64');
const { computeFinancialExecutiveSummary } = await import(`data:text/javascript;base64,${source}`);

test('el calendario conserva la tarjeta y proyecta las mensualidades en USD convertidas a MXN', async () => {
  const { outputFiles } = await build({
    entryPoints: ['src/lib/cashflowForecast.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
  });
  const { projectCashflow90Days } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
  const forecast = projectCashflow90Days({
    today: new Date('2026-11-17T00:00:00Z'), usdRate: 20,
    platforms: [], incomes: [], renewals: [],
    expenses: [{
      id: 'expense-test', concept: 'Servicio mensual ficticio', currency: 'USD', amount: 12.5,
      expense_date: '2026-11-20', recurrence_cycle: 'monthly', payment_method_id: 'card-test',
    }],
  });
  assert.deepEqual(forecast.events.map(({ date }) => date), ['2026-11-20', '2026-12-20', '2027-01-20']);
  for (const event of forecast.events) {
    assert.equal(event.amountMXN, 250);
    assert.equal(event.amountMXN / 20, 12.5);
    assert.equal(event.paymentMethodId, 'card-test');
  }
});

test('una renovación del primer día del mes pertenece al mes indicado en Tijuana', () => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = 'America/Tijuana';
  try {
    const summary = computeFinancialExecutiveSummary([{
      id: '1', name: 'Servicio anual', subscription_status: 'active',
      subscription_cost: 1200, currency: 'MXN', billing_cycle: 'yearly',
      renewal_date: '2027-01-01',
    }], [], 20);
    assert.equal(summary.peakMonth.monthName, 'Enero');
    assert.equal(summary.peakWeek.label, 'Semana 1');
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test('el resumen usa los estados reales de la API y no cobra las pruebas gratuitas', () => {
  const items = [
    { id: '1', name: 'Servicio activo', subscription_status: 'active', subscription_cost: 100, currency: 'MXN', billing_cycle: 'monthly' },
    { id: '2', name: 'Servicio pausado', subscription_status: 'paused', subscription_cost: 50, currency: 'MXN', billing_cycle: 'monthly' },
    { id: '3', name: 'Prueba gratuita', subscription_status: 'free_trial', subscription_cost: 200, currency: 'MXN', billing_cycle: 'monthly' },
  ];
  const summary = computeFinancialExecutiveSummary(items, [], 20, 'all', []);
  assert.equal(summary.activeCount, 2);
  assert.equal(summary.paidActiveCount, 1);
  assert.equal(summary.pausedCount, 1);
  assert.equal(summary.freeTrialCount, 1);
  assert.equal(summary.monthlyMXN, 100);
  assert.equal(summary.alreadySavedMonthlyMXN, 50);
});

test('el resumen convierte suscripciones en dólares con la tasa proporcionada', () => {
  const items = [{ id: '1', name: 'Servicio ficticio', subscription_status: 'active', subscription_cost: 10, currency: 'USD', billing_cycle: 'monthly' }];
  const summary = computeFinancialExecutiveSummary(items, [], 20, 'all', []);
  assert.equal(summary.monthlyMXN, 200);
  assert.equal(summary.monthlyUSD, 10);
});
