"""Mock-only safety coverage for Wi-Fi mode and MAC mutations."""
from __future__ import annotations

import json
import subprocess

import pytest
from fastapi import HTTPException

from app.api.v1 import c2, c2_proxy
from app.c2.core import cleanup
from app.c2.modules import opsec, wifi


def _completed(command: list[str], stdout: str = "", returncode: int = 0, stderr: str = ""):
    return subprocess.CompletedProcess(command, returncode, stdout, stderr)


def _sys_net(tmp_path, iface="wlan9", *, siblings=()):
    base = tmp_path / "sys" / "class" / "net"
    base.mkdir(parents=True)
    phy = tmp_path / "sys" / "devices" / "phy0"
    phy.mkdir(parents=True)
    for name in (iface, *siblings):
        device = base / name
        device.mkdir()
        (device / "phy80211").symlink_to(phy)
    return base


def _wifi_mock(monkeypatch, base, *, mode="managed", link_flags=None, operstate="DOWN", routes=None):
    calls = []
    state = {"mode": mode, "up": operstate.upper() != "DOWN"}
    monkeypatch.setattr(wifi, "SYS_NET_PATH", base)

    def run(command):
        calls.append(list(command))
        if command[:4] == ["iw", "dev", "wlan9", "info"]:
            return _completed(command, f"Interface wlan9\n\ttype {state['mode']}\n")
        if command[:4] == ["iw", "dev", "wlan9", "link"]:
            return _completed(command, "Not connected.\n")
        if command[:3] == ["ip", "-j", "link"]:
            flags = link_flags
            if flags is None:
                flags = ["BROADCAST", "MULTICAST"]
                if state["up"]:
                    flags.append("UP")
            return _completed(command, json.dumps([{
                "ifname": "wlan9", "flags": flags,
                "operstate": operstate if link_flags is not None else ("UP" if state["up"] else "DOWN"),
            }]))
        if command[:3] == ["ip", "-j", "address"]:
            return _completed(command, json.dumps([{"ifname": "wlan9", "addr_info": []}]))
        if command[:5] == ["ip", "-j", "route", "show", "default"]:
            return _completed(command, json.dumps(routes or []))
        if command[:6] == ["ip", "-6", "-j", "route", "show", "default"]:
            return _completed(command, "[]")
        if command[:5] == ["iw", "dev", "wlan9", "set", "type"]:
            state["mode"] = command[-1]
        if command[:5] == ["ip", "link", "set", "wlan9", "up"]:
            state["up"] = True
        if command[:5] == ["ip", "link", "set", "wlan9", "down"]:
            state["up"] = False
        return _completed(command)

    monkeypatch.setattr(wifi, "_run", run)
    return calls, state


def _opsec_mock(monkeypatch, base, *, active=False, routes=None):
    calls = []
    monkeypatch.setattr(opsec, "SYS_NET_PATH", base)

    def run(command):
        calls.append(list(command))
        if command[:5] == ["ip", "-j", "link", "show", "dev"]:
            return _completed(command, json.dumps([{
                "ifname": "eth-test",
                "flags": ["BROADCAST", "MULTICAST", "UP"] if active else ["BROADCAST", "MULTICAST"],
                "operstate": "UP" if active else "DOWN",
            }]))
        if command[:5] == ["ip", "-j", "address", "show", "dev"]:
            return _completed(command, json.dumps([{"ifname": "eth-test", "addr_info": []}]))
        if command[:5] == ["ip", "-j", "route", "show", "default"]:
            return _completed(command, json.dumps(routes or []))
        if command[:6] == ["ip", "-6", "-j", "route", "show", "default"]:
            return _completed(command, "[]")
        return _completed(command)

    monkeypatch.setattr(opsec, "_run", run)
    return calls


def test_wifi_monitor_rejects_active_and_default_route_without_mutation(tmp_path, monkeypatch):
    base = _sys_net(tmp_path)
    calls, _ = _wifi_mock(monkeypatch, base, link_flags=["UP"], operstate="UP")

    with pytest.raises(RuntimeError, match="activa.*adaptador dedicado"):
        wifi.prepare_monitor("wlan9")
    assert not any(cmd[:3] == ["ip", "link", "set"] or cmd[:2] == ["iw", "dev"] and "set" in cmd for cmd in calls)

    calls, _ = _wifi_mock(monkeypatch, base, routes=[{"dst": "default", "dev": "wlan9"}])
    with pytest.raises(RuntimeError, match="ruta por defecto"):
        wifi.prepare_monitor("wlan9")
    assert not any(cmd[:3] == ["ip", "link", "set"] for cmd in calls)


def test_wifi_monitor_fails_closed_for_shared_phy_and_allows_isolated_adapter(tmp_path, monkeypatch):
    base = _sys_net(tmp_path, siblings=("wlan10",))
    calls, _ = _wifi_mock(monkeypatch, base)
    with pytest.raises(RuntimeError, match="comparte radio.*dedicado"):
        wifi.prepare_monitor("wlan9")
    assert not any(cmd[:3] == ["ip", "link", "set"] for cmd in calls)

    base = _sys_net(tmp_path / "isolated")
    calls, state = _wifi_mock(monkeypatch, base)
    result = wifi.prepare_monitor("wlan9")
    assert result["mode"] == "monitor"
    assert state["mode"] == "monitor"
    assert ["iw", "dev", "wlan9", "set", "type", "monitor"] in calls
    assert not any(cmd[0] in {"systemctl", "pkill", "airmon-ng"} for cmd in calls)


def test_wifi_monitor_fails_closed_when_system_state_cannot_be_read(tmp_path, monkeypatch):
    base = _sys_net(tmp_path)
    calls, _ = _wifi_mock(monkeypatch, base)
    original_run = wifi._run

    def missing_link(command):
        calls.append(list(command))
        if command[:3] == ["ip", "-j", "link"]:
            return _completed(command, returncode=127, stderr="ip unavailable")
        return original_run(command)

    monkeypatch.setattr(wifi, "_run", missing_link)
    with pytest.raises(RuntimeError, match="verificar el enlace"):
        wifi.prepare_monitor("wlan9")
    assert not any(cmd[:3] == ["ip", "link", "set"] for cmd in calls)


def test_monitor_stop_is_idempotent_and_never_reconnects_or_restores_global_services(tmp_path, monkeypatch):
    base = _sys_net(tmp_path)
    calls, state = _wifi_mock(
        monkeypatch, base, mode="monitor", link_flags=["BROADCAST", "MULTICAST", "UP"], operstate="UP"
    )
    result = wifi.set_monitor("wlan9", False)
    assert result["mode"] == "managed"
    assert state["mode"] == "managed"
    assert ["iw", "dev", "wlan9", "set", "type", "managed"] in calls
    assert not any(cmd[:4] == ["ip", "link", "set", "wlan9", "up"] for cmd in calls)
    assert wifi.restore_interferers() == []
    assert not any(cmd[0] in {"systemctl", "pkill", "airmon-ng"} for cmd in calls)


def test_monitor_api_start_stop_uses_only_verified_interface_operations(tmp_path, monkeypatch):
    base = _sys_net(tmp_path)
    calls, state = _wifi_mock(monkeypatch, base)
    started = c2.api_wifi_monitor_start(c2.WifiMonitorReq(interface="wlan9", prepare=True))
    assert started["mode"] == "monitor"
    assert state["mode"] == "monitor"

    stopped = c2.api_wifi_monitor_stop(c2.WifiMonitorReq(interface="wlan9", prepare=True))
    assert stopped["mode"] == "managed"
    assert state["mode"] == "managed"
    assert not any(cmd[0] in {"systemctl", "pkill", "airmon-ng"} for cmd in calls)


def test_cleanup_service_restore_never_starts_untracked_services(monkeypatch):
    monkeypatch.setattr(wifi, "_services_stopped_by_app", set())
    monkeypatch.setattr(wifi, "_run", lambda command: pytest.fail(f"unexpected command: {command}"))
    assert wifi.restore_interferers() == []


def test_full_cleanup_reports_when_opsec_restore_is_blocked(monkeypatch):
    from app.c2.core import fw, manager, state

    monkeypatch.setattr(manager.manager, "stop_all", lambda: [])
    monkeypatch.setattr(fw, "cleanup", lambda _family: 0)
    monkeypatch.setattr(opsec, "restore", lambda: (_ for _ in ()).throw(RuntimeError("adaptador dedicado requerido")))
    monkeypatch.setattr(state.state, "restore", lambda: {"restored": []})
    monkeypatch.setattr(cleanup.bus, "emit", lambda _event: None)

    actions = cleanup.full_cleanup("test")
    assert any("identidad OPSEC no restaurada" in action for action in actions)


def test_wifi_kill_endpoint_is_non_destructive_and_explains_policy(monkeypatch):
    monkeypatch.setattr(wifi, "kill_interferers", lambda: pytest.fail("must not stop services"))
    assert not c2_proxy._requires_scope("POST", "wifi/kill")
    result = c2.api_wifi_kill()
    assert result["stopped"] == []
    assert "LESSSO ya no detiene NetworkManager" in result["message"]


def test_opsec_mac_mutations_reject_active_or_default_route_interface(tmp_path, monkeypatch):
    base = _sys_net(tmp_path, iface="eth-test")
    calls = _opsec_mock(monkeypatch, base, active=True)
    with pytest.raises(RuntimeError, match="activa.*adaptador dedicado"):
        opsec.set_mac("eth-test", "02:11:22:33:44:55")
    assert not any(cmd[:3] == ["ip", "link", "set"] for cmd in calls)

    calls = _opsec_mock(monkeypatch, base, routes=[{"dst": "default", "dev": "eth-test"}])
    with pytest.raises(RuntimeError, match="ruta por defecto"):
        opsec.set_mac("eth-test", "02:11:22:33:44:55")
    assert not any(cmd[:3] == ["ip", "link", "set"] for cmd in calls)


def test_opsec_apply_preflights_before_hostname_mutation(tmp_path, monkeypatch):
    base = _sys_net(tmp_path, iface="eth-test")
    _opsec_mock(monkeypatch, base, active=True)
    changed = []
    monkeypatch.setattr(opsec, "set_hostname", lambda *args: changed.append(args))

    with pytest.raises(RuntimeError, match="adaptador dedicado"):
        opsec.apply_identity("eth-test", "TEST-HOST", "02:11:22:33:44:55")
    assert changed == []


@pytest.mark.parametrize(
    ("endpoint", "payload"),
    [
        (c2.api_opsec_mac, c2.OpsecMacReq(interface="eth-test", mac="02:11:22:33:44:55")),
        (c2.api_opsec_apply, c2.OpsecApplyReq(interface="eth-test", hostname="TEST-HOST", mac="02:11:22:33:44:55")),
        (c2.api_opsec_profile, c2.OpsecProfileReq(interface="eth-test", profile="macos")),
    ],
)
def test_opsec_mutation_routes_reject_active_interface(tmp_path, monkeypatch, endpoint, payload):
    base = _sys_net(tmp_path, iface="eth-test")
    _opsec_mock(monkeypatch, base, active=True)
    changed_hostname = []
    monkeypatch.setattr(opsec, "set_hostname", lambda *args: changed_hostname.append(args))

    with pytest.raises(HTTPException) as error:
        endpoint(payload)
    assert error.value.status_code == 400
    assert "adaptador dedicado" in error.value.detail
    assert changed_hostname == []


def test_opsec_safe_mac_change_keeps_interface_down_and_does_not_start_dhcp(tmp_path, monkeypatch):
    base = _sys_net(tmp_path, iface="eth-test")
    calls = _opsec_mock(monkeypatch, base)
    monkeypatch.setattr(opsec, "_remember_originals", lambda *_: {})
    monkeypatch.setattr(opsec, "identity", lambda: {"ok": True})

    assert opsec.set_mac("eth-test", "02:11:22:33:44:55") == {"ok": True}
    mutations = [cmd for cmd in calls if cmd[:3] == ["ip", "link", "set"]]
    assert mutations == [
        ["ip", "link", "set", "eth-test", "down"],
        ["ip", "link", "set", "eth-test", "address", "02:11:22:33:44:55"],
    ]


def test_opsec_restore_preserves_original_mac_when_interface_is_unsafe(tmp_path, monkeypatch):
    base = _sys_net(tmp_path, iface="eth-test")
    _opsec_mock(monkeypatch, base, active=True)
    original_state = {"hostname": None, "pretty": None, "macs": {"eth-test": {"original": "aa:bb:cc:dd:ee:ff"}}}
    saved = {}
    monkeypatch.setattr(opsec, "_load_state", lambda: original_state)
    monkeypatch.setattr(opsec, "_save_state", lambda value: saved.update(value))

    with pytest.raises(RuntimeError, match="adaptador dedicado"):
        opsec.restore("eth-test")
    assert saved["macs"]["eth-test"]["original"] == "aa:bb:cc:dd:ee:ff"

