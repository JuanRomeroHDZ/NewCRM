"""Fail-closed checks for local network interface mutations.

These checks deliberately require an already-down, unaddressed interface with
no default route. C2 must never take a production connection down to prepare a
wireless monitor adapter or change a MAC address.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Callable

_IFACE_RE = re.compile(r"^[A-Za-z0-9_.-]{1,15}$")
_DEDICATED_ADAPTER_HINT = (
    "Selecciona un adaptador dedicado, desconectado y sin ruta por defecto; "
    "LESSSO no cambia interfaces activas."
)


def _fail(reason: str) -> RuntimeError:
    return RuntimeError(f"{reason} {_DEDICATED_ADAPTER_HINT}")


def _json_command(run: Callable[[list[str]], object], command: list[str], label: str) -> list[dict]:
    result = run(command)
    if getattr(result, "returncode", 1) != 0:
        raise _fail(f"No se pudo verificar {label} de la interfaz.")
    try:
        value = json.loads(getattr(result, "stdout", "") or "")
    except (TypeError, json.JSONDecodeError) as exc:
        raise _fail(f"La respuesta de {label} no es válida.") from exc
    if not isinstance(value, list) or any(not isinstance(row, dict) for row in value):
        raise _fail(f"La respuesta de {label} no es válida.")
    return value


def _route_uses_interface(route: dict, iface: str) -> bool:
    if route.get("dev") == iface:
        return True
    nexthops = route.get("nexthops", [])
    if not isinstance(nexthops, list):
        raise _fail("No se pudo interpretar la tabla de rutas.")
    for hop in nexthops:
        if not isinstance(hop, dict):
            raise _fail("No se pudo interpretar la tabla de rutas.")
        if hop.get("dev") == iface:
            return True
    return False


def inspect_offline_interface(
    iface: str,
    run: Callable[[list[str]], object],
    sys_net_path: Path = Path("/sys/class/net"),
    *,
    require_down: bool = True,
) -> dict:
    """Verify an interface is safe for a local mode/MAC mutation.

    `require_down=False` is reserved for monitor-mode cleanup: an existing
    monitor interface may be administratively up, but must still be isolated.
    """
    if not isinstance(iface, str) or not _IFACE_RE.fullmatch(iface) or iface == "lo":
        raise ValueError("Interfaz inválida.")
    if not (sys_net_path / iface).exists():
        raise ValueError(f"No existe la interfaz {iface}.")

    links = _json_command(run, ["ip", "-j", "link", "show", "dev", iface], "el enlace")
    if len(links) != 1 or links[0].get("ifname") != iface:
        raise _fail("No se pudo identificar de forma única la interfaz.")
    link = links[0]
    flags = link.get("flags")
    operstate = link.get("operstate")
    if not isinstance(flags, list) or any(not isinstance(flag, str) for flag in flags):
        raise _fail("No se pudo verificar el estado administrativo del enlace.")
    if not isinstance(operstate, str):
        raise _fail("No se pudo verificar el estado operativo del enlace.")
    is_up = "UP" in flags or operstate.upper() not in {"DOWN", "UNKNOWN"}
    if require_down and ("UP" in flags or operstate.upper() != "DOWN"):
        raise _fail("La interfaz está activa.")

    addresses = _json_command(
        run, ["ip", "-j", "address", "show", "dev", iface], "las direcciones IP"
    )
    if len(addresses) != 1 or addresses[0].get("ifname") != iface:
        raise _fail("No se pudo identificar de forma única la interfaz y sus direcciones.")
    addr_info = addresses[0].get("addr_info")
    if not isinstance(addr_info, list):
        raise _fail("No se pudo verificar si la interfaz tiene direcciones IP.")
    # Linux may keep an automatic IPv6 link-local address on an otherwise
    # disconnected adapter. It cannot carry a routed session by itself.
    for address in addr_info:
        if not isinstance(address, dict):
            raise _fail("No se pudo interpretar las direcciones IP de la interfaz.")
        local = address.get("local", "")
        scope = address.get("scope", "")
        family = address.get("family", "")
        if family == "inet6" and scope == "link" and isinstance(local, str) and local.lower().startswith("fe80:"):
            continue
        raise _fail("La interfaz tiene una dirección IP configurada.")

    for command in (
        ["ip", "-j", "route", "show", "default"],
        ["ip", "-6", "-j", "route", "show", "default"],
    ):
        for route in _json_command(run, command, "las rutas por defecto"):
            if _route_uses_interface(route, iface):
                raise _fail("La interfaz tiene una ruta por defecto.")

    return {"interface": iface, "up": is_up, "operstate": operstate.upper()}
