import { 
  EmailAccount, PlatformAccount, PaymentMethod, VaultStatus, 
  ExchangeRate, GraphData, AuditLogItem, VaultCredentialItem, Prospect,
  ClientIncome, DomainRenewal, AdvanceRenewalPayload,
  OneTimeExpense, InternalProject, SecureResource
} from '../types';

const API_BASE = '/api/v1';

export interface OSMBounds {
  min_lat: number;
  min_lon: number;
  max_lat: number;
  max_lon: number;
}

export interface OSMZone {
  slug: string;
  zone: string;
  center: [number, number];
  zoom: number;
  bbox: OSMBounds;
  colonias: string[];
}

export interface OSMMapConfig {
  tile_url_template: string;
  center: [number, number];
  zoom: number;
  attribution: string;
}

export interface OSMLead {
  osm_id: string;
  osm_url: string;
  name: string;
  sector: string;
  subsector?: string | null;
  category: string;
  zone: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  opening_hours?: string | null;
  lat: number;
  lon: number;
  source: 'openstreetmap';
}

export interface OSMSearchResponse {
  source: 'cache' | 'openstreetmap';
  attribution: string;
  cell_id: string;
  sector: string;
  zone: string;
  search_bounds: OSMBounds;
  fetched_at: string;
  expires_at: string;
  result_count: number;
  results: OSMLead[];
}

let currentVaultToken: string | null = localStorage.getItem('emailsaver_vault_token');

export function setApiVaultToken(token: string | null) {
  currentVaultToken = token;
  if (token) {
    localStorage.setItem('emailsaver_vault_token', token);
  } else {
    localStorage.removeItem('emailsaver_vault_token');
  }
}

export function getApiVaultToken(): string | null {
  return currentVaultToken;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (currentVaultToken) {
    headers['X-Vault-Token'] = currentVaultToken;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    if ((response.status === 401 || response.status === 403) && !endpoint.startsWith('/auth/unlock') && !endpoint.startsWith('/auth/status')) {
      setApiVaultToken(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vault_locked'));
      }
    }
    let errorDetail = 'Error en la petición al servidor';
    try {
      const err = await response.json();
      errorDetail = err.detail || err.message || errorDetail;
    } catch (_) {
      // ignore
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

export const api = {
  // Auth & Vault
  getVaultStatus: () => request<VaultStatus>('/auth/status'),
  setupMasterPassword: (master_password: string) => 
    request<{ message: string; token: string; timeout_minutes: number }>('/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ master_password })
    }),
  unlockVault: (master_password: string) =>
    request<{ message: string; token: string; timeout_minutes: number; remaining_seconds: number }>('/auth/unlock', {
      method: 'POST',
      body: JSON.stringify({ master_password })
    }),
  lockVault: () => request<{ message: string }>('/auth/lock', { method: 'POST' }),

  // Emails
  getEmails: (search?: string, provider?: string) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (provider) params.append('provider', provider);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<EmailAccount[]>(`/emails${qs}`);
  },
  getEmailDetail: (id: string) => request<EmailAccount>(`/emails/${id}`),
  createEmail: (data: any) => request<EmailAccount>('/emails', { method: 'POST', body: JSON.stringify(data) }),
  updateEmail: (id: string, data: any) => request<EmailAccount>(`/emails/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmail: (id: string) => request<{ message: string }>(`/emails/${id}`, { method: 'DELETE' }),

  // Platforms
  getPlatforms: (filters: { email_id?: string; status?: string; search?: string; tag?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.email_id) params.append('email_id', filters.email_id);
    if (filters.status) params.append('status', filters.status);
    if (filters.search) params.append('search', filters.search);
    if (filters.tag) params.append('tag', filters.tag);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<PlatformAccount[]>(`/platforms${qs}`);
  },
  getPlatformDetail: (id: string) => request<PlatformAccount>(`/platforms/${id}`),
  createPlatform: (data: any) => request<PlatformAccount>('/platforms', { method: 'POST', body: JSON.stringify(data) }),
  updatePlatform: (id: string, data: any) => request<PlatformAccount>(`/platforms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePlatform: (id: string) => request<{ message: string }>(`/platforms/${id}`, { method: 'DELETE' }),
  getSingleSecret: (platformId: string, secretType: string, itemId?: string) => {
    const params = new URLSearchParams({ secret_type: secretType });
    if (itemId) params.append('item_id', itemId);
    return request<{ value: string; label: string }>(`/platforms/${platformId}/secret?${params.toString()}`);
  },
  getBillingHistory: (limit = 100) => request<any[]>(`/platforms/billing-history?limit=${limit}`),

  // Payment Methods
  getPaymentMethods: () => request<PaymentMethod[]>('/payments'),
  createPaymentMethod: (data: any) => request<PaymentMethod>('/payments', { method: 'POST', body: JSON.stringify(data) }),
  updatePaymentMethod: (id: string, data: any) => request<PaymentMethod>(`/payments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePaymentMethod: (id: string) => request<{ message: string }>(`/payments/${id}`, { method: 'DELETE' }),

  // Passwords
  getVaultCredentials: () => request<VaultCredentialItem[]>('/passwords/vault'),
  generatePassword: (params: Record<string, any>) => {
    const qs = new URLSearchParams(params).toString();
    return request<{ password: string; entropy: any }>(`/passwords/generate?${qs}`);
  },
  getPasswordHistory: (targetId: string) => request<any[]>(`/passwords/history/${targetId}`),

  // Graph
  getGraph: () => request<GraphData>('/graph'),

  // Exchange
  getExchangeRate: () => request<ExchangeRate>('/exchange'),
  setManualExchangeRate: (rate: number, is_manual: boolean = true) =>
    request<ExchangeRate>('/exchange/manual', {
      method: 'POST',
      body: JSON.stringify({ rate, is_manual })
    }),
  syncExchangeRate: () => request<ExchangeRate>('/exchange/sync', { method: 'POST' }),

  // Trash & Audit
  getTrash: () => request<any[]>('/trash'),
  restoreItem: (type: string, id: string) => request<{ message: string }>(`/trash/restore/${type}/${id}`, { method: 'POST' }),
  purgeItem: (type: string, id: string) => request<{ message: string }>(`/trash/purge/${type}/${id}`, { method: 'DELETE' }),
  getAuditLogs: (limit = 50) => request<AuditLogItem[]>(`/trash/audit?limit=${limit}`),

  // Settings
  getSettings: () => request<any>('/settings'),
  updateSettings: (data: any) => request<any>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  exportVault: () => request<any>('/settings/export'),

  // Security Audit & Emergency Kit
  getSecurityHealth: () => request<any>('/security/health'),
  getEmergencyKit: () => request<any>('/security/emergency-kit'),
  checkPasswordPwned: (password?: string, platformId?: string) =>
    request<any>('/security/check-pwned', {
      method: 'POST',
      body: JSON.stringify({ password, platform_id: platformId })
    }),

  // Dedicated Audit Trail
  getAuditTrail: (limit = 50, offset = 0, action?: string, entityType?: string) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (action) params.append('action', action);
    if (entityType) params.append('entity_type', entityType);
    return request<any>(`/audit/logs?${params.toString()}`);
  },

  // Encrypted Vault Backup & Restore
  exportEncryptedVault: (export_password: string) =>
    request<any>('/vault/export-encrypted', {
      method: 'POST',
      body: JSON.stringify({ export_password })
    }),
  restoreEncryptedVault: (export_password: string, backup_data: any) =>
    request<any>('/vault/restore-encrypted', {
      method: 'POST',
      body: JSON.stringify({ export_password, backup_data })
    }),

  // TOTP Authenticator
  setupPlatformTotp: (platformId: string, totp_secret: string) =>
    request<any>(`/platforms/${platformId}/totp`, {
      method: 'POST',
      body: JSON.stringify({ totp_secret })
    }),
  getPlatformTotp: (platformId: string) =>
    request<any>(`/platforms/${platformId}/totp`),
  deletePlatformTotp: (platformId: string) =>
    request<{ message: string }>(`/platforms/${platformId}/totp`, { method: 'DELETE' }),

  // Importer
  importBatch: (source: string, items: any[]) =>
    request<any>('/importer/batch', {
      method: 'POST',
      body: JSON.stringify({ source, items })
    }),

  // Prospects / Demos CRM
  getProspects: (filters: {
    email_id?: string;
    status?: string;
    workflow_type?: string;
    sla_status?: string;
    search?: string;
    tag?: string;
  } = {}) => {
    const params = new URLSearchParams();
    if (filters.email_id) params.append('email_id', filters.email_id);
    if (filters.status) params.append('status', filters.status);
    if (filters.workflow_type) params.append('workflow_type', filters.workflow_type);
    if (filters.sla_status) params.append('sla_status', filters.sla_status);
    if (filters.search) params.append('search', filters.search);
    if (filters.tag) params.append('tag', filters.tag);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<Prospect[]>(`/prospects${qs}`);
  },
  getProspectDetail: (id: string) => request<Prospect>(`/prospects/${id}`),
  createProspect: (data: any) => request<Prospect>('/prospects', { method: 'POST', body: JSON.stringify(data) }),
  updateProspect: (id: string, data: any) => request<Prospect>(`/prospects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  markProspectResponded: (id: string) => request<Prospect>(`/prospects/${id}/respond`, { method: 'POST' }),
  recordProspectContactAttempt: (
    id: string,
    channel: 'whatsapp' | 'email' | 'phone' | 'template',
    followupSlaHoursOrNote?: number | string,
    auto_advance_status: boolean = true,
    followup_sla_hours: number = 48
  ) => {
    const isNumberArg = typeof followupSlaHoursOrNote === 'number';
    const finalSlaHours = isNumberArg ? followupSlaHoursOrNote : followup_sla_hours;
    const finalNote = isNumberArg ? undefined : followupSlaHoursOrNote;
    return request<Prospect>(`/prospects/${id}/contact-attempt`, {
      method: 'POST',
      body: JSON.stringify({
        channel,
        note: finalNote,
        auto_advance_status,
        followup_sla_hours: finalSlaHours
      })
    });
  },
  reactivateProspect: (id: string, followupSlaHours: number = 48) =>
    request<Prospect>(`/prospects/${id}/reactivate?followup_sla_hours=${followupSlaHours}`, { method: 'POST' }),
  recycleProspectDemo: (id: string) =>
    request<Prospect>(`/prospects/${id}/recycle-demo`, { method: 'POST' }),
  resetProspectTimer: (id: string, restartFromNow: boolean = true) =>
    request<Prospect>(`/prospects/${id}/reset-timer?restart_from_now=${restartFromNow}`, { method: 'POST' }),
  deleteProspect: (id: string) => request<{ message: string }>(`/prospects/${id}`, { method: 'DELETE' }),

  // OpenStreetMap prospect capture
  getCaptureZones: () => request<{ zones: OSMZone[] }>('/crm/capture/zones'),
  getCaptureMapConfig: () => request<OSMMapConfig>('/crm/capture/map-config'),
  searchOSMLeads: (payload: {
    sector: string;
    zone: string;
    subsector?: string;
    max_cache_age_days?: number;
    bbox?: OSMBounds;
  }) => request<OSMSearchResponse>('/crm/capture/search', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  // Client Incomes / Pagos Recibidos
  getIncomes: () => request<ClientIncome[]>('/finances/incomes'),
  createIncome: (data: Partial<ClientIncome>) =>
    request<ClientIncome>('/finances/incomes', { method: 'POST', body: JSON.stringify(data) }),
  cloneIncomeNextMonth: (id: string) =>
    request<ClientIncome>(`/finances/incomes/${id}/clone-next-month`, { method: 'POST' }),
  updateIncome: (id: string, data: Partial<ClientIncome>) =>
    request<ClientIncome>(`/finances/incomes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteIncome: (id: string) =>
    request<{ message: string }>(`/finances/incomes/${id}`, { method: 'DELETE' }),

  // Domain & Hosting Renewals Monitor
  getRenewals: () => request<DomainRenewal[]>('/finances/renewals'),
  createRenewal: (data: Partial<DomainRenewal>) =>
    request<DomainRenewal>('/finances/renewals', { method: 'POST', body: JSON.stringify(data) }),
  updateRenewal: (id: string, data: Partial<DomainRenewal>) =>
    request<DomainRenewal>(`/finances/renewals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  advanceRenewalCycle: (id: string, payload?: AdvanceRenewalPayload) =>
    request<DomainRenewal>(`/finances/renewals/${id}/advance-cycle`, {
      method: 'POST',
      body: payload ? JSON.stringify(payload) : undefined,
    }),
  deleteRenewal: (id: string) =>
    request<{ message: string }>(`/finances/renewals/${id}`, { method: 'DELETE' }),

  // One-Time Expenses / Gastos Únicos
  getExpenses: () => request<OneTimeExpense[]>('/finances/expenses'),
  createExpense: (data: Partial<OneTimeExpense>) =>
    request<OneTimeExpense>('/finances/expenses', { method: 'POST', body: JSON.stringify(data) }),
  updateExpense: (id: string, data: Partial<OneTimeExpense>) =>
    request<OneTimeExpense>(`/finances/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteExpense: (id: string) =>
    request<{ message: string }>(`/finances/expenses/${id}`, { method: 'DELETE' }),

  // Internal Projects / Proyectos Propios
  getProjects: () => request<InternalProject[]>('/finances/projects'),
  createProject: (data: Partial<InternalProject>) =>
    request<InternalProject>('/finances/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: string, data: Partial<InternalProject>) =>
    request<InternalProject>(`/finances/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    request<{ message: string }>(`/finances/projects/${id}`, { method: 'DELETE' }),

  // Secure Resources & Encrypted Notes
  getResources: () => request<SecureResource[]>('/finances/resources'),
  createResource: (data: Partial<SecureResource>) =>
    request<SecureResource>('/finances/resources', { method: 'POST', body: JSON.stringify(data) }),
  updateResource: (id: string, data: Partial<SecureResource>) =>
    request<SecureResource>(`/finances/resources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteResource: (id: string) =>
    request<{ message: string }>(`/finances/resources/${id}`, { method: 'DELETE' }),
};

