"""Tests de integración API y WebSocket para LESSSO | C2 bajo /api/v1/c2."""
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.c2.core import demo
from app.c2.core.bus import bus
from app.config import settings
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker
import pytest_asyncio
from app.api.v1 import auth, c2
from app.database import get_db

# El motor se prueba de forma aislada; la pasarela pública se cubre en
# test_c2_worker_proxy.py con un proceso y socket reales.
app = FastAPI()
app.include_router(auth.router, prefix="/api/v1")
app.include_router(c2.router, prefix="/api/v1")

@pytest_asyncio.fixture
async def client(test_engine):
    session_factory = async_sessionmaker(test_engine, expire_on_commit=False)
    async def override_db():
        async with session_factory() as session:
            yield session
    app.dependency_overrides[get_db] = override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
from app.security.tokens import create_vault_token, revoke_vault_token


@pytest.mark.asyncio
async def test_c2_routes_reject_unauthenticated(client):
    """Todos los endpoints HTTP de C2 deben exigir sesión de bóveda Level 2 (401)."""
    get_routes = [
        "/api/v1/c2/meta",
        "/api/v1/c2/interfaces",
        "/api/v1/c2/status",
        "/api/v1/c2/creds/export",
        "/api/v1/c2/wifi/ifaces",
        "/api/v1/c2/wifi/clients",
        "/api/v1/c2/wifi/captures",
        "/api/v1/c2/wifi/download?file=x.pcap",
        "/api/v1/c2/opsec",
        "/api/v1/c2/cleanup",
        "/api/v1/c2/envcheck",
    ]
    for route in get_routes:
        res = await client.get(route)
        assert res.status_code == 401, f"GET {route} expected 401, got {res.status_code}"

    post_routes = [
        ("/api/v1/c2/discovery", {"interface": "eth0", "cidr": "10.10.20.0/24"}),
        ("/api/v1/c2/portscan", {"ip": "10.10.20.1"}),
        ("/api/v1/c2/fingerprint", {"ip": "10.10.20.1"}),
        ("/api/v1/c2/exploits/check", {"services": []}),
        ("/api/v1/c2/topology", {"interface": "eth0", "cidr": "10.10.20.0/24"}),
        ("/api/v1/c2/arp/start", {"interface": "eth0", "target_ip": "10.10.20.10", "gateway_ip": "10.10.20.1"}),
        ("/api/v1/c2/panic", {}),
        ("/api/v1/c2/cleanup", {}),
    ]
    for route, payload in post_routes:
        res = await client.post(route, json=payload)
        assert res.status_code == 401, f"POST {route} expected 401, got {res.status_code}"


def test_c2_websocket_rejects_invalid_and_revoked_tokens():
    """WS /api/v1/c2/ws debe cerrar con 4401 si falta token, es inválido o fue revocado."""
    client = TestClient(app)

    # Sin token
    with pytest.raises(WebSocketDisconnect) as exc_missing:
        with client.websocket_connect("/api/v1/c2/ws"):
            pass
    assert exc_missing.value.code == 4401

    # Token inválido
    with pytest.raises(WebSocketDisconnect) as exc_bad:
        with client.websocket_connect("/api/v1/c2/ws?token=invalid-jwt-token"):
            pass
    assert exc_bad.value.code == 4401

    # Token válido revocado (bóveda bloqueada)
    token = create_vault_token(timeout_minutes=5)
    assert revoke_vault_token(token) is True
    with pytest.raises(WebSocketDisconnect) as exc_revoked:
        with client.websocket_connect(f"/api/v1/c2/ws?token={token}"):
            pass
    assert exc_revoked.value.code == 4401


def test_c2_websocket_accepts_valid_token_and_replays_events():
    """WS /api/v1/c2/ws acepta token válido y entrega eventos del EventBus."""
    token = create_vault_token(timeout_minutes=5)
    try:
        client = TestClient(app)
        with client.websocket_connect(f"/api/v1/c2/ws?token={token}") as ws:
            bus.emit({"type": "info", "msg": "ws-test-event"})
            ev = ws.receive_json()
            # Si había eventos previos en el replay buffer, leer hasta ver el emitido
            seen = [ev]
            for _ in range(30):
                if ev.get("msg") == "ws-test-event":
                    break
                ev = ws.receive_json()
                seen.append(ev)
            assert any(item.get("msg") == "ws-test-event" for item in seen)
    finally:
        revoke_vault_token(token)


@pytest.mark.asyncio
async def test_c2_demo_mode_endpoints_and_real_mode_guard(client, auth_token, monkeypatch):
    """En modo demo, los endpoints seguros devuelven datos ficticios y los ofensivos responden 400."""
    monkeypatch.setattr(settings, "LESSSO_DEMO", True)
    headers = {"X-Vault-Token": auth_token}

    meta_res = await client.get("/api/v1/c2/meta", headers=headers)
    assert meta_res.status_code == 200
    assert meta_res.json() == {"demo_mode": True}

    iface_res = await client.get("/api/v1/c2/interfaces", headers=headers)
    assert iface_res.status_code == 200
    assert iface_res.json()["interfaces"][0]["name"] == demo.IFACE["name"]
    assert iface_res.json()["gateway"] == demo.GATEWAY

    status_res = await client.get("/api/v1/c2/status", headers=headers)
    assert status_res.status_code == 200
    assert "arp" in status_res.json()
    assert "mitm6" in status_res.json()

    disc_res = await client.post(
        "/api/v1/c2/discovery",
        headers=headers,
        json={"interface": "eth0", "cidr": "10.10.20.0/24"},
    )
    assert disc_res.status_code == 200
    assert len(disc_res.json()["hosts"]) == len(demo.HOSTS)

    ps_res = await client.post(
        "/api/v1/c2/portscan",
        headers=headers,
        json={"ip": "10.10.20.1"},
    )
    assert ps_res.status_code == 200
    assert ps_res.json()["ip"] == "10.10.20.1"
    assert len(ps_res.json()["open"]) >= 1

    fp_res = await client.post(
        "/api/v1/c2/fingerprint",
        headers=headers,
        json={"ip": "10.10.20.1"},
    )
    assert fp_res.status_code == 200
    assert fp_res.json()["ttl"] == 255

    topo_res = await client.post(
        "/api/v1/c2/topology",
        headers=headers,
        json={"interface": "eth0", "cidr": "10.10.20.0/24"},
    )
    assert topo_res.status_code == 200
    assert topo_res.json() == demo.TOPOLOGY

    env_res = await client.get("/api/v1/c2/envcheck", headers=headers)
    assert env_res.status_code == 200
    assert env_res.json()["warnings"] == demo.envcheck()

    cl_get = await client.get("/api/v1/c2/cleanup", headers=headers)
    assert cl_get.status_code == 200
    assert "tagged_rules" in cl_get.json()

    cl_post = await client.post("/api/v1/c2/cleanup", headers=headers)
    assert cl_post.status_code == 200
    assert "removed" in cl_post.json()

    opsec_res = await client.get("/api/v1/c2/opsec", headers=headers)
    assert opsec_res.status_code == 200
    assert opsec_res.json()["hostname"] == "lessso-demo"

    opsec_gen = await client.post(
        "/api/v1/c2/opsec/generate",
        headers=headers,
        json={"kind": "windows", "vendor": "Dell"},
    )
    assert opsec_gen.status_code == 200
    assert opsec_gen.json()["hostname"].startswith("DESKTOP-")
    assert opsec_gen.json()["vendor"] == "Dell"

    opsec_prev = await client.post(
        "/api/v1/c2/opsec/preview",
        headers=headers,
        json={"interface": "eth0", "profile": "macos"},
    )
    assert opsec_prev.status_code == 200
    assert opsec_prev.json()["vendor"] == "Apple"

    exp_res = await client.post(
        "/api/v1/c2/exploits/check",
        headers=headers,
        json={"services": [{"port": 22, "service": "ssh", "banner": "OpenSSH_7.4"}]},
    )
    assert exp_res.status_code == 200
    assert "results" in exp_res.json()

    wifi_if = await client.get("/api/v1/c2/wifi/ifaces", headers=headers)
    assert wifi_if.status_code == 200
    assert wifi_if.json() == {"interfaces": [demo.IFACE["name"]]}

    wifi_cl = await client.get("/api/v1/c2/wifi/clients", headers=headers)
    assert wifi_cl.status_code == 200
    assert wifi_cl.json() == {"clients": []}

    wifi_cap = await client.get("/api/v1/c2/wifi/captures", headers=headers)
    assert wifi_cap.status_code == 200
    assert "captures" in wifi_cap.json()

    # Endpoints ofensivos / modo real bloqueados con 400 en modo demo
    blocked_calls = [
        ("POST", "/api/v1/c2/arp/start", {"interface": "eth0", "target_ip": "10.10.20.10", "gateway_ip": "10.10.20.1"}),
        ("POST", "/api/v1/c2/arp/stop", {}),
        ("POST", "/api/v1/c2/sniff/start", {"interface": "eth0"}),
        ("POST", "/api/v1/c2/dns/start", {"interface": "eth0"}),
        ("POST", "/api/v1/c2/creds/start", {"interface": "eth0"}),
        ("GET", "/api/v1/c2/creds/export", None),
        ("POST", "/api/v1/c2/httpinject/start", {"inject": "", "port": 8080}),
        ("POST", "/api/v1/c2/wifi/monitor/start", {"interface": "wlan0"}),
        ("POST", "/api/v1/c2/wifi/scan/start", {"interface": "wlan0"}),
        ("POST", "/api/v1/c2/wifi/deauth/start", {"interface": "wlan0", "bssid": "00:11:22:33:44:55", "broadcast": True}),
        ("POST", "/api/v1/c2/wifi/handshake/start", {"interface": "wlan0"}),
        ("POST", "/api/v1/c2/wifi/pmkid/start", {"interface": "wlan0", "bssid": "00:11:22:33:44:55"}),
        ("POST", "/api/v1/c2/poison/start", {"interface": "eth0"}),
        ("POST", "/api/v1/c2/wpad/start", {"interface": "eth0"}),
        ("POST", "/api/v1/c2/mitm6/start", {"interface": "eth0"}),
        ("POST", "/api/v1/c2/opsec/hostname", {"hostname": "test-host"}),
        ("POST", "/api/v1/c2/opsec/apply", {"interface": "eth0", "hostname": "test-host"}),
        ("POST", "/api/v1/c2/panic", {}),
        ("POST", "/api/v1/c2/camera/discover", {"target": "10.10.20.0/24"}),
        ("POST", "/api/v1/c2/camera/audit", {"target": "10.10.20.60"}),
    ]
    for method, url, payload in blocked_calls:
        res = await client.request(method, url, headers=headers, json=payload)
        assert res.status_code == 400, f"{method} {url} expected 400 in demo, got {res.status_code}: {res.text}"
        assert "modo demo" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_c2_meta_real_mode(client, auth_token, monkeypatch):
    monkeypatch.setattr(settings, "LESSSO_DEMO", False)
    monkeypatch.delenv("LESSSO_DEMO", raising=False)
    monkeypatch.delenv("NETPWN_DEMO", raising=False)
    res = await client.get("/api/v1/c2/meta", headers={"X-Vault-Token": auth_token})
    assert res.status_code == 200
    assert res.json() == {"demo_mode": False}


@pytest.mark.asyncio
async def test_portscan_rejects_invalid_parameters_instead_of_hanging(client, auth_token):
    headers = {'X-Vault-Token': auth_token}
    for payload in (
        {'ip': '127.0.0.1', 'concurrency': 0},
        {'ip': '127.0.0.1', 'timeout': -1},
        {'ip': '127.0.0.1', 'ports': '20-invalid'},
    ):
        response = await client.post('/api/v1/c2/portscan', json=payload, headers=headers)
        assert response.status_code == 422
