"""Lifecycle regressions: no network traffic or firewall changes are made."""
import asyncio
import subprocess
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api.v1 import c2
from app.c2.core import fw
from app.c2.modules import httpinject
from app.c2.modules import wpad


class FakeServer:
    def __init__(self):
        self.open = True

    async def serve_forever(self):
        await asyncio.Event().wait()

    def is_serving(self):
        return self.open

    def close(self):
        self.open = False

    async def wait_closed(self):
        return None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        self.close()


def test_failed_firewall_rule_is_not_reported_as_success(monkeypatch):
    monkeypatch.setattr(fw, '_run', lambda *args: subprocess.CompletedProcess([], 1, '', 'permission denied'))
    with pytest.raises(RuntimeError, match='permission denied'):
        fw.add_redirect(8080)


@pytest.mark.asyncio
async def test_http_start_failure_closes_server_and_returns_error(monkeypatch):
    server = FakeServer()
    monkeypatch.setattr(httpinject.asyncio, 'start_server', AsyncMock(return_value=server))
    monkeypatch.setattr(httpinject.HttpInjector, '_local_address_for_target', lambda self: '192.0.2.10')
    monkeypatch.setattr(httpinject, '_iptables_add', lambda port, target_ip: (_ for _ in ()).throw(RuntimeError('firewall unavailable')))
    monkeypatch.setattr(c2.manager, 'httpinject', None)
    with pytest.raises(HTTPException, match='firewall unavailable') as exc:
        await c2.api_httpinject_start(c2.HttpInjectReq(target_ip='10.0.0.2'))
    assert exc.value.status_code == 400
    assert not server.open
    assert c2.manager.httpinject is None


@pytest.mark.asyncio
async def test_http_restart_waits_for_previous_proxy_to_close(monkeypatch):
    servers = [FakeServer(), FakeServer()]
    monkeypatch.setattr(httpinject.asyncio, 'start_server', AsyncMock(side_effect=servers))
    monkeypatch.setattr(httpinject.HttpInjector, '_local_address_for_target', lambda self: '192.0.2.10')
    monkeypatch.setattr(httpinject, '_iptables_add', lambda port, target_ip: None)
    monkeypatch.setattr(httpinject, '_iptables_del', lambda: None)
    monkeypatch.setattr(c2.manager, 'httpinject', None)
    await c2.api_httpinject_start(c2.HttpInjectReq(target_ip='10.0.0.2'))
    assert c2.manager.httpinject.running
    await c2.api_httpinject_start(c2.HttpInjectReq(target_ip='10.0.0.2'))
    assert not servers[0].open
    assert c2.manager.httpinject.running
    await c2.api_httpinject_stop()
    assert not servers[1].open
    assert c2.manager.httpinject is None


@pytest.mark.asyncio
async def test_httpinject_listener_binds_to_target_route_address_not_every_interface(monkeypatch):
    server = FakeServer()
    start_server = AsyncMock(return_value=server)
    monkeypatch.setattr(httpinject.asyncio, 'start_server', start_server)
    monkeypatch.setattr(httpinject.HttpInjector, '_local_address_for_target', lambda self: '192.0.2.10')
    monkeypatch.setattr(httpinject, '_iptables_add', lambda port, target_ip: None)
    monkeypatch.setattr(httpinject, '_iptables_del', lambda: None)
    injector = httpinject.HttpInjector(target_ip='192.0.2.17')
    await injector.start()
    assert start_server.await_args.args[1] == '192.0.2.10'
    injector.stop()
    await injector.wait_stopped()


def test_wpad_services_bind_only_to_selected_interface(monkeypatch):
    addresses = []

    class FakeTCPServer:
        def __init__(self, address, handler):
            addresses.append(address)
        def serve_forever(self):
            pass
        def shutdown(self):
            pass
        def server_close(self):
            pass

    class FakeThread:
        def __init__(self, *args, **kwargs):
            pass
        def start(self):
            pass

    monkeypatch.setattr(wpad, '_PacServer', FakeTCPServer)
    monkeypatch.setattr(wpad, '_ProxyServer', FakeTCPServer)
    monkeypatch.setattr(wpad.threading, 'Thread', FakeThread)
    spoofer = wpad.WpadSpoofer('192.168.100.17')
    spoofer.start()
    assert addresses == [('192.168.100.17', 80), ('192.168.100.17', 3128)]
    spoofer.stop()


def test_demo_cleanup_never_inspects_or_changes_host_firewall(monkeypatch):
    monkeypatch.setattr(c2.demo, 'is_demo', lambda: True)
    monkeypatch.setattr(fw, 'peek', lambda: pytest.fail('demo touched firewall'))
    monkeypatch.setattr(fw, 'cleanup_all', lambda: pytest.fail('demo touched firewall'))
    assert c2.api_cleanup_status() == {'tagged_rules': 0}
    assert c2.api_cleanup_run() == {'removed': 0}


def test_demo_captures_do_not_expose_real_files(monkeypatch):
    monkeypatch.setattr(c2.demo, 'is_demo', lambda: True)
    monkeypatch.setattr(c2.wifi, 'list_captures', lambda: pytest.fail('demo read captures'))
    assert c2.api_wifi_captures() == {'captures': []}


def test_mitm6_failed_start_cleans_up(monkeypatch):
    class FailedMitm:
        cleaned = False
        def __init__(self, *args):
            pass
        def start(self):
            raise RuntimeError('firewall unavailable')
        def stop(self):
            self.cleaned = True

    attacker = FailedMitm()
    monkeypatch.setattr(c2.mitm6_module, "_SCAPY_AVAILABLE", True)
    monkeypatch.setattr(c2, 'Mitm6', lambda *args: attacker)
    monkeypatch.setattr(c2.manager, 'mitm6', None)
    with pytest.raises(HTTPException, match='firewall unavailable'):
        c2.api_mitm6_start(c2.Mitm6Req(interface='eth0'))
    assert attacker.cleaned
    assert c2.manager.mitm6 is None
