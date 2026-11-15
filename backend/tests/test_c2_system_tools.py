"""Tool discovery must not depend on a caller's PATH or touch the host."""
import subprocess
from app.c2.core import fw, system_tools
from app.c2.modules import opsec, wifi


def test_network_commands_use_trusted_path_without_sbin_in_caller(monkeypatch):
    monkeypatch.setenv('PATH', '/tmp/untrusted')
    calls = []
    def fake_run(cmd, **kwargs):
        calls.append((cmd, kwargs['env']['PATH']))
        return subprocess.CompletedProcess(cmd, 0, 'type managed\n', '')
    monkeypatch.setattr(subprocess, 'run', fake_run)
    assert wifi.iface_mode('test0') == 'managed'
    wifi.set_channel('test0', 1)
    fw._run('iptables', ['-S'])
    opsec._run(['ip', 'link', 'show'])
    assert [cmd[0] for cmd, _ in calls] == ['iw', 'iw', 'iptables', 'ip']
    assert all(path == system_tools.SYSTEM_PATH and '/usr/sbin' in path for _, path in calls)
    assert all('/tmp/untrusted' not in path for _, path in calls)


def test_missing_wifi_tool_is_a_controlled_error(monkeypatch):
    def missing(*args, **kwargs):
        raise FileNotFoundError()
    monkeypatch.setattr(subprocess, 'run', missing)
    result = wifi._run(['iw', 'dev'])
    assert result.returncode == 127
    assert 'iw' in result.stderr


def test_optional_tool_lookup_uses_trusted_system_directories(monkeypatch):
    seen = []
    monkeypatch.setattr(system_tools.shutil, 'which', lambda name, path: seen.append((name, path)) or '/usr/sbin/dhclient')
    assert system_tools.find_tool('dhclient') == '/usr/sbin/dhclient'
    assert seen == [('dhclient', system_tools.SYSTEM_PATH)]
