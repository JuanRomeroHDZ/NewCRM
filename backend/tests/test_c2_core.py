"""Tests unitarios del núcleo C2 migrado desde LESSSO | C2."""
import asyncio
import base64
import os

from app.c2.core import demo, fw
from app.c2.core.bus import EventBus
from app.c2.core.netutils import to_cidr
from app.c2.modules import creds as creds_mod
from app.c2.modules.creds import CredSniffer
from app.c2.modules.exploits import ExploitSearcher
from app.c2.modules.portscan import COMMON_PORTS, parse_ports
from app.config import settings


def test_camera_credentials_do_not_leak_to_console(monkeypatch, capsys):
    from app.c2.modules.cameras import credential_tester

    monkeypatch.setattr(credential_tester, 'DEFAULT_CREDENTIALS', [('test-user', 'test-secret', 'fixture')])
    tester = credential_tester.CredentialTester('example.invalid')
    monkeypatch.setattr(tester, '_try_rtsp_auth', lambda *args: True)
    monkeypatch.setattr(tester, '_try_http_basic', lambda *args: True)
    findings = tester.run()
    output = capsys.readouterr().out

    assert 'test-user' not in output
    assert 'test-secret' not in output
    assert len(findings) == 2
    assert all(finding['evidence'][0]['pass'] == 'test-secret' for finding in findings)

try:
    from scapy.all import IP as _SCAPY_IP, Raw as _SCAPY_Raw, TCP as _SCAPY_TCP
    _HAS_SCAPY = True
except ImportError:
    class _FakeLayer:
        pass

    _SCAPY_IP = _FakeLayer
    _SCAPY_Raw = _FakeLayer
    _SCAPY_TCP = _FakeLayer
    _HAS_SCAPY = False


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


# --------------------------------------------------------------------------- #
# EventBus
# --------------------------------------------------------------------------- #
def test_emit_llega_al_suscriptor():
    async def scenario():
        bus = EventBus()
        bus.bind_loop(asyncio.get_running_loop())
        q = bus.subscribe()
        bus.emit({"type": "packet", "proto": "TCP"})
        await asyncio.sleep(0)
        assert await q.get() == {"type": "packet", "proto": "TCP"}

    _run(scenario())


def test_replay_entrega_historico_al_conectar_tarde():
    async def scenario():
        bus = EventBus()
        bus.bind_loop(asyncio.get_running_loop())
        q1 = bus.subscribe()
        bus.emit({"type": "error", "msg": "aviso previo"})
        await asyncio.sleep(0)
        await q1.get()

        q2 = bus.subscribe()
        assert await asyncio.wait_for(q2.get(), 1) == {"type": "error", "msg": "aviso previo"}

    _run(scenario())


def test_emit_sin_loop_no_explota():
    bus = EventBus()
    bus.emit({"type": "x"})


def test_unsubscribe():
    async def scenario():
        bus = EventBus()
        bus.bind_loop(asyncio.get_running_loop())
        q = bus.subscribe()
        bus.unsubscribe(q)
        assert q not in bus._subscribers

    _run(scenario())


# --------------------------------------------------------------------------- #
# CredSniffer
# --------------------------------------------------------------------------- #
class _RawSentinel:
    pass


class _IPSentinel:
    pass


class _TCPSentinel:
    pass


class FakePkt:
    """Mínimo objeto con la interfaz de paquete scapy que usa CredSniffer."""

    def __init__(self, load: bytes, raw_cls, ip_cls, tcp_cls,
                 src="10.0.0.2", dst="10.0.0.1", sport=12345, dport=80):
        self._load = load
        self._raw_cls = raw_cls
        self._ip_cls = ip_cls
        self._tcp_cls = tcp_cls
        self._src = src
        self._dst = dst
        self._sport = sport
        self._dport = dport

    def haslayer(self, cls):
        return cls in (self._raw_cls, self._ip_cls, self._tcp_cls)

    def __getitem__(self, cls):
        return self

    @property
    def load(self):
        return self._load

    @property
    def src(self):
        return self._src

    @property
    def dst(self):
        return self._dst

    @property
    def sport(self):
        return self._sport

    @property
    def dport(self):
        return self._dport


def _collect(monkeypatch, load: str, **kw) -> list[tuple[str, str]]:
    if _HAS_SCAPY:
        raw_cls, ip_cls, tcp_cls = _SCAPY_Raw, _SCAPY_IP, _SCAPY_TCP
    else:
        raw_cls, ip_cls, tcp_cls = _RawSentinel, _IPSentinel, _TCPSentinel
        monkeypatch.setattr(creds_mod, "Raw", raw_cls)
        monkeypatch.setattr(creds_mod, "IP", ip_cls)
        monkeypatch.setattr(creds_mod, "TCP", tcp_cls)

    sniffer = CredSniffer("eth0")
    emitted = []
    sniffer._emit = lambda proto, data, src, dst: emitted.append((proto, data))
    sniffer._process(FakePkt(load.encode(), raw_cls, ip_cls, tcp_cls, **kw))
    return emitted


def test_detecta_http_basic(monkeypatch):
    cred = base64.b64encode(b"admin:SuperSecret1").decode()
    found = _collect(monkeypatch, f"GET / HTTP/1.1\r\nAuthorization: Basic {cred}\r\n")
    assert any(p == "HTTP-Basic" and "admin:SuperSecret1" in d for p, d in found)


def test_detecta_formulario_post(monkeypatch):
    found = _collect(monkeypatch, "POST /login HTTP/1.1\r\n\r\nuser=admin&password=hunter2")
    assert any(p == "HTTP-Form" for p, d in found)


def test_detecta_bearer(monkeypatch):
    found = _collect(monkeypatch, "GET /api HTTP/1.1\r\nAuthorization: Bearer eyJhbGciOi.abc.def")
    assert any(p == "Token-Bearer" for p, d in found)


def test_detecta_json_cred(monkeypatch):
    found = _collect(monkeypatch, 'POST /api HTTP/1.1\r\n\r\n{"username": "bob", "password": "s3cret0"}')
    assert any(p == "JSON-Cred" for p, d in found)


def test_detecta_ntlmssp(monkeypatch):
    found = _collect(monkeypatch, b"NTLMSSP\x00\x02\x00\x00\x00".decode(errors="ignore"))
    assert any(p == "NTLMSSP" for p, d in found)


def test_paquete_sin_credenciales_no_emite(monkeypatch):
    found = _collect(monkeypatch, "GET /style.css HTTP/1.1\r\nHost: example.com")
    assert found == []


# --------------------------------------------------------------------------- #
# Demo dataset y fw
# --------------------------------------------------------------------------- #
def test_hosts_con_ip_unica_y_mac_valida():
    ips = [h["ip"] for h in demo.HOSTS]
    assert len(ips) == len(set(ips))
    for h in demo.HOSTS:
        assert len(h["mac"].split(":")) == 6
        assert h["os"]


def test_todos_los_hosts_de_discovery_tienen_datos_en_el_dataset():
    flat = {h["ip"] for h in demo.hosts()}
    detailed = {h["ip"] for h in demo.HOSTS}
    assert flat == detailed


def test_topologia_nodos_y_aristas_coherentes():
    ids = {n["id"] for n in demo.TOPOLOGY["nodes"]}
    for edge in demo.TOPOLOGY["edges"]:
        assert edge["source"] in ids
        assert edge["target"] in ids


def test_puertos_demo_validos():
    for h in demo.HOSTS:
        for p in h["ports"]:
            assert 0 < p["port"] < 65535


def test_is_demo_respeta_variable_de_entorno_y_settings(monkeypatch):
    monkeypatch.setattr(settings, "LESSSO_DEMO", False)
    old = os.environ.get(demo.DEMO_ENV)
    old_legacy = os.environ.get(demo.LEGACY_DEMO_ENV)
    try:
        os.environ.pop(demo.LEGACY_DEMO_ENV, None)
        os.environ[demo.DEMO_ENV] = "1"
        assert demo.is_demo()
        os.environ[demo.DEMO_ENV] = "0"
        assert not demo.is_demo()
        del os.environ[demo.DEMO_ENV]
        assert not demo.is_demo()

        os.environ[demo.LEGACY_DEMO_ENV] = "1"
        assert demo.is_demo()
        del os.environ[demo.LEGACY_DEMO_ENV]

        monkeypatch.setattr(settings, "LESSSO_DEMO", True)
        assert demo.is_demo()
    finally:
        if old is not None:
            os.environ[demo.DEMO_ENV] = old
        else:
            os.environ.pop(demo.DEMO_ENV, None)
        if old_legacy is not None:
            os.environ[demo.LEGACY_DEMO_ENV] = old_legacy
        else:
            os.environ.pop(demo.LEGACY_DEMO_ENV, None)


def test_fw_run_con_binario_inexistente_no_lanza_excepcion():
    proc = fw._run("binario-que-no-existe-12345", ["-S"])
    assert proc.returncode != 0


def test_fw_peek_es_seguro_sin_iptables():
    assert fw.peek() == 0


# --------------------------------------------------------------------------- #
# Netutils, portscan & exploits
# --------------------------------------------------------------------------- #
def test_parse_ports_none_devuelve_comunes():
    assert parse_ports(None) == COMMON_PORTS


def test_parse_ports_lista():
    assert parse_ports([22, 80, 443]) == [22, 80, 443]


def test_parse_ports_rango_y_sueltos():
    assert parse_ports("22,80,100-102,443") == [22, 80, 100, 101, 102, 443]


def test_parse_ports_rango_invertido():
    assert parse_ports("200-198") == [198, 199, 200]


def test_parse_ports_filtra_invalidos():
    assert parse_ports("0,70000,80") == [80]


def test_to_cidr_normal():
    assert to_cidr("192.168.1.10", "255.255.255.0") == "192.168.1.0/24"


def test_to_cidr_mascara_rara():
    assert to_cidr("10.0.0.5", "255.255.0.0") == "10.0.0.0/16"


def test_to_cidr_invalido_devuelve_none():
    assert to_cidr("no-ip", "255.255.255.0") is None
    assert to_cidr(None, None) is None
    assert to_cidr("10.0.0.5", None) is None


def test_core_modules_import_cleanly():
    import app.c2.core.cleanup  # noqa: F401
    import app.c2.core.envcheck  # noqa: F401
    import app.c2.core.manager  # noqa: F401
    import app.c2.core.state  # noqa: F401
    import app.c2.modules.cameras  # noqa: F401
    searcher = ExploitSearcher()
    assert searcher._clean_term("--exclude") == ""
    assert searcher._query_term({"product": "OpenSSH", "version": "7.4p1"}) == "OpenSSH 7.4p1"


def test_parse_ports_clamps_ranges_before_expanding():
    assert parse_ports('65534-999999999999') == [65534, 65535]
    assert parse_ports('70000-999999999999') == []


def test_network_discovery_rejects_unbounded_or_incompatible_ranges():
    import pytest
    from app.c2.core.targets import bounded_network
    from app.c2.modules import discovery
    from app.c2.modules.cameras.discovery import CameraDiscovery
    from app.api.v1.c2 import ScanReq, TopologyReq, CameraDiscoverReq
    from pydantic import ValidationError

    assert bounded_network('192.0.2.0/24').num_addresses == 256
    assert bounded_network('2001:db8::1').num_addresses == 1
    assert bounded_network('192.0.0.0/20').num_addresses == 4096
    for target in ('10.0.0.0/8', '2001:db8::/64'):
        with pytest.raises(ValueError, match='4096'):
            CameraDiscovery(target).scan()
        with pytest.raises(ValidationError, match='4096'):
            CameraDiscoverReq(target=target)
    with pytest.raises(ValueError, match='4096'):
        discovery.scan('eth0', '10.0.0.0/8')
    with pytest.raises(ValidationError, match='4096'):
        ScanReq(interface='eth0', cidr='10.0.0.0/8')
    with pytest.raises(ValidationError, match='IPv4'):
        TopologyReq(interface='eth0', cidr='2001:db8::/120')
