import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const built = await build({
  entryPoints: ['src/components/writeups/writeupWorkbenchUtils.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const utils = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);

test('fragmentos sustituyen variables seguras y rechazan metacaracteres de shell', () => {
  const safe = utils.interpolateSnippet('nmap -p {{puerto}} {{ip}} -H {{dominio}}', {
    ip: '10.10.10.5', port: '443', domain: 'objetivo.local',
  });
  assert.deepEqual(safe, { value: 'nmap -p 443 10.10.10.5 -H objetivo.local' });

  const unsafeIp = utils.interpolateSnippet('nmap {{ip}}', {
    ip: '10.10.10.5; touch /tmp/owned', port: '', domain: '',
  });
  assert.match(unsafeIp.error, /solo puede contener/);
  const unsafePort = utils.interpolateSnippet('curl --port {{port}}', {
    ip: '', port: '443$(id)', domain: '',
  });
  assert.match(unsafePort.error, /número entre 1 y 65535/);
  const invalidDomain = utils.interpolateSnippet('curl https://{{domain}}', {
    ip: '', port: '', domain: 'host.local;id',
  });
  assert.match(invalidDomain.error, /dominio debe usar/);
});

test('la revisión detecta enlaces vacíos, imágenes no disponibles y secretos sin censurar', () => {
  const report = {
    markdown_content: '# Resumen\n\nTexto\n\n## Vacía\n\n## Siguiente\n\n[enlace]()\n<a href="">sin destino</a>\n![captura](asset://missing)\n<img src="https://example.invalid/captura.png">\npassword=example-secret',
    assets: [],
    findings: [],
    workbench: { machines: [], evidence: [] },
  };
  const review = utils.reviewPublication(report);
  assert.equal(review.emptyLinks, 2);
  assert.equal(review.emptySections, 1);
  assert.equal(review.missingImages, 2);
  assert.equal(review.possibleSecrets, 1);
});

test('la revisión reconoce capturas y campos de evidencia censurados', () => {
  const report = {
    markdown_content: '# Reporte\n\nContenido',
    assets: [{ id: 'asset-1' }],
    findings: [],
    workbench: {
      machines: [{ id: 'machine-1', name: 'Caja', target: '', status: 'en_progreso', questions: [{ id: 'q-1', question: '¿Qué?', answer: '', status: 'pendiente' }], steps: [{ id: 's-1', text: 'Revisar', status: 'pendiente' }] }],
      evidence: [{ id: 'e-1', title: 'Evidencia', target: '10.0.0.1', command: 'password=covered-secret', result: '', captured_at: null, asset_ids: ['asset-1'], finding_ids: [], redact_target: false, redact_command: true, redact_result: false }],
    },
  };
  const review = utils.reviewPublication(report);
  assert.equal(review.missingImages, 0);
  assert.equal(review.redactedFields, 1);
  assert.equal(review.possibleSecrets, 0);
  assert.equal(review.pendingQuestions, 1);
  assert.equal(review.pendingSteps, 1);
});
