export type C2SectionId =
  | 'c2_hosts'
  | 'c2_topo'
  | 'c2_ports'
  | 'c2_mitm'
  | 'c2_sniff'
  | 'c2_dns'
  | 'c2_creds'
  | 'c2_http'
  | 'c2_poison'
  | 'c2_mitm6'
  | 'c2_wifi'
  | 'c2_camera'
  | 'c2_opsec';

export interface C2Interface {
  name: string;
  ip?: string | null;
  netmask?: string | null;
  mac?: string | null;
  cidr?: string | null;
  wireless?: boolean;
  mode?: string;
}

export interface C2Gateway {
  ip: string;
  iface: string;
}

export interface C2InterfacesResponse {
  interfaces: C2Interface[];
  gateway: C2Gateway | null;
}

export interface C2Meta {
  demo_mode?: boolean;
  demo?: boolean;
  root?: boolean;
  os?: string;
  hostname?: string;
  version?: string;
  [key: string]: unknown;
}

export interface C2Engagement {
  id: string;
  title: string;
  authorized_targets: string;
  authorized_ipv6_targets: string;
  status: 'autorizado' | 'en_ejecucion';
  window_start: string;
  window_end: string;
  active_now: boolean;
}

export interface C2EngagementClient {
  id: string;
  company_name: string;
}

export type C2ModuleKey =
  | 'arp'
  | 'sniffer'
  | 'dns'
  | 'creds'
  | 'httpinject'
  | 'wifi_scan'
  | 'deauth'
  | 'handshake'
  | 'pmkid'
  | 'poison'
  | 'wpad'
  | 'mitm6';

export type C2ModuleStatus = Record<C2ModuleKey, boolean> & Record<string, boolean>;

export interface C2Host {
  ip: string;
  mac: string;
  vendor?: string;
  os?: string;
  ttl?: number | null;
}

export interface C2PortResult {
  ip?: string;
  port: number;
  proto?: string;
  service?: string;
  product?: string;
  version?: string;
  banner?: string;
}

export interface C2ExploitItem {
  edb_id?: string | number;
  title: string;
  url?: string;
  type?: string;
  platform?: string;
  [key: string]: unknown;
}

export interface C2ExploitServiceResult {
  ip?: string;
  port?: number;
  proto?: string;
  service?: string | null;
  product?: string | null;
  version?: string | null;
  banner?: string | null;
  query?: string;
  exploits: C2ExploitItem[];
}

export type C2DeviceType =
  | 'self'
  | 'router'
  | 'internet'
  | 'pc'
  | 'phone'
  | 'tv'
  | 'printer'
  | 'iot'
  | 'camera'
  | 'console'
  | 'nas'
  | 'speaker'
  | 'plc'
  | 'hmi'
  | 'rtu'
  | 'scada'
  | 'drive'
  | 'relay'
  | 'robot'
  | 'switch'
  | 'gateway'
  | 'sensor'
  | 'unknown'
  | (string & {});

export interface C2TopologyNode {
  id: string;
  ip?: string;
  type: C2DeviceType;
  label?: string;
  mac?: string;
  vendor?: string;
  hostname?: string;
  os?: string;
  ttl?: number | null;
  open_ports?: number[];
  confidence?: number;
  evidence?: string[];
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fixed?: boolean;
}

export interface C2TopologyEdge {
  source: string;
  target: string;
  kind?: string;
  count?: number;
}

export interface C2TopologyData {
  nodes: C2TopologyNode[];
  edges: C2TopologyEdge[];
}

export interface C2SniffPacket {
  id?: string;
  proto: string;
  src: string;
  dst: string;
  sport?: number | string | null;
  dport?: number | string | null;
  len?: number;
  info?: string;
  ts?: string;
}

export interface C2CredItem {
  id?: string;
  proto: string;
  data: string;
  src?: string;
  dst?: string;
  ts?: string;
}

export interface C2HttpRequest {
  id?: string;
  host?: string;
  path?: string;
  dst?: string;
  method?: string;
  ts?: string;
}

export interface C2PoisonEvent {
  id?: string;
  proto: string;
  name: string;
  src: string;
  ts?: string;
}

export interface C2Mitm6Event {
  id?: string;
  qtype: string;
  name: string;
  src: string;
  ts?: string;
}

export interface C2WifiAp {
  ssid: string;
  bssid: string;
  channel?: number | null;
  signal?: number | null;
  enc?: string;
}

export interface C2WifiClient {
  bssid: string;
  client: string;
  signal?: number | null;
  channel?: number | null;
  last_seen?: number;
  age?: number;
}

export interface C2HandshakeRow {
  key: string;
  bssid: string;
  client: string;
  msgs: number[];
  captured: boolean;
  ssid?: string;
  file?: string;
}

export interface C2WifiCapture {
  name: string;
  size: number;
  kind: string;
}

export interface C2CameraDiscovered {
  ip: string;
  port: number;
  vendor?: string;
  service?: string;
  [key: string]: unknown;
}

export interface C2CameraFinding {
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info' | (string & {});
  module?: string;
  category?: string;
  description?: string;
  title?: string;
  detail?: string;
  evidence?: string;
  url?: string;
}

export interface C2OpsecLinkInterface {
  name: string;
  mac?: string | null;
  permanent?: string | null;
  spoofed: boolean;
}

export interface C2OpsecProfile {
  id: string;
  label: string;
  blurb: string;
  kind?: string;
  vendor?: string;
  pretty?: string;
}

export interface C2OpsecState {
  hostname: string;
  pretty?: string | null;
  original_hostname?: string | null;
  spoofed: boolean;
  interfaces: C2OpsecLinkInterface[];
  vendors: string[];
  profiles: C2OpsecProfile[];
}

export interface C2EnvWarning {
  level: 'ok' | 'warn' | 'error' | (string & {});
  msg: string;
}

export interface C2Preflight {
  root: boolean;
  tools: Record<string, boolean>;
}

export type C2LogType =
  | 'info'
  | 'error'
  | 'cred'
  | 'arp'
  | 'dns'
  | 'sniff'
  | 'inject'
  | 'wifi'
  | 'poison'
  | 'wpad'
  | 'dns6'
  | 'opsec'
  | 'camera';

export interface C2LogEntry {
  id: string;
  ts: string;
  type: C2LogType;
  msg: string;
}

export type C2WsEvent =
  | { type: 'ping' }
  | { type: 'packet'; proto: string; src: string; dst: string; sport?: number | string | null; dport?: number | string | null; len?: number; info?: string }
  | { type: 'cred'; proto: string; data: string; src?: string; dst?: string }
  | { type: 'port'; port: number; service?: string; banner?: string; proto?: string }
  | { type: 'portscan'; msg: string }
  | { type: 'fingerprint'; ip: string; os?: string; ttl?: number | null }
  | { type: 'inject'; msg: string }
  | { type: 'httpreq'; host?: string; path?: string; dst?: string; method?: string }
  | { type: 'wifi_ap'; ssid: string; bssid: string; channel?: number | null; signal?: number | null; enc?: string }
  | { type: 'wifi_client'; bssid: string; client: string; signal?: number | null; channel?: number | null; last_seen?: number }
  | { type: 'wifi_eapol'; bssid: string; client: string; msg: number }
  | { type: 'handshake'; bssid: string; client: string; essid?: string; file: string }
  | { type: 'hashcat'; ok: boolean; file: string; hashes?: number; log?: string }
  | { type: 'wifi'; msg: string }
  | { type: 'poison'; proto: string; name?: string; src?: string; msg?: string }
  | { type: 'wpad'; msg: string }
  | { type: 'dns6'; qtype: string; name: string; src: string }
  | { type: 'mitm6'; msg: string }
  | { type: 'pmkid'; bssid: string; essid?: string; file: string }
  | { type: 'cleanup'; msg: string }
  | { type: 'opsec'; msg: string }
  | { type: 'arp'; msg: string }
  | { type: 'dns'; msg: string }
  | { type: 'sniff'; msg: string }
  | { type: 'topology'; msg: string }
  | {
      type: 'camera';
      msg?: string;
      found?: C2CameraDiscovered;
      module_done?: string;
      n?: number;
      finding?: C2CameraFinding;
      audit_done?: { findings: C2CameraFinding[]; errors?: string[] };
    }
  | { type: 'error'; msg: string }
  | { type: 'info'; msg: string }
  | { type: string; [key: string]: unknown };
