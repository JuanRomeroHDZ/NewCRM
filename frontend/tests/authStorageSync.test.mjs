import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const makeStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
};

globalThis.localStorage = makeStorage();
globalThis.sessionStorage = makeStorage();
const listeners = new Map();
const dispatched = [];
globalThis.window = {
  location: { protocol: 'https:', host: 'test.local' },
  addEventListener: (type, listener) => listeners.set(type, listener),
  dispatchEvent: (event) => { dispatched.push(event); return true; },
};
globalThis.CustomEvent = class {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
};

const compiled = await build({
  stdin: {
    contents: "export * from './src/lib/api';",
    resolveDir: process.cwd(),
    sourcefile: 'auth-storage-sync-test-entry.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  define: { 'import.meta.env.VITE_API_BASE_URL': '"/api/v1"' },
});
const apiClient = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);

test('el token de bóveda sigue los cambios de localStorage de otras pestañas', () => {
  const onStorage = listeners.get('storage');
  assert.equal(typeof onStorage, 'function');

  globalThis.localStorage.setItem('emailsaver_vault_token', 'unlocked-in-another-tab');
  onStorage({ storageArea: globalThis.localStorage, key: 'emailsaver_vault_token', newValue: 'unlocked-in-another-tab' });
  assert.equal(apiClient.getApiVaultToken(), 'unlocked-in-another-tab');
  assert.equal(dispatched.at(-1).type, 'vault_token_changed');
  assert.equal(dispatched.at(-1).detail.token, 'unlocked-in-another-tab');

  globalThis.localStorage.removeItem('emailsaver_vault_token');
  onStorage({ storageArea: globalThis.localStorage, key: 'emailsaver_vault_token', newValue: null });
  assert.equal(apiClient.getApiVaultToken(), null);
  assert.equal(dispatched.at(-1).type, 'vault_token_changed');
  assert.equal(dispatched.at(-1).detail.token, null);
});

test('ignora cambios de almacenamiento ajenos al token de bóveda', () => {
  const onStorage = listeners.get('storage');
  apiClient.setApiVaultToken(null);
  dispatched.length = 0;
  onStorage({ storageArea: globalThis.localStorage, key: 'unrelated-setting', newValue: 'value' });
  onStorage({ storageArea: makeStorage(), key: 'emailsaver_vault_token', newValue: 'foreign-token' });
  assert.equal(apiClient.getApiVaultToken(), null);
  assert.deepEqual(dispatched, []);
});
