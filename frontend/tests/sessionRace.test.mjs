import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const events = [];
globalThis.window = { location: { protocol: 'https:', host: 'test.local' }, dispatchEvent: (event) => events.push(event.type) };
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
const compiled = await build({ stdin: { contents: "export * from './src/lib/api'; export {c2Api} from './src/lib/c2Api';", resolveDir: process.cwd(), sourcefile: 'test-entry.ts' }, bundle: true, format: 'esm', platform: 'node', write: false, define: { 'import.meta.env.VITE_API_BASE_URL': '"/api/v1"' } });
const client = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);

test('un 401 tardío no invalida una sesión de bóveda o usuario renovada', async () => {
  for (const [oldToken, newToken, setter, getter, request] of [
    ['old-vault', 'new-vault', client.setApiVaultToken, client.getApiVaultToken, () => client.api.getEmails()],
    ['old-user', 'new-user', client.setApiUserToken, client.getApiUserToken, () => client.api.getCurrentUser()],
    ['old-c2-vault', 'new-c2-vault', client.setApiVaultToken, client.getApiVaultToken, () => client.c2Api.getService()],
  ]) {
    events.length = 0;
    setter(oldToken);
    let finish;
    globalThis.fetch = () => new Promise((resolve) => { finish = resolve; });
    const pending = request();
    setter(newToken);
    finish(new Response('', { status: 401 }));
    await assert.rejects(pending);
    assert.equal(getter(), newToken);
    assert.deepEqual(events, []);
  }
});

test('un 401 de la sesión actual sigue invalidándola', async () => {
  events.length = 0;
  client.setApiVaultToken('current-vault');
  globalThis.fetch = async () => new Response('', { status: 401 });
  await assert.rejects(client.c2Api.getService());
  assert.equal(client.getApiVaultToken(), null);
  assert.deepEqual(events, ['vault_locked']);
});
