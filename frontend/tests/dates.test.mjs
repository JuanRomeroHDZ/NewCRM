import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['src/lib/dates.ts'], bundle: true, format: 'esm', platform: 'node', write: false });
const { parseApiDate, formatApiDateTime } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);

test('API dates without a zone are UTC and explicit offsets are preserved', () => {
  assert.equal(parseApiDate('2026-11-15T06:27:00').toISOString(), '2026-11-15T06:27:00.000Z');
  assert.equal(parseApiDate('2026-11-14T22:27:00-08:00').toISOString(), '2026-11-15T06:27:00.000Z');
  assert.equal(parseApiDate('2026-11-15T06:27:00.123Z').toISOString(), '2026-11-15T06:27:00.123Z');
  const originalTimezone = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    assert.equal(formatApiDateTime('2026-11-15T06:27:00', 'en-US'), '11/14/2026, 10:27:00 PM');
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
  assert.equal(formatApiDateTime('invalid'), 'Fecha no disponible');
});
