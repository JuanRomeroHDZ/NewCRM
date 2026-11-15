"""API FastAPI de LESSSO | C2 integrada bajo /api/v1/c2.

Todos los endpoints HTTP exigen sesión de bóveda Level 2 activa mediante
`Depends(require_vault_unlocked)`. El WebSocket `/ws` valida el token de
bóveda en `?token=<vault_token>` (o cabecera `x-vault-token`) mediante
`verify_vault_token` y `session_manager.is_session_active` y cierra con
código 4401 cuando es inválido o la bóveda está bloqueada.
"""
import asyncio
import ipaddress
import json
import time
from typing import Literal
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
    arp as arp_module,
    cameras,
    creds as creds_module,
    discovery,
    dns as dns_module,
    exploits,
    fingerprint,
    mitm6 as mitm6_module,
    opsec,
    portscan,
    poison as poison_module,
    sniff as sniff_module,
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
_httpinject_lock = asyncio.Lock()


def _validated_interface(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value or len(value) > 15 or any(char.isspace() for char in value) or "/" in value:
        raise ValueError("Selecciona una interfaz de red válida.")
    return value


def _require_real_mode() -> None:
    """En modo demo, los endpoints ofensivos responden 400 con mensaje claro."""
    if demo.is_demo():
        raise HTTPException(
            status_code=400,
            detail="Endpoint desactivado en modo demo (arranca sin --demo para uso real)",
        )


def _require_scapy(available: bool, feature: str) -> None:
    if not available:
        raise HTTPException(
            status_code=503,
            detail=f"{feature} no está disponible: Scapy o los permisos para inicializar sockets no están disponibles en el entorno C2.",
        )


# --------------------------------------------------------------------------- #
# Modelos de petición
# --------------------------------------------------------------------------- #
class InterfaceRequest(BaseModel):
    interface: str

    @field_validator("interface")
    @classmethod
    def validate_interface_name(cls, value):
        return _validated_interface(value)


class ScanReq(InterfaceRequest):
    cidr: str
    timeout: float = Field(default=2.0, gt=0, le=30)

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
    mode: Literal["connect", "syn"] = "connect"  # "syn" (stealth)
    low_noise: bool = False    # menos velocidad, jitter aleatorio

    @field_validator("ports")
    @classmethod
    def validate_ports(cls, value):
        if isinstance(value, str):
            if len(value) > 2000:
                raise ValueError("La lista de puertos es demasiado larga.")
            try:
                portscan.parse_ports(value)
            except (ValueError, OverflowError):
                raise ValueError("La lista de puertos no tiene un formato válido.")
        elif isinstance(value, list):
            if len(value) > 65535 or any(not 1 <= port <= 65535 for port in value):
                raise ValueError("Los puertos deben estar entre 1 y 65535.")
        return value

    @field_validator("ip")
    @classmethod
    def validate_ip(cls, value):
        try:
            ipaddress.ip_address(value.strip())
        except ValueError as exc:
            raise ValueError("Introduce una dirección IP válida.") from exc
        return value.strip()


class FingerprintReq(BaseModel):
    ip: str
    mac: str | None = None
    open_ports: list[int] = Field(default_factory=list, max_length=1024)

    @field_validator("ip")
    @classmethod
    def validate_ip(cls, value):
        try:
            ipaddress.IPv4Address(value.strip())
        except ValueError as exc:
            raise ValueError("La huella de sistema requiere una dirección IPv4 válida.") from exc
        return value.strip()

    @field_validator("open_ports")
    @classmethod
    def validate_open_ports(cls, value):
        if any(not 1 <= port <= 65535 for port in value):
            raise ValueError("Los puertos deben estar entre 1 y 65535.")
        return value


class ExploitCheckReq(BaseModel):
    ip: str | None = None
    services: list[dict] = Field(default_factory=list, max_length=512)

    @field_validator("ip")
    @classmethod
    def validate_ip(cls, value):
        if value is None:
            return value
        try:
            ipaddress.ip_address(value.strip())
        except ValueError as exc:
            raise ValueError("Introduce una dirección IP válida.") from exc
        return value.strip()

    @field_validator("services")
    @classmethod
    def validate_services(cls, value):
        text_fields = ("product", "version", "service", "banner")
        for service in value:
            for field_name in text_fields:
                item = service.get(field_name)
                if item is not None and (not isinstance(item, str) or len(item) > 512):
                    raise ValueError(f"El campo {field_name} debe ser texto de hasta 512 caracteres.")
            target_ip = service.get("ip")
            if target_ip is not None:
                try:
                    ipaddress.ip_address(target_ip.strip())
                except (ValueError, AttributeError) as exc:
                    raise ValueError("Cada servicio debe incluir una dirección IP válida.") from exc
            port = service.get("port")
            if port is not None and (not isinstance(port, int) or isinstance(port, bool) or not 1 <= port <= 65535):
                raise ValueError("Cada servicio debe incluir un puerto entre 1 y 65535.")
        return value


class CameraAuditReq(InterfaceRequest):
    target: str = Field(max_length=100)  # IP o CIDR
    port: int | None = Field(default=None, ge=1, le=65535)
    modules: list[str] = Field(default_factory=lambda: ["creds", "rtsp", "onvif"], max_length=8)
    timeout: int = Field(default=5, ge=1, le=30)
    depth: int = Field(default=2, ge=0, le=8)
    interface: str | None = None

    @field_validator("modules")
    @classmethod
    def validate_modules(cls, value):
        supported = {"creds", "rtsp", "http", "onvif", "wifi", "modern", "cloud", "vuln"}
        unknown = set(value) - supported
        if unknown:
            raise ValueError(f"Módulos de cámara desconocidos: {', '.join(sorted(unknown))}")
        return list(dict.fromkeys(value))

    @field_validator("interface")
    @classmethod
    def validate_optional_interface(cls, value):
        return _validated_interface(value)

    @field_validator("target")
    @classmethod
    def validate_target(cls, value):
        bounded_network(value)
        return value.strip()


class CameraDiscoverReq(BaseModel):
    target: str = Field(max_length=100)  # CIDR o IP
    timeout: int = Field(default=3, ge=1, le=30)

    @field_validator("target")
    @classmethod
    def validate_target(cls, value):
        bounded_network(value)
        return value


class TopologyReq(InterfaceRequest):
    cidr: str
    aggressive: bool = False
    traffic_seconds: float = Field(default=0, ge=0, le=30)

    @field_validator("cidr")
    @classmethod
    def validate_cidr(cls, value):
        bounded_network(value, ipv4_only=True)
        return value


class HttpInjectReq(BaseModel):
    target_ip: str
    inject: str = ""
    sslstrip: bool = False
    port: int = Field(default=8080, ge=1, le=65535)

    @field_validator("target_ip")
    @classmethod
    def validate_target_ip(cls, value):
        try:
            return str(ipaddress.IPv4Address(value.strip()))
        except ValueError as exc:
            raise ValueError("La redirección HTTP requiere una IPv4 autorizada.") from exc


class WifiScanReq(InterfaceRequest):
    channels: list[int] | None = Field(default=None, max_length=14)
    prepare: bool = False

    @field_validator("channels")
    @classmethod
    def validate_channels(cls, value):
        if value is not None and (any(channel < 1 or channel > 196 for channel in value) or len(set(value)) != len(value)):
            raise ValueError("Selecciona canales Wi-Fi únicos entre 1 y 196.")
        return value


class DeauthReq(InterfaceRequest):
    bssid: str
    client: str | None = None
    channel: int | None = Field(default=None, ge=1, le=196)
    prepare: bool = False
    low_noise: bool = False
    broadcast: bool = False


class PmkidReq(InterfaceRequest):
    bssid: str
    channel: int | None = Field(default=None, ge=1, le=196)
    auto_convert: bool = False
    prepare: bool = False

    @field_validator("bssid")
    @classmethod
    def validate_bssid(cls, value):
        if not wifi.is_unicast_mac(value.strip()):
            raise ValueError("Selecciona un BSSID unicast válido.")
        return value.strip().lower()


class PoisonReq(InterfaceRequest):
    spoof_ip: str | None = None
    llmnr: bool = False
    nbtns: bool = False
    mdns: bool = False

    @field_validator("spoof_ip")
    @classmethod
    def validate_spoof_ip(cls, value):
        if value is None:
            return value
        try:
            return str(ipaddress.IPv4Address(value.strip()))
        except ValueError as exc:
            raise ValueError("La IP de respuesta debe ser una IPv4 válida.") from exc


class WpadReq(InterfaceRequest):
    pac_port: int = Field(default=80, ge=1, le=65535)
    proxy_port: int = Field(default=3128, ge=1, le=65535)


class Mitm6Req(InterfaceRequest):
    interval: float = Field(default=10.0, gt=0, le=60)
    jitter: float = Field(default=2.0, ge=0, le=30)
    mapping: dict[str, str] = Field(default_factory=dict, max_length=256)
    redirect_http_port: int | None = Field(default=None, ge=1, le=65535)

    @field_validator("mapping")
    @classmethod
    def validate_mapping(cls, value):
        for hostname, address in value.items():
            if not hostname.strip() or len(hostname) > 253:
                raise ValueError("Cada nombre DNS debe tener entre 1 y 253 caracteres.")
            try:
                ipaddress.ip_address(address.strip())
            except (ValueError, AttributeError) as exc:
                raise ValueError("Cada destino MITM6 debe ser una IP válida.") from exc
        return value


class HandshakeReq(InterfaceRequest):
    bssid: str
    channel: int | None = Field(default=None, ge=1, le=196)
    auto_convert: bool = False
    prepare: bool = False

    @field_validator("bssid")
    @classmethod
    def validate_bssid(cls, value):
        if not wifi.is_unicast_mac(value.strip()):
            raise ValueError("Selecciona un BSSID unicast autorizado.")
        return value.strip().lower()


class WifiMonitorReq(InterfaceRequest):
    prepare: bool = False


class ConvertReq(BaseModel):
    file: str


class ArpReq(InterfaceRequest):
    target_ip: str
    gateway_ip: str

    @field_validator("target_ip", "gateway_ip")
    @classmethod
    def validate_ipv4(cls, value):
        try:
            return str(ipaddress.IPv4Address(value.strip()))
        except ValueError:
            raise ValueError("Introduce una dirección IPv4 válida.")

class SniffReq(InterfaceRequest):
    bpf: str | None = None


class DnsReq(InterfaceRequest):
    mapping: dict[str, str] = Field(default_factory=dict, max_length=256)
    spoof_all_to: str | None = None

    @field_validator("mapping")
    @classmethod
    def validate_mapping(cls, value):
        for domain, address in value.items():
            if len(domain) > 253:
                raise ValueError("El nombre de dominio supera el límite permitido.")
            try:
                ipaddress.IPv4Address(address.strip())
            except (ValueError, AttributeError) as exc:
                raise ValueError("Cada respuesta DNS debe ser una IPv4 válida.") from exc
        return value

    @field_validator("spoof_all_to")
    @classmethod
    def validate_spoof_ip(cls, value):
        if value is None:
            return value
        try:
            return str(ipaddress.IPv4Address(value.strip()))
        except ValueError as exc:
            raise ValueError("La respuesta DNS debe ser una IPv4 válida.") from exc


class CredReq(InterfaceRequest):
    pass

class OpsecHostReq(BaseModel):
    hostname: str
    pretty: str | None = None


class OpsecMacReq(InterfaceRequest):
    mac: str | None = None
    vendor: str | None = None
    dhcp: bool = False


class OpsecApplyReq(InterfaceRequest):
    hostname: str
    mac: str | None = None
    vendor: str | None = None
    pretty: str | None = None
    dhcp: bool = False


class OpsecProfileReq(InterfaceRequest):
    profile: str
    dhcp: bool = False


class OpsecRestoreReq(InterfaceRequest):
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
    _require_scapy(discovery._SCAPY_AVAILABLE, "El descubrimiento ARP")
    try:
        hosts = await asyncio.to_thread(discovery.scan, req.interface, req.cidr, req.timeout)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except (RuntimeError, OSError) as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return {"hosts": hosts}


@http_router.post("/portscan")
async def api_portscan(req: PortReq):
    if demo.is_demo():
        open_ports = demo.ports_for(req.ip)
        for p in open_ports:
            await asyncio.sleep(0.25)
            bus.emit({"type": "port", "port": p["port"], "service": p["service"], "banner": p["banner"]})
        return {"ip": req.ip, "open": open_ports}
    try:
        result = await portscan.scan(
            req.ip,
            req.ports,
            req.timeout,
            req.concurrency,
            req.grab_banner,
            mode=req.mode,
            low_noise=req.low_noise,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except (RuntimeError, OSError) as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return {"ip": req.ip, "open": result}


@http_router.post("/fingerprint")
async def api_fingerprint(req: FingerprintReq):
    if demo.is_demo():
        for h in demo.HOSTS:
            if h["ip"] == req.ip:
                return {"ip": h["ip"], "os": h["os"], "ttl": h["ttl"]}
        return {"ip": req.ip, "os": "?", "ttl": None}
    _require_scapy(fingerprint._SCAPY_AVAILABLE, "La huella activa de sistema")
    return await fingerprint.guess_async(req.ip, req.mac, req.open_ports)


@http_router.post("/exploits/check")
def api_exploits_check(req: ExploitCheckReq):
    if not exploits.SEARCHSPLOIT:
        raise HTTPException(
            status_code=503,
            detail="La búsqueda local de exploits no está disponible: instala searchsploit en el equipo C2.",
        )
    try:
        results = exploits.searcher.check(req.services)
        return {"results": results}
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except (RuntimeError, OSError) as e:
        raise HTTPException(status_code=503, detail=f"No se pudo ejecutar searchsploit: {e}") from e


# --------------------------------------------------------------------------- #
# Cámaras: auditoría integrada
# --------------------------------------------------------------------------- #
@http_router.post("/camera/discover", dependencies=[Depends(_require_real_mode)])
async def api_camera_discover(req: CameraDiscoverReq):
    try:
        return await asyncio.to_thread(cameras.discover, req.target, req.timeout)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except (RuntimeError, OSError) as e:
        raise HTTPException(status_code=503, detail=f"El descubrimiento de cámaras no está disponible: {e}") from e


@http_router.post("/camera/audit", dependencies=[Depends(_require_real_mode)])
async def api_camera_audit(req: CameraAuditReq):
    try:
        return await cameras.audit(
            req.target,
            port=req.port,
            modules=req.modules,
            timeout=req.timeout,
            depth=req.depth,
            interface=req.interface,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except (RuntimeError, OSError) as e:
        raise HTTPException(status_code=503, detail=f"La auditoría de cámaras no está disponible: {e}") from e


# --------------------------------------------------------------------------- #
# Topología de red
# --------------------------------------------------------------------------- #
@http_router.post("/topology")
async def api_topology(req: TopologyReq):
    if demo.is_demo():
        await asyncio.sleep(1.0)
        return demo.TOPOLOGY
    _require_scapy(discovery._SCAPY_AVAILABLE, "La topología de red")
    try:
        return await topology.build(req.interface, req.cidr, req.aggressive, req.traffic_seconds)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (RuntimeError, OSError) as e:
        raise HTTPException(status_code=503, detail=f"La topología no está disponible: {e}") from e


# --------------------------------------------------------------------------- #
# MITM / ARP
# --------------------------------------------------------------------------- #
@http_router.post("/arp/start", dependencies=[Depends(_require_real_mode)])
def api_arp_start(req: ArpReq):
    _require_scapy(arp_module._SCAPY_AVAILABLE, "MITM ARP")
    if req.target_ip == req.gateway_ip:
        raise HTTPException(status_code=400, detail="El objetivo y el gateway deben ser distintos.")
    spoofer = ArpSpoofer(req.target_ip, req.gateway_ip, req.interface)
    with manager.lock:
        if manager.arp:
            manager.arp.stop()
            manager.arp = None
        try:
            spoofer.start()
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e)) from e
        except OSError as e:
            raise HTTPException(status_code=503, detail=f"No se pudo iniciar MITM ARP: {e}") from e
        manager.arp = spoofer
    return {"status": "started"}


@http_router.post("/arp/stop", dependencies=[Depends(_require_real_mode)])
def api_arp_stop():
    with manager.lock:
        if manager.arp:
            manager.arp.stop()
            manager.arp = None
    return {"status": "stopped"}


# --------------------------------------------------------------------------- #
# Sniffer
# --------------------------------------------------------------------------- #
@http_router.post("/sniff/start", dependencies=[Depends(_require_real_mode)])
def api_sniff_start(req: SniffReq):
    _require_scapy(sniff_module._SCAPY_AVAILABLE, "El sniffer")
    sniffer = Sniffer(req.interface, req.bpf)
    with manager.lock:
        if manager.sniffer:
            manager.sniffer.stop()
            manager.sniffer = None
        try:
            sniffer.start()
        except (ValueError, RuntimeError) as e:
            try:
                sniffer.stop()
            except Exception:
                pass
            raise HTTPException(status_code=400, detail=str(e)) from e
        except OSError as e:
            try:
                sniffer.stop()
            except Exception:
                pass
            raise HTTPException(status_code=503, detail=f"No se pudo abrir la captura: {e}") from e
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
    _require_scapy(dns_module._SCAPY_AVAILABLE, "DNS spoofing")
    spoofer = DnsSpoofer(req.interface, req.mapping, req.spoof_all_to)
    with manager.lock:
        if manager.dns:
            manager.dns.stop()
            manager.dns = None
        try:
            spoofer.start()
        except (ValueError, RuntimeError) as e:
            try:
                spoofer.stop()
            except Exception:
                pass
            raise HTTPException(status_code=400, detail=str(e)) from e
        except OSError as e:
            try:
                spoofer.stop()
            except Exception:
                pass
            raise HTTPException(status_code=503, detail=f"No se pudo abrir la captura DNS: {e}") from e
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
    _require_scapy(creds_module._SCAPY_AVAILABLE, "La captura de credenciales")
    sniffer = CredSniffer(req.interface)
    with manager.lock:
        if manager.creds:
            manager.creds.stop()
            manager.creds = None
        try:
            sniffer.start()
        except (ValueError, RuntimeError) as e:
            try:
                sniffer.stop()
            except Exception:
                pass
            raise HTTPException(status_code=400, detail=str(e)) from e
        except OSError as e:
            try:
                sniffer.stop()
            except Exception:
                pass
            raise HTTPException(status_code=503, detail=f"No se pudo abrir la captura: {e}") from e
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
    async with _httpinject_lock:
        if manager.httpinject:
            manager.httpinject.stop()
            await manager.httpinject.wait_stopped()
            manager.httpinject = None
        injector = HttpInjector(req.inject, req.sslstrip, req.port, req.target_ip)
        try:
            await injector.start()
        except (RuntimeError, OSError) as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        manager.httpinject = injector
    return {"status": "started"}


@http_router.post("/httpinject/stop", dependencies=[Depends(_require_real_mode)])
async def api_httpinject_stop():
    async with _httpinject_lock:
        if manager.httpinject:
            manager.httpinject.stop()
            await manager.httpinject.wait_stopped()
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
        try:
            wifi.restore_interferers()
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=str(e))
    except OSError as e:
        try:
            wifi.restore_interferers()
        except Exception:
            pass
        raise HTTPException(status_code=503, detail=f"No se pudo preparar la interfaz Wi-Fi: {e}") from e
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
        if req.prepare:
            try:
                wifi.restore_interferers()
            except Exception:
                pass
        raise HTTPException(status_code=400, detail=str(e))
    except OSError as e:
        if req.prepare:
            try:
                wifi.restore_interferers()
            except Exception:
                pass
        raise HTTPException(status_code=503, detail=f"No se pudo cambiar el modo de la interfaz: {e}") from e


@http_router.post("/wifi/monitor/stop", dependencies=[Depends(_require_real_mode)])
def api_wifi_monitor_stop(req: WifiMonitorReq):
    try:
        result = wifi.set_monitor(req.interface, False)
    except (ValueError, RuntimeError) as e:
        if req.prepare:
            try:
                wifi.restore_interferers()
            except Exception:
                pass
        raise HTTPException(status_code=400, detail=str(e)) from e
    except OSError as e:
        if req.prepare:
            try:
                wifi.restore_interferers()
            except Exception:
                pass
        raise HTTPException(status_code=503, detail=f"No se pudo restaurar la interfaz: {e}") from e
    if req.prepare:
        try:
            wifi.restore_interferers()
        except OSError as e:
            raise HTTPException(status_code=503, detail=f"No se pudieron restaurar los servicios de red: {e}") from e
    return result


@http_router.post("/wifi/kill")
def api_wifi_kill():
    # Kept as a compatibility endpoint for older clients. It is deliberately
    # non-destructive because this request has no interface-specific safety proof.
    return {
        "stopped": [],
        "message": (
            "LESSSO ya no detiene NetworkManager ni otros servicios globales. "
            "Usa un adaptador Wi-Fi dedicado y desconectado para modo monitor."
        ),
    }


@http_router.post("/wifi/restore-services", dependencies=[Depends(_require_real_mode)])
def api_wifi_restore_services():
    try:
        started = wifi.restore_interferers()
        return {
            "started": started,
            "message": "Solo se restauran servicios detenidos por LESSSO; ninguno fue detenido.",
        }
    except OSError as e:
        raise HTTPException(status_code=503, detail=f"No se pudieron restaurar los servicios Wi-Fi: {e}") from e


# --------------------------------------------------------------------------- #
# Wi-Fi: escaneo 802.11 y deauth
# --------------------------------------------------------------------------- #
@http_router.post("/wifi/scan/start", dependencies=[Depends(_require_real_mode)])
def api_wifi_scan_start(req: WifiScanReq):
    _require_scapy(wifi._SCAPY_AVAILABLE, "El escaneo Wi-Fi")
    iface = _wifi_iface(req.interface, req.prepare)
    scanner = WifiScanner(iface, req.channels, clients_lock=manager.wifi_clients_lock)
    try:
        with manager.lock:
            if manager.wifi_scan:
                manager.wifi_scan.stop()
                manager.wifi_scan = None
            scanner.start()
            manager.wifi_clients = scanner.clients
            manager.wifi_scan = scanner
    except (ValueError, RuntimeError, OSError) as e:
        try:
            scanner.stop()
        except Exception:
            pass
        if req.prepare:
            try:
                wifi.set_monitor(iface, False)
                wifi.restore_interferers()
            except Exception:
                pass
        raise HTTPException(status_code=503, detail=f"No se pudo iniciar el escaneo Wi-Fi: {e}") from e
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
    client_snapshot = manager.wifi_clients_snapshot()
    for (ap, _client), info in client_snapshot.items():
        age = max(0, now - info.get("last_seen", 0))
        if age > 120 or (wanted and ap != wanted):
            continue
        clients.append({**info, "age": round(age, 1)})
    return {"clients": sorted(clients, key=lambda c: (c["bssid"], c["client"]))}


@http_router.post("/wifi/deauth/start", dependencies=[Depends(_require_real_mode)])
def api_wifi_deauth_start(req: DeauthReq):
    _require_scapy(wifi._SCAPY_AVAILABLE, "El envío de tramas Wi-Fi")
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
        observed = manager.get_wifi_client((bssid, client))
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
            manager.deauth = None
        try:
            deauther.start()
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except (RuntimeError, OSError) as e:
            if req.prepare:
                try:
                    wifi.set_monitor(iface, False)
                    wifi.restore_interferers()
                except Exception:
                    pass
            raise HTTPException(status_code=503, detail=f"No se pudo iniciar la operación Wi-Fi: {e}") from e
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
    _require_scapy(wifi._SCAPY_AVAILABLE, "La captura de handshakes Wi-Fi")
    if manager.wifi_scan:
        manager.wifi_scan.stop()
        manager.wifi_scan = None
    iface = _wifi_iface(req.interface, req.prepare)
    capturer = HandshakeCapturer(iface, req.bssid, req.channel, req.auto_convert)
    with manager.lock:
        if manager.handshake:
            manager.handshake.stop()
            manager.handshake = None
        try:
            capturer.start()
        except (ValueError, RuntimeError, OSError) as e:
            try:
                capturer.stop()
            except Exception:
                pass
            if req.prepare:
                try:
                    wifi.set_monitor(iface, False)
                    wifi.restore_interferers()
                except Exception:
                    pass
            raise HTTPException(status_code=503, detail=f"No se pudo iniciar la captura de handshake: {e}") from e
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
    _require_scapy(wifi._SCAPY_AVAILABLE, "La captura PMKID Wi-Fi")
    if manager.wifi_scan:
        manager.wifi_scan.stop()
        manager.wifi_scan = None
    iface = _wifi_iface(req.interface, req.prepare)
    capturer = PmkidCapturer(iface, req.bssid, req.channel, req.auto_convert)
    with manager.lock:
        if manager.pmkid:
            manager.pmkid.stop()
            manager.pmkid = None
        try:
            capturer.start()
        except (ValueError, RuntimeError, OSError) as e:
            try:
                capturer.stop()
            except Exception:
                pass
            if req.prepare:
                try:
                    wifi.set_monitor(iface, False)
                    wifi.restore_interferers()
                except Exception:
                    pass
            raise HTTPException(status_code=503, detail=f"No se pudo iniciar la captura PMKID: {e}") from e
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
    if demo.is_demo():
        return {"captures": []}
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
    _require_scapy(poison_module._SCAPY_AVAILABLE, "Los poisoners LLMNR/NBT-NS/mDNS")
    try:
        poisoner = NamePoisoner(req.interface, req.spoof_ip, req.llmnr, req.nbtns, req.mdns)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except (RuntimeError, OSError) as e:
        raise HTTPException(status_code=503, detail=f"No se pudo preparar el poisoner: {e}") from e
    with manager.lock:
        if manager.poison:
            manager.poison.stop()
            manager.poison = None
        try:
            poisoner.start()
        except (ValueError, RuntimeError) as e:
            try:
                poisoner.stop()
            except Exception:
                pass
            raise HTTPException(status_code=400, detail=str(e)) from e
        except OSError as e:
            try:
                poisoner.stop()
            except Exception:
                pass
            raise HTTPException(status_code=503, detail=f"No se pudo iniciar la captura de nombres: {e}") from e
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
            manager.wpad = None
        try:
            spoofer.start()
        except (ValueError, RuntimeError, OSError) as e:
            try:
                spoofer.stop()
            except Exception:
                pass
            raise HTTPException(status_code=503, detail=f"No se pudo iniciar WPAD: {e}") from e
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
    _require_scapy(mitm6_module._SCAPY_AVAILABLE, "MITM6")
    try:
        attacker = Mitm6(req.interface, req.interval, req.jitter, req.mapping, req.redirect_http_port)
    except (RuntimeError, ValueError, OSError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    with manager.lock:
        if manager.mitm6:
            manager.mitm6.stop()
            manager.mitm6 = None
        try:
            attacker.start()
        except ValueError as e:
            try:
                attacker.stop()
            except Exception as cleanup_error:
                bus.emit({"type": "error", "msg": f"No se pudo limpiar MITM6: {cleanup_error}"})
            raise HTTPException(status_code=400, detail=str(e)) from e
        except (RuntimeError, OSError) as e:
            try:
                attacker.stop()
            except Exception as cleanup_error:
                bus.emit({"type": "error", "msg": f"No se pudo limpiar MITM6: {cleanup_error}"})
            raise HTTPException(status_code=503, detail=f"No se pudo iniciar MITM6: {e}") from e
        manager.mitm6 = attacker
    return {"status": "started"}


@http_router.post("/mitm6/stop", dependencies=[Depends(_require_real_mode)])
def api_mitm6_stop():
    with manager.lock:
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
    except OSError as e:
        raise HTTPException(status_code=503, detail=f"No se pudo completar el cambio local: {e}") from e


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
    return {"tagged_rules": 0 if demo.is_demo() else fw.peek()}


@http_router.post("/cleanup")
def api_cleanup_run():
    return {"removed": 0 if demo.is_demo() else fw.cleanup_all()}


@http_router.get("/envcheck")
def api_envcheck():
    if demo.is_demo():
        return {"warnings": demo.envcheck(), "preflight": None}
    return {"warnings": envcheck.check(), "preflight": envcheck.preflight()}


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
