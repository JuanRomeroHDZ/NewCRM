import type { WriteupSeverity, WriteupStatus, WriteupSummary } from '../../types';
import { MAX_REPORT_TITLE_LENGTH } from './writeupLimits';

export type WriteupDevDataset = 'worst' | 'empty' | 'one' | '1000';

export interface WriteupDevPage {
  items: WriteupSummary[];
  total: number;
  hasMore: boolean;
}

const REPORT_LIST_LIMIT = 1000;
const LONG_TITLE = (
  'Evaluación de autorización y segmentación de red en Northwind Industries Holdings; verificación de acceso al portal de socios, API, almacenamiento de evidencias y administración remota con Aleksandra Wiśniewska-Kowalczyk y su equipo de respuesta'
).slice(0, MAX_REPORT_TITLE_LENGTH);

const SCOPE_HOSTS = [
  'portal.northwind.example', 'api.northwind.example', 'sso.northwind.example',
  'vpn.northwind.example', 'admin.northwind.example', 'files.northwind.example',
  'partners.northwind.example', 'billing.northwind.example', 'support.northwind.example',
  'login.northwind.example', 'auth.northwind.example', 'edge.northwind.example',
  '192.0.2.0/24', '198.51.100.0/24', '203.0.113.0/25',
];
const LONG_SCOPE = Array.from({ length: 40 }, (_, index) => SCOPE_HOSTS[index % SCOPE_HOSTS.length]).join(', ').slice(0, 500);

const severityCycle: WriteupSeverity[] = ['critica', 'alta', 'media', 'baja', 'informativa'];
const statusCycle: WriteupStatus[] = ['en_revision', 'borrador', 'finalizado', 'entregado'];

const createSummary = (index: number, overrides: Partial<WriteupSummary> = {}): WriteupSummary => {
  const id = `dev-writeup-${index + 1}`;
  const timestamp = new Date(Date.UTC(2026, 10, 17, 18, 30) - index * 60 * 60 * 1000).toISOString();
  return {
    id,
    slug: `dev-fixture-${index + 1}`,
    title: `Informe ${String(index + 1).padStart(4, '0')}: validación de acceso y exposición de servicios`,
    status: statusCycle[index % statusCycle.length],
    severity: severityCycle[index % severityCycle.length],
    cvss_score: [9.8, 8.1, 6.5, 3.7, null][index % 5],
    cwe_id: ['CWE-639', 'CWE-862', 'CWE-78', 'CWE-200', null][index % 5],
    cve_id: index % 4 === 0 ? `CVE-2026-${String(13000 + index).padStart(5, '0')}` : null,
    target_scope: index % 3 === 0 ? LONG_SCOPE : `api-${index + 1}.northwind.example, 192.0.2.${(index % 200) + 1}`,
    tags: ['fixture', 'seguridad', `grupo-${index % 8}`],
    prospect_id: null,
    project_id: null,
    engagement_id: null,
    boards_count: [0, 1, 2, 4][index % 4],
    assets_count: [0, 1, 3, 8][index % 4],
    citations_count: [0, 1, 5, 12][index % 4],
    updated_at: timestamp,
    created_at: timestamp,
    ...overrides,
  };
};

const createWorstCaseSummaries = (): WriteupSummary[] => [
  createSummary(0, {
    title: LONG_TITLE,
    target_scope: LONG_SCOPE,
    severity: 'critica',
    status: 'en_revision',
    boards_count: 4,
    citations_count: 1284,
    assets_count: 36,
  }),
  createSummary(1, {
    title: 'Jo',
    target_scope: null,
    status: 'borrador',
    severity: 'informativa',
    boards_count: 1,
    citations_count: 1,
    assets_count: 1,
  }),
  createSummary(2, {
    title: '雪の認証レビュー — revisión de accesos y rutas públicas',
    target_scope: 'portal.northwind.example, sso.northwind.example, 192.0.2.0/24',
    severity: 'alta',
  }),
  createSummary(3, {
    title: 'Revisión de control de acceso \u{1F6E1} en servicios de socios',
    target_scope: '',
    boards_count: 0,
    citations_count: 0,
    assets_count: 0,
  }),
  createSummary(4, {
    title: 'Un informe con alcance no indicado',
    target_scope: null,
    status: 'entregado',
    severity: 'baja',
  }),
];

const createSingleSummary = (): WriteupSummary[] => [
  createSummary(0, {
    title: 'Jo',
    target_scope: null,
    status: 'borrador',
    severity: 'media',
    boards_count: 1,
    citations_count: 1,
    assets_count: 1,
  }),
];

const createThousandRows = (): WriteupSummary[] =>
  Array.from({ length: REPORT_LIST_LIMIT }, (_, index) => {
    const cycle = index % 8;
    const variant = cycle === 0
      ? { title: LONG_TITLE, target_scope: LONG_SCOPE }
      : cycle === 1
        ? { title: 'Jo', target_scope: null }
        : cycle === 2
          ? { title: '雪の認証レビュー — revisión de acceso', target_scope: 'portal.northwind.example, 192.0.2.0/24' }
          : cycle === 3
            ? { title: 'Revisión de acceso \u{1F6E1} al portal de socios', target_scope: '' }
            : {};
    return createSummary(index, variant);
  });

const fixtureCache = new Map<WriteupDevDataset, WriteupSummary[]>();

const getDataset = (dataset: WriteupDevDataset): WriteupSummary[] => {
  const cached = fixtureCache.get(dataset);
  if (cached) return cached;
  const summaries = dataset === 'empty'
    ? []
    : dataset === 'one'
      ? createSingleSummary()
      : dataset === '1000'
        ? createThousandRows()
        : createWorstCaseSummaries();
  fixtureCache.set(dataset, summaries);
  return summaries;
};

export const getWriteupDevPage = (
  dataset: WriteupDevDataset,
  { limit, offset, q, severity }: { limit: number; offset: number; q?: string; severity?: string },
): WriteupDevPage => {
  const query = q?.trim().toLocaleLowerCase('es-MX') || '';
  const filtered = getDataset(dataset).filter((item) => {
    if (severity && item.severity !== severity) return false;
    if (!query) return true;
    return [item.title, item.target_scope, item.cwe_id, item.cve_id, ...item.tags]
      .some((value) => value?.toLocaleLowerCase('es-MX').includes(query));
  });
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const items = filtered.slice(safeOffset, safeOffset + safeLimit);
  return { items, total: filtered.length, hasMore: safeOffset + items.length < filtered.length };
};

export const readWriteupDevDataset = (): WriteupDevDataset | null => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('data');
  return value === 'worst' || value === 'empty' || value === 'one' || value === '1000' ? value : null;
};

export const updateWriteupDevDatasetUrl = (dataset: WriteupDevDataset | null) => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (dataset) url.searchParams.set('data', dataset);
  else url.searchParams.delete('data');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
};
