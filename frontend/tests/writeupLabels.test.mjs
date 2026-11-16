import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({ stdin: { contents: "export * from './src/components/writeups/writeupLabels';", resolveDir: process.cwd(), sourcefile: 'test-entry.ts' }, bundle: true, format: 'esm', platform: 'node', write: false });
const { renderWriteupLabels } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);

test('las etiquetas aplican la paleta elegida y escapan HTML', () => {
  assert.equal(renderWriteupLabels('{etiqueta:jade:grande:<script>}'), '<span class="writeup-label writeup-label-jade writeup-label-grande">&lt;script&gt;</span>');
  assert.equal(renderWriteupLabels('{etiqueta:rojo:pequena:Respuesta}'), '<span class="writeup-label writeup-label-rojo writeup-label-pequena">Respuesta</span>');
});

test('el código, las anclas previas y valores no permitidos se conservan', () => {
  const input = '`{etiqueta:azul:normal:Texto}`\n```\n{etiqueta:jade:normal:Texto}\n```\n{#Respuesta} {etiqueta:evil:normal:Texto}';
  assert.equal(renderWriteupLabels(input), input);
});

test('conserva etiquetas en bloques con delimitadores alternativos', () => {
  const input = '~~~~md\n{etiqueta:jade:normal:Texto}\n```\n~~~~\n\n{etiqueta:azul:normal:Fuera}';
  assert.equal(renderWriteupLabels(input), '~~~~md\n{etiqueta:jade:normal:Texto}\n```\n~~~~\n\n<span class="writeup-label writeup-label-azul writeup-label-normal">Fuera</span>');
});
