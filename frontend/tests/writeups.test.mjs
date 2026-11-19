import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

async function loadModule(entryPoint) {
  const compiled = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    jsx: 'automatic',
  });
  const source = Buffer.from(compiled.outputFiles[0].contents).toString('base64');
  return import(`data:text/javascript;base64,${source}`);
}

const pentestUtils = await loadModule('src/components/writeups/pentestUtils.ts');
const pentestIcons = await loadModule('src/components/writeups/pentestSvgIcons.tsx');
const portTable = await loadModule('src/components/writeups/portTable.ts');

test('createPortTableMarkdown valida límites y escapa contenido de las celdas', () => {
  const table = portTable.createPortTableMarkdown('443/tcp https servidor|principal estado|revisado, 53/UDP dns');
  assert.ok(table.includes('| `443/tcp` | https | servidor\\|principal | estado\\|revisado |'));
  assert.ok(table.includes('| `53/udp` | dns | Sin especificar | Sin especificar |'));
  assert.equal(table.split('\n').filter((line) => line.startsWith('| `')).length, 2);

  assert.throws(() => portTable.createPortTableMarkdown('65536/tcp http'));
  assert.throws(() => portTable.createPortTableMarkdown('80/tcp'));
  assert.throws(() => portTable.createPortTableMarkdown('x'.repeat(portTable.MAX_PORT_TABLE_INPUT_LENGTH + 1)));
  assert.throws(() => portTable.createPortTableMarkdown(Array.from({ length: 101 }, (_, i) => `${i + 1}/tcp http`).join(', ')));
});

test('el índice interno incluye H5 y H6, tablas e imágenes y omite bloques de código', () => {
  const md = ['# Informe', '##### Nivel cinco', '###### Nivel seis', '| Puerto | Estado |', '| --- | --- |', '| 80 | abierto |', '![Captura](asset://abc)', '~~~md', '###### No es encabezado', '![No es imagen](x.png)', '~~~'].join('\n');
  assert.deepEqual(pentestUtils.extractMarkdownOutline(md).map((item) => item.level), [1, 5, 6]);
  assert.deepEqual(pentestUtils.extractMarkdownObjects(md), [
    { kind: 'table', text: 'Puerto · Estado', line: 4 },
    { kind: 'image', text: 'Captura', line: 7 },
  ]);
});

test('el índice interno reconoce imágenes y tablas HTML, conserva líneas CRLF y excluye etiquetas dentro de código', () => {
  const md = [
    '# Informe',
    "<figure><img src='captura.png' alt='Acceso inicial'><figcaption>Pantalla inicial</figcaption></figure>",
    "<img src='consola.png' alt='Terminal'>",
    '<table><caption>Puertos encontrados</caption><tr><th>Puerto</th><th>Servicio</th></tr></table>',
    '```html',
    '<img src="fake.png" alt="No contar">',
    '<table><tr><th>Falsa</th></tr></table>',
    '```',
  ].join('\r\n');
  assert.deepEqual(pentestUtils.extractMarkdownOutline(md).map((item) => item.text), ['Informe']);
  assert.deepEqual(pentestUtils.extractMarkdownObjects(md), [
    { kind: 'image', text: 'Pantalla inicial', line: 2 },
    { kind: 'image', text: 'Terminal', line: 3 },
    { kind: 'table', text: 'Puertos encontrados', line: 4 },
  ]);
});

test('Writeups no usa diálogos nativos ni precarga ejemplos que parecen datos reales', () => {
  const editor = fs.readFileSync('src/components/writeups/WriteupMarkdownSplitEditor.tsx', 'utf8');
  const view = fs.readFileSync('src/components/writeups/WriteupsView.tsx', 'utf8');
  assert.doesNotMatch(`${editor}\n${view}`, /\balert\s*\(|\bwindow\.(?:alert|confirm|prompt)\s*\(|\b(?:confirm|prompt)\s*\(\s*['"`]/);
  assert.doesNotMatch(`${editor}\n${view}`, /nginx-1\.24|AuthBypass|Auditoría API REST — Cliente|CVE-2026-XXXX/);
});

test('Los diálogos compartidos y de Writeups exponen descripción, cierre por Escape y límites', () => {
  const tooltip = fs.readFileSync('src/components/common/InfoTooltip.tsx', 'utf8');
  const promptDialog = fs.readFileSync('src/components/common/PromptDialog.tsx', 'utf8');
  const confirmDialog = fs.readFileSync('src/components/common/ConfirmDialog.tsx', 'utf8');
  const exportDialog = fs.readFileSync('src/components/writeups/WriteupExportModal.tsx', 'utf8');
  for (const [name, source] of [['InfoTooltip', tooltip], ['PromptDialog', promptDialog], ['ConfirmDialog', confirmDialog], ['ExportDialog', exportDialog]]) {
    assert.match(source, /aria-modal|aria-describedby/ , `${name} debe exponer información accesible`);
    assert.match(source, /Escape|e\.key === 'Escape'/, `${name} debe permitir cerrar con Escape`);
  }
  assert.match(tooltip, /aria-describedby=\{open \? tooltipId/);
  assert.match(promptDialog, /maxLength=\{safeMaxLength\}/);
  assert.match(promptDialog, /aria-invalid=\{Boolean\(error\)\}/);
  assert.match(exportDialog, /maxLength=\{120\}/);
});

test('calculateCvss31 y parseCvss31Vector calculan score, severidad y vector consistente', () => {
  const crit = pentestUtils.calculateCvss31({
    AV: 'N',
    AC: 'L',
    PR: 'N',
    UI: 'N',
    S: 'C',
    C: 'H',
    I: 'H',
    A: 'H',
  });
  assert.equal(crit.score, 10.0);
  assert.equal(crit.severity, 'critica');
  assert.equal(crit.vector, 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H');

  const zero = pentestUtils.calculateCvss31({
    AV: 'N',
    AC: 'L',
    PR: 'N',
    UI: 'N',
    S: 'U',
    C: 'N',
    I: 'N',
    A: 'N',
  });
  assert.equal(zero.score, 0);
  assert.equal(zero.severity, 'informativa');

  const parsed = pentestUtils.parseCvss31Vector(crit.vector);
  assert.deepEqual(parsed, { AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'C', C: 'H', I: 'H', A: 'H' });
  assert.equal(pentestUtils.parseCvss31Vector('invalid'), null);
});

test('PENTEST_TAXONOMY_PRESETS contiene mapeos OWASP, CWE y MITRE válidos', () => {
  assert.ok(pentestUtils.PENTEST_TAXONOMY_PRESETS.length >= 10);
  for (const preset of pentestUtils.PENTEST_TAXONOMY_PRESETS) {
    assert.ok(preset.cwe.startsWith('CWE-'));
    assert.ok(preset.mitre.startsWith('T'));
    const res = pentestUtils.calculateCvss31(preset.defaultMetrics);
    assert.ok(res.score > 0 && res.score <= 10);
  }
});

test('defangIocs y autoRedactSensitiveData neutralizan URLs/IPs y envuelven secretos sin duplicar', () => {
  const defanged = pentestUtils.defangIocs('Conectar a https://evil.test/c2 y http://192.168.10.42:8080');
  assert.equal(defanged, 'Conectar a hxxps://evil.test/c2 y hxxp://192[.]168[.]10[.]42:8080');

  const fakeJwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJhZG1pbiJ9', 'sig12345678'].join('.');
  const fakeAwsKey = ['AKIA', '1234567890ABCDEF'].join('');
  const raw = [
    `Authorization: Bearer ${fakeJwt}`,
    `AWS=${fakeAwsKey}`,
    'x-api-key: {{redact:YA_PROTEGIDA}}',
  ].join('\n');
  const redacted = pentestUtils.autoRedactSensitiveData(raw);
  assert.ok(redacted.count >= 2);
  assert.ok(redacted.result.includes(`{{redact:${fakeAwsKey}}}`));
  assert.ok(!redacted.result.includes('{{redact:{{redact:'));
});

test('Codecs offline Base64, Hex y JWT decodifican correctamente UTF-8 y claims', () => {
  const sample = 'Admin ñandú {"role":"admin"}';
  const b64 = pentestUtils.encodeBase64Utf8(sample);
  assert.equal(pentestUtils.decodeBase64Utf8(b64), sample);

  const hex = pentestUtils.encodeHex('A1');
  assert.equal(hex, '4131');
  assert.equal(pentestUtils.decodeHex(hex), 'A1');
  assert.throws(() => pentestUtils.decodeHex('xyz'));

  const hdr = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const pld = Buffer.from(JSON.stringify({ sub: 'pentester', admin: true })).toString('base64url');
  const jwt = pentestUtils.decodeJwtOffline(`${hdr}.${pld}.fakesig`);
  assert.ok(jwt.header.includes('HS256'));
  assert.ok(jwt.payload.includes('"admin": true'));
  assert.equal(jwt.signature, 'fakesig');
});

test('extractMarkdownOutline, computeWriteupMetrics y computeLineDiff procesan Markdown y diffs', () => {
  const md = [
    '# Reporte {#rep}',
    '```bash',
    '# Comentario bash que no debe ser H1',
    'curl http://localhost',
    '```',
    '## Hallazgo SQLi {#sqli}',
    '```mermaid',
    'flowchart LR',
    '  A-->B',
    '```',
    'Token: {{redact:abc12345}}',
  ].join('\n');

  const outline = pentestUtils.extractMarkdownOutline(md);
  assert.equal(outline.length, 2);
  assert.equal(outline[0].text, 'Reporte');
  assert.equal(outline[1].line, 6);

  const metrics = pentestUtils.computeWriteupMetrics(md);
  assert.equal(metrics.codeBlocks, 2);
  assert.equal(metrics.mermaidBlocks, 1);
  assert.equal(metrics.redactedMarkers, 1);

  const diff = pentestUtils.computeLineDiff('linea 1\nlinea vieja\nlinea 3', 'linea 1\nlinea nueva\nlinea 3');
  assert.ok(diff.some((d) => d.kind === 'added' && d.text === 'linea nueva'));
  assert.ok(diff.some((d) => d.kind === 'removed' && d.text === 'linea vieja'));
});

test('buildAttackPathElements crea nodos anclados con sourceId/targetId desde scope y hallazgos', () => {
  const els = pentestUtils.buildAttackPathElements('api.cliente.local', [
    {
      id: 'H-01',
      title: 'SSRF en /fetch',
      severity: 'critica',
      cvss_score: 9.1,
      status: 'abierta',
      summary: 'Permite pivotar a metadata',
      remediation: 'Allowlist',
    },
  ]);
  const arrows = els.filter((e) => e.type === 'arrow');
  assert.ok(arrows.length >= 3);
  assert.ok(arrows.every((a) => Boolean(a.sourceId) && Boolean(a.targetId)));
  assert.ok(els.some((e) => e.text?.includes('api.cliente.local')));
  assert.ok(els.some((e) => e.text?.includes('H-01')));
});

test('PENTEST_STENCILS ofrece nodos SVG puros sin foreignObject ni emojis', () => {
  assert.ok(pentestIcons.PENTEST_STENCILS.length >= 19);
  for (const stencil of pentestIcons.PENTEST_STENCILS) {
    const svg = pentestIcons.renderIconSvgXml(stencil.id, 10, 10, 24, '#6366f1');
    assert.ok(svg.includes('<g transform='));
    assert.ok(!svg.includes('foreignObject'));
    assert.ok(!/\p{Extended_Pictographic}/u.test(stencil.label));
  }
});

test('Componentes de writeups están completamente libres de emojis Unicode', () => {
  const dir = path.resolve('src/components/writeups');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.equal(emojiRegex.test(content), false, `Emoji inesperado detectado en ${file}`);
  }
});


test('la comparación conserva todas las líneas y alinea inserciones y eliminaciones', () => {
  const diff = pentestUtils.computeLineDiff('inicio\nse elimina\nfin', 'inicio\nse añade\nfin');
  assert.deepEqual(diff, [
    { kind: 'same', text: 'inicio' },
    { kind: 'removed', text: 'se elimina' },
    { kind: 'added', text: 'se añade' },
    { kind: 'same', text: 'fin' },
  ]);
  const oldText = Array.from({ length: 1000 }, (_, i) => `antes ${i}`).join('\n');
  const newText = Array.from({ length: 1000 }, (_, i) => `después ${i}`).join('\n');
  const large = pentestUtils.computeLineDiff(oldText, newText);
  assert.equal(large.filter(line => line.kind === 'removed').length, 1000);
  assert.equal(large.filter(line => line.kind === 'added').length, 1000);
});

test('la comparación encuentra la secuencia común óptima incluso con líneas repetidas y cambios distantes', () => {
  let seed = 12345;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };
  for (let trial = 0; trial < 200; trial++) {
    const a = Array.from({ length: 1 + random() % 12 }, () => String(random() % 5));
    const b = Array.from({ length: 1 + random() % 12 }, () => String(random() % 5));
    const diff = pentestUtils.computeLineDiff(a.join('\n'), b.join('\n'));
    assert.deepEqual(diff.filter(line => line.kind !== 'added').map(line => line.text), a);
    assert.deepEqual(diff.filter(line => line.kind !== 'removed').map(line => line.text), b);
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
    assert.equal(diff.filter(line => line.kind === 'same').length, dp[a.length][b.length]);
  }
  const original = ['encabezado', ...Array.from({ length: 3000 }, (_, i) => `línea ${i}`), 'final'];
  const changed = ['encabezado', ...Array.from({ length: 100 }, (_, i) => `nueva ${i}`), ...original.slice(1)];
  const diff = pentestUtils.computeLineDiff(original.join('\n'), changed.join('\n'));
  assert.equal(diff.filter(line => line.kind === 'same').length, original.length);
  assert.equal(diff.filter(line => line.kind === 'added').length, 100);
});

test('la comparación procesa informes grandes sin líneas comunes', () => {
  const count = 50000;
  const oldText = Array.from({ length: count }, (_, i) => `anterior ${i}`).join('\n');
  const newText = Array.from({ length: count }, (_, i) => `nuevo ${i}`).join('\n');
  const diff = pentestUtils.computeLineDiff(oldText, newText);
  assert.equal(diff.length, 2 * count);
  assert.equal(diff[0].kind, 'removed');
  assert.equal(diff[count].kind, 'added');
});

test('el worker calcula la comparación fuera del hilo principal y conserva el resultado exacto', async () => {
  const compiled = await build({
    entryPoints: ['src/components/writeups/revisionDiff.worker.ts'],
    bundle: true, format: 'iife', platform: 'browser', write: false,
  });
  const source = Buffer.from(compiled.outputFiles[0].contents).toString();
  const worker = new Worker(`
    const { parentPort } = require('node:worker_threads');
    globalThis.self = { postMessage: value => parentPort.postMessage(value) };
    ${source}
    parentPort.on('message', data => self.onmessage({ data }));
  `, { eval: true });
  try {
    const response = new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
    });
    const oldText = Array.from({ length: 5000 }, (_, i) => `línea ${i}`).join('\n');
    const newText = `inicio\n${oldText}\nfin`;
    worker.postMessage({ oldText, newText });
    const diff = await response;
    assert.equal(diff.filter(line => line.kind === 'same').length, 5000);
    assert.deepEqual(diff.filter(line => line.kind === 'added').map(line => line.text), ['inicio', 'fin']);
  } finally {
    await worker.terminate();
  }
});
