import { 
  EmailAccount, PlatformAccount, PaymentMethod, VaultStatus, 
  ExchangeRate, GraphData, AuditLogItem, VaultCredentialItem, Prospect,
  ClientIncome, DomainRenewal, AdvanceRenewalPayload,
  OneTimeExpense, InternalProject, SecureResource,
  CoreUser, CoreLoginResponse, CoreUserCreateResponse, TotpSetupResponse, CoreUserRole,
  WriteupSummary, WriteupDetail, WriteupBoard, WriteupCitation, WriteupAsset,
  WriteupRevision, WriteupExportFormat, WriteupStructuredFinding, WriteupStatus, WriteupSeverity,
  RuntimeConfig
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

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

let currentVaultToken: string | null = localStorage.getItem('emailsaver_vault_token');
let currentUserToken: string | null = sessionStorage.getItem('emailsaver_user_token');

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
  '/crm/sales',
  '/crm/capture/audit-url',
  '/crm/capture/duplicates',
  '/crm/capture/merge',
  '/crm/capture/undo-merge',
  '/crm/capture/discards',
  '/crm/capture/discard',
  '/crm/capture/google-places',
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

async function handleApiErrorResponse(endpoint: string, response: Response): Promise<never> {
  const coreEndpoint = isCoreUserEndpoint(endpoint);
  if (coreEndpoint) {
    if (
      response.status === 401 &&
      !endpoint.startsWith('/auth/login') &&
      !endpoint.startsWith('/auth/change-password') &&
      !endpoint.startsWith('/auth/setup-2fa') &&
      !endpoint.startsWith('/auth/verify-2fa')
    ) {
      setApiUserToken(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('core_user_session_expired'));
      }
    }
  } else if (
    response.status === 401 &&
    !endpoint.startsWith('/auth/unlock') &&
    !endpoint.startsWith('/auth/status')
  ) {
    setApiVaultToken(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vault_locked'));
    }
  }
  let errorDetail = 'Error en la petición al servidor';
  try {
    const err = await response.json();
    if (typeof err.detail === 'string') {
      errorDetail = err.detail;
    } else if (Array.isArray(err.detail)) {
      errorDetail = 'Revisa los datos ingresados: algún campo tiene un formato incorrecto o supera el límite permitido.';
    } else if (typeof err.message === 'string') {
      errorDetail = err.message;
    }
  } catch (_) {
    // ignore
  }
  throw new Error(errorDetail);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = buildAuthHeaders(options.headers as Record<string, string> | undefined, true);
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    await handleApiErrorResponse(endpoint, response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

async function requestBlobResponse(endpoint: string, options: RequestInit = {}): Promise<{ blob: Blob; filename: string; sha256?: string }> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = buildAuthHeaders(options.headers as Record<string, string> | undefined, !isFormData);
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    await handleApiErrorResponse(endpoint, response);
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const nameMatch = disposition.match(/filename="([^"]+)"/);
  return {
    blob: await response.blob(),
    filename: nameMatch ? nameMatch[1] : 'export',
    sha256: response.headers.get('X-Export-SHA256') || undefined,
  };
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

  // Core User Auth, 2FA & RBAC Users
  userLogin: (payload: { username_or_email: string; password: string; totp_code?: string }) =>
    request<CoreLoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
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
      prospect_id?: string | null;
      project_id?: string | null;
      save_revision?: boolean;
      revision_note?: string;
    }
  ) => request<WriteupDetail>(`/writeups/${writeupId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteWriteup: (writeupId: string) => request<void>(`/writeups/${writeupId}`, { method: 'DELETE' }),
  listWriteupRevisions: (writeupId: string) => request<WriteupRevision[]>(`/writeups/${writeupId}/revisions`),
  restoreWriteupRevision: (writeupId: string, revisionId: string) =>
    request<WriteupDetail>(`/writeups/${writeupId}/revisions/${revisionId}/restore`, { method: 'POST' }),

  uploadWriteupAsset: async (
    writeupId: string,
    file: File,
    caption?: string,
    convertToGif = false
  ): Promise<WriteupAsset> => {
    const form = new FormData();
    form.append('file', file);
    if (caption) form.append('caption', caption);
    if (convertToGif) form.append('convert_to_gif', 'true');
    const headers = buildAuthHeaders(undefined, false);
    const response = await fetch(`${API_BASE}/writeups/${writeupId}/assets`, {
      method: 'POST',
      headers,
      body: form,
    });
    if (!response.ok) {
      await handleApiErrorResponse(`/writeups/${writeupId}/assets`, response);
    }
    return response.json();
  },
  convertWriteupVideoToGif: (
    writeupId: string,
    assetId: string,
    opts?: { fps?: number; maxWidth?: number }
  ) => {
    const params = new URLSearchParams();
    if (opts?.fps) params.set('fps', String(opts.fps));
    if (opts?.maxWidth) params.set('max_width', String(opts.maxWidth));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<WriteupAsset>(`/writeups/${writeupId}/assets/${assetId}/convert-to-gif${qs}`, {
      method: 'POST',
    });
  },
  fetchWriteupAssetBlob: async (writeupId: string, assetId: string): Promise<Blob> => {
    const { blob } = await requestBlobResponse(`/writeups/${writeupId}/assets/${assetId}`);
    return blob;
  },
  deleteWriteupAsset: (writeupId: string, assetId: string) =>
    request<void>(`/writeups/${writeupId}/assets/${assetId}`, { method: 'DELETE' }),

  createWriteupBoard: (writeupId: string, payload: { title: string; scene_json?: string; svg_snapshot?: string | null; element_count?: number }) =>
    request<WriteupBoard>(`/writeups/${writeupId}/boards`, { method: 'POST', body: JSON.stringify(payload) }),
  updateWriteupBoard: (
    writeupId: string,
    boardId: string,
    payload: { title?: string; scene_json?: string; svg_snapshot?: string | null; element_count?: number }
  ) => request<WriteupBoard>(`/writeups/${writeupId}/boards/${boardId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteWriteupBoard: (writeupId: string, boardId: string) =>
    request<void>(`/writeups/${writeupId}/boards/${boardId}`, { method: 'DELETE' }),

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
    }
  ) => request<WriteupCitation>(`/writeups/${writeupId}/citations`, { method: 'POST', body: JSON.stringify(payload) }),
  updateWriteupCitation: (
    writeupId: string,
    citationId: string,
    payload: { board_element_id?: string | null; quoted_text?: string; color?: string; note?: string | null; line_start?: number; line_end?: number }
  ) => request<WriteupCitation>(`/writeups/${writeupId}/citations/${citationId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteWriteupCitation: (writeupId: string, citationId: string) =>
    request<void>(`/writeups/${writeupId}/citations/${citationId}`, { method: 'DELETE' }),

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

