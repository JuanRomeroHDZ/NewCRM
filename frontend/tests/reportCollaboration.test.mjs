import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { applyExcalidrawElementFields, elementFieldsToPlainObject } from '../src/components/reports/reportCanvasCollaboration.mjs';
import { createTypstRangeAnchor, resolveTypstRangeAnchor } from '../src/components/reports/reportCommentAnchors.mjs';

function updatesAfterEdit(doc, edit) {
  const updates = [];
  const listener = (update) => updates.push(update);
  doc.on('update', listener);
  edit();
  doc.off('update', listener);
  return updates;
}

test('three Typst editors converge after concurrent edits to one paragraph', () => {
  const seed = new Y.Doc();
  seed.getText('typst-source').insert(0, 'Informe: listo');
  const baseline = Y.encodeStateAsUpdate(seed);
  const peers = Array.from({ length: 3 }, () => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, baseline);
    return doc;
  });

  const operations = [
    () => peers[0].getText('typst-source').insert(8, ' técnico'),
    () => peers[1].getText('typst-source').insert(14, ' para cliente'),
    () => peers[2].getText('typst-source').insert(0, 'BORRADOR · '),
  ];
  const updates = operations.map((operation, index) => updatesAfterEdit(peers[index], operation));
  for (let recipient = 0; recipient < peers.length; recipient += 1) {
    for (let author = 0; author < peers.length; author += 1) {
      if (author === recipient) continue;
      for (const update of updates[author]) Y.applyUpdate(peers[recipient], update);
    }
  }

  const results = peers.map((doc) => doc.getText('typst-source').toString());
  assert.ok(results[0].includes('técnico'));
  assert.ok(results[0].includes('para cliente'));
  assert.ok(results[0].startsWith('BORRADOR · '));
  assert.equal(new Set(results).size, 1);
  peers.forEach((doc) => doc.destroy());
  seed.destroy();
});

test('three Excalidraw editors merge separate shape additions and different properties of one shape', () => {
  const seed = new Y.Doc();
  const elements = seed.getMap('elements');
  const original = new Y.Map();
  original.set('id', 'shape-shared');
  original.set('type', 'text');
  original.set('x', 10);
  original.set('strokeColor', '#000000');
  original.set('version', 1);
  const originalText = new Y.Text();
  original.set('text', originalText);
  originalText.insert(0, 'Plan');
  elements.set('shape-shared', original);
  const baseline = Y.encodeStateAsUpdate(seed);
  const peers = Array.from({ length: 3 }, () => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, baseline);
    return doc;
  });

  const operations = [
    () => {
      const fields = peers[0].getMap('elements').get('shape-shared');
      applyExcalidrawElementFields(fields, { ...elementFieldsToPlainObject(fields), x: 120, text: 'Plan A' });
    },
    () => {
      const fields = peers[1].getMap('elements').get('shape-shared');
      applyExcalidrawElementFields(fields, { ...elementFieldsToPlainObject(fields), strokeColor: '#176B5B', text: 'Plan B' });
    },
    () => {
      const elements = peers[2].getMap('elements');
      const shared = elements.get('shape-shared');
      applyExcalidrawElementFields(shared, { ...elementFieldsToPlainObject(shared), text: 'Plan C' });
      const added = new Y.Map();
      elements.set('shape-added-by-third-editor', added);
      applyExcalidrawElementFields(added, { id: 'shape-added-by-third-editor', type: 'rectangle' });
    },
  ];
  const updates = operations.map((operation, index) => updatesAfterEdit(peers[index], operation));
  for (let recipient = 0; recipient < peers.length; recipient += 1) {
    for (let author = 0; author < peers.length; author += 1) {
      if (author === recipient) continue;
      for (const update of updates[author]) Y.applyUpdate(peers[recipient], update);
    }
  }

  const results = peers.map((doc) => {
    const map = doc.getMap('elements');
    return JSON.stringify({
      shared: elementFieldsToPlainObject(map.get('shape-shared')),
      third: elementFieldsToPlainObject(map.get('shape-added-by-third-editor')),
    });
  });
  assert.equal(new Set(results).size, 1);
  const merged = JSON.parse(results[0]);
  assert.equal(merged.shared.x, 120);
  assert.equal(merged.shared.strokeColor, '#176B5B');
  assert.ok(merged.shared.text.startsWith('Plan'));
  assert.ok(merged.shared.text.includes('A'));
  assert.ok(merged.shared.text.includes('B'));
  assert.ok(merged.shared.text.includes('C'));
  assert.equal(merged.third.id, 'shape-added-by-third-editor');
  peers.forEach((doc) => doc.destroy());
  seed.destroy();
});

test('Typst comment anchors use relative positions that resolve after another peer edits before them', () => {
  const owner = new Y.Doc();
  const source = owner.getText('typst-source');
  source.insert(0, 'Resumen ejecutivo');
  const stored = createTypstRangeAnchor(source, 0, 7);
  assert.ok(stored);
  const editor = new Y.Doc();
  Y.applyUpdate(editor, Y.encodeStateAsUpdate(owner));
  editor.getText('typst-source').insert(0, 'Informe · ');
  Y.applyUpdate(owner, Y.encodeStateAsUpdate(editor));
  const range = resolveTypstRangeAnchor(stored, owner, source);
  assert.ok(range);
  assert.equal(source.toString().slice(range.from, range.to), 'Resumen');
  assert.equal(resolveTypstRangeAnchor('{"version":1,"kind":"invalid"}', owner, source), null);
  owner.destroy();
  editor.destroy();
});
