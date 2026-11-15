import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVault } from './VaultContext';
import { c2Api, buildC2WsUrl, buildC2WsProtocols } from '../lib/c2Api';
import { ApiError } from '../lib/apiErrors';
import { createC2SessionGuard } from '../lib/c2SessionGuard';
import { selectC2Interface } from '../lib/c2Interfaces';
import { C2Lang, getStoredC2Lang, setStoredC2Lang, tC2 } from '../lib/c2I18n';
import type {
  C2CameraDiscovered,
  C2CameraFinding,
  C2CredItem,
  C2EnvWarning,
  C2ExploitServiceResult,
  C2Gateway,
  C2HandshakeRow,
  C2Host,
  C2HttpRequest,
  C2Interface,
  C2LogEntry,
  C2LogType,
  C2Meta,
  C2Mitm6Event,
  C2ModuleKey,
  C2ModuleStatus,
  C2OpsecState,
  C2PoisonEvent,
  C2PortResult,
  C2SniffPacket,
  C2TopologyData,
  C2WifiAp,
  C2WifiCapture,
  C2WifiClient,
  C2WsEvent,
} from '../types/c2';

const MAX_SNIFF_PACKETS = 200;
const MAX_HTTP_REQUESTS = 200;
const MAX_POISON_EVENTS = 200;
const MAX_MITM6_EVENTS = 200;
const MAX_CONSOLE_LOGS = 400;

const DEFAULT_MODULE_STATUS: C2ModuleStatus = {
  arp: false,
  sniffer: false,
  dns: false,
  creds: false,
  httpinject: false,
  wifi_scan: false,
  deauth: false,
  handshake: false,
  pmkid: false,
  poison: false,
  wpad: false,
  mitm6: false,
};

const MODULE_KEYS: C2ModuleKey[] = [
  'arp',
  'sniffer',
  'dns',
  'creds',
  'httpinject',
  'wifi_scan',
  'deauth',
  'handshake',
  'pmkid',
  'poison',
  'wpad',
  'mitm6',
];

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatNow(): string {
  return new Date().toLocaleTimeString();
}

export interface C2ContextValue {
  lang: C2Lang;
  setLang: (lang: C2Lang) => void;
  t: (key: string, vars?: Record<string, string | number | boolean | null | undefined>) => string;

  meta: C2Meta | null;
  demoMode: boolean;
  wsConnected: boolean;
  serviceState: 'idle' | 'checking' | 'running' | 'unavailable' | 'forbidden';
  serviceDetail: string;
  retryService: () => Promise<void>;

  interfaces: C2Interface[];
  gateway: C2Gateway | null;
  selectedIface: string;
  setSelectedIface: (iface: string) => void;
  currentInterface: C2Interface | null;

  moduleStatus: C2ModuleStatus;
  activeModuleCount: number;
  activeModuleNames: string[];

  opsecState: C2OpsecState | null;
  envWarnings: C2EnvWarning[];

  // Discovery, ports, exploits & topology
  hosts: C2Host[];
  setHosts: React.Dispatch<React.SetStateAction<C2Host[]>>;
  hostOsMap: Record<string, { os: string; ttl?: number | null }>;
  portResults: C2PortResult[];
  setPortResults: React.Dispatch<React.SetStateAction<C2PortResult[]>>;
  portScanIp: string;
  setPortScanIp: (ip: string) => void;
  exploitResults: C2ExploitServiceResult[];
  setExploitResults: React.Dispatch<React.SetStateAction<C2ExploitServiceResult[]>>;
  topologyData: C2TopologyData | null;
  setTopologyData: React.Dispatch<React.SetStateAction<C2TopologyData | null>>;

  // Live traffic & capture buffers
  sniffPackets: C2SniffPacket[];
  clearSniffPackets: () => void;
  creds: C2CredItem[];
  setCreds: React.Dispatch<React.SetStateAction<C2CredItem[]>>;
  clearCredsBuffer: () => void;
  httpRequests: C2HttpRequest[];
  clearHttpRequests: () => void;
  poisonEvents: C2PoisonEvent[];
  clearPoisonEvents: () => void;
  mitm6Events: C2Mitm6Event[];
  clearMitm6Events: () => void;

  // Wi-Fi buffers
  wifiAps: C2WifiAp[];
  wifiClients: C2WifiClient[];
  handshakes: C2HandshakeRow[];
  wifiCaptures: C2WifiCapture[];
  wifiIfaces: Array<string | { name: string; mode?: string }>;
  clearWifiScanState: () => void;

  // Camera buffers
  cameraDiscovered: C2CameraDiscovered[];
  setCameraDiscovered: React.Dispatch<React.SetStateAction<C2CameraDiscovered[]>>;
  cameraFindings: C2CameraFinding[];
  setCameraFindings: React.Dispatch<React.SetStateAction<C2CameraFinding[]>>;
  clearCameraState: () => void;

  // Console logs
  consoleLogs: C2LogEntry[];
  addLog: (type: C2LogType, msg: string) => void;
  clearLogs: () => void;

  // Cross-panel target state & actions
  arpTarget: string;
  setArpTarget: (ip: string) => void;
  arpGateway: string;
  setArpGateway: (ip: string) => void;
  portIp: string;
  setPortIp: (ip: string) => void;
  camTarget: string;
  setCamTarget: (target: string) => void;
  deauthBssid: string;
  setDeauthBssid: (bssid: string) => void;
  deauthChannel: string;
  setDeauthChannel: (channel: string) => void;
  deauthClient: string;
  setDeauthClient: (client: string) => void;
  pmkidBssid: string;
  setPmkidBssid: (bssid: string) => void;
  pmkidChannel: string;
  setPmkidChannel: (channel: string) => void;

  pinHostTarget: (ip: string) => void;
  scanHostPorts: (ip: string) => void;
  selectWifiApForDeauth: (bssid: string, channel?: number | null) => void;
  selectWifiApForPmkid: (bssid: string, channel?: number | null, ssid?: string) => void;
  auditDiscoveredCamera: (ip: string) => void;
  triggerPanic: () => Promise<void>;

  // Manual refreshers
  refreshMeta: () => Promise<void>;
  refreshInterfaces: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshOpsec: () => Promise<void>;
  refreshEnvCheck: () => Promise<void>;
  refreshWifiCaptures: () => Promise<void>;
  refreshWifiClients: () => Promise<void>;
  refreshWifiIfaces: () => Promise<void>;
}

const C2Context = createContext<C2ContextValue | undefined>(undefined);

export const C2Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isUnlocked, activeSection, setActiveSection, confirm, showToast } = useVault();

  const [lang, setLangState] = useState<C2Lang>(() => getStoredC2Lang());
  const setLang = useCallback((next: C2Lang) => {
    setLangState(next);
    setStoredC2Lang(next);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number | boolean | null | undefined>) =>
      tC2(lang, key, vars),
    [lang]
  );

  const tRef = useRef(t);
  tRef.current = t;

  const [meta, setMeta] = useState<C2Meta | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [serviceState, setServiceState] = useState<'idle' | 'checking' | 'running' | 'unavailable' | 'forbidden'>('idle');
  const [serviceDetail, setServiceDetail] = useState('');
  const [enteredC2, setEnteredC2] = useState(false);
  const inC2Workspace = activeSection.startsWith('c2_');
  const unlockedRef = useRef(isUnlocked);
  const sessionGuardRef = useRef(createC2SessionGuard(isUnlocked));
  sessionGuardRef.current.update(isUnlocked);
  const serviceRequestRef = useRef(0);
  unlockedRef.current = isUnlocked;

  const retryService = useCallback(async (quiet = false) => {
    if (!unlockedRef.current) return;
    const requestId = ++serviceRequestRef.current;
    if (!quiet) setServiceState((current) => current === 'running' ? current : 'checking');
    try {
      const result = await c2Api.getService();
      if (!unlockedRef.current || requestId !== serviceRequestRef.current) return;
      setServiceState(result.state === 'running' ? 'running' : 'unavailable');
      setServiceDetail(result.detail || '');
    } catch (error) {
      if (!unlockedRef.current || requestId !== serviceRequestRef.current) return;
      setServiceState(error instanceof ApiError && error.status === 403 ? 'forbidden' : 'unavailable');
      setServiceDetail(error instanceof Error ? error.message : 'No se pudo consultar el servicio C2.');
    }
  }, []);

  const [interfaces, setInterfaces] = useState<C2Interface[]>([]);
  const [gateway, setGateway] = useState<C2Gateway | null>(null);
  const [selectedIface, setSelectedIface] = useState('');

  const [moduleStatus, setModuleStatus] = useState<C2ModuleStatus>(DEFAULT_MODULE_STATUS);
  const [opsecState, setOpsecState] = useState<C2OpsecState | null>(null);
  const [envWarnings, setEnvWarnings] = useState<C2EnvWarning[]>([]);

  const [hosts, setHosts] = useState<C2Host[]>([]);
  const [hostOsMap, setHostOsMap] = useState<Record<string, { os: string; ttl?: number | null }>>({});
  const [portResults, setPortResults] = useState<C2PortResult[]>([]);
  const [portScanIp, setPortScanIp] = useState('');
  const [exploitResults, setExploitResults] = useState<C2ExploitServiceResult[]>([]);
  const [topologyData, setTopologyData] = useState<C2TopologyData | null>(null);

  const [sniffPackets, setSniffPackets] = useState<C2SniffPacket[]>([]);
  const [creds, setCreds] = useState<C2CredItem[]>([]);
  const [httpRequests, setHttpRequests] = useState<C2HttpRequest[]>([]);
  const [poisonEvents, setPoisonEvents] = useState<C2PoisonEvent[]>([]);
  const [mitm6Events, setMitm6Events] = useState<C2Mitm6Event[]>([]);

  const [wifiAps, setWifiAps] = useState<C2WifiAp[]>([]);
  const [wifiClients, setWifiClients] = useState<C2WifiClient[]>([]);
  const [handshakes, setHandshakes] = useState<C2HandshakeRow[]>([]);
  const [wifiCaptures, setWifiCaptures] = useState<C2WifiCapture[]>([]);
  const [wifiIfaces, setWifiIfaces] = useState<Array<string | { name: string; mode?: string }>>([]);

  const [cameraDiscovered, setCameraDiscovered] = useState<C2CameraDiscovered[]>([]);
  const [cameraFindings, setCameraFindings] = useState<C2CameraFinding[]>([]);

  const [consoleLogs, setConsoleLogs] = useState<C2LogEntry[]>([]);

  // Cross-panel target state
  const [arpTarget, setArpTarget] = useState('');
  const [arpGateway, setArpGateway] = useState('');
  const [portIp, setPortIp] = useState('');
  const [camTarget, setCamTarget] = useState('');
  const [deauthBssid, setDeauthBssid] = useState('');
  const [deauthChannel, setDeauthChannel] = useState('');
  const [deauthClient, setDeauthClient] = useState('');
  const [pmkidBssid, setPmkidBssid] = useState('');
  const [pmkidChannel, setPmkidChannel] = useState('');

  const addLog = useCallback((type: C2LogType, msg: string) => {
    const entry: C2LogEntry = {
      id: makeId(),
      ts: formatNow(),
      type,
      msg,
    };
    setConsoleLogs((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_CONSOLE_LOGS ? next.slice(next.length - MAX_CONSOLE_LOGS) : next;
    });
  }, []);

  const clearLogs = useCallback(() => setConsoleLogs([]), []);
  const clearSniffPackets = useCallback(() => setSniffPackets([]), []);
  const clearCredsBuffer = useCallback(() => setCreds([]), []);
  const clearHttpRequests = useCallback(() => setHttpRequests([]), []);
  const clearPoisonEvents = useCallback(() => setPoisonEvents([]), []);
  const clearMitm6Events = useCallback(() => setMitm6Events([]), []);
  const clearWifiScanState = useCallback(() => {
    setWifiAps([]);
    setWifiClients([]);
    setDeauthClient('');
  }, []);
  const clearCameraState = useCallback(() => {
    setCameraDiscovered([]);
    setCameraFindings([]);
  }, []);

  // API refreshers (strictly gated on isUnlocked)
  const refreshMeta = useCallback(async () => {
    if (!isUnlocked) return;
    const isCurrentSession = sessionGuardRef.current.capture();
    try {
      const data = await c2Api.getMeta();
      if (!isCurrentSession()) return;
      setMeta(data);
    } catch {
      // Optional endpoint; ignore silently if unavailable
    }
  }, [isUnlocked]);

  const refreshInterfaces = useCallback(async () => {
    if (!isUnlocked) return;
    const isCurrentSession = sessionGuardRef.current.capture();
    try {
      const data = await c2Api.getInterfaces();
      if (!isCurrentSession()) return;
      const list = data.interfaces || [];
      setInterfaces(list);
      setGateway(data.gateway || null);
      setSelectedIface((prev) => selectC2Interface(list, data.gateway, prev));
      if (data.gateway?.ip) {
        setArpGateway((prev) => prev || data.gateway!.ip);
      }
    } catch (err) {
      if (!isCurrentSession()) return;
      addLog('error', err instanceof Error ? err.message : 'Error loading interfaces');
    }
  }, [isUnlocked, addLog]);

  const refreshStatus = useCallback(async () => {
    if (!isUnlocked) return;
    const isCurrentSession = sessionGuardRef.current.capture();
    try {
      const st = await c2Api.getStatus();
      if (!isCurrentSession()) return;
      setModuleStatus({ ...DEFAULT_MODULE_STATUS, ...st });
    } catch {
      // WS/UI indicates connectivity issues; avoid spamming console on poll ticks
    }
  }, [isUnlocked]);

  const refreshOpsec = useCallback(async () => {
    if (!isUnlocked) return;
    const isCurrentSession = sessionGuardRef.current.capture();
    try {
      const data = await c2Api.getOpsec();
      if (!isCurrentSession()) return;
      setOpsecState(data);
    } catch (err) {
      if (!isCurrentSession()) return;
      addLog('error', err instanceof Error ? err.message : 'Error loading OPSEC');
    }
  }, [isUnlocked, addLog]);

  const refreshEnvCheck = useCallback(async () => {
    if (!isUnlocked) return;
    const isCurrentSession = sessionGuardRef.current.capture();
    try {
      const data = await c2Api.getEnvCheck();
      if (!isCurrentSession()) return;
      setEnvWarnings(data.warnings || []);
    } catch {
      if (!isCurrentSession()) return;
      setEnvWarnings([]);
    }
  }, [isUnlocked]);

  const refreshWifiCaptures = useCallback(async () => {
    if (!isUnlocked) return;
    const isCurrentSession = sessionGuardRef.current.capture();
    try {
      const data = await c2Api.getWifiCaptures();
      if (!isCurrentSession()) return;
      setWifiCaptures(data.captures || []);
    } catch {
      // ignore if Wi-Fi capture directory is unavailable
    }
  }, [isUnlocked]);

  const refreshWifiClients = useCallback(async () => {
    if (!isUnlocked) return;
    const isCurrentSession = sessionGuardRef.current.capture();
    try {
      const data = await c2Api.getWifiClients();
      if (!isCurrentSession()) return;
      setWifiClients(data.clients || []);
    } catch {
      // ignore if no previous scan
    }
  }, [isUnlocked]);

  const refreshWifiIfaces = useCallback(async () => {
    if (!isUnlocked) return;
    const isCurrentSession = sessionGuardRef.current.capture();
    try {
      const data = await c2Api.getWifiIfaces();
      if (!isCurrentSession()) return;
      setWifiIfaces(data.interfaces || []);
    } catch {
      // ignore
    }
  }, [isUnlocked]);

  const refreshAllRef = useRef({
    refreshMeta,
    refreshInterfaces,
    refreshStatus,
    refreshOpsec,
    refreshEnvCheck,
    refreshWifiCaptures,
    refreshWifiClients,
    refreshWifiIfaces,
  });
  refreshAllRef.current = {
    refreshMeta,
    refreshInterfaces,
    refreshStatus,
    refreshOpsec,
    refreshEnvCheck,
    refreshWifiCaptures,
    refreshWifiClients,
    refreshWifiIfaces,
  };

  // Handle incoming WebSocket event
  const handleWsEvent = useCallback(
    (event: C2WsEvent) => {
      if (!event || typeof event.type !== 'string') return;
      if (event.type === 'ping') return;

      const tr = tRef.current;

      switch (event.type) {
        case 'packet': {
          const pkt: C2SniffPacket = {
            id: makeId(),
            proto: String(event.proto || ''),
            src: String(event.src || ''),
            dst: String(event.dst || ''),
            sport: event.sport as number | string | null | undefined,
            dport: event.dport as number | string | null | undefined,
            len: typeof event.len === 'number' ? event.len : undefined,
            info: typeof event.info === 'string' ? event.info : '',
            ts: formatNow(),
          };
          setSniffPackets((prev) => [pkt, ...prev].slice(0, MAX_SNIFF_PACKETS));
          break;
        }
        case 'cred': {
          if (event.proto === 'info') {
            addLog('info', String(event.data || ''));
            break;
          }
          const item: C2CredItem = {
            id: makeId(),
            proto: String(event.proto || ''),
            data: String(event.data || ''),
            src: typeof event.src === 'string' ? event.src : '',
            dst: typeof event.dst === 'string' ? event.dst : '',
            ts: formatNow(),
          };
          setCreds((prev) => [item, ...prev]);
          addLog('cred', `[${item.proto}] ${item.data}`);
          break;
        }
        case 'port': {
          const portItem: C2PortResult = {
            port: Number(event.port),
            proto: typeof event.proto === 'string' ? event.proto : undefined,
            service: typeof event.service === 'string' ? event.service : '-',
            banner: typeof event.banner === 'string' ? event.banner : '',
          };
          setPortResults((prev) => {
            if (prev.some((p) => p.port === portItem.port && (p.proto || 'tcp') === (portItem.proto || 'tcp'))) {
              return prev;
            }
            return [...prev, portItem];
          });
          break;
        }
        case 'portscan':
          addLog('info', String(event.msg || ''));
          break;
        case 'fingerprint': {
          const ip = String(event.ip || '');
          const os = typeof event.os === 'string' && event.os ? event.os : '?';
          const ttl = typeof event.ttl === 'number' ? event.ttl : null;
          if (ip) {
            setHostOsMap((prev) => ({ ...prev, [ip]: { os, ttl } }));
          }
          const ttlSuffix = ttl && !/\(TTL\b/i.test(os) ? ` (TTL ${ttl})` : '';
          addLog('info', tr('log.os', { ip, os, ttl: ttlSuffix }));
          break;
        }
        case 'inject':
          addLog('inject', String(event.msg || ''));
          break;
        case 'httpreq': {
          const req: C2HttpRequest = {
            id: makeId(),
            host: typeof event.host === 'string' ? event.host : '-',
            path: typeof event.path === 'string' ? event.path : '/',
            dst: typeof event.dst === 'string' ? event.dst : '',
            method: typeof event.method === 'string' ? event.method : undefined,
            ts: formatNow(),
          };
          setHttpRequests((prev) => [req, ...prev].slice(0, MAX_HTTP_REQUESTS));
          break;
        }
        case 'wifi_ap': {
          const ap: C2WifiAp = {
            ssid: String(event.ssid || ''),
            bssid: String(event.bssid || ''),
            channel: typeof event.channel === 'number' ? event.channel : null,
            signal: typeof event.signal === 'number' ? event.signal : null,
            enc: typeof event.enc === 'string' ? event.enc : undefined,
          };
          if (!ap.bssid) break;
          setWifiAps((prev) => {
            const idx = prev.findIndex((item) => item.bssid.toLowerCase() === ap.bssid.toLowerCase());
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], ...ap };
              return next;
            }
            return [...prev, ap];
          });
          break;
        }
        case 'wifi_client': {
          const bssid = String(event.bssid || '').toLowerCase();
          const client = String(event.client || '').toLowerCase();
          if (!bssid || !client) break;
          const entry: C2WifiClient = {
            bssid,
            client,
            signal: typeof event.signal === 'number' ? event.signal : null,
            channel: typeof event.channel === 'number' ? event.channel : null,
            last_seen: typeof event.last_seen === 'number' ? event.last_seen : undefined,
          };
          setWifiClients((prev) => {
            const idx = prev.findIndex(
              (c) => c.bssid.toLowerCase() === bssid && c.client.toLowerCase() === client
            );
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], ...entry };
              return next;
            }
            return [...prev, entry];
          });
          break;
        }
        case 'wifi_eapol': {
          const bssid = String(event.bssid || '');
          const client = String(event.client || '');
          const msgNum = Number(event.msg);
          const key = `${bssid}|${client}`;
          setHandshakes((prev) => {
            const idx = prev.findIndex((h) => h.key === key);
            if (idx >= 0) {
              const next = [...prev];
              const msgs = Array.from(new Set([...next[idx].msgs, msgNum])).sort((a, b) => a - b);
              next[idx] = { ...next[idx], msgs };
              return next;
            }
            return [
              ...prev,
              {
                key,
                bssid,
                client,
                msgs: Number.isFinite(msgNum) ? [msgNum] : [],
                captured: false,
              },
            ];
          });
          addLog('wifi', `EAPOL M${event.msg}  ${client} @ ${bssid}`);
          break;
        }
        case 'handshake': {
          const bssid = String(event.bssid || '');
          const client = String(event.client || '');
          const ssid = typeof event.essid === 'string' ? event.essid : '';
          const file = String(event.file || '');
          const key = `${bssid}|${client}`;
          setHandshakes((prev) => {
            const idx = prev.findIndex((h) => h.key === key);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], captured: true, ssid: ssid || next[idx].ssid, file: file || next[idx].file };
              return next;
            }
            return [...prev, { key, bssid, client, msgs: [], captured: true, ssid, file }];
          });
          addLog('cred', tr('log.hs', { name: ssid || bssid, file }));
          void refreshAllRef.current.refreshWifiCaptures();
          break;
        }
        case 'hashcat': {
          if (event.ok) {
            addLog('cred', tr('log.hashOk', { file: String(event.file || ''), hashes: Number(event.hashes || 0) }));
          } else {
            addLog('error', tr('log.hashFail', { file: String(event.file || ''), log: String(event.log || '') }));
          }
          void refreshAllRef.current.refreshWifiCaptures();
          break;
        }
        case 'wifi':
          addLog('wifi', String(event.msg || ''));
          void refreshAllRef.current.refreshWifiIfaces();
          break;
        case 'poison': {
          if (event.proto === 'info') {
            addLog('poison', String(event.msg || ''));
            break;
          }
          const pe: C2PoisonEvent = {
            id: makeId(),
            proto: String(event.proto || ''),
            name: String(event.name || ''),
            src: String(event.src || ''),
            ts: formatNow(),
          };
          setPoisonEvents((prev) => [pe, ...prev].slice(0, MAX_POISON_EVENTS));
          addLog('poison', tr('poison.hit', { proto: pe.proto, name: pe.name, src: pe.src }));
          break;
        }
        case 'wpad':
          addLog('wpad', String(event.msg || ''));
          break;
        case 'dns6': {
          const ev6: C2Mitm6Event = {
            id: makeId(),
            qtype: String(event.qtype || ''),
            name: String(event.name || ''),
            src: String(event.src || ''),
            ts: formatNow(),
          };
          setMitm6Events((prev) => [ev6, ...prev].slice(0, MAX_MITM6_EVENTS));
          addLog('dns6', `[${ev6.qtype}] ${ev6.name} <- ${ev6.src}`);
          break;
        }
        case 'mitm6':
          addLog('dns6', String(event.msg || ''));
          break;
        case 'pmkid':
          addLog(
            'cred',
            tr('log.pmkid', {
              name: String(event.essid || event.bssid || ''),
              file: String(event.file || ''),
            })
          );
          void refreshAllRef.current.refreshWifiCaptures();
          break;
        case 'cleanup':
          addLog('opsec', String(event.msg || ''));
          break;
        case 'opsec':
          addLog('opsec', String(event.msg || ''));
          void refreshAllRef.current.refreshOpsec();
          break;
        case 'arp':
          addLog('arp', String(event.msg || ''));
          break;
        case 'dns':
          addLog('dns', String(event.msg || ''));
          break;
        case 'sniff':
          addLog('sniff', String(event.msg || ''));
          break;
        case 'topology':
          addLog('info', `[topo] ${String(event.msg || '')}`);
          break;
        case 'camera': {
          if (typeof event.msg === 'string' && event.msg) {
            addLog('camera', event.msg);
          }
          if (event.found && typeof event.found === 'object') {
            const found = event.found as C2CameraDiscovered;
            setCameraDiscovered((prev) => {
              if (prev.some((c) => c.ip === found.ip && c.port === found.port)) return prev;
              return [...prev, found];
            });
            setCameraFindings((prev) => [
              {
                severity: 'info',
                module: 'discovery',
                description: `${found.ip}:${found.port}`,
                detail: found.vendor || found.service || 'camera',
              },
              ...prev,
            ]);
          }
          if (typeof event.module_done === 'string') {
            addLog('camera', `<- ${event.module_done}: ${Number(event.n ?? 0)}`);
          }
          if (event.finding && typeof event.finding === 'object') {
            setCameraFindings((prev) => [event.finding as C2CameraFinding, ...prev]);
          }
          if (event.audit_done && typeof event.audit_done === 'object') {
            const count = Array.isArray((event.audit_done as { findings?: unknown[] }).findings)
              ? (event.audit_done as { findings: unknown[] }).findings.length
              : 0;
            addLog('camera', `Audit: ${count}`);
          }
          break;
        }
        case 'error':
          addLog('error', String(event.msg || ''));
          break;
        case 'info':
          addLog('info', typeof event.msg === 'string' ? event.msg : JSON.stringify(event));
          break;
        default:
          addLog('info', 'msg' in event && typeof event.msg === 'string' ? event.msg : JSON.stringify(event));
      }
    },
    [addLog]
  );

  // Track initial load per unlock and refresh on first entry into C2
  const hasLoadedInitialRef = useRef(false);

  const loadBootstrapData = useCallback(() => {
    void refreshAllRef.current.refreshMeta();
    void refreshAllRef.current.refreshInterfaces();
    void refreshAllRef.current.refreshOpsec();
    void refreshAllRef.current.refreshEnvCheck();
    void refreshAllRef.current.refreshStatus();
    void refreshAllRef.current.refreshWifiCaptures();
    void refreshAllRef.current.refreshWifiClients();
    void refreshAllRef.current.refreshWifiIfaces();
  }, []);

  // C2 is independent from CRM: do not contact it until its workspace is opened.
  useEffect(() => {
    if (!isUnlocked) {
      serviceRequestRef.current += 1;
      setEnteredC2(false);
      setServiceState('idle');
      setServiceDetail('');
    } else if (inC2Workspace) {
      setEnteredC2(true);
    }
  }, [isUnlocked, inC2Workspace]);

  useEffect(() => {
    if (!isUnlocked || !enteredC2) return;
    if (inC2Workspace) void retryService();
    const timer = window.setInterval(() => void retryService(true), 10000);
    return () => window.clearInterval(timer);
  }, [isUnlocked, enteredC2, inC2Workspace, retryService]);

  // Only connect to the engine when the separate service is available.
  useEffect(() => {
    if (!isUnlocked || serviceState !== 'running') {
      hasLoadedInitialRef.current = false;
      setWsConnected(false);
      setModuleStatus(DEFAULT_MODULE_STATUS);
      return;
    }

    if (!hasLoadedInitialRef.current) {
      hasLoadedInitialRef.current = true;
      loadBootstrapData();
    }

    const pollId = window.setInterval(() => {
      void refreshAllRef.current.refreshStatus();
    }, 3000);

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      try {
        ws = new WebSocket(buildC2WsUrl(), buildC2WsProtocols());
      } catch {
        reconnectTimer = window.setTimeout(connect, 2000);
        return;
      }

      ws.onopen = () => {
        if (!disposed) setWsConnected(true);
      };

      ws.onmessage = (msgEvent) => {
        if (disposed) return;
        try {
          const parsed = JSON.parse(String(msgEvent.data)) as C2WsEvent;
          handleWsEvent(parsed);
        } catch {
          // ignore malformed WS frames
        }
      };

      ws.onerror = () => {
        // onclose handles reconnect
      };

      ws.onclose = () => {
        if (disposed) return;
        setWsConnected(false);
        reconnectTimer = window.setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      disposed = true;
      window.clearInterval(pollId);
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }
      setWsConnected(false);
    };
  }, [isUnlocked, serviceState, loadBootstrapData, handleWsEvent]);

  // Cross-panel actions
  const pinHostTarget = useCallback(
    (ip: string) => {
      setArpTarget(ip);
      setPortIp(ip);
      setCamTarget(ip);
      addLog('info', tRef.current('hosts.targetSet', { ip }));
    },
    [addLog]
  );

  const scanHostPorts = useCallback(
    (ip: string) => {
      setPortIp(ip);
      setActiveSection('c2_ports');
    },
    [setActiveSection]
  );

  const selectWifiApForDeauth = useCallback(
    (bssid: string, channel?: number | null) => {
      setDeauthBssid(bssid);
      if (channel !== undefined && channel !== null) {
        setDeauthChannel(String(channel));
      }
      setActiveSection('c2_wifi');
    },
    [setActiveSection]
  );

  const selectWifiApForPmkid = useCallback(
    (bssid: string, channel?: number | null, ssid?: string) => {
      setPmkidBssid(bssid);
      if (channel !== undefined && channel !== null) {
        setPmkidChannel(String(channel));
      }
      setActiveSection('c2_wifi');
      addLog('info', tRef.current('wifi.pmkidReady', { ssid: ssid || bssid, bssid }));
    },
    [setActiveSection, addLog]
  );

  const auditDiscoveredCamera = useCallback(
    (ip: string) => {
      setCamTarget(ip);
      setActiveSection('c2_camera');
    },
    [setActiveSection]
  );

  const triggerPanic = useCallback(async () => {
    const tr = tRef.current;
    const accepted = await confirm({
      title: tr('panic.btn'),
      message: tr('panic.confirm'),
      confirmLabel: tr('panic.btn'),
      tone: 'danger',
    });
    if (!accepted) return;

    addLog('opsec', tr('panic.running'));
    try {
      const res = await c2Api.triggerPanic();
      (res.actions || []).forEach((action) => addLog('opsec', action));
      showToast(tr('panic.btn'), 'warning');
      void refreshOpsec();
      void refreshInterfaces();
      void refreshStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Panic failed';
      addLog('error', msg);
      showToast(msg, 'error');
    }
  }, [confirm, addLog, showToast, refreshOpsec, refreshInterfaces, refreshStatus]);

  const currentInterface = useMemo(
    () => interfaces.find((i) => i.name === selectedIface) || null,
    [interfaces, selectedIface]
  );

  const activeModuleNames = useMemo(
    () => MODULE_KEYS.filter((key) => Boolean(moduleStatus[key])).map((key) => t(`module.${key}`) || key),
    [moduleStatus, t]
  );

  const activeModuleCount = activeModuleNames.length;
  const demoMode = Boolean(meta?.demo_mode ?? meta?.demo);

  const value: C2ContextValue = {
    lang,
    setLang,
    t,
    meta,
    demoMode,
    wsConnected,
    serviceState,
    serviceDetail,
    retryService,
    interfaces,
    gateway,
    selectedIface,
    setSelectedIface,
    currentInterface,
    moduleStatus,
    activeModuleCount,
    activeModuleNames,
    opsecState,
    envWarnings,
    hosts,
    setHosts,
    hostOsMap,
    portResults,
    setPortResults,
    portScanIp,
    setPortScanIp,
    exploitResults,
    setExploitResults,
    topologyData,
    setTopologyData,
    sniffPackets,
    clearSniffPackets,
    creds,
    setCreds,
    clearCredsBuffer,
    httpRequests,
    clearHttpRequests,
    poisonEvents,
    clearPoisonEvents,
    mitm6Events,
    clearMitm6Events,
    wifiAps,
    wifiClients,
    handshakes,
    wifiCaptures,
    wifiIfaces,
    clearWifiScanState,
    cameraDiscovered,
    setCameraDiscovered,
    cameraFindings,
    setCameraFindings,
    clearCameraState,
    consoleLogs,
    addLog,
    clearLogs,
    arpTarget,
    setArpTarget,
    arpGateway,
    setArpGateway,
    portIp,
    setPortIp,
    camTarget,
    setCamTarget,
    deauthBssid,
    setDeauthBssid,
    deauthChannel,
    setDeauthChannel,
    deauthClient,
    setDeauthClient,
    pmkidBssid,
    setPmkidBssid,
    pmkidChannel,
    setPmkidChannel,
    pinHostTarget,
    scanHostPorts,
    selectWifiApForDeauth,
    selectWifiApForPmkid,
    auditDiscoveredCamera,
    triggerPanic,
    refreshMeta,
    refreshInterfaces,
    refreshStatus,
    refreshOpsec,
    refreshEnvCheck,
    refreshWifiCaptures,
    refreshWifiClients,
    refreshWifiIfaces,
  };

  return <C2Context.Provider value={value}>{children}</C2Context.Provider>;
};

export function useC2(): C2ContextValue {
  const ctx = useContext(C2Context);
  if (!ctx) {
    throw new Error('useC2 must be used within C2Provider');
  }
  return ctx;
}
