"""The preflight inventory must be read-only and use trusted tool discovery."""
from app.c2.core import envcheck


def test_preflight_reports_missing_tools_and_unprivileged_service(monkeypatch):
    seen = []
    monkeypatch.setattr(envcheck.os, 'geteuid', lambda: 1000)
    monkeypatch.setattr(envcheck, 'find_tool', lambda name: seen.append(name) or ('/usr/sbin/iw' if name == 'iw' else None))
    result = envcheck.preflight()
    assert result['root'] is False
    assert result['tools']['iw'] is True
    assert result['tools']['iptables'] is False
    assert set(seen) == {'ip', 'iw', 'iptables', 'ip6tables', 'hcxpcapngtool', 'searchsploit'}
