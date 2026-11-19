import { API_BASE, getApiUserToken, getApiVaultToken, setApiVaultToken, setApiUserToken } from './api';
import { ApiError, createHttpApiError, normalizeResponseReadError, normalizeTransportError } from './apiErrors';
import type {
  C2CameraDiscovered,
  C2CameraFinding,
  C2Engagement,
  C2EngagementClient,
  C2EnvWarning,
  C2Preflight,
  C2ExploitServiceResult,
  C2Host,
  C2InterfacesResponse,
  C2Meta,
  C2ModuleStatus,
  C2OpsecState,
  C2PortResult,
  C2TopologyData,
  C2WifiCapture,
  C2WifiClient,
} from '../types/c2';

let activeC2EngagementId: string | null = null;

export function setActiveC2EngagementId(id: string | null): void {
  activeC2EngagementId = id?.trim() || null;
}

function buildC2Headers(includeJsonContentType = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }
  const vaultToken = getApiVaultToken();
  if (vaultToken) {
    headers['X-Vault-Token'] = vaultToken;
  }
  const userToken = getApiUserToken();
  if (userToken?.startsWith('cookie:')) {
    headers['X-LESSSO-CSRF'] = userToken.slice(7);
  } else if (userToken) {
    headers['Authorization'] = `Bearer ${userToken}`;
  }
  if (activeC2EngagementId) {
    headers['X-C2-Engagement-Id'] = activeC2EngagementId;
  }
  return headers;
}

async function fetchC2Response(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    throw normalizeTransportError(error);
  }
}

async function handleC2ErrorResponse(endpoint: string, response: Response, requestVaultToken: string | null, requestUserToken: string | null): Promise<never> {
  if (response.status === 401) {
    if (response.headers.get('X-Auth-Scope') === 'user') {
      if (requestUserToken && requestUserToken === getApiUserToken()) {
        setApiUserToken(null);
        window.dispatchEvent(new CustomEvent('core_user_session_expired'));
      }
    } else if ((requestVaultToken || '') === (getApiVaultToken() || '')) {
      setApiVaultToken(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vault_locked'));
      }
    }
    throw createHttpApiError(response.status, endpoint, false);
  }

  let detailMessage: string | undefined;
  try {
    const text = await response.text();
    if (text) {
      try {
        const parsed = JSON.parse(text) as { detail?: unknown; message?: unknown };
        if (typeof parsed.detail === 'string' && parsed.detail.trim()) {
          detailMessage = parsed.detail.trim();
        } else if (typeof parsed.message === 'string' && parsed.message.trim()) {
          detailMessage = parsed.message.trim();
        }
      } catch {
        if (text.trim().length > 0 && text.trim().length < 240 && !text.trim().startsWith('<')) {
          detailMessage = text.trim();
        }
      }
    }
  } catch {
    // Ignore body parse failure and fall back to createHttpApiError
  }

  if (detailMessage) {
    throw new ApiError(detailMessage, 'http', {
      status: response.status,
      retryable: response.status >= 500 || response.status === 408 || response.status === 429,
    });
  }

  throw createHttpApiError(response.status, endpoint, false);
}

async function c2Request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const endpoint = `/c2${path}`;
  const headers = { ...buildC2Headers(true), ...(options.headers as Record<string, string> | undefined) };
  const response = await fetchC2Response(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    await handleC2ErrorResponse(endpoint, response, headers['X-Vault-Token'] || null, headers.Authorization?.replace(/^Bearer /, '') || null);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw normalizeResponseReadError(error, response.status);
  }
}

function triggerBrowserBlobDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function c2DownloadBlob(path: string, fallbackFilename: string): Promise<Blob> {
  const endpoint = `/c2${path}`;
  const headers = buildC2Headers(false);
  const response = await fetchC2Response(`${API_BASE}${endpoint}`, {
    method: 'GET',
    headers,
  });
  if (!response.ok) {
    await handleC2ErrorResponse(endpoint, response, headers['X-Vault-Token'] || null, headers.Authorization?.replace(/^Bearer /, '') || null);
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || fallbackFilename;
  let blob: Blob;
  try {
    blob = await response.blob();
  } catch (error) {
    throw normalizeResponseReadError(error, response.status);
  }
  triggerBrowserBlobDownload(blob, filename);
  return blob;
}

// ---------------------------------------------------------------------------
// Request / Response contracts
// ---------------------------------------------------------------------------
export interface C2DiscoveryReq {
  interface: string;
  cidr: string;
  timeout?: number;
}

export interface C2PortscanReq {
  ip: string;
  ports?: string | number[] | null;
  timeout?: number;
  concurrency?: number;
  grab_banner?: boolean;
  mode?: 'connect' | 'syn';
  low_noise?: boolean;
}

export interface C2FingerprintReq {
  ip: string;
  mac?: string | null;
  open_ports?: number[];
}

export interface C2ExploitCheckReq {
  ip?: string | null;
  services: Array<Record<string, unknown>>;
}

export interface C2TopologyReq {
  interface: string;
  cidr: string;
  aggressive?: boolean;
  traffic_seconds?: number;
}

export interface C2ArpReq {
  interface: string;
  target_ip: string;
  gateway_ip: string;
}

export interface C2SniffReq {
  interface: string;
  bpf?: string | null;
}

export interface C2DnsReq {
  interface: string;
  mapping: Record<string, string>;
  spoof_all_to?: string | null;
}

export interface C2CredReq {
  interface: string;
}

export interface C2HttpInjectReq {
  target_ip: string;
  inject?: string;
  sslstrip?: boolean;
  port?: number;
}

export interface C2PoisonReq {
  interface: string;
  spoof_ip?: string | null;
  llmnr?: boolean;
  nbtns?: boolean;
  mdns?: boolean;
}

export interface C2WpadReq {
  interface: string;
  pac_port?: number;
  proxy_port?: number;
}

export interface C2Mitm6Req {
  interface: string;
  interval?: number;
  jitter?: number;
  mapping?: Record<string, string>;
  redirect_http_port?: number | null;
}

export interface C2WifiMonitorReq {
  interface: string;
  prepare?: boolean;
}

export interface C2WifiScanReq {
  interface: string;
  channels?: number[] | null;
  prepare?: boolean;
}

export interface C2WifiDeauthReq {
  interface: string;
  bssid: string;
  client?: string | null;
  channel?: number | null;
  prepare?: boolean;
  low_noise?: boolean;
  broadcast?: boolean;
}

export interface C2WifiHandshakeReq {
  interface: string;
  bssid: string;
  channel?: number | null;
  auto_convert?: boolean;
  prepare?: boolean;
}

export interface C2WifiPmkidReq {
  interface: string;
  bssid: string;
  channel?: number | null;
  auto_convert?: boolean;
  prepare?: boolean;
}

export interface C2CameraDiscoverReq {
  target: string;
  timeout?: number;
}

export interface C2CameraAuditReq {
  target: string;
  port?: number | null;
  modules?: string[];
  timeout?: number;
  depth?: number;
  interface?: string | null;
}

export interface C2OpsecProfileReq {
  interface: string;
  profile: string;
  dhcp?: boolean;
}

export interface C2OpsecGenReq {
  vendor?: string | null;
  kind?: string;
}

export interface C2OpsecHostReq {
  hostname: string;
  pretty?: string | null;
}

export interface C2OpsecMacReq {
  interface: string;
  mac?: string | null;
  vendor?: string | null;
  dhcp?: boolean;
}

export interface C2OpsecApplyReq {
  interface: string;
  hostname: string;
  mac?: string | null;
  vendor?: string | null;
  pretty?: string | null;
  dhcp?: boolean;
}

export interface C2OpsecRestoreReq {
  interface?: string | null;
}

// ---------------------------------------------------------------------------
// Info, status & cleanup
// ---------------------------------------------------------------------------
export const getMeta = () => c2Request<C2Meta>('/meta');
export const getService = () => c2Request<{ state: 'running' | 'unavailable'; detail: string }>('/service');

export const getInterfaces = () => c2Request<C2InterfacesResponse>('/interfaces');

export const getStatus = () => c2Request<C2ModuleStatus>('/status');

export const getEnvCheck = () => c2Request<{ warnings: C2EnvWarning[]; preflight?: C2Preflight | null }>('/envcheck');

export const getCleanupCount = () => c2Request<{ tagged_rules: number }>('/cleanup');

export const runCleanup = () => c2Request<{ removed: number }>('/cleanup', { method: 'POST', body: '{}' });

// ---------------------------------------------------------------------------
// Recon, ports, exploits & topology
// ---------------------------------------------------------------------------
export const runDiscovery = (req: C2DiscoveryReq) =>
  c2Request<{ hosts: C2Host[] }>('/discovery', { method: 'POST', body: JSON.stringify(req) });

export const runPortscan = (req: C2PortscanReq) =>
  c2Request<{ ip: string; open: C2PortResult[] }>('/portscan', { method: 'POST', body: JSON.stringify(req) });

export const runFingerprint = (req: C2FingerprintReq) =>
  c2Request<{ ip: string; os: string; ttl: number | null }>('/fingerprint', {
    method: 'POST',
    body: JSON.stringify(req),
  });

export const checkExploits = (req: C2ExploitCheckReq) =>
  c2Request<{ results: C2ExploitServiceResult[] }>('/exploits/check', {
    method: 'POST',
    body: JSON.stringify(req),
  });

export const runTopology = (req: C2TopologyReq) =>
  c2Request<C2TopologyData>('/topology', { method: 'POST', body: JSON.stringify(req) });

// ---------------------------------------------------------------------------
// MITM, sniffer, DNS, credentials & HTTP inject
// ---------------------------------------------------------------------------
export const startArp = (req: C2ArpReq) =>
  c2Request<{ status: string }>('/arp/start', { method: 'POST', body: JSON.stringify(req) });

export const stopArp = () =>
  c2Request<{ status: string }>('/arp/stop', { method: 'POST', body: '{}' });

export const startSniff = (req: C2SniffReq) =>
  c2Request<{ status: string }>('/sniff/start', { method: 'POST', body: JSON.stringify(req) });

export const stopSniff = () =>
  c2Request<{ status: string }>('/sniff/stop', { method: 'POST', body: '{}' });

export const startDns = (req: C2DnsReq) =>
  c2Request<{ status: string }>('/dns/start', { method: 'POST', body: JSON.stringify(req) });

export const stopDns = () =>
  c2Request<{ status: string }>('/dns/stop', { method: 'POST', body: '{}' });

export const startCreds = (req: C2CredReq) =>
  c2Request<{ status: string }>('/creds/start', { method: 'POST', body: JSON.stringify(req) });

export const stopCreds = () =>
  c2Request<{ status: string }>('/creds/stop', { method: 'POST', body: '{}' });

export const exportCredsBlob = () => c2DownloadBlob('/creds/export', 'creds.json');

export const clearCreds = () =>
  c2Request<{ status: string }>('/creds/clear', { method: 'POST', body: '{}' });

export const startHttpInject = (req: C2HttpInjectReq) =>
  c2Request<{ status: string }>('/httpinject/start', { method: 'POST', body: JSON.stringify(req) });

export const stopHttpInject = () =>
  c2Request<{ status: string }>('/httpinject/stop', { method: 'POST', body: '{}' });

// ---------------------------------------------------------------------------
// Poisoners, WPAD & mitm6
// ---------------------------------------------------------------------------
export const startPoison = (req: C2PoisonReq) =>
  c2Request<{ status: string }>('/poison/start', { method: 'POST', body: JSON.stringify(req) });

export const stopPoison = () =>
  c2Request<{ status: string }>('/poison/stop', { method: 'POST', body: '{}' });

export const startWpad = (req: C2WpadReq) =>
  c2Request<{ status: string }>('/wpad/start', { method: 'POST', body: JSON.stringify(req) });

export const stopWpad = () =>
  c2Request<{ status: string }>('/wpad/stop', { method: 'POST', body: '{}' });

export const startMitm6 = (req: C2Mitm6Req) =>
  c2Request<{ status: string }>('/mitm6/start', { method: 'POST', body: JSON.stringify(req) });

export const stopMitm6 = () =>
  c2Request<{ status: string }>('/mitm6/stop', { method: 'POST', body: '{}' });

// ---------------------------------------------------------------------------
// Wi-Fi (802.11)
// ---------------------------------------------------------------------------
export const getWifiIfaces = () =>
  c2Request<{ interfaces: Array<string | { name: string; mode?: string }> }>('/wifi/ifaces');

export const startWifiMonitor = (req: C2WifiMonitorReq) =>
  c2Request<{ interface?: string; mode?: string }>('/wifi/monitor/start', {
    method: 'POST',
    body: JSON.stringify(req),
  });

export const stopWifiMonitor = (req: C2WifiMonitorReq) =>
  c2Request<{ interface?: string; mode?: string }>('/wifi/monitor/stop', {
    method: 'POST',
    body: JSON.stringify(req),
  });

export const killWifiInterferers = () =>
  c2Request<{ stopped: string[]; message?: string }>('/wifi/kill', { method: 'POST', body: '{}' });

export const restoreWifiServices = () =>
  c2Request<{ started: string[]; message?: string }>('/wifi/restore-services', { method: 'POST', body: '{}' });

export const startWifiScan = (req: C2WifiScanReq) =>
  c2Request<{ status: string; interface: string }>('/wifi/scan/start', {
    method: 'POST',
    body: JSON.stringify(req),
  });

export const stopWifiScan = () =>
  c2Request<{ status: string }>('/wifi/scan/stop', { method: 'POST', body: '{}' });

export const getWifiClients = (bssid?: string) => {
  const qs = bssid ? `?bssid=${encodeURIComponent(bssid)}` : '';
  return c2Request<{ clients: C2WifiClient[] }>(`/wifi/clients${qs}`);
};

export const startWifiDeauth = (req: C2WifiDeauthReq) =>
  c2Request<{ status: string; interface: string }>('/wifi/deauth/start', {
    method: 'POST',
    body: JSON.stringify(req),
  });

export const stopWifiDeauth = () =>
  c2Request<{ status: string }>('/wifi/deauth/stop', { method: 'POST', body: '{}' });

export const startWifiHandshake = (req: C2WifiHandshakeReq) =>
  c2Request<{ status: string; interface: string }>('/wifi/handshake/start', {
    method: 'POST',
    body: JSON.stringify(req),
  });

export const stopWifiHandshake = () =>
  c2Request<{ status: string }>('/wifi/handshake/stop', { method: 'POST', body: '{}' });

export const startWifiPmkid = (req: C2WifiPmkidReq) =>
  c2Request<{ status: string; interface: string }>('/wifi/pmkid/start', {
    method: 'POST',
    body: JSON.stringify(req),
  });

export const stopWifiPmkid = () =>
  c2Request<{ status: string }>('/wifi/pmkid/stop', { method: 'POST', body: '{}' });

export const getWifiCaptures = () =>
  c2Request<{ captures: C2WifiCapture[] }>('/wifi/captures');

export const convertWifiCapture = (file: string) =>
  c2Request<{ file: string; ok: boolean; hashes: number; log?: string }>('/wifi/convert', {
    method: 'POST',
    body: JSON.stringify({ file }),
  });

export const downloadWifiCaptureBlob = (file: string) =>
  c2DownloadBlob(`/wifi/download?file=${encodeURIComponent(file)}`, file);

// ---------------------------------------------------------------------------
// Cameras
// ---------------------------------------------------------------------------
export const discoverCameras = (req: C2CameraDiscoverReq) =>
  c2Request<C2CameraDiscovered[]>('/camera/discover', {
    method: 'POST',
    body: JSON.stringify(req),
  });

export const auditCameras = (req: C2CameraAuditReq) =>
  c2Request<{ findings: C2CameraFinding[]; errors: string[] }>('/camera/audit', {
    method: 'POST',
    body: JSON.stringify(req),
  });

// ---------------------------------------------------------------------------
// OPSEC & Panic
// ---------------------------------------------------------------------------
export const getOpsec = () => c2Request<C2OpsecState>('/opsec');

export const previewOpsecProfile = (req: C2OpsecProfileReq) =>
  c2Request<{ profile: string; hostname: string; pretty: string; mac: string; vendor: string }>('/opsec/preview', {
    method: 'POST',
    body: JSON.stringify(req),
  });

export const generateOpsec = (req: C2OpsecGenReq) =>
  c2Request<{ hostname: string; mac: string; vendor: string }>('/opsec/generate', {
    method: 'POST',
    body: JSON.stringify(req),
  });

export const setOpsecHostname = (req: C2OpsecHostReq) =>
  c2Request<C2OpsecState>('/opsec/hostname', {
    method: 'POST',
    body: JSON.stringify(req),
  });

export const setOpsecMac = (req: C2OpsecMacReq) =>
  c2Request<C2OpsecState>('/opsec/mac', {
    method: 'POST',
    body: JSON.stringify(req),
  });

export const applyOpsecIdentity = (req: C2OpsecApplyReq) =>
  c2Request<C2OpsecState>('/opsec/apply', {
    method: 'POST',
    body: JSON.stringify(req),
  });

export const applyOpsecProfile = (req: C2OpsecProfileReq) =>
  c2Request<C2OpsecState>('/opsec/profile', {
    method: 'POST',
    body: JSON.stringify(req),
  });

export const restoreOpsec = (req: C2OpsecRestoreReq = {}) =>
  c2Request<C2OpsecState>('/opsec/restore', {
    method: 'POST',
    body: JSON.stringify(req),
  });

export const triggerPanic = () =>
  c2Request<{ status: string; actions: string[] }>('/panic', { method: 'POST', body: '{}' });

// ---------------------------------------------------------------------------
// WebSocket URL builder
// ---------------------------------------------------------------------------
export function buildC2WsUrl(): string {
  const base = API_BASE.replace(/\/+$/, '');
  if (/^https?:\/\//i.test(base)) {
    const wsBase = base.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
    return `${wsBase}/c2/ws`;
  }
  const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : '';
  const normalizedBase = base.startsWith('/') ? base : `/${base}`;
  return `${proto}//${host}${normalizedBase}/c2/ws`;
}

export function buildC2WsProtocols(): string[] {
  const vault = getApiVaultToken();
  const user = getApiUserToken();
  return [
    'lessso-v1',
    ...(vault ? [`vault.${vault}`] : []),
    ...(user ? [user.startsWith('cookie:') ? `csrf.${user.slice(7)}` : `user.${user}`] : []),
    ...(activeC2EngagementId ? [`engagement.${activeC2EngagementId}`] : []),
  ];
}

const getEngagements = () => c2Request<C2Engagement[]>('/engagements');
const getEngagementClients = () => c2Request<C2EngagementClient[]>('/clients');
const createEngagement = (payload: {
  client_id: string;
  title: string;
  scope_written_summary: string;
  authorized_targets: string;
  authorized_ipv6_targets: string;
  window_start: string;
  window_end: string;
}) => c2Request<C2Engagement>('/engagements', {
  method: 'POST',
  body: JSON.stringify(payload),
});

export const c2Api = {
  getEngagements,
  getEngagementClients,
  createEngagement,
  getMeta,
  getService,
  getInterfaces,
  getStatus,
  getEnvCheck,
  getCleanupCount,
  runCleanup,
  runDiscovery,
  runPortscan,
  runFingerprint,
  checkExploits,
  runTopology,
  startArp,
  stopArp,
  startSniff,
  stopSniff,
  startDns,
  stopDns,
  startCreds,
  stopCreds,
  exportCredsBlob,
  clearCreds,
  startHttpInject,
  stopHttpInject,
  startPoison,
  stopPoison,
  startWpad,
  stopWpad,
  startMitm6,
  stopMitm6,
  getWifiIfaces,
  startWifiMonitor,
  stopWifiMonitor,
  killWifiInterferers,
  restoreWifiServices,
  startWifiScan,
  stopWifiScan,
  getWifiClients,
  startWifiDeauth,
  stopWifiDeauth,
  startWifiHandshake,
  stopWifiHandshake,
  startWifiPmkid,
  stopWifiPmkid,
  getWifiCaptures,
  convertWifiCapture,
  downloadWifiCaptureBlob,
  discoverCameras,
  auditCameras,
  getOpsec,
  previewOpsecProfile,
  generateOpsec,
  setOpsecHostname,
  setOpsecMac,
  applyOpsecIdentity,
  applyOpsecProfile,
  restoreOpsec,
  triggerPanic,
  buildC2WsUrl,
};
