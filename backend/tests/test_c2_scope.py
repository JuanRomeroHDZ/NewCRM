"""Safe unit tests for C2 engagement scope enforcement; no network calls."""
from datetime import timedelta
import threading
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1 import c2_proxy
from app.api.v1 import c2 as c2_worker_api
from app.api.v1.agenda import PentestEngagementCreate
from app.c2.core.manager import manager
from app.services import c2_scope
from app.services.core_auth import utc_now


def test_scope_target_parser_supports_ips_ranges_domains_and_macs():
    authorized = c2_scope.parse_authorized_targets(
        "192.168.100.0/24, app.lab.example; *.devices.example 02:00:00:00:00:01"
    )

    assert c2_scope.target_is_authorized("192.168.100.17", authorized)
    assert c2_scope.target_is_authorized("192.168.100.16/28", authorized)
    assert not c2_scope.target_is_authorized("192.168.101.17", authorized)
    assert c2_scope.target_is_authorized("app.lab.example", authorized)
    assert c2_scope.target_is_authorized("cam.devices.example", authorized)
    assert not c2_scope.target_is_authorized("devices.example", authorized)
    assert c2_scope.target_is_authorized("02:00:00:00:00:01", authorized)
    assert not c2_scope.target_is_authorized("02:00:00:00:00:02", authorized)


def test_scope_gate_extracts_targets_for_operations_and_rejects_escape():
    scope = "192.168.100.0/24"
    c2_scope.validate_scope_targets(
        "arp/start",
        {"target_ip": "192.168.100.17", "gateway_ip": "192.168.100.1"},
        scope,
    )

    with pytest.raises(HTTPException) as error:
        c2_scope.validate_scope_targets(
            "discovery", {"cidr": "192.168.0.0/16"}, scope
        )
    assert error.value.status_code == 403
    assert "no está incluido" in error.value.detail

    with pytest.raises(HTTPException):
        c2_scope.validate_scope_targets(
            "exploits/check",
            {"ip": "192.168.100.17", "services": [{"ip": "192.168.101.9", "product": "OpenSSH"}]},
            scope,
        )


def test_scope_gate_checks_dns_mapping_names_and_answers():
    c2_scope.validate_scope_targets(
        "dns/start",
        {"mapping": {"internal.lab.example": "192.168.100.10"}},
        "internal.lab.example 192.168.100.0/24",
    )
    with pytest.raises(HTTPException):
        c2_scope.validate_scope_targets(
            "dns/start",
            {"mapping": {"outside.example": "192.168.100.10"}},
            "192.168.100.0/24",
        )


def test_handshake_requires_an_exactly_authorized_access_point():
    c2_scope.validate_scope_targets(
        "wifi/handshake/start",
        {"bssid": "02:00:00:00:00:17"},
        "192.168.100.0/24 02:00:00:00:00:17",
    )
    with pytest.raises(HTTPException) as error:
        c2_scope.validate_scope_targets(
            "wifi/handshake/start",
            {"bssid": "02:00:00:00:00:18"},
            "192.168.100.0/24 02:00:00:00:00:17",
        )
    assert error.value.status_code == 403


def test_mitm6_requires_a_valid_matching_ipv6_network():
    approved = c2_scope.parse_authorized_ipv6_targets("fd00:100::/48, 2001:db8:1::/64")
    assert len(approved) == 2
    c2_scope.validate_interface_ipv6_cidrs(["fd00:100:1::/64"], "fd00:100::/40")
    with pytest.raises(HTTPException) as missing:
        c2_scope.validate_interface_ipv6_cidrs([], "fd00:100::/40")
    assert missing.value.status_code == 403
    with pytest.raises(HTTPException) as mismatch:
        c2_scope.validate_interface_ipv6_cidrs(["fd00:101::/64"], "fd00:100::/48")
    assert mismatch.value.status_code == 403
    with pytest.raises(ValueError):
        c2_scope.parse_authorized_ipv6_targets("192.168.100.0/24")


def test_engagement_schema_accepts_only_ipv6_networks_in_mitm6_scope():
    now = utc_now()
    values = dict(
        client_id="client-1",
        title="Authorized lab",
        scope_written_summary="Written approval for a contained network lab.",
        authorized_targets="192.168.100.0/24",
        window_start=now,
        window_end=now + timedelta(hours=1),
    )
    engagement = PentestEngagementCreate(**values, authorized_ipv6_targets="fd00:100::/64")
    assert engagement.authorized_ipv6_targets == "fd00:100::/64"
    with pytest.raises(ValueError):
        PentestEngagementCreate(**values, authorized_ipv6_targets="192.168.100.0/24")


@pytest.mark.asyncio
async def test_mitm6_interface_gate_uses_worker_ipv6_metadata_only():
    class FakeResponse:
        status_code = 200

        def __init__(self, rows):
            self.rows = rows

        def json(self):
            return {"interfaces": self.rows}

    class FakeClient:
        def __init__(self, rows):
            self.rows = rows

        async def get(self, url, headers):
            return FakeResponse(self.rows)

    rows = [{"name": "eth0", "cidr": None, "ipv6_cidrs": ["fd00:100:1::/64"]}]
    await c2_proxy._validate_interface_scope(
        FakeClient(rows), "secret", "mitm6/start", {"interface": "eth0"},
        "192.168.100.0/24", "fd00:100::/40",
    )
    with pytest.raises(HTTPException) as error:
        await c2_proxy._validate_interface_scope(
            FakeClient(rows), "secret", "mitm6/start", {"interface": "eth0"},
            "192.168.100.0/24", "fd00:101::/40",
        )
    assert error.value.status_code == 403


def test_all_non_read_routes_are_scope_gated_except_safe_stop_and_preview_routes():
    operational_routes = (
        "discovery", "portscan", "fingerprint", "exploits/check", "camera/discover",
        "camera/audit", "topology", "arp/start", "sniff/start", "dns/start",
        "creds/start", "httpinject/start", "wifi/monitor/start", "wifi/scan/start",
        "wifi/deauth/start", "wifi/handshake/start", "wifi/pmkid/start", "wifi/convert",
        "poison/start", "wpad/start", "mitm6/start", "opsec/hostname", "opsec/mac",
        "opsec/apply", "opsec/profile",
    )
    for path in operational_routes:
        assert c2_proxy._requires_scope("POST", path), path

    safe_routes = (
        "arp/stop", "wifi/deauth/stop", "wifi/restore-services", "opsec/restore",
        "wifi/handshake/stop", "creds/clear", "panic", "cleanup", "opsec/preview", "opsec/generate",
    )
    for path in safe_routes:
        assert not c2_proxy._requires_scope("POST", path), path
    for path in ("meta", "interfaces", "status", "wifi/ifaces", "wifi/clients", "creds/export",
                 "wifi/captures", "wifi/download", "opsec", "cleanup", "envcheck"):
        assert not c2_proxy._requires_scope("GET", path), path
    # A newly added GET endpoint fails closed until it is reviewed as read-only.
    assert c2_proxy._requires_scope("GET", "future/scan")


def test_worker_route_inventory_is_explicit_and_every_get_is_classified():
    actual_gets = set()
    actual_posts = set()
    for route in c2_worker_api.http_router.routes:
        path = route.path.lstrip("/")
        for method in getattr(route, "methods", ()):
            if method == "GET":
                actual_gets.add(path)
            elif method == "POST":
                actual_posts.add(path)

    expected_gets = {
        "meta", "interfaces", "status", "creds/export", "wifi/ifaces",
        "wifi/clients", "wifi/captures", "wifi/download", "opsec", "cleanup", "envcheck",
    }
    expected_posts = {
        "discovery", "portscan", "fingerprint", "exploits/check", "camera/discover",
        "camera/audit", "topology", "arp/start", "arp/stop", "sniff/start", "sniff/stop",
        "dns/start", "dns/stop", "creds/start", "creds/stop", "creds/clear",
        "httpinject/start", "httpinject/stop", "wifi/monitor/start", "wifi/monitor/stop",
        "wifi/kill", "wifi/restore-services", "wifi/scan/start", "wifi/scan/stop",
        "wifi/deauth/start", "wifi/deauth/stop", "wifi/handshake/start", "wifi/handshake/stop",
        "wifi/pmkid/start", "wifi/pmkid/stop", "wifi/convert", "poison/start", "poison/stop",
        "wpad/start", "wpad/stop", "mitm6/start", "mitm6/stop", "opsec/preview",
        "opsec/generate", "opsec/hostname", "opsec/mac", "opsec/apply", "opsec/profile",
        "opsec/restore", "panic", "cleanup",
    }
    assert actual_gets == expected_gets
    assert actual_posts == expected_posts
    assert all(not c2_proxy._requires_scope("GET", path) for path in actual_gets)
    assert all(c2_proxy._requires_scope("POST", path) for path in actual_posts - c2_proxy._SCOPE_EXEMPT_POSTS)
    assert all(not c2_proxy._requires_scope("POST", path) for path in actual_posts & c2_proxy._SCOPE_EXEMPT_POSTS)


def test_interface_bound_operations_require_the_entire_interface_range_in_scope():
    assert c2_scope.interface_scope_required("sniff/start")
    assert c2_scope.interface_scope_required("wifi/scan/start")
    assert c2_scope.interface_scope_required("opsec/mac")
    assert not c2_scope.interface_scope_required("wifi/handshake/start")
    assert c2_scope.interface_validation_required("wifi/handshake/start")
    c2_scope.validate_interface_cidr("10.10.2.0/24", "10.10.0.0/16")
    with pytest.raises(HTTPException):
        c2_scope.validate_interface_cidr("10.10.2.0/24", "10.10.2.17")


@pytest.mark.asyncio
async def test_active_engagement_requires_allowed_state_and_live_window(monkeypatch):
    now = utc_now()
    engagement = SimpleNamespace(
        id="scope-1",
        status="autorizado",
        window_start=now - timedelta(minutes=1),
        window_end=now + timedelta(minutes=1),
        authorized_targets="10.0.0.0/24",
        authorized_ipv6_targets="",
    )

    class FakeDb:
        async def get(self, model, engagement_id):
            return engagement if engagement_id == engagement.id else None

    loaded = await c2_proxy._load_active_engagement(FakeDb(), "scope-1")
    assert loaded is engagement

    engagement.authorized_targets = ""
    engagement.authorized_ipv6_targets = "fd00:100::/64"
    assert await c2_proxy._load_active_engagement(FakeDb(), "scope-1") is engagement
    engagement.authorized_targets = "10.0.0.0/24"

    engagement.status = "cancelado"
    with pytest.raises(HTTPException) as error:
        await c2_proxy._load_active_engagement(FakeDb(), "scope-1")
    assert error.value.status_code == 403

    with pytest.raises(HTTPException):
        await c2_proxy._load_active_engagement(FakeDb(), None)


def test_wifi_clients_snapshot_cannot_race_capture_thread():
    """A writer must wait while the route takes its response snapshot."""
    started = threading.Event()
    resume = threading.Event()
    writer_done = threading.Event()

    class PausingItems(dict):
        def items(self):
            iterator = iter(super().items())
            first = next(iterator)
            started.set()
            assert resume.wait(2)
            yield first
            yield from iterator

    previous_clients = manager.wifi_clients
    previous_scan = manager.wifi_scan
    manager.wifi_scan = None
    manager.wifi_clients = PausingItems({
        ("02:00:00:00:00:01", "02:00:00:00:00:02"): {
            "bssid": "02:00:00:00:00:01",
            "client": "02:00:00:00:00:02",
            "last_seen": utc_now().timestamp(),
        },
    })
    result: list[dict] = []

    def read_clients():
        result.append(manager.wifi_clients_snapshot())

    def write_client():
        assert started.wait(2)
        with manager.wifi_clients_lock:
            manager.wifi_clients[("02:00:00:00:00:03", "02:00:00:00:00:04")] = {
                "bssid": "02:00:00:00:00:03",
                "client": "02:00:00:00:00:04",
                "last_seen": utc_now().timestamp(),
            }
        writer_done.set()

    reader = threading.Thread(target=read_clients)
    writer = threading.Thread(target=write_client)
    try:
        reader.start()
        writer.start()
        assert started.wait(2)
        assert not writer_done.wait(0.05)
        resume.set()
        reader.join(2)
        writer.join(2)
        assert not reader.is_alive() and not writer.is_alive()
        assert len(result[0]) == 1
        assert result[0][("02:00:00:00:00:01", "02:00:00:00:00:02")]["bssid"] == "02:00:00:00:00:01"
        assert writer_done.is_set()
    finally:
        resume.set()
        manager.wifi_clients = previous_clients
        manager.wifi_scan = previous_scan
