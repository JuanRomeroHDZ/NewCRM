import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const storage = (values) => ({ getItem: (key) => values[key] || null, setItem() {}, removeItem() {} });
globalThis.localStorage = storage({ emailsaver_vault_token: 'vault-token' });
globalThis.sessionStorage = storage({ emailsaver_user_token: 'owner-token' });
globalThis.window = { location: { protocol: 'https:', host: 'lessso.local' } };
const compiled = await build({ entryPoints: ['src/lib/c2Api.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
  define: { 'import.meta.env.VITE_API_BASE_URL': '"/api/v1"' } });
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);

test('el canal C2 incluye la sesión de propietario y la bóveda', () => {
  const url = new URL(api.buildC2WsUrl());
  assert.equal(url.protocol, 'wss:');
  assert.equal(url.pathname, '/api/v1/c2/ws');
  assert.equal(url.search, '');
  assert.deepEqual(api.buildC2WsProtocols(), ['lessso-v1', 'vault.vault-token', 'user.owner-token']);
});

test('la comprobación del servicio conserva ambas autorizaciones', async () => {
  let call;
  globalThis.fetch = async (url, options) => {
    call = { url, options };
    return new Response(JSON.stringify({ state: 'running', detail: '' }), { status: 200 });
  };
  assert.equal((await api.getService()).state, 'running');
  assert.equal(call.url, '/api/v1/c2/service');
  assert.equal(call.options.headers.Authorization, 'Bearer owner-token');
  assert.equal(call.options.headers['X-Vault-Token'], 'vault-token');
});
