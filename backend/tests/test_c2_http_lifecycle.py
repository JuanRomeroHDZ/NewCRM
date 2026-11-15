"""Lifecycle regressions: no network traffic or firewall changes are made."""
import asyncio
import subprocess
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api.v1 import c2
from app.c2.core import fw
from app.c2.modules import httpinject


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
    monkeypatch.setattr(httpinject, '_iptables_add', lambda port: (_ for _ in ()).throw(RuntimeError('firewall unavailable')))
    monkeypatch.setattr(c2.manager, 'httpinject', None)
    with pytest.raises(HTTPException, match='firewall unavailable') as exc:
        await c2.api_httpinject_start(c2.HttpInjectReq())
    assert exc.value.status_code == 400
    assert not server.open
    assert c2.manager.httpinject is None


@pytest.mark.asyncio
async def test_http_restart_waits_for_previous_proxy_to_close(monkeypatch):
    servers = [FakeServer(), FakeServer()]
    monkeypatch.setattr(httpinject.asyncio, 'start_server', AsyncMock(side_effect=servers))
    monkeypatch.setattr(httpinject, '_iptables_add', lambda port: None)
    monkeypatch.setattr(httpinject, '_iptables_del', lambda: None)
    monkeypatch.setattr(c2.manager, 'httpinject', None)
    await c2.api_httpinject_start(c2.HttpInjectReq())
    assert c2.manager.httpinject.running
    await c2.api_httpinject_start(c2.HttpInjectReq())
    assert not servers[0].open
    assert c2.manager.httpinject.running
    await c2.api_httpinject_stop()
    assert not servers[1].open
    assert c2.manager.httpinject is None


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
    monkeypatch.setattr(c2, 'Mitm6', lambda *args: attacker)
    monkeypatch.setattr(c2.manager, 'mitm6', None)
    with pytest.raises(HTTPException, match='firewall unavailable'):
        c2.api_mitm6_start(c2.Mitm6Req(interface='eth0'))
    assert attacker.cleaned
    assert c2.manager.mitm6 is None
