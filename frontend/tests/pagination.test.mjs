import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
globalThis.sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const compiled = await build({
  entryPoints: ['src/lib/api.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  define: { 'import.meta.env.VITE_API_BASE_URL': '"/api/v1"' },
});
const source = Buffer.from(compiled.outputFiles[0].contents).toString('base64');
const { api } = await import(`data:text/javascript;base64,${source}`);

test('los métodos por página envían filtros, límite y offset, y leen los metadatos', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify([{ id: 'row-1' }]), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Total-Count': '120',
        'X-Has-More': 'true',
      },
    });
  };

  try {
    const emails = await api.getEmailsPage({ search: 'ana@lessso.mx', provider: 'Google', limit: 50, offset: 50 });
    const prospects = await api.getProspectsPage({ status: 'contactado', search: 'Ana', limit: 50, offset: 100 });
    const writeups = await api.listWriteupsPage({ severity: 'alta', q: 'mapa', limit: 50, offset: 0 });

    assert.deepEqual(emails, { items: [{ id: 'row-1' }], total: 120, hasMore: true });
    assert.deepEqual(prospects, { items: [{ id: 'row-1' }], total: 120, hasMore: true });
    assert.deepEqual(writeups, { items: [{ id: 'row-1' }], total: 120, hasMore: true });
    assert.match(urls[0], /\/emails\?/);
    assert.match(urls[0], /search=ana%40lessso\.mx/);
    assert.match(urls[0], /provider=Google/);
    assert.match(urls[0], /limit=50/);
    assert.match(urls[0], /offset=50/);
    assert.match(urls[1], /\/prospects\?/);
    assert.match(urls[1], /status=contactado/);
    assert.match(urls[1], /search=Ana/);
    assert.match(urls[1], /offset=100/);
    assert.match(urls[2], /\/writeups\?/);
    assert.match(urls[2], /severity=alta/);
    assert.match(urls[2], /q=mapa/);
    assert.match(urls[2], /offset=0/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('los métodos por página siguen funcionando cuando el navegador no expone los headers', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([{ id: 'row-1' }, { id: 'row-2' }]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    const page = await api.getEmailsPage({ limit: 2, offset: 4 });
    assert.deepEqual(page, { items: [{ id: 'row-1' }, { id: 'row-2' }], total: 6, hasMore: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('los métodos legacy conservan llamadas sin paginación para consumidores existentes', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await api.getEmails();
    await api.getProspects();
    await api.listWriteups();
    assert.deepEqual(urls, ['/api/v1/emails', '/api/v1/prospects', '/api/v1/writeups']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
