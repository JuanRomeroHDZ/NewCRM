import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const built = await build({ entryPoints: ['src/lib/writeupDraftRecovery.ts'], bundle: true, format: 'esm', platform: 'node', write: false });
const recovery = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);
const makeStorage = (initial = new Map()) => ({
  getItem: key => initial.get(key) ?? null,
  setItem: (key, value) => initial.set(key, String(value)),
  removeItem: key => initial.delete(key),
  key: index => [...initial.keys()][index] ?? null,
  get length() { return initial.size; },
  items: initial,
});

test('encrypted drafts reopen with the vault password and enumerate separate tab copies', async () => {
  const storage = makeStorage();
  const value = {
    markdown: 'Confidencial: clave y detalles',
    text: 'x'.repeat(150000),
    boardDrafts: [{
      boardId: 'board-1',
      title: 'Cadena de explotación',
      sceneJson: JSON.stringify({ elements: [{ id: 'el-1', type: 'text', text: 'shell de prueba' }], citationPositions: {} }),
      svgSnapshot: '<svg><text>shell de prueba</text></svg>',
      elementCount: 1,
      sceneGeneration: 4,
    }],
  };
  const key = await recovery.deriveDraftKey('test vault password', storage);
  const firstTabKey = 'lessso.writeup-draft.v2.report-1.tab-a';
  const secondTabKey = 'lessso.writeup-draft.v2.report-1.tab-b';
  const firstCiphertext = await recovery.encryptDraft(key, firstTabKey, value);
  const secondCiphertext = await recovery.encryptDraft(key, secondTabKey, { ...value, markdown: 'Cambios de otra pestaña' });
  recovery.storeEncryptedDraft(firstTabKey, firstCiphertext, storage);
  recovery.storeEncryptedDraft(secondTabKey, secondCiphertext, storage);
  assert.ok(!firstCiphertext.includes('Confidencial'));
  assert.ok(!firstCiphertext.includes('shell de prueba'), 'board scene labels and SVG text stay encrypted');

  const reopenedKey = await recovery.deriveDraftKey('test vault password', storage);
  const copies = recovery.listDraftCopies('report-1', storage);
  assert.deepEqual(copies.map(copy => copy.storageKey), [firstTabKey, secondTabKey]);
  assert.deepEqual(await recovery.readDraft(reopenedKey, copies[0], storage), value);
  assert.deepEqual(await recovery.readDraft(reopenedKey, copies[1], storage), { ...value, markdown: 'Cambios de otra pestaña' });
  assert.equal(recovery.removeDraft(firstTabKey, storage), true);
  assert.equal(storage.getItem(secondTabKey), secondCiphertext, 'removing one recovered copy must not remove the other tab copy');
});

test('large repetitive HTB drafts compress before encrypted browser storage', async () => {
  const storage = makeStorage();
  const key = await recovery.deriveDraftKey('test vault password', storage);
  const slot = 'lessso.writeup-draft.v2.report-compress.tab-a';
  const value = { markdown: '# HTB report\n## Enumeration\n'.repeat(12000) };
  const ciphertext = await recovery.encryptDraft(key, slot, value);
  assert.equal(JSON.parse(ciphertext).version, 2);
  assert.ok(ciphertext.length < JSON.stringify(value).length / 5);
  recovery.storeEncryptedDraft(slot, ciphertext, storage);
  const [copy] = recovery.listDraftCopies('report-compress', storage);
  assert.deepEqual(await recovery.readDraft(key, copy, storage), value);
});

test('legacy single-slot drafts remain recoverable after migration to per-tab keys', async () => {
  const storage = makeStorage();
  const reportId = 'report.legacy';
  const legacyKey = `lessso.writeup-draft.v1.${reportId}`;
  const vaultKey = await recovery.deriveDraftKey('same vault password', storage);
  const value = { baseUpdatedAt: '2026-01-01T00:00:00Z', markdown: 'legacy draft' };
  const ciphertext = await recovery.encryptDraft(vaultKey, reportId, value);
  recovery.storeEncryptedDraft(legacyKey, ciphertext, storage);

  const [copy] = recovery.listDraftCopies(reportId, storage);
  assert.equal(copy.legacy, true);
  assert.deepEqual(await recovery.readDraft(vaultKey, copy, storage), value);
  assert.equal(storage.getItem(legacyKey), ciphertext, 'listing and reading must not migrate or delete the original');
});

test('password rotation keeps old-password copies intact until they can be recovered', async () => {
  const storage = makeStorage();
  const oldKey = await recovery.deriveDraftKey('old vault password', storage);
  const newPasswordKey = 'lessso.writeup-draft.v2.report-rotation.old-tab';
  const ciphertext = await recovery.encryptDraft(oldKey, newPasswordKey, { markdown: 'before rotation' });
  recovery.storeEncryptedDraft(newPasswordKey, ciphertext, storage);
  const currentKey = await recovery.deriveDraftKey('new vault password', storage);
  const [copy] = recovery.listDraftCopies('report-rotation', storage);
  await assert.rejects(recovery.readDraft(currentKey, copy, storage));
  assert.equal(storage.getItem(newPasswordKey), ciphertext);
  assert.deepEqual(await recovery.readDraft(oldKey, copy, storage), { markdown: 'before rotation' });
});

test('wrong password, swapped report identity and corrupted data cannot decrypt or erase copies', async () => {
  const storage = makeStorage();
  const key = await recovery.deriveDraftKey('correct password', storage);
  const slot = 'lessso.writeup-draft.v2.report-1.tab-a';
  const ciphertext = await recovery.encryptDraft(key, slot, { markdown: 'private' });
  recovery.storeEncryptedDraft(slot, ciphertext, storage);
  const wrong = await recovery.deriveDraftKey('wrong password', storage);
  const [copy] = recovery.listDraftCopies('report-1', storage);
  await assert.rejects(recovery.readDraft(wrong, copy, storage));
  const swappedSlot = 'lessso.writeup-draft.v2.report-2.tab-a';
  storage.setItem(swappedSlot, ciphertext);
  const swapped = { ...copy, storageKey: swappedSlot, reportId: 'report-2' };
  await assert.rejects(recovery.readDraft(key, swapped, storage));
  assert.equal(storage.getItem(slot), ciphertext);

  const corrupted = JSON.parse(ciphertext);
  corrupted.ciphertext = `${corrupted.ciphertext.slice(0, -8)}AAAAAAAA`;
  recovery.storeEncryptedDraft(slot, JSON.stringify(corrupted), storage);
  await assert.rejects(recovery.readDraft(key, copy, storage));
  assert.equal(recovery.removeDraft(slot, { ...storage, removeItem: () => { throw new Error('quota or storage disabled'); } }), false);
  assert.notEqual(storage.getItem(slot), null);
});

test('quota failures surface to caller and do not silently report a saved copy', () => {
  const failedStorage = { setItem: () => { throw new Error('quota exceeded'); } };
  assert.throws(() => recovery.storeEncryptedDraft('slot', 'ciphertext', failedStorage), /quota exceeded/);
});
