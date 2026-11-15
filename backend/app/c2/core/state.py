"""Snapshot del sistema para el boton de panico y la limpieza automatica.

Guarda hostname, ip_forward (v4/v6) y MACs originales ANTES de que LESSSO
toque nada, y los restaura bajo demanda. Se persiste en JSON para poder
recuperarse incluso si el proceso murio sin limpiar.
"""
import json
import subprocess
from pathlib import Path

from app.config import settings
from app.c2.core import fw
from app.c2.core.system_tools import tool_environment

STATE_FILE = Path(settings.C2_STATE_DIR) / "state.json"
LEGACY_STATE_FILE = Path("/var/lib/netpwn/state.json")


def _read_saved_state() -> dict | None:
    """Load current state or the previous path so cleanup survives upgrades."""
    for path in (STATE_FILE, LEGACY_STATE_FILE):
        try:
            if path.exists():
                saved = json.loads(path.read_text())
                if path == LEGACY_STATE_FILE:
                    try:
                        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
                        STATE_FILE.write_text(json.dumps(saved, indent=2))
                    except Exception:
                        pass
                return saved
        except Exception:
            continue
    return None


def load() -> dict | None:
    """Lee el JSON persistido y devuelve el dict (None si falta o falla)."""
    return _read_saved_state()


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, env=tool_environment())


def _read(path: str) -> str | None:
    try:
        return Path(path).read_text().strip()
    except Exception:
        return None


class State:
    def __init__(self) -> None:
        self.data: dict = {}
        self._taken = False

    # ------------------------------------------------------------------ snapshot
    def snapshot_system(self) -> None:
        """Captura (una sola vez) valores globales antes de modificar nada."""
        if self._taken:
            return
        self.data["hostname"] = _read("/proc/sys/kernel/hostname")
        self.data["ip_forward_v4"] = _read("/proc/sys/net/ipv4/ip_forward")
        self.data["ip_forward_v6"] = _read("/proc/sys/net/ipv6/conf/all/forwarding")
        self._taken = True
        self.persist()

    def snapshot_mac(self, iface: str) -> None:
        """Guarda la MAC de fabrica de una interfaz antes de spoofearla."""
        mac = _read(f"/sys/class/net/{iface}/address")
        if mac and iface not in self.data.get("macs", {}):
            self.data.setdefault("macs", {})[iface] = mac
            self.persist()

    # ------------------------------------------------------------------ restore
    def restore(self) -> dict:
        actions: list[str] = []
        for iface, mac in self.data.get("macs", {}).items():
            for cmd in (["ip", "link", "set", iface, "down"],
                        ["ip", "link", "set", iface, "address", mac],
                        ["ip", "link", "set", iface, "up"]):
                _run(cmd)
            actions.append(f"MAC {iface} -> {mac}")
        for key, path, label in (
            ("ip_forward_v4", "/proc/sys/net/ipv4/ip_forward", "ip_forward"),
            ("ip_forward_v6", "/proc/sys/net/ipv6/conf/all/forwarding", "ipv6 forwarding"),
        ):
            val = self.data.get(key)
            if val is not None:
                try:
                    Path(path).write_text(val + "\n")
                    actions.append(f"{label} -> {val}")
                except Exception:
                    pass
        host = self.data.get("hostname")
        if host:
            if _run(["hostnamectl", "set-hostname", host]).returncode != 0:
                _run(["hostname", host])
            actions.append(f"hostname -> {host}")
        removed = fw.cleanup_all()
        actions.append(f"{removed} reglas de firewall eliminadas")
        return {"restored": actions}

    # ------------------------------------------------------------------ persist
    def persist(self) -> None:
        try:
            STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
            STATE_FILE.write_text(json.dumps(self.data, indent=2))
        except Exception:
            pass

    @classmethod
    def load(cls) -> "State":
        st = cls()
        saved = _read_saved_state()
        if saved is not None:
            st.data = saved
            st._taken = True
        return st


state = State()
