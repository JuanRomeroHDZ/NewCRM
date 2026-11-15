import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}
const { selectC2Interface } = await load('src/lib/c2Interfaces.ts');
const { tC2 } = await load('src/lib/c2I18n.ts');

test('la ruta predeterminada tiene prioridad sobre bridges y respeta una selección manual', () => {
  const interfaces = [{ name: 'br-docker' }, { name: 'wlo1' }];
  const gateway = { ip: '192.168.101.1', iface: 'wlo1' };
  assert.equal(selectC2Interface(interfaces, gateway, ''), 'wlo1');
  assert.equal(selectC2Interface(interfaces, gateway, 'br-docker'), 'br-docker');
  assert.equal(selectC2Interface(interfaces, gateway, 'interfaz-desconectada'), 'wlo1');
  assert.equal(selectC2Interface(interfaces, null, ''), 'br-docker');
  assert.equal(selectC2Interface([], gateway, ''), '');
});

test('las advertencias de broadcast están traducidas en ambos idiomas', () => {
  for (const lang of ['es', 'en']) {
    for (const key of ['wifi.broadcastOption', 'wifi.broadcastWarning']) assert.notEqual(tC2(lang, key), key);
  }
});
