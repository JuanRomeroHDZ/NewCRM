import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function collectFiles(dir, exts) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

test('Toda la UI fuente está libre de emojis Unicode y diálogos nativos bloqueantes', () => {
  const srcFiles = collectFiles(path.resolve('src'), ['.ts', '.tsx', '.css']);
  assert.ok(srcFiles.length > 20, 'Se esperan archivos fuente en src/');

  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  const windowDialogRegex = /\bwindow\.(?:confirm|prompt|alert)\s*\(/;

  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    assert.equal(emojiRegex.test(content), false, `Emoji Unicode encontrado en ${file}`);
    assert.equal(windowDialogRegex.test(content), false, `Diálogo nativo del navegador encontrado en ${file}`);
  }
});

test('AuditLogsView ya no usa el texto fijo Localhost / Docker', () => {
  const auditPath = path.resolve('src/components/views/AuditLogsView.tsx');
  const content = fs.readFileSync(auditPath, 'utf8');
  assert.equal(content.includes('Localhost / Docker'), false);
});
