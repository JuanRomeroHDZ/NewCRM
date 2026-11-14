import type { GraphData, GraphNode } from '../../types';

type GraphFixtureMode = 'worst' | 'empty' | 'one' | 'thousand';

const node = (
  id: string,
  type: GraphNode['type'],
  label: string,
  options: Partial<Pick<GraphNode, 'sub_type' | 'status' | 'is_critical_failure_point' | 'metrics'>> = {}
): GraphNode => ({
  id,
  type,
  label,
  is_critical_failure_point: false,
  metrics: {},
  ...options,
});

const emptyGraph: GraphData = {
  nodes: [],
  links: [],
  cycles_detected: [],
  critical_nodes: [],
};

const createWorstCaseGraph = (): GraphData => {
  const emailNodes = [
    node('email_long', 'email', 'bartholomew.fitzgerald+billing-notifications@northwind-industries-holdings.example.com', {
      sub_type: 'Google Workspace',
      status: 'secure',
      is_critical_failure_point: true,
      metrics: { platforms_count: 8, recovers_accounts_count: 1 },
    }),
    node('email_short', 'email', 'a@b.test', {
      sub_type: 'Personal',
      metrics: { platforms_count: 1 },
    }),
    node('email_diacritics', 'email', 'sean.obrien-o.suilleabhain@northwind.example.com', {
      sub_type: 'Outlook',
      metrics: { platforms_count: 2 },
    }),
    node('email_cycle', 'email', 'cuentas+recuperacion@northwind.example.com', {
      sub_type: 'Proton Mail',
      is_critical_failure_point: true,
      metrics: { platforms_count: 0, recovers_accounts_count: 1 },
    }),
  ];

  const platformNodes = [
    node(
      'platform_long',
      'platform',
      'Administración integral de identidades, facturación y herramientas empresariales para equipos regionales',
      { sub_type: 'own_password', status: 'free_trial' }
    ),
    node('platform_one_letter', 'platform', 'J', { sub_type: 'shared', status: 'active' }),
    node('platform_cjk', 'platform', '王秀英 · Servicios de la cuenta', { sub_type: 'sso', status: 'active' }),
    node('platform_missing_fields', 'platform', 'Cuenta sin detalles opcionales'),
    ...Array.from({ length: 6 }, (_, index) =>
      node(`platform_${index + 4}`, 'platform', `Servicio empresarial ${index + 1}`, {
        sub_type: index % 2 ? 'sso' : 'own_password',
        status: index === 2 ? 'free_trial' : 'active',
      })
    ),
  ];

  const prospectNodes = [
    node(
      'prospect_long',
      'prospect',
      'Organización Internacional de Servicios Integrales para la Protección y Conservación del Patrimonio Arquitectónico del Noroeste de Baja California S.C.',
      { sub_type: 'demo_first', status: 'demo_creada' }
    ),
    node('prospect_one_letter', 'prospect', 'J', { sub_type: 'direct_quote', status: 'nuevo' }),
    node('prospect_cjk', 'prospect', '王秀英 — Taller de Diseño', { sub_type: 'demo_first', status: 'respondido' }),
    node('prospect_diacritics', 'prospect', 'Aleksandra Wiśniewska-Kowalczyk', {
      sub_type: 'direct_quote',
      status: 'primer_contacto',
    }),
    node('prospect_missing_status', 'prospect', 'Prospecto sin datos opcionales'),
  ];

  const paymentNodes = [
    node('payment_long', 'payment', 'Banco del Pacífico y Servicios Financieros Digitales (*4821)', {
      sub_type: 'Banco del Pacífico y Servicios Financieros Digitales',
      status: 'active',
    }),
    node('payment_short', 'payment', 'Visa (*0001)', { sub_type: 'Visa', status: 'active' }),
  ];

  return {
    nodes: [...emailNodes, ...platformNodes, ...prospectNodes, ...paymentNodes],
    links: [
      ...platformNodes.slice(0, 8).map((platform) => ({
        source: 'email_long',
        target: platform.id,
        type: 'child' as const,
        label: 'owns',
      })),
      { source: 'email_long', target: 'email_cycle', type: 'recovery' },
      { source: 'email_cycle', target: 'email_long', type: 'recovery', is_cycle: true },
      { source: 'email_short', target: 'prospect_long', type: 'prospect' },
      { source: 'email_diacritics', target: 'prospect_cjk', type: 'prospect' },
      { source: 'payment_long', target: 'platform_long', type: 'payment' },
    ],
    cycles_detected: [['email_long', 'email_cycle', 'email_long']],
    critical_nodes: ['email_long', 'email_cycle'],
  };
};

const createSingleNodeGraph = (): GraphData => ({
  nodes: [node('email_one', 'email', 'a@b.test', { sub_type: 'Personal', metrics: { platforms_count: 0 } })],
  links: [],
  cycles_detected: [],
  critical_nodes: [],
});

const createThousandNodeGraph = (): GraphData => {
  const emailNodes = Array.from({ length: 100 }, (_, index) =>
    node(`email_${index + 1}`, 'email', `cuenta.${String(index + 1).padStart(3, '0')}@empresa.test`, {
      sub_type: index % 2 ? 'Google Workspace' : 'Microsoft 365',
      status: 'secure',
      metrics: { platforms_count: 6 },
    })
  );
  const platformNodes = Array.from({ length: 600 }, (_, index) =>
    node(`platform_${index + 1}`, 'platform', `Servicio empresarial ${String(index + 1).padStart(3, '0')}`, {
      sub_type: index % 2 ? 'sso' : 'own_password',
      status: index % 13 === 0 ? 'free_trial' : 'active',
    })
  );
  const prospectNodes = Array.from({ length: 200 }, (_, index) =>
    node(`prospect_${index + 1}`, 'prospect', `Organización regional ${String(index + 1).padStart(3, '0')}`, {
      sub_type: 'demo_first',
      status: index % 2 ? 'demo_creada' : 'primer_contacto',
    })
  );
  const paymentNodes = Array.from({ length: 100 }, (_, index) =>
    node(`payment_${index + 1}`, 'payment', `Banco regional (*${String(1000 + index).slice(-4)})`, {
      sub_type: 'Banco regional',
      status: 'active',
    })
  );

  const links: GraphData['links'] = [
    ...platformNodes.map((platform, index) => ({
      source: emailNodes[index % emailNodes.length].id,
      target: platform.id,
      type: 'child' as const,
    })),
    ...prospectNodes.map((prospect, index) => ({
      source: emailNodes[index % emailNodes.length].id,
      target: prospect.id,
      type: 'prospect' as const,
    })),
    ...paymentNodes.map((payment, index) => ({
      source: payment.id,
      target: platformNodes[index * 6].id,
      type: 'payment' as const,
    })),
  ];

  return { nodes: [...emailNodes, ...platformNodes, ...prospectNodes, ...paymentNodes], links, cycles_detected: [], critical_nodes: [] };
};

export const createGraphStressFixture = (mode: GraphFixtureMode): GraphData => {
  if (mode === 'empty') return { ...emptyGraph, nodes: [], links: [], cycles_detected: [], critical_nodes: [] };
  if (mode === 'one') return createSingleNodeGraph();
  if (mode === 'thousand') return createThousandNodeGraph();
  return createWorstCaseGraph();
};
