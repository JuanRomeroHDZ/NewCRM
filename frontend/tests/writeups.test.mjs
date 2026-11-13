import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

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

  const raw = [
    'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.sig12345678',
    'AWS=AKIA1234567890ABCDEF',
    'x-api-key: {{redact:YA_PROTEGIDA}}',
  ].join('\n');
  const redacted = pentestUtils.autoRedactSensitiveData(raw);
  assert.ok(redacted.count >= 2);
  assert.ok(redacted.result.includes('{{redact:AKIA1234567890ABCDEF}}'));
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

test('PENTEST_STENCILS ofrece 16 nodos SVG puros sin foreignObject ni emojis', () => {
  assert.equal(pentestIcons.PENTEST_STENCILS.length, 16);
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
