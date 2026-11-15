"""ARP request validation and lifecycle failures without network access."""
import threading

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1 import c2
from app.c2.modules import arp


def test_arp_request_rejects_invalid_ipv4_and_empty_interface():
    with pytest.raises(ValidationError):
        c2.ArpReq(interface="eth0", target_ip="not-an-ip", gateway_ip="10.0.0.1")
    with pytest.raises(ValidationError):
        c2.ArpReq(interface=" ", target_ip="10.0.0.2", gateway_ip="10.0.0.1")


def test_arp_failed_restart_clears_stopped_instance(monkeypatch):
    class OldModule:
        stopped = False

        def stop(self):
            self.stopped = True

    class FailedModule:
        def __init__(self, *args):
            pass

        def start(self):
            raise RuntimeError("No se pudo resolver la MAC")

    old = OldModule()
    # Keep this lifecycle test independent of the runner's raw-socket privileges.
    monkeypatch.setattr(c2.arp_module, "_SCAPY_AVAILABLE", True)
    monkeypatch.setattr(c2.manager, "arp", old)
    monkeypatch.setattr(c2, "ArpSpoofer", FailedModule)
    with pytest.raises(HTTPException) as exc:
        c2.api_arp_start(c2.ArpReq(interface="eth0", target_ip="10.0.0.2", gateway_ip="10.0.0.1"))
    assert exc.value.status_code == 503
    assert "MAC" in exc.value.detail
    assert old.stopped and c2.manager.arp is None


def test_arp_reports_unavailable_scapy(monkeypatch):
    monkeypatch.setattr(arp, "_SCAPY_AVAILABLE", False)
    with pytest.raises(RuntimeError, match="Scapy"):
        arp.ArpSpoofer("10.0.0.2", "10.0.0.1", "eth0").start()


def test_arp_thread_failure_is_reported_and_not_running(monkeypatch):
    messages = []
    monkeypatch.setattr(arp.bus, "emit", messages.append)
    module = arp.ArpSpoofer("10.0.0.2", "10.0.0.1", "eth0")
    module._started = True
    monkeypatch.setattr(module, "_poison", lambda: (_ for _ in ()).throw(OSError("interface down")))
    module._thread = threading.Thread(target=module._run)
    module._thread.start()
    module._thread.join()
    assert not module.running
    assert any("interface down" in message["msg"] for message in messages)
