import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const built = await build({
  entryPoints: ['src/lib/writeupEditLeaseClient.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const leaseClient = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);

function createSessionStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('editor client identity survives a remount in the same tab storage', () => {
  const sessionStorage = createSessionStorage();
  const beforeReload = leaseClient.getWriteupEditClientId(sessionStorage);
  const afterReload = leaseClient.getWriteupEditClientId(sessionStorage);

  assert.match(beforeReload, /^writeup-[A-Za-z0-9_-]{16,96}$/);
  assert.equal(afterReload, beforeReload);
});

test('separate browser tabs keep separate editor client identities', () => {
  const firstTabStorage = createSessionStorage();
  const secondTabStorage = createSessionStorage();

  assert.notEqual(
    leaseClient.getWriteupEditClientId(firstTabStorage),
    leaseClient.getWriteupEditClientId(secondTabStorage),
  );
});

test('malformed stored client IDs are replaced with a fresh valid identity', () => {
  const sessionStorage = createSessionStorage({ lessso_writeup_edit_client_id_v1: '1 nodo' });
  const clientId = leaseClient.getWriteupEditClientId(sessionStorage);

  assert.match(clientId, /^writeup-[A-Za-z0-9_-]{16,96}$/);
  assert.notEqual(clientId, '1 nodo');
});
