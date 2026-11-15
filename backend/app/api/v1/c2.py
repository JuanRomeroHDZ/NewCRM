"""API FastAPI de LESSSO | C2 integrada bajo /api/v1/c2.

Todos los endpoints HTTP exigen sesión de bóveda Level 2 activa mediante
`Depends(require_vault_unlocked)`. El WebSocket `/ws` valida el token de
bóveda en `?token=<vault_token>` (o cabecera `x-vault-token`) mediante
`verify_vault_token` y `session_manager.is_session_active` y cierra con
código 4401 cuando es inválido o la bóveda está bloqueada.
"""
import asyncio
import json
import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator

from app.c2.core import demo, envcheck, fw, netutils
from app.c2.core.bus import bus
from app.c2.core.targets import bounded_network
from app.c2.core.cleanup import full_cleanup
from app.c2.core.manager import manager
from app.c2.modules import (
    cameras,
    discovery,
    exploits,
    fingerprint,
    opsec,
    portscan,
    topology,
    wifi,
)
from app.c2.modules.arp import ArpSpoofer
from app.c2.modules.creds import CredSniffer
from app.c2.modules.dns import DnsSpoofer
from app.c2.modules.httpinject import HttpInjector
from app.c2.modules.mitm6 import Mitm6
from app.c2.modules.poison import NamePoisoner
from app.c2.modules.sniff import Sniffer
from app.c2.modules.wifi import Deauther, HandshakeCapturer, PmkidCapturer, WifiScanner
from app.c2.modules.wpad import WpadSpoofer
from app.security.tokens import require_vault_unlocked, verify_vault_token

router = APIRouter(prefix="/c2", tags=["c2"])
http_router = APIRouter(dependencies=[Depends(require_vault_unlocked)])


def _require_real_mode() -> None:
    """En modo demo, los endpoints ofensivos responden 400 con mensaje claro."""
    if demo.is_demo():
        raise HTTPException(
            status_code=400,
            detail="Endpoint desactivado en modo demo (arranca sin --demo para uso real)",
        )


# --------------------------------------------------------------------------- #
# Modelos de petición
# --------------------------------------------------------------------------- #
class ScanReq(BaseModel):
    interface: str
    cidr: str
    timeout: float = 2.0

    @field_validator("cidr")
    @classmethod
    def validate_cidr(cls, value):
        bounded_network(value, ipv4_only=True)
        return value


class PortReq(BaseModel):
    ip: str
    ports: str | list[int] | None = None
    timeout: float = Field(default=0.6, gt=0, le=300)
    concurrency: int = Field(default=800, ge=1, le=65535)
    grab_banner: bool = True
    mode: str = "connect"      # "connect" | "syn" (stealth)
    low_noise: bool = False    # menos velocidad, jitter aleatorio

    @field_validator("ports")
    @classmethod
    def validate_ports(cls, value):
        if isinstance(value, str):
            try:
                portscan.parse_ports(value)
            except (ValueError, OverflowError):
                raise ValueError("La lista de puertos no tiene un formato válido.")
        return value


class FingerprintReq(BaseModel):
    ip: str
    mac: str | None = None
    open_ports: list[int] = []


class ExploitCheckReq(BaseModel):
    ip: str | None = None
    services: list[dict] = []


class CameraAuditReq(BaseModel):
    target: str                    # IP o CIDR
    port: int | None = None
    modules: list[str] = ["creds", "rtsp", "onvif"]
    timeout: int = 5
    depth: int = 2
    interface: str | None = None


class CameraDiscoverReq(BaseModel):
    target: str                    # CIDR o IP
    timeout: int = 3

    @field_validator("target")
    @classmethod
    def validate_target(cls, value):
        bounded_network(value)
        return value


class TopologyReq(BaseModel):
    interface: str
    cidr: str
    aggressive: bool = False
    traffic_seconds: float = 0

    @field_validator("cidr")
    @classmethod
    def validate_cidr(cls, value):
        bounded_network(value, ipv4_only=True)
        return value


class HttpInjectReq(BaseModel):
    inject: str = ""
    sslstrip: bool = True
    port: int = 8080


class WifiScanReq(BaseModel):
    interface: str
    channels: list[int] | None = None
    prepare: bool = True


class DeauthReq(BaseModel):
    interface: str
    bssid: str
    client: str | None = None
    channel: int | None = None
    prepare: bool = True
    low_noise: bool = False
    broadcast: bool = False


class PmkidReq(BaseModel):
    interface: str
    bssid: str
    channel: int | None = None
    auto_convert: bool = False
    prepare: bool = True


class PoisonReq(BaseModel):
    interface: str
    spoof_ip: str | None = None
    llmnr: bool = True
    nbtns: bool = True
    mdns: bool = True


class WpadReq(BaseModel):
    interface: str
    pac_port: int = 80
    proxy_port: int = 3128


class Mitm6Req(BaseModel):
    interface: str
    interval: float = 10.0
    jitter: float = 2.0
    mapping: dict[str, str] = {}
    redirect_http_port: int | None = None


class HandshakeReq(BaseModel):
    interface: str
    channel: int | None = None
    auto_convert: bool = False
    prepare: bool = True


class WifiMonitorReq(BaseModel):
    interface: str
    prepare: bool = True


class ConvertReq(BaseModel):
    file: str


class ArpReq(BaseModel):
    interface: str
    target_ip: str
    gateway_ip: str


class SniffReq(BaseModel):
    interface: str
    bpf: str | None = None


class DnsReq(BaseModel):
    interface: str
    mapping: dict[str, str] = {}
    spoof_all_to: str | None = None


class CredReq(BaseModel):
    interface: str


class OpsecHostReq(BaseModel):
    hostname: str
    pretty: str | None = None


class OpsecMacReq(BaseModel):
    interface: str
    mac: str | None = None
    vendor: str | None = None
    dhcp: bool = False


class OpsecApplyReq(BaseModel):
    interface: str
    hostname: str
    mac: str | None = None
    vendor: str | None = None
    pretty: str | None = None
    dhcp: bool = False


class OpsecProfileReq(BaseModel):
    interface: str
    profile: str
    dhcp: bool = False


class OpsecRestoreReq(BaseModel):
    interface: str | None = None


class OpsecGenReq(BaseModel):
    vendor: str | None = None
    kind: str = "windows"


# --------------------------------------------------------------------------- #
# Endpoints de información
# --------------------------------------------------------------------------- #
@http_router.get("/meta")
def api_meta():
    return {"demo_mode": demo.is_demo()}


@http_router.get("/interfaces")
def api_interfaces():
    if demo.is_demo():
        return demo.interfaces()
    return {"interfaces": netutils.list_interfaces(), "gateway": netutils.default_gateway()}


@http_router.get("/status")
def api_status():
    return manager.status()


# --------------------------------------------------------------------------- #
# Reconocimiento
# --------------------------------------------------------------------------- #
@http_router.post("/discovery")
async def api_discovery(req: ScanReq):
    if demo.is_demo():
        await asyncio.sleep(0.8)
        hosts = demo.hosts()
        for h in demo.HOSTS:
            bus.emit({"type": "fingerprint", "ip": h["ip"], "os": h["os"], "ttl": h["ttl"]})
        return {"hosts": hosts}
    hosts = await asyncio.to_thread(discovery.scan, req.interface, req.cidr, req.timeout)
    return {"hosts": hosts}


@http_router.post("/portscan")
async def api_portscan(req: PortReq):
    if demo.is_demo():
        open_ports = demo.ports_for(req.ip)
        for p in open_ports:
            await asyncio.sleep(0.25)
            bus.emit({"type": "port", "port": p["port"], "service": p["service"], "banner": p["banner"]})
        return {"ip": req.ip, "open": open_ports}
    result = await portscan.scan(
        req.ip,
        req.ports,
        req.timeout,
        req.concurrency,
        req.grab_banner,
        mode=req.mode,
        low_noise=req.low_noise,
    )
    return {"ip": req.ip, "open": result}


@http_router.post("/fingerprint")
async def api_fingerprint(req: FingerprintReq):
    if demo.is_demo():
        for h in demo.HOSTS:
            if h["ip"] == req.ip:
                return {"ip": h["ip"], "os": h["os"], "ttl": h["ttl"]}
        return {"ip": req.ip, "os": "?", "ttl": None}
    return await fingerprint.guess_async(req.ip, req.mac, req.open_ports)


@http_router.post("/exploits/check")
def api_exploits_check(req: ExploitCheckReq):
    try:
        results = exploits.searcher.check(req.services)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --------------------------------------------------------------------------- #
# Cámaras: auditoría integrada
# --------------------------------------------------------------------------- #
@http_router.post("/camera/discover", dependencies=[Depends(_require_real_mode)])
async def api_camera_discover(req: CameraDiscoverReq):
    return await asyncio.to_thread(cameras.discover, req.target, req.timeout)


@http_router.post("/camera/audit", dependencies=[Depends(_require_real_mode)])
async def api_camera_audit(req: CameraAuditReq):
    return await cameras.audit(
        req.target,
        port=req.port,
        modules=req.modules,
        timeout=req.timeout,
        depth=req.depth,
        interface=req.interface,
    )


# --------------------------------------------------------------------------- #
# Topología de red
# --------------------------------------------------------------------------- #
@http_router.post("/topology")
async def api_topology(req: TopologyReq):
    if demo.is_demo():
        await asyncio.sleep(1.0)
        return demo.TOPOLOGY
    try:
        return await topology.build(req.interface, req.cidr, req.aggressive, req.traffic_seconds)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --------------------------------------------------------------------------- #
# MITM / ARP
# --------------------------------------------------------------------------- #
@http_router.post("/arp/start", dependencies=[Depends(_require_real_mode)])
def api_arp_start(req: ArpReq):
    spoofer = ArpSpoofer(req.target_ip, req.gateway_ip, req.interface)
    with manager.lock:
        if manager.arp:
            manager.arp.stop()
        spoofer.start()
        manager.arp = spoofer
    return {"status": "started"}


@http_router.post("/arp/stop", dependencies=[Depends(_require_real_mode)])
def api_arp_stop():
    if manager.arp:
        manager.arp.stop()
        manager.arp = None
    return {"status": "stopped"}


# --------------------------------------------------------------------------- #
# Sniffer
# --------------------------------------------------------------------------- #
@http_router.post("/sniff/start", dependencies=[Depends(_require_real_mode)])
def api_sniff_start(req: SniffReq):
    sniffer = Sniffer(req.interface, req.bpf)
    with manager.lock:
        if manager.sniffer:
            manager.sniffer.stop()
        sniffer.start()
        manager.sniffer = sniffer
    return {"status": "started"}


@http_router.post("/sniff/stop", dependencies=[Depends(_require_real_mode)])
def api_sniff_stop():
    if manager.sniffer:
        manager.sniffer.stop()
        manager.sniffer = None
    return {"status": "stopped"}


# --------------------------------------------------------------------------- #
# DNS spoofing
# --------------------------------------------------------------------------- #
@http_router.post("/dns/start", dependencies=[Depends(_require_real_mode)])
def api_dns_start(req: DnsReq):
    spoofer = DnsSpoofer(req.interface, req.mapping, req.spoof_all_to)
    with manager.lock:
        if manager.dns:
            manager.dns.stop()
        spoofer.start()
        manager.dns = spoofer
    return {"status": "started"}


@http_router.post("/dns/stop", dependencies=[Depends(_require_real_mode)])
def api_dns_stop():
    if manager.dns:
        manager.dns.stop()
        manager.dns = None
    return {"status": "stopped"}


# --------------------------------------------------------------------------- #
# Credenciales
# --------------------------------------------------------------------------- #
@http_router.post("/creds/start", dependencies=[Depends(_require_real_mode)])
def api_creds_start(req: CredReq):
    sniffer = CredSniffer(req.interface)
    with manager.lock:
        if manager.creds:
            manager.creds.stop()
        sniffer.start()
        manager.creds = sniffer
    return {"status": "started"}


@http_router.post("/creds/stop", dependencies=[Depends(_require_real_mode)])
def api_creds_stop():
    if manager.creds:
        manager.creds.stop()
        manager.creds = None
    return {"status": "stopped"}


@http_router.get("/creds/export", dependencies=[Depends(_require_real_mode)])
def api_creds_export():
    """Descarga el buffer de credenciales como JSON. No se persiste nunca a disco."""
    creds = manager.creds.export() if manager.creds else []
    return Response(
        content=json.dumps(creds, indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=creds.json"},
    )


@http_router.post("/creds/clear", dependencies=[Depends(_require_real_mode)])
def api_creds_clear():
    if manager.creds:
        manager.creds.clear()
    return {"status": "cleared"}


# --------------------------------------------------------------------------- #
# MITM HTTP: inyección + sslstrip
# --------------------------------------------------------------------------- #
@http_router.post("/httpinject/start", dependencies=[Depends(_require_real_mode)])
async def api_httpinject_start(req: HttpInjectReq):
    injector = HttpInjector(req.inject, req.sslstrip, req.port)
    with manager.lock:
        if manager.httpinject:
            manager.httpinject.stop()
        injector.start(asyncio.get_running_loop())
        manager.httpinject = injector
    return {"status": "started"}


@http_router.post("/httpinject/stop", dependencies=[Depends(_require_real_mode)])
def api_httpinject_stop():
    if manager.httpinject:
        manager.httpinject.stop()
        manager.httpinject = None
    return {"status": "stopped"}


# --------------------------------------------------------------------------- #
# Wi-Fi: modo monitor y servicios interferentes
# --------------------------------------------------------------------------- #
def _wifi_iface(req_iface: str, prepare: bool) -> str:
    if not prepare:
        return req_iface
    try:
        info = wifi.prepare_monitor(req_iface)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return info.get("interface") or req_iface


@http_router.get("/wifi/ifaces")
def api_wifi_ifaces():
    if demo.is_demo():
        return {"interfaces": [demo.IFACE["name"]]}
    return {"interfaces": wifi.list_wireless()}


@http_router.post("/wifi/monitor/start", dependencies=[Depends(_require_real_mode)])
def api_wifi_monitor_start(req: WifiMonitorReq):
    try:
        if req.prepare:
            return wifi.prepare_monitor(req.interface)
        return wifi.set_monitor(req.interface, True)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@http_router.post("/wifi/monitor/stop", dependencies=[Depends(_require_real_mode)])
def api_wifi_monitor_stop(req: WifiMonitorReq):
    try:
        result = wifi.set_monitor(req.interface, False)
        if req.prepare:
            wifi.restore_interferers()
        return result
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@http_router.post("/wifi/kill", dependencies=[Depends(_require_real_mode)])
def api_wifi_kill():
    return {"stopped": wifi.kill_interferers()}


@http_router.post("/wifi/restore-services", dependencies=[Depends(_require_real_mode)])
def api_wifi_restore_services():
    return {"started": wifi.restore_interferers()}


# --------------------------------------------------------------------------- #
# Wi-Fi: escaneo 802.11 y deauth
# --------------------------------------------------------------------------- #
@http_router.post("/wifi/scan/start", dependencies=[Depends(_require_real_mode)])
def api_wifi_scan_start(req: WifiScanReq):
    iface = _wifi_iface(req.interface, req.prepare)
    scanner = WifiScanner(iface, req.channels)
    manager.wifi_clients = scanner.clients
    with manager.lock:
        if manager.wifi_scan:
            manager.wifi_scan.stop()
        scanner.start()
        manager.wifi_scan = scanner
    return {"status": "started", "interface": iface}


@http_router.post("/wifi/scan/stop", dependencies=[Depends(_require_real_mode)])
def api_wifi_scan_stop():
    if manager.wifi_scan:
        manager.wifi_scan.stop()
        manager.wifi_scan = None
    return {"status": "stopped"}


@http_router.get("/wifi/clients")
def api_wifi_clients(bssid: str | None = None):
    if demo.is_demo():
        return {"clients": []}
    now = time.time()
    wanted = bssid.lower() if bssid else None
    clients = []
    for (ap, _client), info in list(manager.wifi_clients.items()):
        age = max(0, now - info.get("last_seen", 0))
        if age > 120 or (wanted and ap != wanted):
            continue
        clients.append({**info, "age": round(age, 1)})
    return {"clients": sorted(clients, key=lambda c: (c["bssid"], c["client"]))}


@http_router.post("/wifi/deauth/start", dependencies=[Depends(_require_real_mode)])
def api_wifi_deauth_start(req: DeauthReq):
    bssid = req.bssid.strip().lower()
    client = req.client.strip().lower() if req.client else None
    if not wifi.is_unicast_mac(bssid):
        raise HTTPException(status_code=400, detail="BSSID invalido")
    if req.broadcast:
        if client and client != "ff:ff:ff:ff:ff:ff":
            raise HTTPException(status_code=400, detail="No combines modo broadcast con un cliente individual")
        client = "ff:ff:ff:ff:ff:ff"
    else:
        if not wifi.is_unicast_mac(client):
            raise HTTPException(
                status_code=400,
                detail="Selecciona un cliente detectado o activa explicitamente el modo broadcast",
            )
        if bssid == client:
            raise HTTPException(status_code=400, detail="El cliente objetivo no puede ser el BSSID del AP")
        observed = manager.wifi_clients.get((bssid, client))
        if not observed or time.time() - observed.get("last_seen", 0) > 120:
            raise HTTPException(
                status_code=400,
                detail="Cliente no detectado recientemente en ese AP. Ejecuta primero el escaneo Wi-Fi.",
            )
    if manager.wifi_scan:
        manager.wifi_scan.stop()
        manager.wifi_scan = None
    iface = _wifi_iface(req.interface, req.prepare)
    try:
        deauther = Deauther(
            iface,
            bssid,
            client,
            req.channel,
            low_noise=req.low_noise,
            broadcast=req.broadcast,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    with manager.lock:
        if manager.deauth:
            manager.deauth.stop()
        deauther.start()
        manager.deauth = deauther
    return {"status": "started", "interface": iface}


@http_router.post("/wifi/deauth/stop", dependencies=[Depends(_require_real_mode)])
def api_wifi_deauth_stop():
    if manager.deauth:
        manager.deauth.stop()
        manager.deauth = None
    return {"status": "stopped"}


# --------------------------------------------------------------------------- #
# Wi-Fi: captura de handshakes EAPOL y conversión a hashcat
# --------------------------------------------------------------------------- #
@http_router.post("/wifi/handshake/start", dependencies=[Depends(_require_real_mode)])
def api_handshake_start(req: HandshakeReq):
    if manager.wifi_scan:
        manager.wifi_scan.stop()
        manager.wifi_scan = None
    iface = _wifi_iface(req.interface, req.prepare)
    capturer = HandshakeCapturer(iface, req.channel, req.auto_convert)
    with manager.lock:
        if manager.handshake:
            manager.handshake.stop()
        capturer.start()
        manager.handshake = capturer
    return {"status": "started", "interface": iface}


@http_router.post("/wifi/handshake/stop", dependencies=[Depends(_require_real_mode)])
def api_handshake_stop():
    if manager.handshake:
        manager.handshake.stop()
        manager.handshake = None
    return {"status": "stopped"}


# --------------------------------------------------------------------------- #
# Wi-Fi: captura de PMKID
# --------------------------------------------------------------------------- #
@http_router.post("/wifi/pmkid/start", dependencies=[Depends(_require_real_mode)])
def api_pmkid_start(req: PmkidReq):
    if manager.wifi_scan:
        manager.wifi_scan.stop()
        manager.wifi_scan = None
    iface = _wifi_iface(req.interface, req.prepare)
    capturer = PmkidCapturer(iface, req.bssid, req.channel, req.auto_convert)
    with manager.lock:
        if manager.pmkid:
            manager.pmkid.stop()
        capturer.start()
        manager.pmkid = capturer
    return {"status": "started", "interface": iface}


@http_router.post("/wifi/pmkid/stop", dependencies=[Depends(_require_real_mode)])
def api_pmkid_stop():
    if manager.pmkid:
        manager.pmkid.stop()
        manager.pmkid = None
    return {"status": "stopped"}


@http_router.get("/wifi/captures")
def api_wifi_captures():
    return {"captures": wifi.list_captures()}


@http_router.post("/wifi/convert", dependencies=[Depends(_require_real_mode)])
def api_wifi_convert(req: ConvertReq):
    pcap = wifi.CAPTURE_DIR / Path(req.file).name
    if not pcap.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    try:
        return wifi.convert_to_22000(pcap)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@http_router.get("/wifi/download", dependencies=[Depends(_require_real_mode)])
def api_wifi_download(file: str):
    path = wifi.CAPTURE_DIR / Path(file).name
    if not (path.resolve().is_relative_to(wifi.CAPTURE_DIR.resolve()) and path.is_file()):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return FileResponse(path, filename=path.name, media_type="application/octet-stream")


# --------------------------------------------------------------------------- #
# Poisoners: LLMNR / NBT-NS / mDNS
# --------------------------------------------------------------------------- #
@http_router.post("/poison/start", dependencies=[Depends(_require_real_mode)])
def api_poison_start(req: PoisonReq):
    poisoner = NamePoisoner(req.interface, req.spoof_ip, req.llmnr, req.nbtns, req.mdns)
    with manager.lock:
        if manager.poison:
            manager.poison.stop()
        poisoner.start()
        manager.poison = poisoner
    return {"status": "started"}


@http_router.post("/poison/stop", dependencies=[Depends(_require_real_mode)])
def api_poison_stop():
    if manager.poison:
        manager.poison.stop()
        manager.poison = None
    return {"status": "stopped"}


# --------------------------------------------------------------------------- #
# WPAD: PAC + proxy que registra
# --------------------------------------------------------------------------- #
def _iface_ip(iface_name: str) -> str:
    for i in netutils.list_interfaces():
        if i["name"] == iface_name and i.get("ip"):
            return i["ip"]
    raise HTTPException(
        status_code=400,
        detail="La interfaz no tiene IPv4 (necesaria para WPAD)",
    )


@http_router.post("/wpad/start", dependencies=[Depends(_require_real_mode)])
def api_wpad_start(req: WpadReq):
    spoofer = WpadSpoofer(_iface_ip(req.interface), req.pac_port, req.proxy_port)
    with manager.lock:
        if manager.wpad:
            manager.wpad.stop()
        spoofer.start()
        manager.wpad = spoofer
    return {"status": "started"}


@http_router.post("/wpad/stop", dependencies=[Depends(_require_real_mode)])
def api_wpad_stop():
    if manager.wpad:
        manager.wpad.stop()
        manager.wpad = None
    return {"status": "stopped"}


# --------------------------------------------------------------------------- #
# mitm6: RA + DNS spoofing IPv6
# --------------------------------------------------------------------------- #
@http_router.post("/mitm6/start", dependencies=[Depends(_require_real_mode)])
def api_mitm6_start(req: Mitm6Req):
    if manager.mitm6:
        manager.mitm6.stop()
    try:
        attacker = Mitm6(req.interface, req.interval, req.jitter, req.mapping, req.redirect_http_port)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    with manager.lock:
        if manager.mitm6:
            manager.mitm6.stop()
        attacker.start()
        manager.mitm6 = attacker
    return {"status": "started"}


@http_router.post("/mitm6/stop", dependencies=[Depends(_require_real_mode)])
def api_mitm6_stop():
    if manager.mitm6:
        manager.mitm6.stop()
        manager.mitm6 = None
    return {"status": "stopped"}


# --------------------------------------------------------------------------- #
# OPSEC: hostname + MAC
# --------------------------------------------------------------------------- #
def _opsec_or_400(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@http_router.get("/opsec")
def api_opsec_identity():
    if demo.is_demo():
        iface = dict(demo.IFACE)
        return {
            "hostname": "lessso-demo",
            "pretty": None,
            "original_hostname": None,
            "spoofed": False,
            "interfaces": [
                {
                    "name": iface["name"],
                    "mac": iface["mac"],
                    "permanent": iface["mac"],
                    "spoofed": False,
                }
            ],
            "vendors": list(opsec.VENDORS),
            "profiles": opsec.PROFILES,
        }
    return opsec.identity()


@http_router.post("/opsec/preview")
def api_opsec_preview(req: OpsecProfileReq):
    return _opsec_or_400(opsec.preview_profile, req.profile)


@http_router.post("/opsec/generate")
def api_opsec_generate(req: OpsecGenReq):
    return {
        "hostname": opsec.generate_hostname(req.kind),
        **opsec.generate_mac(req.vendor),
    }


@http_router.post("/opsec/hostname", dependencies=[Depends(_require_real_mode)])
def api_opsec_hostname(req: OpsecHostReq):
    return _opsec_or_400(opsec.set_hostname, req.hostname, req.pretty)


@http_router.post("/opsec/mac", dependencies=[Depends(_require_real_mode)])
def api_opsec_mac(req: OpsecMacReq):
    return _opsec_or_400(opsec.set_mac, req.interface, req.mac, req.vendor, req.dhcp)


@http_router.post("/opsec/apply", dependencies=[Depends(_require_real_mode)])
def api_opsec_apply(req: OpsecApplyReq):
    return _opsec_or_400(
        opsec.apply_identity,
        req.interface,
        req.hostname,
        req.mac,
        req.vendor,
        req.pretty,
        req.dhcp,
    )


@http_router.post("/opsec/profile", dependencies=[Depends(_require_real_mode)])
def api_opsec_profile(req: OpsecProfileReq):
    return _opsec_or_400(opsec.apply_profile, req.interface, req.profile, req.dhcp)


@http_router.post("/opsec/restore", dependencies=[Depends(_require_real_mode)])
def api_opsec_restore(req: OpsecRestoreReq):
    return _opsec_or_400(opsec.restore, req.interface)


# --------------------------------------------------------------------------- #
# Emergencias y entorno
# --------------------------------------------------------------------------- #
@http_router.post("/panic", dependencies=[Depends(_require_real_mode)])
def api_panic():
    """Kill switch: para TODO, borra reglas etiquetadas y restaura identidad."""
    actions = full_cleanup("boton de panico")
    return {"status": "panicked", "actions": actions}


@http_router.get("/cleanup")
def api_cleanup_status():
    return {"tagged_rules": fw.peek()}


@http_router.post("/cleanup")
def api_cleanup_run():
    return {"removed": fw.cleanup_all()}


@http_router.get("/envcheck")
def api_envcheck():
    if demo.is_demo():
        return {"warnings": demo.envcheck()}
    return {"warnings": envcheck.check()}


# --------------------------------------------------------------------------- #
# WebSocket de eventos en vivo (autenticación por token de bóveda)
# --------------------------------------------------------------------------- #
@router.websocket("/ws")
async def ws_events(websocket: WebSocket):
    token = websocket.query_params.get("token") or websocket.headers.get("x-vault-token")
    if not verify_vault_token(token):
        await websocket.close(code=4401)
        return
    await websocket.accept()
    if bus._loop is None or bus._loop.is_closed():
        bus.bind_loop(asyncio.get_running_loop())
    queue = bus.subscribe()
    try:
        while True:
            if not verify_vault_token(token):
                await websocket.close(code=4401)
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=25.0)
                await websocket.send_json(event)
            except asyncio.TimeoutError:
                if not verify_vault_token(token):
                    await websocket.close(code=4401)
                    break
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        bus.unsubscribe(queue)


router.include_router(http_router)
