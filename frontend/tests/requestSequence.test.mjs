import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: "export * from './src/lib/requestSequence';", resolveDir: process.cwd(), sourcefile: 'test-entry.ts' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const sequenceModule = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);

test('una respuesta anterior deja de ser vigente al comenzar otra solicitud', () => {
  const sequence = sequenceModule.createRequestSequence();
  const earlier = sequence.next();
  const current = sequence.next();

  assert.equal(sequence.isCurrent(earlier), false);
  assert.equal(sequence.isCurrent(current), true);
});

test('un cambio de sesión invalida las comprobaciones pendientes', () => {
  const sequence = sequenceModule.createRequestSequence();
  const pending = sequence.next();

  sequence.invalidate();

  assert.equal(sequence.isCurrent(pending), false);
});
