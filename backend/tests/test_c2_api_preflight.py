"""C2 API failure behavior with missing tools/dependencies; never sends traffic."""
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api.v1 import c2


def test_missing_scapy_is_a_clear_service_unavailable(monkeypatch):
    monkeypatch.setattr(c2.sniff_module, "_SCAPY_AVAILABLE", False)
    with pytest.raises(HTTPException) as error:
        c2.api_sniff_start(c2.SniffReq(interface="wlo1"))
    assert error.value.status_code == 503
    assert "Scapy" in error.value.detail


def test_wifi_module_dependency_is_checked_before_interface_changes(monkeypatch):
    monkeypatch.setattr(c2.wifi, "_SCAPY_AVAILABLE", False)
    with pytest.raises(HTTPException) as error:
        c2.api_wifi_scan_start(c2.WifiScanReq(interface="wlo1", prepare=True))
    assert error.value.status_code == 503
    assert "escaneo Wi-Fi" in error.value.detail


def test_poison_and_mitm6_missing_scapy_do_not_construct_modules(monkeypatch):
    monkeypatch.setattr(c2.poison_module, "_SCAPY_AVAILABLE", False)
    with pytest.raises(HTTPException) as poison_error:
        c2.api_poison_start(c2.PoisonReq(interface="wlo1"))
    assert poison_error.value.status_code == 503

    monkeypatch.setattr(c2.mitm6_module, "_SCAPY_AVAILABLE", False)
    with pytest.raises(HTTPException) as mitm6_error:
        c2.api_mitm6_start(c2.Mitm6Req(interface="wlo1"))
    assert mitm6_error.value.status_code == 503


def test_poison_interface_setup_errors_are_not_internal_server_errors(monkeypatch):
    monkeypatch.setattr(c2.poison_module, "_SCAPY_AVAILABLE", True)

    def unavailable(*args, **kwargs):
        raise OSError("interface unavailable")

    monkeypatch.setattr(c2, "NamePoisoner", unavailable)
    with pytest.raises(HTTPException) as error:
        c2.api_poison_start(c2.PoisonReq(interface="wlo1"))
    assert error.value.status_code == 503


def test_optional_exploit_tool_absence_returns_503(monkeypatch):
    monkeypatch.setattr(c2.exploits, "SEARCHSPLOIT", None)
    with pytest.raises(HTTPException) as error:
        c2.api_exploits_check(c2.ExploitCheckReq(services=[]))
    assert error.value.status_code == 503


@pytest.mark.asyncio
async def test_camera_dependency_errors_are_reported_without_leaking_500(monkeypatch):
    async def unavailable(*args, **kwargs):
        raise RuntimeError("optional camera tool unavailable")

    monkeypatch.setattr(c2.cameras, "audit", unavailable)
    with pytest.raises(HTTPException) as error:
        await c2.api_camera_audit(c2.CameraAuditReq(target="192.0.2.1"))
    assert error.value.status_code == 503
    assert "no está disponible" in error.value.detail


@pytest.mark.asyncio
async def test_portscan_dependency_error_is_reported_without_network(monkeypatch):
    monkeypatch.setattr(c2.portscan, "scan", AsyncMock(side_effect=RuntimeError("raw sockets unavailable")))
    with pytest.raises(HTTPException) as error:
        await c2.api_portscan(c2.PortReq(ip="192.0.2.1", mode="syn"))
    assert error.value.status_code == 503


def test_null_or_malformed_interface_inputs_are_rejected_before_dispatch():
    with pytest.raises(ValueError):
        c2.SniffReq(interface="  ")
    with pytest.raises(ValueError):
        c2.WifiScanReq(interface="wlo1/../../etc")
    with pytest.raises(ValueError):
        c2.WifiScanReq(interface="x" * 16)

    with pytest.raises(ValueError):
        c2.ExploitCheckReq(services=[{"product": 7}])

    with pytest.raises(ValueError):
        c2.CameraAuditReq(target="192.0.2.1", modules=["unknown-module"])

