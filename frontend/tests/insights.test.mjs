import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function loadModule(entryPoint) {
  const compiled = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false });
  const source = Buffer.from(compiled.outputFiles[0].contents).toString('base64');
  return import(`data:text/javascript;base64,${source}`);
}

const { projectCashflow90Days } = await loadModule('src/lib/cashflowForecast.ts');
const { correlateWriteup } = await loadModule('src/lib/writeupCorrelations.ts');

test('la previsión avanza cargos mensuales atrasados y suma cobros recurrentes sin mover fechas del ciclo', () => {
  const forecast = projectCashflow90Days({
    today: new Date('2026-01-31T12:00:00Z'),
    usdRate: 20,
    activeScope: 'all',
    platforms: [{ id: 'tool', name: 'Herramienta', scope: 'business', subscription_status: 'active', subscription_cost: 100, currency: 'MXN', billing_cycle: 'monthly', next_billing_date: '2025-12-31' }],
    incomes: [{ id: 'income', client_name: 'Cliente', concept: 'Iguala', scope: 'business', amount: 200, currency: 'MXN', status: 'cobrado', is_recurring: true, received_date: '2026-01-15', is_deleted: false }],
    renewals: [],
    expenses: [],
  });

  assert.deepEqual(forecast.events.filter((event) => event.kind === 'subscription').map((event) => event.date), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(forecast.events.filter((event) => event.kind === 'income').map((event) => event.date), ['2026-02-15', '2026-03-15', '2026-04-15']);
  assert.equal(forecast.outflow90MXN, 400);
  assert.equal(forecast.inflow90MXN, 600);
});

test('la previsión omite monedas sin cotización compatible y gastos que ya ocurrieron', () => {
  const forecast = projectCashflow90Days({
    today: new Date('2026-01-01T00:00:00Z'),
    platforms: [], incomes: [], renewals: [],
    expenses: [
      { id: 'future-usd', concept: 'USD sin tasa', amount: 10, currency: 'USD', expense_date: '2026-01-02', scope: 'business', is_deleted: false },
      { id: 'past-mxn', concept: 'Ya pagado', amount: 50, currency: 'MXN', expense_date: '2025-12-31', scope: 'business', is_deleted: false },
    ],
  });

  assert.equal(forecast.events.length, 0);
  assert.equal(forecast.excludedCurrencyCount, 1);
});

test('la ventana de 90 días no cuenta el día 91 y omite pruebas vencidas sin siguiente cobro', () => {
  const forecast = projectCashflow90Days({
    today: new Date('2026-01-01T00:00:00Z'),
    platforms: [
      { id: 'trial', name: 'Prueba vencida', scope: 'business', subscription_status: 'free_trial', subscription_cost: 100, currency: 'MXN', billing_cycle: 'monthly', trial_end_date: '2025-12-01' },
    ],
    incomes: [], renewals: [],
    expenses: [
      { id: 'inside', concept: 'Dentro del plazo', amount: 10, currency: 'MXN', expense_date: '2026-03-31', scope: 'business', is_deleted: false },
      { id: 'outside', concept: 'Día 91', amount: 20, currency: 'MXN', expense_date: '2026-04-01', scope: 'business', is_deleted: false },
    ],
  });

  assert.deepEqual(forecast.events.map((event) => event.date), ['2026-03-31']);
  assert.equal(forecast.outflow90MXN, 10);
});

test('las correlaciones priorizan CVE, CWE y activo compartido y descartan etiquetas genéricas', () => {
  const current = {
    id: 'current', title: 'Informe actual', tags: ['Linux', 'HTB'], cve_id: null, cwe_id: null,
    target_scope: 'https://10.10.10.5:8443/servicio', findings: [
      { id: 'f1', cve_id: 'CVE-2024-12345', cwe_id: 'CWE-79' },
    ],
  };
  const reports = [
    { id: 'match', title: 'Coincidencia técnica', tags: ['Linux', 'HTB'], cve_id: 'CVE-2024-12345', cwe_id: 'CWE-79', target_scope: '10.10.10.5', updated_at: '2026-01-01' },
    { id: 'generic', title: 'Solo etiqueta genérica', tags: ['Linux', 'HTB'], cve_id: null, cwe_id: null, target_scope: null, updated_at: '2026-01-02' },
  ];

  const matches = correlateWriteup(current, reports);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].report.id, 'match');
  assert.equal(matches[0].strength, 240);
  assert.equal(matches[0].evidence, 'technical');
  assert.deepEqual(matches[0].reasons, ['Mismo CVE: CVE-2024-12345', 'Misma clase: CWE-79', 'Mismo activo: 10.10.10.5']);
});

test('las correlaciones usan los vínculos seleccionados en el borrador antes de guardar', () => {
  const current = { id: 'current', title: 'Actual', tags: [], findings: [], project_id: null, prospect_id: null, engagement_id: null };
  const reports = [
    { id: 'linked', title: 'Otro informe', project_id: 'project-1', prospect_id: 'prospect-1', engagement_id: null, tags: [], updated_at: '2026-01-01' },
  ];

  const matches = correlateWriteup(current, reports, { projectId: 'project-1', prospectId: 'prospect-1' });
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].reasons, ['Mismo proyecto', 'Mismo cliente o prospecto']);
  assert.equal(matches[0].evidence, 'context');
});
