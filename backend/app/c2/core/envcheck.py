"""Deteccion de entorno: avisos tempranos antes de hacer nada ruidoso."""
import os
import subprocess

from app.c2.core import fw
from app.c2.core.system_tools import find_tool, tool_environment
from app.c2.core.state import state

# Procesos que suelen indicar monitorizacion/deteccion en la red o el host.
_DETECTORS = ("arpwatch", "zeek", "suricata", "snort", "ossec", "p0f", "bro")


def preflight() -> dict:
    """Read-only inventory; presence alone does not guarantee hardware support."""
    return {
        "root": os.geteuid() == 0 if hasattr(os, "geteuid") else False,
        "tools": {name: bool(find_tool(name)) for name in (
            "ip", "iw", "iptables", "ip6tables", "hcxpcapngtool", "searchsploit"
        )},
    }


def _proc_names() -> set[str]:
    try:
        out = subprocess.run(["ps", "-eo", "comm"], capture_output=True, text=True, env=tool_environment())
        return {
            name.strip().casefold()
            for name in (out.stdout or "").splitlines()
            if name.strip()
        }
    except Exception:
        return set()


def _read(path: str) -> str:
    try:
        with open(path) as f:
            return f.read().strip()
    except Exception:
        return ""


def check() -> list[dict]:
    warns: list[dict] = []

    root = os.geteuid() == 0 if hasattr(os, "geteuid") else True
    if root:
        warns.append({"level": "ok", "msg": "Ejecutando como root"})
    else:
        warns.append({"level": "error",
                      "msg": "Sin root: los sockets raw e iptables no funcionaran"})

    host = _read("/proc/sys/kernel/hostname").lower()
    if host in ("kali", "kali-linux", "parrot", "attacker"):
        warns.append({"level": "warn",
                      "msg": f"Hostname '{host}' te delata en DHCP/ARP (usa el panel OPSEC)"})

    fwd = _read("/proc/sys/net/ipv4/ip_forward")
    original_fwd = state.data.get("ip_forward_v4")
    if fwd in ("0", "1") and original_fwd in ("0", "1") and fwd != original_fwd:
        warns.append({"level": "warn",
                      "msg": f"ip_forward cambió desde que inició C2 (antes {original_fwd}, ahora {fwd}); la limpieza intentará restaurar el valor previo."})
    elif fwd in ("0", "1") and original_fwd not in ("0", "1") and fwd == "1":
        warns.append({"level": "warn",
                      "msg": "ip_forward está activo; no se pudo confirmar el valor anterior al inicio de C2."})

    leftovers = fw.peek()
    if leftovers:
        warns.append({"level": "warn",
                      "msg": f"{leftovers} reglas iptables de LESSSO sin limpiar (resto de un crash)"})

    procs = _proc_names()
    for det in _DETECTORS:
        if det.casefold() in procs:
            warns.append({"level": "warn",
                          "msg": f"'{det}' esta corriendo: puede detectar spoofing/escaneos"})

    return warns
