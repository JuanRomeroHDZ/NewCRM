#!/usr/bin/env python3
"""Select and validate a private IPv4 address for LAN-only LESSSO access."""

from __future__ import annotations

import argparse
import ipaddress
import json
import socket
import subprocess
from collections.abc import Sequence


PRIVATE_NETWORKS = tuple(
    ipaddress.ip_network(value)
    for value in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
)
VIRTUAL_INTERFACE_PREFIXES = (
    "docker",
    "br-",
    "veth",
    "virbr",
    "podman",
    "cni",
    "flannel",
    "zt",
    "tailscale",
)


def _ip_json(arguments: Sequence[str]) -> list[dict]:
    try:
        result = subprocess.run(
            ["ip", *arguments], check=True, capture_output=True, text=True, timeout=2
        )
        payload = json.loads(result.stdout)
        return payload if isinstance(payload, list) else []
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
        return []


def list_private_ipv4() -> list[tuple[str, str]]:
    """Return RFC1918 interface addresses, preferring the default-route NIC."""
    interfaces = _ip_json(["-j", "-4", "addr", "show", "scope", "global"])
    routes = _ip_json(["-j", "-4", "route", "show", "default"])
    default_interface = next(
        (route.get("dev") for route in routes if isinstance(route.get("dev"), str)),
        None,
    )
    candidates: list[tuple[str, str]] = []
    for interface in interfaces:
        name = interface.get("ifname")
        if not isinstance(name, str) or name.startswith(VIRTUAL_INTERFACE_PREFIXES):
            continue
        for info in interface.get("addr_info", []):
            raw_address = info.get("local")
            if not isinstance(raw_address, str):
                continue
            try:
                address = ipaddress.IPv4Address(raw_address)
            except ipaddress.AddressValueError:
                continue
            if any(address in network for network in PRIVATE_NETWORKS):
                candidates.append((name, str(address)))

    candidates.sort(key=lambda item: item[0] != default_interface)
    return candidates


def validate_bind_address(value: str) -> None:
    address = ipaddress.IPv4Address(value)
    if address != ipaddress.IPv4Address("127.0.0.1") and not any(
        address in network for network in PRIVATE_NETWORKS
    ):
        raise ValueError(
            "elige 127.0.0.1 o una dirección IPv4 privada (10.x, 172.16-31.x o 192.168.x)"
        )
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((str(address), 0))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suggest", action="store_true", help="print the preferred private IPv4")
    parser.add_argument("--list", action="store_true", help="list private interface IPv4s")
    parser.add_argument("--validate", metavar="IP", help="validate a local loopback/private IPv4")
    args = parser.parse_args()

    if args.validate:
        try:
            validate_bind_address(args.validate)
        except (ipaddress.AddressValueError, ValueError, OSError) as exc:
            print(f"Dirección de acceso no válida o no asignada a este equipo: {exc}")
            return 1
        return 0

    addresses = list_private_ipv4()
    if args.list:
        for interface, address in addresses:
            print(f"{interface}\t{address}")
        return 0

    if args.suggest and addresses:
        print(addresses[0][1])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
