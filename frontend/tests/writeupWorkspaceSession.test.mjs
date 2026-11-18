import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: ['src/lib/writeupWorkspaceSession.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`;

test('recupera el último informe, modo y pizarra tras cargar el módulo de nuevo', async () => {
  const items = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key),
  };
  try {
    const before = await import(`${moduleUrl}#before`);
    const workspace = { reportId: 'report-1', boardId: 'board-2', mode: 'dual' };
    before.rememberWriteupWorkspace({ ...workspace, markdown: 'Contenido privado de prueba' });
    assert.deepEqual(JSON.parse(items.get('lessso.writeup.workspace')), workspace);
    const after = await import(`${moduleUrl}#after`);
    assert.deepEqual(after.readWriteupWorkspace(), workspace);
    after.rememberWriteupWorkspace(null);
    assert.equal(after.readWriteupWorkspace(), null);
    for (const invalid of ['{', JSON.stringify({ ...workspace, mode: 'invalid' })]) {
      sessionStorage.setItem('lessso.writeup.workspace', invalid);
      assert.equal(after.readWriteupWorkspace(), null);
    }
  } finally {
    delete globalThis.sessionStorage;
  }
});
