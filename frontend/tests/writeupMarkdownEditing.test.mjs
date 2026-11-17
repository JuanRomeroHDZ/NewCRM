import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const built = await build({
  entryPoints: ['src/components/writeups/markdownEditing.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const editing = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);

test('converts each selected line to a real Markdown list and leaves a blank item ready to type', () => {
  assert.equal(editing.transformMarkdownList('uno\ndos', 0, 7, 'bullet').markdown, '- uno\n- dos');
  assert.equal(editing.transformMarkdownList('', 0, 0, 'bullet').markdown, '- ');
  assert.equal(editing.transformMarkdownList('uno\ndos', 0, 7, 'task').markdown, '- [ ] uno\n- [ ] dos');
});

test('nested list items use CommonMark indentation and ordered lists number each item', () => {
  assert.equal(editing.transformMarkdownList('hijo\notro', 0, 9, 'nested-bullet').markdown, '    - hijo\n    - otro');
  assert.equal(editing.transformMarkdownList('a\nb', 0, 3, 'nested-ordered').markdown, '    1. a\n    2. b');
});

test('Tab indents selected lines and Shift+Tab removes the indentation without losing content', () => {
  const source = '- padre\n- hijo';
  const indented = editing.indentMarkdownLines(source, 0, source.length, 'indent');
  assert.equal(indented.markdown, '    - padre\n    - hijo');
  const outdented = editing.indentMarkdownLines(indented.markdown, 0, indented.markdown.length, 'outdent');
  assert.equal(outdented.markdown, source);
  assert.equal(editing.indentMarkdownLines('texto', 3, 3, 'indent').markdown, '    texto');
});

test('colored underline accepts a selected hex color and falls back from invalid input', () => {
  assert.equal(editing.createColoredUnderlineOpeningTag('#12abEF'), '<u style="text-decoration-color: #12ABEF; text-decoration-thickness: 1px;">');
  assert.equal(editing.createColoredUnderlineOpeningTag('red'), '<u style="text-decoration-color: #A98242; text-decoration-thickness: 1px;">');
});

test('worst-case writeup input handles 1,000 realistic UTF-8 lines within the API text limit', () => {
  const rows = Array.from({ length: 1000 }, (_, index) =>
    `Hallazgo ${String(index + 1).padStart(4, '0')}: autenticación débil en el módulo de administración; evidencia ${index + 1}.`,
  );
  const source = rows.join('\n');
  const reportMaxLength = 500_000;
  assert.ok(source.length < reportMaxLength, 'fixture stays below frontend and backend writeup text limit');
  const result = editing.transformMarkdownList(source, 0, source.length, 'bullet');
  assert.equal(result.markdown.split('\n').length, 1000);
  assert.ok(result.markdown.startsWith('- Hallazgo 0001:'));
  assert.ok(result.markdown.includes('autenticación débil'));
  assert.ok(result.markdown.endsWith('evidencia 1000.'));
  assert.ok(result.markdown.length < reportMaxLength);
});
