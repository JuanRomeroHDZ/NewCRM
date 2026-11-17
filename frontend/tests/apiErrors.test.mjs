import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function loadApiErrors() {
  const compiled = await build({
    entryPoints: ['src/lib/apiErrors.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  const source = Buffer.from(compiled.outputFiles[0].contents).toString('base64');
  return import(`data:text/javascript;base64,${source}`);
}

async function loadApiClient() {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const compiled = await build({
    entryPoints: ['src/lib/api.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    define: { 'import.meta.env.VITE_API_BASE_URL': '"/api/v1"' },
  });
  const source = Buffer.from(compiled.outputFiles[0].contents).toString('base64');
  return import(`data:text/javascript;base64,${source}`);
}

const apiErrors = await loadApiErrors();
const apiClient = await loadApiClient();

test('normaliza el fallo de conexión sin exponer el mensaje del navegador', () => {
  const error = apiErrors.normalizeTransportError(new TypeError('Failed to fetch'));
  assert.equal(error.code, 'network');
  assert.equal(error.retryable, true);
  assert.match(error.message, /No se pudo conectar con LESSSO/);
  assert.doesNotMatch(error.message, /Failed to fetch/i);
});

test('distingue tiempos de espera y cancelaciones', () => {
  const timeout = apiErrors.normalizeTransportError({ name: 'TimeoutError' });
  const aborted = apiErrors.normalizeTransportError({ name: 'AbortError' });
  assert.equal(timeout.code, 'timeout');
  assert.match(timeout.message, /tardó demasiado/);
  assert.equal(aborted.code, 'aborted');
  assert.equal(aborted.retryable, false);
});

test('oculta detalles internos de respuestas 5xx', () => {
  const error = apiErrors.createHttpApiError(500, '/finances', { detail: 'password_hash: secret / SQL traceback' }, false);
  assert.match(error.message, /servidor no pudo completar la solicitud/);
  assert.doesNotMatch(error.message, /password_hash|secret|SQL traceback/);
});

test('no expone detalles de servidor en respuestas de validación', () => {
  const validation = apiErrors.createHttpApiError(422, '/prospects', false);
  const badRequest = apiErrors.createHttpApiError(400, '/prospects', false);
  assert.match(validation.message, /Revisa los datos ingresados/);
  assert.match(badRequest.message, /Revisa los datos ingresados/);
  assert.doesNotMatch(validation.message, /value error|SQL|traceback/i);
});

test('separa el acceso de bóveda de sesiones de usuario vencidas', () => {
  const vaultError = apiErrors.createHttpApiError(401, '/prospects', false);
  const userError = apiErrors.createHttpApiError(401, '/users', true);
  const loginError = apiErrors.createHttpApiError(401, '/auth/login', true);
  const unlockError = apiErrors.createHttpApiError(401, '/auth/unlock', false);
  assert.match(vaultError.message, /La bóveda se bloqueó/);
  assert.match(userError.message, /sesión de usuario terminó/);
  assert.match(loginError.message, /usuario, la contraseña o el código/);
  assert.match(unlockError.message, /contraseña de acceso no es correcta/);
});

test('las consultas de la API convierten fallos de red en mensajes recuperables', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  try {
    await assert.rejects(apiClient.api.getEmails(), (error) => {
      assert.equal(error.code, 'network');
      assert.match(error.message, /No se pudo conectar con LESSSO/);
      assert.doesNotMatch(error.message, /Failed to fetch/i);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('las consultas de la API no muestran detalles internos de errores del servidor', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ detail: 'DB password secret / traceback' }),
  });
  try {
    await assert.rejects(apiClient.api.getEmails(), (error) => {
      assert.equal(error.status, 500);
      assert.match(error.message, /El servidor no pudo completar la solicitud/);
      assert.doesNotMatch(error.message, /DB password|secret|traceback/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('las respuestas de validación no muestran excepciones internas', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ detail: 'SQL constraint failed at /srv/app/backend.py' }),
  });
  try {
    await assert.rejects(apiClient.api.getEmails(), (error) => {
      assert.equal(error.status, 400);
      assert.match(error.message, /Revisa los datos ingresados/);
      assert.doesNotMatch(error.message, /SQL|srv\/app|backend\.py/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('alta inicial conserva el motivo del conflicto y distingue la bóveda vencida', async () => {
  const originalFetch = globalThis.fetch;
  const payload = { username: 'usuario', email: 'a@example.test', full_name: 'Usuario', password: 'PruebaTemporal123' };
  try {
    const detail = 'El nombre de usuario o correo está reservado para la cuenta inicial del sistema.';
    globalThis.fetch = async () => Response.json({ detail }, { status: 409 });
    await assert.rejects(apiClient.api.bootstrapAccount(payload), { message: detail });
    apiClient.setApiVaultToken('vault-test');
    apiClient.setApiUserToken('user-test');
    globalThis.fetch = async () => new Response(null, { status: 401 });
    await assert.rejects(apiClient.api.bootstrapAccount(payload), /La bóveda se bloqueó/);
    assert.equal(apiClient.getApiVaultToken(), null);
    assert.equal(apiClient.getApiUserToken(), 'user-test');
  } finally {
    apiClient.setApiUserToken(null);
    globalThis.fetch = originalFetch;
  }
});

test('libera las reservas de writeup antes de bloquear la bóveda', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  apiClient.clearWriteupEditLease();
  apiClient.setApiVaultToken('vault-before-lock');
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), 'https://lesso.test');
    const method = init.method || 'GET';
    requests.push({ path: url.pathname, method, headers: new Headers(init.headers) });
    if (url.pathname.endsWith('/edit-lease') && method === 'POST') {
      return Response.json({ acquired: true, token: 'lease-token', client_id: 'editor-client-0001', holder: 'test', expires_at: '2026-11-16T12:00:00Z', ttl_seconds: 90 });
    }
    if (url.pathname.endsWith('/edit-lease') && method === 'DELETE') return Response.json({ released: true });
    if (url.pathname === '/api/v1/auth/lock') return Response.json({ message: 'locked' });
    throw new Error(`Request inesperada: ${method} ${url.pathname}`);
  };
  try {
    await apiClient.api.acquireWriteupEditLease('writeup-1', 'editor-client-0001');
    await apiClient.api.lockVault();
    assert.deepEqual(requests.map(({ path, method }) => [method, path]), [
      ['POST', '/api/v1/writeups/writeup-1/edit-lease'],
      ['DELETE', '/api/v1/writeups/writeup-1/edit-lease'],
      ['POST', '/api/v1/auth/lock'],
    ]);
    assert.equal(requests[1].headers.get('X-Writeup-Edit-Lease'), 'lease-token');
    assert.equal(requests[1].headers.get('X-Writeup-Client-ID'), 'editor-client-0001');
    assert.equal(requests[1].headers.get('X-Vault-Token'), 'vault-before-lock');
  } finally {
    apiClient.clearWriteupEditLease();
    apiClient.setApiVaultToken(null);
    globalThis.fetch = originalFetch;
  }
});
