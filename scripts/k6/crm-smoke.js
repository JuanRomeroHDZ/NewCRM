import { check, sleep } from 'k6';
import http from 'k6/http';

const base = (__ENV.LESSSO_BASE_URL || '').replace(/\/$/, '');
if (!base.startsWith('https://')) throw new Error('Configura LESSSO_BASE_URL con la URL HTTPS de LESSSO.');

export const options = {
  vus: 5,
  duration: '15s',
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<750'],
  },
};

export default function () {
  const health = http.get(`${base}/health`, { timeout: '5s' });
  check(health, { 'health conectado': (r) => r.status === 200 && r.json('database') === 'connected' });
  const page = http.get(`${base}/`, { timeout: '5s' });
  check(page, { 'interfaz disponible': (r) => r.status === 200 && r.body.includes('LESSSO') });
  sleep(1);
}
