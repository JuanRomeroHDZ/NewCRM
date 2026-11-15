from app.c2.core import envcheck


def _check(monkeypatch, *, forwarding="0", original="0", process_names=()):
    monkeypatch.setattr(envcheck.os, "geteuid", lambda: 1000)
    monkeypatch.setattr(
        envcheck, "_read",
        lambda path: forwarding if path == "/proc/sys/net/ipv4/ip_forward" else "",
    )
    monkeypatch.setattr(envcheck, "_proc_names", lambda: set(process_names))
    monkeypatch.setattr(envcheck.fw, "peek", lambda: 0)
    monkeypatch.setattr(envcheck.state, "data", {"ip_forward_v4": original} if original is not None else {})
    return envcheck.check()


def test_broker_process_name_does_not_trigger_bro_detector(monkeypatch):
    warnings = _check(monkeypatch, process_names={"dbus-broker"})

    assert not any("'bro'" in warning["msg"] for warning in warnings)


def test_exact_zeek_process_name_is_reported(monkeypatch):
    warnings = _check(monkeypatch, process_names={"zeek"})

    assert any("'zeek'" in warning["msg"] for warning in warnings)


def test_preexisting_ip_forward_is_not_reported_as_a_leftover(monkeypatch):
    warnings = _check(monkeypatch, forwarding="1", original="1")

    assert not any("ip_forward" in warning["msg"] for warning in warnings)


def test_changed_ip_forward_warns_that_cleanup_restores_original_value(monkeypatch):
    warnings = _check(monkeypatch, forwarding="1", original="0")

    warning = next(warning["msg"] for warning in warnings if "ip_forward" in warning["msg"])
    assert "antes 0, ahora 1" in warning
    assert "restaurar el valor previo" in warning
