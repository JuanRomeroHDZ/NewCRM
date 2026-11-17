import { 
  EmailAccount, EmailDomainPostureResponse, PlatformAccount, PaymentMethod, VaultStatus,
  ExchangeRate, GraphData, AuditLogItem, VaultCredentialItem, Prospect,
  ClientIncome, DomainRenewal, AdvanceRenewalPayload,
  OneTimeExpense, InternalProject, SecureResource,
  CoreUser, CoreLoginResponse, CoreUserCreateResponse, TotpSetupResponse, CoreUserRole,
  WriteupSummary, WriteupDetail, WriteupBoard, WriteupCitation, WriteupAsset,
  WriteupRevision, WriteupRevisionAuthor, WriteupExportFormat, WriteupStructuredFinding, WriteupStatus, WriteupSeverity,
  WriteupSnippet, WriteupWorkbench, RuntimeConfig, SecurityAuditResponse
} from '../types';
import { ApiError, createHttpApiError, normalizeResponseReadError, normalizeTransportError } from './apiErrors';

export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

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
  default_city?: string;
  default_zone?: string;
  default_sector?: string;
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

export interface ApiPage<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

export interface WriteupRevisionFilters {
  offset?: number;
  before_revision_number?: number;
  limit?: number;
  search?: string;
  change_type?: WriteupRevision['change_type'];
  author_id?: string;
  created_after?: string;
  created_before?: string;
  /** Omit Markdown and the snapshot until the user opens a revision. */
  include_content?: boolean;
}

let currentVaultToken: string | null = localStorage.getItem('emailsaver_vault_token');
let currentUserToken: string | null = sessionStorage.getItem('emailsaver_user_token');
const activeWriteupEditLeases = new Map<string, { token: string; clientId: string }>();

// The vault token is intentionally shared by same-origin tabs through
// localStorage. Keep the in-memory request header in sync when another tab
// unlocks or locks the vault; otherwise an already-open tab keeps sending a
// stale token until its next 401 response.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.storageArea !== localStorage || (event.key !== 'emailsaver_vault_token' && event.key !== null)) return;

    const nextToken = event.key === null
      ? localStorage.getItem('emailsaver_vault_token')
      : event.newValue;
    if (nextToken === currentVaultToken) return;

    currentVaultToken = nextToken;
    window.dispatchEvent(new CustomEvent('vault_token_changed', { detail: { token: nextToken } }));
  });
}

export function setWriteupEditLease(writeupId: string, token: string, clientId: string) {
  activeWriteupEditLeases.set(writeupId, { token, clientId });
}

export function clearWriteupEditLease(writeupId?: string) {
  if (writeupId) activeWriteupEditLeases.delete(writeupId);
  else activeWriteupEditLeases.clear();
}

function addWriteupEditLeaseHeaders(endpoint: string, headers: Record<string, string>): Record<string, string> {
  const reportId = endpoint.match(/^\/writeups\/([^/?]+)/)?.[1];
  const lease = reportId ? activeWriteupEditLeases.get(reportId) : undefined;
  if (!reportId || !lease) return headers;
  return {
    ...headers,
    'X-Writeup-Edit-Lease': lease.token,
    'X-Writeup-Client-ID': lease.clientId,
  };
}

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

export function setApiUserToken(token: string | null) {
  currentUserToken = token;
  if (token) {
    sessionStorage.setItem('emailsaver_user_token', token);
  } else {
    sessionStorage.removeItem('emailsaver_user_token');
  }
}

export function getApiUserToken(): string | null {
  return currentUserToken;
}

const CORE_USER_ENDPOINT_PREFIXES = [
  '/auth/login',
  '/auth/logout',
  '/auth/me',
  '/auth/change-password',
  '/auth/setup-2fa',
  '/auth/verify-2fa',
  '/users',
  '/settings/trash-retention',
  '/crm/sales',
  '/crm/capture/audit-url',
  '/crm/capture/duplicates',
  '/crm/capture/merge',
  '/crm/capture/undo-merge',
  '/crm/capture/discards',
  '/crm/capture/discard',
  '/crm/capture/google-places',
  '/trash',
  '/personal-finances',
  '/agenda',
  '/comms',
  '/workshop',
  '/integrations',
];

function isCoreUserEndpoint(endpoint: string): boolean {
  return CORE_USER_ENDPOINT_PREFIXES.some((prefix) => endpoint.startsWith(prefix));
}

function buildAuthHeaders(extra?: Record<string, string>, includeJsonContentType = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }
  if (extra) {
    Object.assign(headers, extra);
  }
  if (currentVaultToken) {
    headers['X-Vault-Token'] = currentVaultToken;
  }
  if (currentUserToken) {
    headers['Authorization'] = `Bearer ${currentUserToken}`;
  }
  return headers;
}

async function handleApiErrorResponse(endpoint: string, response: Response, requestHeaders: Record<string, string>): Promise<never> {
  const coreEndpoint = isCoreUserEndpoint(endpoint);
  const userScope = response.headers?.get('X-Auth-Scope') === 'user';
  if (coreEndpoint || userScope) {
    if (
      response.status === 401 &&
      !endpoint.startsWith('/auth/login') &&
      !endpoint.startsWith('/auth/change-password') &&
      !endpoint.startsWith('/auth/setup-2fa') &&
      !endpoint.startsWith('/auth/verify-2fa') &&
      (requestHeaders.Authorization || '') === (currentUserToken ? `Bearer ${currentUserToken}` : '')
    ) {
      setApiUserToken(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('core_user_session_expired'));
      }
    }
  } else if (
    response.status === 401 &&
    !endpoint.startsWith('/auth/unlock') &&
    !endpoint.startsWith('/auth/status') &&
    (requestHeaders['X-Vault-Token'] || '') === (currentVaultToken || '')
  ) {
    setApiVaultToken(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vault_locked'));
    }
  }
  if (response.status === 423) {
    const result = await response.json().catch(() => null);
    if (typeof result?.detail === 'string') {
      throw new ApiError(result.detail, 'http', { status: response.status });
    }
  }
  if ((endpoint === '/auth/bootstrap-account' || endpoint === '/users') &&
      (response.status === 400 || response.status === 409)) {
    const result = await response.json().catch(() => null);
    const accountMessages = [
      'La creación inicial de cuenta ya no está disponible.',
      'El nombre de usuario o correo está reservado para la cuenta inicial del sistema.',
      'El nombre de usuario o correo ya está registrado.',
      'El nombre de usuario o correo ya se encuentra registrado.',
      'La cuenta inicial ya fue creada.',
    ];
    if (accountMessages.includes(result?.detail)) {
      throw new ApiError(result.detail, 'http', { status: response.status });
    }
  }
  throw createHttpApiError(response.status, endpoint, coreEndpoint);
}

async function fetchApiResponse(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    throw normalizeTransportError(error);
  }
}

async function readApiJson<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch (error) {
    throw normalizeResponseReadError(error, response.status);
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = addWriteupEditLeaseHeaders(endpoint, buildAuthHeaders(options.headers as Record<string, string> | undefined, true));
  const response = await fetchApiResponse(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    await handleApiErrorResponse(endpoint, response, headers);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return readApiJson<T>(response);
}

async function requestUpdatedAtHeader(endpoint: string, options: RequestInit = {}): Promise<string | null> {
  const headers = addWriteupEditLeaseHeaders(endpoint, buildAuthHeaders(options.headers as Record<string, string> | undefined, true));
  const response = await fetchApiResponse(`${API_BASE}${endpoint}`, { ...options, headers });
  if (!response.ok) await handleApiErrorResponse(endpoint, response, headers);
  return response.headers.get('X-Writeup-Updated-At');
}

async function requestPage<T>(endpoint: string, offset: number, limit: number): Promise<ApiPage<T>> {
  const headers = buildAuthHeaders(undefined, true);
  const response = await fetchApiResponse(`${API_BASE}${endpoint}`, { headers });
  if (!response.ok) {
    await handleApiErrorResponse(endpoint, response, headers);
  }
  const items = await readApiJson<T[]>(response);
  const totalValue = response.headers.get('X-Total-Count');
  const totalHeader = totalValue === null ? Number.NaN : Number(totalValue);
  const total = Number.isSafeInteger(totalHeader) && totalHeader >= 0
    ? totalHeader
    : offset + items.length;
  const hasMoreHeader = response.headers.get('X-Has-More');
  const hasMore = hasMoreHeader === null
    ? items.length === limit
    : hasMoreHeader.toLowerCase() === 'true';
  return { items, total, hasMore };
}

async function requestBlobResponse(endpoint: string, options: RequestInit = {}): Promise<{ blob: Blob; filename: string; sha256?: string }> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = addWriteupEditLeaseHeaders(endpoint, buildAuthHeaders(options.headers as Record<string, string> | undefined, !isFormData));
  const response = await fetchApiResponse(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    await handleApiErrorResponse(endpoint, response, headers);
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const nameMatch = disposition.match(/filename="([^"]+)"/);
  return {
    blob: await response.blob().catch((error) => {
      throw normalizeResponseReadError(error, response.status);
    }),
    filename: nameMatch ? nameMatch[1] : 'export',
    sha256: response.headers.get('X-Export-SHA256') || undefined,
  };
}

export const api = {
  // Auth & Vault
  getVaultStatus: () => request<VaultStatus>('/auth/status'),
  recordVaultActivity: () => request<{ remaining_seconds: number; account_active: boolean | null }>('/auth/activity', { method: 'POST' }),
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
  verifyVaultPassword: (master_password: string) =>
    request<{ verified: boolean }>('/auth/verify-password', {
      method: 'POST',
      body: JSON.stringify({ master_password })
    }),
  lockVault: async () => {
    // Release any active writeup lease while the vault token is still valid.
    // Bound the wait so a stalled release cannot delay a security lock.
    const writeupIds = [...activeWriteupEditLeases.keys()];
    if (writeupIds.length) {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.allSettled(writeupIds.map((id) => api.releaseWriteupEditLease(id, controller.signal))),
          new Promise<void>((resolve) => { timer = setTimeout(resolve, 350); }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        controller.abort();
        clearWriteupEditLease();
      }
    }
    return request<{ message: string }>('/auth/lock', { method: 'POST' });
  },

  // Emails
  getEmails: (search?: string, provider?: string) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (provider) params.append('provider', provider);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<EmailAccount[]>(`/emails${qs}`);
  },
  getEmailsPage: (filters: { search?: string; provider?: string; limit: number; offset: number }) => {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.provider) params.append('provider', filters.provider);
    params.set('limit', String(filters.limit));
    params.set('offset', String(filters.offset));
    return requestPage<EmailAccount>(`/emails?${params.toString()}`, filters.offset, filters.limit);
  },
  getEmailDetail: (id: string) => request<EmailAccount>(`/emails/${id}`),
  checkEmailDomainPosture: (domain: string, dkimSelector?: string) => request<EmailDomainPostureResponse>('/emails/domain-posture', {
    method: 'POST',
    body: JSON.stringify({ domain, dkim_selector: dkimSelector?.trim() || null }),
  }),
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
  updateTrashRetention: (trash_retention_days: number) =>
    request<any>('/settings/trash-retention', {
      method: 'PUT',
      body: JSON.stringify({ trash_retention_days }),
    }),
  exportVault: () => request<any>('/settings/export'),

  // Security Audit & Emergency Kit
  getSecurityHealth: () => request<SecurityAuditResponse>('/security/health'),
  getEmergencyKit: () => request<any>('/security/emergency-kit'),
  checkPasswordPwned: (password?: string, platformId?: string) =>
    request<any>('/security/check-pwned', {
      method: 'POST',
      body: JSON.stringify({ password, platform_id: platformId })
    }),

  // Dedicated Audit Trail
  getAuditTrail: (limit = 25, offset = 0, action?: string, entityType?: string, search?: string) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (action) params.append('action', action);
    if (entityType) params.append('entity_type', entityType);
    if (search?.trim()) params.append('search', search.trim());
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
  verifyEncryptedVault: (export_password: string, backup_data: unknown) =>
    request<{ valid: boolean; counts: Record<string, number>; partial: boolean }>('/vault/verify-encrypted', {
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
  getProspectsPage: (filters: {
    email_id?: string;
    status?: string;
    workflow_type?: string;
    sla_status?: string;
    search?: string;
    tag?: string;
    limit: number;
    offset: number;
  }) => {
    const params = new URLSearchParams();
    if (filters.email_id) params.append('email_id', filters.email_id);
    if (filters.status) params.append('status', filters.status);
    if (filters.workflow_type) params.append('workflow_type', filters.workflow_type);
    if (filters.sla_status) params.append('sla_status', filters.sla_status);
    if (filters.search) params.append('search', filters.search);
    if (filters.tag) params.append('tag', filters.tag);
    params.set('limit', String(filters.limit));
    params.set('offset', String(filters.offset));
    return requestPage<Prospect>(`/prospects?${params.toString()}`, filters.offset, filters.limit);
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
  }, options: Pick<RequestInit, 'signal'> = {}) => request<OSMSearchResponse>('/crm/capture/search', {
    method: 'POST',
    body: JSON.stringify(payload),
    ...options,
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

  // Core User Auth, 2FA & RBAC Users
  userLogin: (payload: { username_or_email: string; password: string; totp_code?: string }) =>
    request<CoreLoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  bootstrapAccount: (payload: { username: string; email: string; full_name: string; password: string }) =>
    request<CoreLoginResponse>('/auth/bootstrap-account', { method: 'POST', body: JSON.stringify(payload) }),
  getBootstrapStatus: () => request<{ available: boolean }>('/auth/bootstrap-status'),
  userLogout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
  getCurrentUser: () => request<CoreUser>('/auth/me'),
  changeUserPassword: (payload: { current_password: string; new_password: string; totp_code?: string }) =>
    request<{ message: string }>('/auth/change-password', { method: 'POST', body: JSON.stringify(payload) }),
  setup2FA: (current_password?: string) =>
    request<TotpSetupResponse>('/auth/setup-2fa', {
      method: 'POST',
      body: JSON.stringify(current_password ? { current_password } : {}),
    }),
  verify2FA: (code: string) =>
    request<{ message: string }>('/auth/verify-2fa', { method: 'POST', body: JSON.stringify({ code }) }),
  listUsers: () => request<CoreUser[]>('/users'),
  createUser: (payload: { username: string; email: string; full_name: string; role: CoreUserRole }) =>
    request<CoreUserCreateResponse>('/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (
    userId: string,
    payload: { full_name?: string; role?: CoreUserRole; is_active?: boolean; unlock?: boolean }
  ) => request<CoreUser>(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Pentest Writeups & Whiteboards
  acquireWriteupEditLease: async (writeupId: string, clientId: string) => {
    const lease = await request<{ acquired: true; token: string; client_id: string; holder: string; expires_at: string; ttl_seconds: number }>(
      `/writeups/${writeupId}/edit-lease`, { method: 'POST', body: JSON.stringify({ client_id: clientId }) },
    );
    setWriteupEditLease(writeupId, lease.token, clientId);
    return lease;
  },
  renewWriteupEditLease: async (writeupId: string, clientId: string) => {
    const lease = await request<{ acquired: true; token: string; client_id: string; holder: string; expires_at: string; ttl_seconds: number }>(
      `/writeups/${writeupId}/edit-lease`, { method: 'POST', body: JSON.stringify({ client_id: clientId }) },
    );
    setWriteupEditLease(writeupId, lease.token, clientId);
    return lease;
  },
  releaseWriteupEditLease: async (writeupId: string, signal?: AbortSignal) => {
    const leaseBeingReleased = activeWriteupEditLeases.get(writeupId);
    try {
      return await request<{ released: boolean }>(`/writeups/${writeupId}/edit-lease`, { method: 'DELETE', signal });
    } finally {
      // A slow release response must not erase a newer lease acquired for the
      // same writeup while the request was in flight.
      if (activeWriteupEditLeases.get(writeupId) === leaseBeingReleased) {
        clearWriteupEditLease(writeupId);
      }
    }
  },
  setWriteupManualLock: (writeupId: string) =>
    request<{ manual_locked: boolean; manual_locked_by: string | null; manual_locked_at: string | null }>(`/writeups/${writeupId}/manual-lock`, { method: 'POST' }),
  clearWriteupManualLock: (writeupId: string) =>
    request<{ manual_locked: boolean; manual_locked_by: string | null; manual_locked_at: string | null }>(`/writeups/${writeupId}/manual-lock`, { method: 'DELETE' }),
  listWriteups: (filters?: { status?: string; severity?: string; prospect_id?: string; project_id?: string; q?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.severity) params.append('severity', filters.severity);
    if (filters?.prospect_id) params.append('prospect_id', filters.prospect_id);
    if (filters?.project_id) params.append('project_id', filters.project_id);
    if (filters?.q) params.append('q', filters.q);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<WriteupSummary[]>(`/writeups${qs}`);
  },
  listWriteupsPage: (filters: {
    status?: string;
    severity?: string;
    prospect_id?: string;
    project_id?: string;
    q?: string;
    limit: number;
    offset: number;
  }) => {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.severity) params.append('severity', filters.severity);
    if (filters.prospect_id) params.append('prospect_id', filters.prospect_id);
    if (filters.project_id) params.append('project_id', filters.project_id);
    if (filters.q) params.append('q', filters.q);
    params.set('limit', String(filters.limit));
    params.set('offset', String(filters.offset));
    return requestPage<WriteupSummary>(`/writeups?${params.toString()}`, filters.offset, filters.limit);
  },
  createWriteup: (payload: {
    title: string;
    status?: WriteupStatus;
    severity?: WriteupSeverity;
    cvss_score?: number | null;
    cvss_vector?: string | null;
    cwe_id?: string | null;
    cve_id?: string | null;
    target_scope?: string | null;
    tags?: string[];
    markdown_content?: string;
    executive_summary?: string | null;
    findings?: WriteupStructuredFinding[];
    workbench?: WriteupWorkbench;
    prospect_id?: string | null;
    project_id?: string | null;
  }) => request<WriteupDetail>('/writeups', { method: 'POST', body: JSON.stringify(payload) }),
  getWriteup: (writeupId: string) => request<WriteupDetail>(`/writeups/${writeupId}`),
  updateWriteup: (
    writeupId: string,
    payload: {
      title?: string;
      status?: WriteupStatus;
      severity?: WriteupSeverity;
      cvss_score?: number | null;
      cvss_vector?: string | null;
      cwe_id?: string | null;
      cve_id?: string | null;
      target_scope?: string | null;
      tags?: string[];
      markdown_content?: string;
      executive_summary?: string | null;
      findings?: WriteupStructuredFinding[];
      workbench?: WriteupWorkbench;
      prospect_id?: string | null;
      project_id?: string | null;
      expected_updated_at?: string;
      save_revision?: boolean;
      revision_note?: string;
      revision_type?: WriteupRevision['change_type'];
    }
  ) => request<WriteupDetail>(`/writeups/${writeupId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  listWriteupSnippets: () => request<WriteupSnippet[]>('/writeups/snippets'),
  createWriteupSnippet: (payload: { name: string; template: string }) =>
    request<WriteupSnippet>('/writeups/snippets', { method: 'POST', body: JSON.stringify(payload) }),
  updateWriteupSnippet: (snippetId: string, payload: { name?: string; template?: string }) =>
    request<WriteupSnippet>(`/writeups/snippets/${encodeURIComponent(snippetId)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteWriteupSnippet: (snippetId: string) =>
    request<void>(`/writeups/snippets/${encodeURIComponent(snippetId)}`, { method: 'DELETE' }),
  deleteWriteup: (writeupId: string, expectedUpdatedAt?: string) =>
    requestUpdatedAtHeader(`/writeups/${writeupId}${expectedUpdatedAt ? `?expected_updated_at=${encodeURIComponent(expectedUpdatedAt)}` : ''}`, { method: 'DELETE' }),
  listWriteupRevisions: (writeupId: string, offsetOrFilters: number | WriteupRevisionFilters = 0, extraFilters: WriteupRevisionFilters = {}) => {
    const filters = typeof offsetOrFilters === 'number'
      ? { ...extraFilters, offset: offsetOrFilters }
      : offsetOrFilters;
    const params = new URLSearchParams({
      offset: String(filters.offset ?? 0),
      limit: String(filters.limit ?? 40),
      include_content: String(filters.include_content ?? true),
    });
    if (filters.before_revision_number !== undefined) params.set('before_revision_number', String(filters.before_revision_number));
    if (filters.search?.trim()) params.set('search', filters.search.trim());
    if (filters.change_type) params.set('change_type', filters.change_type);
    if (filters.author_id) params.set('author_id', filters.author_id);
    if (filters.created_after) params.set('created_after', filters.created_after);
    if (filters.created_before) params.set('created_before', filters.created_before);
    return request<WriteupRevision[]>(`/writeups/${writeupId}/revisions?${params.toString()}`);
  },
  listWriteupRevisionAuthors: (writeupId: string) => request<WriteupRevisionAuthor[]>(`/writeups/${writeupId}/revisions/authors`),
  getWriteupRevision: (writeupId: string, revisionId: string) => request<WriteupRevision>(`/writeups/${writeupId}/revisions/${revisionId}`),
  restoreWriteupRevision: (writeupId: string, revisionId: string, expectedUpdatedAt?: string) =>
    request<WriteupDetail>(`/writeups/${writeupId}/revisions/${revisionId}/restore${expectedUpdatedAt ? `?expected_updated_at=${encodeURIComponent(expectedUpdatedAt)}` : ''}`, { method: 'POST' }),

  uploadWriteupAsset: async (
    writeupId: string,
    file: File,
    caption?: string,
    convertToGif = false,
    expectedUpdatedAt?: string
  ): Promise<WriteupAsset> => {
    const form = new FormData();
    form.append('file', file);
    if (caption) form.append('caption', caption);
    if (convertToGif) form.append('convert_to_gif', 'true');
    if (expectedUpdatedAt) form.append('expected_updated_at', expectedUpdatedAt);
    const endpoint = `/writeups/${writeupId}/assets`;
    const headers = addWriteupEditLeaseHeaders(endpoint, buildAuthHeaders(undefined, false));
    const response = await fetchApiResponse(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: form,
    });
    if (!response.ok) {
      await handleApiErrorResponse(endpoint, response, headers);
    }
    return readApiJson<WriteupAsset>(response);
  },
  convertWriteupVideoToGif: (
    writeupId: string,
    assetId: string,
    opts?: { fps?: number; maxWidth?: number; expectedUpdatedAt?: string }
  ) => {
    const params = new URLSearchParams();
    if (opts?.fps) params.set('fps', String(opts.fps));
    if (opts?.maxWidth) params.set('max_width', String(opts.maxWidth));
    if (opts?.expectedUpdatedAt) params.set('expected_updated_at', opts.expectedUpdatedAt);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<WriteupAsset>(`/writeups/${writeupId}/assets/${assetId}/convert-to-gif${qs}`, {
      method: 'POST',
    });
  },
  fetchWriteupAssetBlob: async (writeupId: string, assetId: string): Promise<Blob> => {
    const { blob } = await requestBlobResponse(`/writeups/${writeupId}/assets/${assetId}`);
    return blob;
  },
  deleteWriteupAsset: (writeupId: string, assetId: string, expectedUpdatedAt?: string) =>
    requestUpdatedAtHeader(`/writeups/${writeupId}/assets/${assetId}${expectedUpdatedAt ? `?expected_updated_at=${encodeURIComponent(expectedUpdatedAt)}` : ''}`, { method: 'DELETE' }),

  createWriteupBoard: (writeupId: string, payload: { title: string; scene_json?: string; svg_snapshot?: string | null; element_count?: number; expected_updated_at?: string }) =>
    request<WriteupBoard>(`/writeups/${writeupId}/boards`, { method: 'POST', body: JSON.stringify(payload) }),
  updateWriteupBoard: (
    writeupId: string,
    boardId: string,
    payload: { title?: string; scene_json?: string; svg_snapshot?: string | null; element_count?: number; expected_updated_at?: string }
  ) => request<WriteupBoard>(`/writeups/${writeupId}/boards/${boardId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteWriteupBoard: (writeupId: string, boardId: string, expectedUpdatedAt?: string) =>
    requestUpdatedAtHeader(`/writeups/${writeupId}/boards/${boardId}${expectedUpdatedAt ? `?expected_updated_at=${encodeURIComponent(expectedUpdatedAt)}` : ''}`, { method: 'DELETE' }),

  createWriteupCitation: (
    writeupId: string,
    payload: {
      board_id: string;
      anchor_id: string;
      board_element_id?: string | null;
      heading_path?: string | null;
      line_start: number;
      line_end: number;
      quoted_text: string;
      color?: string;
      note?: string | null;
      expected_updated_at?: string;
    }
  ) => request<WriteupCitation>(`/writeups/${writeupId}/citations`, { method: 'POST', body: JSON.stringify(payload) }),
  updateWriteupCitation: (
    writeupId: string,
    citationId: string,
    payload: { board_element_id?: string | null; quoted_text?: string; color?: string; note?: string | null; line_start?: number; line_end?: number; expected_updated_at?: string }
  ) => request<WriteupCitation>(`/writeups/${writeupId}/citations/${citationId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteWriteupCitation: (writeupId: string, citationId: string, expectedUpdatedAt?: string) =>
    requestUpdatedAtHeader(`/writeups/${writeupId}/citations/${citationId}${expectedUpdatedAt ? `?expected_updated_at=${encodeURIComponent(expectedUpdatedAt)}` : ''}`, { method: 'DELETE' }),

  previewWriteup: (writeupId: string, redactForClient = false) =>
    request<{ sanitized_html: string; redacted_for_client: boolean }>(
      `/writeups/${writeupId}/preview?redact_for_client=${redactForClient ? 'true' : 'false'}`,
      { method: 'POST' }
    ),
  exportWriteup: (
    writeupId: string,
    payload: {
      format: WriteupExportFormat;
      redact_for_client?: boolean;
      include_watermark?: boolean;
      include_toc?: boolean;
      toc_depth?: number;
      include_figure_index?: boolean;
      include_table_index?: boolean;
      font_size_pt?: number;
      watermark_text?: string;
      rendered_diagrams?: Record<string, string>;
    }
  ) => requestBlobResponse(`/writeups/${writeupId}/export`, { method: 'POST', body: JSON.stringify(payload) }),
  cloneWriteup: (writeupId: string, title?: string) =>
    request<WriteupDetail>(`/writeups/${writeupId}/clone`, {
      method: 'POST',
      body: JSON.stringify(title ? { title } : {}),
    }),
  getRuntimeConfig: () => request<RuntimeConfig>('/settings/runtime-config'),
  updateRuntimeConfig: (payload: Partial<RuntimeConfig>) =>
    request<RuntimeConfig>('/settings/runtime-config', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};

