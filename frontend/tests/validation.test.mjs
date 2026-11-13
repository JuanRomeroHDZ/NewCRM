import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function loadModule(entryPoint, define = {}) {
  const compiled = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    define,
  });
  const source = Buffer.from(compiled.outputFiles[0].contents).toString('base64');
  return import(`data:text/javascript;base64,${source}`);
}

const validation = await loadModule('src/lib/validation.ts');
const prospectUtils = await loadModule('src/lib/prospectUtils.ts', {
  'import.meta.env.VITE_WHATSAPP_SHARE_BASE_URL': '"https://wa.me"',
});

test('isValidPhoneList valida teléfonos individuales y múltiples separados por coma', () => {
  assert.equal(validation.isValidPhoneList(''), false);
  assert.equal(validation.isValidPhoneList('+52 664 123 4567, 664-987-6543'), true);
  assert.equal(validation.isValidPhoneList('+52 664 123 4567, abc'), false);
  assert.equal(validation.isValidPhoneList('123'), false);
});

test('isValidCalendarDate rechaza fechas imposibles como 30 de febrero o 31 de abril', () => {
  assert.equal(validation.isValidCalendarDate('2026-02-28'), true);
  assert.equal(validation.isValidCalendarDate('2024-02-29'), true);
  assert.equal(validation.isValidCalendarDate('2026-02-29'), false);
  assert.equal(validation.isValidCalendarDate('2026-02-30'), false);
  assert.equal(validation.isValidCalendarDate('2026-04-31'), false);
  assert.equal(validation.isValidCalendarDate('2026-13-01'), false);
});

test('validateServiceDatesOrder valida fechas válidas y detecta inicio posterior a renovación o prueba', () => {
  assert.equal(validation.validateServiceDatesOrder('2026-01-10', '2026-02-10', ''), null);
  assert.ok(validation.validateServiceDatesOrder('2026-03-10', '2026-02-10', ''));
  assert.ok(validation.validateServiceDatesOrder('2026-03-10', '', '2026-02-15'));
  assert.ok(validation.validateServiceDatesOrder('2026-02-30', '2026-03-01', ''));
});

test('validateCardFields exige consistencia entre número completo, últimos 4 dígitos y expiración', () => {
  assert.equal(validation.validateCardFields('', '4242', '08', '28'), null);
  assert.equal(validation.validateCardFields('4111 1111 1111 4242', '4242', '08', '28'), null);
  assert.ok(validation.validateCardFields('4111111111114242', '9999', '08', '28'));
  assert.ok(validation.validateCardFields('4111111114', '1114', '08', '28'));
  assert.ok(validation.validateCardFields('', '4242', '08', ''));
});

test('buildWhatsAppUrl sanitiza el teléfono y respeta la URL base configurada', () => {
  assert.equal(
    prospectUtils.buildWhatsAppUrl('+52 (664) 123-4567', undefined, undefined, 'Hola'),
    'https://wa.me/526641234567?text=Hola'
  );
  assert.equal(
    prospectUtils.buildWhatsAppUrl('526641234567', undefined, undefined, 'Test', 'https://custom.wa.example'),
    'https://custom.wa.example/526641234567?text=Test'
  );
});
