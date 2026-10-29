import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({
  entryPoints: ['src/lib/financeUtils.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
});
const source = Buffer.from(compiled.outputFiles[0].contents).toString('base64');
const { computeFinancialExecutiveSummary } = await import(`data:text/javascript;base64,${source}`);

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
