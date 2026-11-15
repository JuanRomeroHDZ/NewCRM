import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['src/lib/c2SessionGuard.ts'], bundle: true, format: 'esm', platform: 'node', write: false });
const { createC2SessionGuard } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);

test('los resultados de una sesión anterior no actualizan la nueva sesión', async () => {
  const guard = createC2SessionGuard(true);
  const isCurrent = guard.capture();
  let resolve;
  const response = new Promise((done) => { resolve = done; });
  const visible = [];
  const pending = response.then((value) => { if (isCurrent()) visible.push(value); });
  guard.update(false);
  guard.update(true);
  resolve('respuesta antigua');
  await pending;
  assert.deepEqual(visible, []);
  assert.equal(guard.capture()(), true);
  guard.update(false);
  assert.equal(guard.capture()(), false);
});
