"""Authorization checks shared by the CRM gateway and C2 operations.

The C2 worker is intentionally isolated from the CRM database. The authenticated
CRM gateway therefore validates the selected engagement before forwarding any
state-changing or operational request to the worker.
"""
from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from urllib.parse import urlsplit

from fastapi import HTTPException


_MAC_RE = re.compile(r"^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$", re.IGNORECASE)
_DOMAIN_RE = re.compile(
    r"^(?:\*\.)?(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ScopeTarget:
    kind: str
    value: object


def _target_from_token(token: str) -> ScopeTarget | None:
    candidate = token.strip().strip("`'\"(){}[]<>,;| ").rstrip(".!?")
    if not candidate:
        return None

    # Accept URL targets as written in engagement documents, but compare only
    # their host component. Ports and URL paths do not widen the authorized host.
    if "://" in candidate:
        try:
            candidate = urlsplit(candidate).hostname or ""
        except ValueError:
            return None
    elif candidate.startswith("[") and "]" in candidate:
        candidate = candidate[1:candidate.index("]")]

    candidate = candidate.strip().lower().rstrip(".")
    if _MAC_RE.fullmatch(candidate):
        return ScopeTarget("mac", candidate)

    try:
        if "/" in candidate:
            network = ipaddress.ip_network(candidate, strict=False)
            return ScopeTarget("network", network)
        address = ipaddress.ip_address(candidate.split("%", 1)[0])
        return ScopeTarget("network", ipaddress.ip_network(f"{address}/{address.max_prefixlen}"))
    except ValueError:
        pass

    # Handle host:port without treating a bare IPv6 address as a hostname.
    host = candidate
    if candidate.count(":") == 1 and not candidate.startswith("["):
        possible_host, possible_port = candidate.rsplit(":", 1)
        if possible_port.isdigit():
            host = possible_host
    if _DOMAIN_RE.fullmatch(host):
        if host.startswith("*."):
            return ScopeTarget("wildcard_domain", host[2:])
        return ScopeTarget("domain", host)
    return None


def parse_authorized_targets(value: str | None) -> tuple[ScopeTarget, ...]:
    """Extract strict IP/CIDR, domain, and MAC entries from a scope document."""
    if not value:
        return ()
    parsed: list[ScopeTarget] = []
    for token in re.split(r"[\s,;|]+", value):
        target = _target_from_token(token)
        if target and target not in parsed:
            parsed.append(target)
    return tuple(parsed)


def parse_authorized_ipv6_targets(value: str | None) -> tuple[ScopeTarget, ...]:
    """Parse only explicit IPv6 CIDRs used to authorize MITM6 traffic."""
    if not value or not value.strip():
        return ()
    parsed: list[ScopeTarget] = []
    for token in re.split(r"[\s,;|]+", value):
        candidate = token.strip()
        try:
            if "/" not in candidate:
                raise ValueError
            network = ipaddress.ip_network(candidate, strict=False)
            if network.version != 6:
                raise ValueError
        except ValueError as exc:
            raise ValueError("Los objetivos IPv6 deben ser CIDR IPv6 válidos.") from exc
        target = ScopeTarget("network", network)
        if target not in parsed:
            parsed.append(target)
    return tuple(parsed)


def target_is_authorized(requested: str, authorized: tuple[ScopeTarget, ...]) -> bool:
    target = _target_from_token(requested)
    if target is None:
        return False
    for allowed in authorized:
        if target.kind == "network" and allowed.kind == "network":
            try:
                if target.value.version == allowed.value.version and target.value.subnet_of(allowed.value):
                    return True
            except (AttributeError, TypeError, ValueError):
                continue
        elif target.kind == "mac" and allowed.kind == "mac" and target.value == allowed.value:
            return True
        elif target.kind == "domain":
            if allowed.kind == "domain" and target.value == allowed.value:
                return True
            if allowed.kind == "wildcard_domain" and target.value != allowed.value and target.value.endswith("." + str(allowed.value)):
                return True
        elif target.kind == "wildcard_domain" and allowed.kind == "wildcard_domain" and target.value == allowed.value:
            return True
    return False


_TARGET_FIELDS: dict[str, tuple[str, ...]] = {
    "discovery": ("cidr",),
    "portscan": ("ip",),
    "fingerprint": ("ip",),
    "exploits/check": ("ip",),
    "camera/discover": ("target",),
    "camera/audit": ("target",),
    "topology": ("cidr",),
    "arp/start": ("target_ip", "gateway_ip"),
    "httpinject/start": ("target_ip",),
    "dns/start": ("spoof_all_to",),
    "wifi/deauth/start": ("bssid", "client"),
    "wifi/pmkid/start": ("bssid",),
    "wifi/handshake/start": ("bssid",),
    "poison/start": ("spoof_ip",),
}

_INTERFACE_SCOPE_ROUTES = {
    "sniff/start",
    "dns/start",
    "creds/start",
    "wifi/monitor/start",
    "wifi/scan/start",
    "poison/start",
    "wpad/start",
    "mitm6/start",
    "opsec/mac",
    "opsec/apply",
    "opsec/profile",
}

_INTERFACE_VALIDATION_ROUTES = {"wifi/handshake/start"}


def request_targets(path: str, payload: object) -> tuple[str, ...]:
    """Return explicit targets for operations whose request names a target."""
    if not isinstance(payload, dict):
        return ()
    normalized = path.strip("/")
    fields = _TARGET_FIELDS.get(normalized, ())
    targets = [str(payload[field]).strip() for field in fields if payload.get(field)]
    if normalized == "exploits/check":
        services = payload.get("services")
        if isinstance(services, list):
            targets.extend(
                str(service["ip"]).strip()
                for service in services
                if isinstance(service, dict) and service.get("ip")
            )
    # The all-stations broadcast address identifies a frame destination, not an
    # independently authorized device. The AP BSSID remains explicitly gated.
    targets = [target for target in targets if target.lower() != "ff:ff:ff:ff:ff:ff"]

    # DNS mappings identify both the queried name and its answer. MITM6 IPv6
    # addresses are checked against the engagement's dedicated IPv6 CIDR field.
    if normalized in {"dns/start", "mitm6/start"}:
        mapping = payload.get("mapping")
        if isinstance(mapping, dict):
            targets.extend(str(item).strip() for pair in mapping.items() for item in pair if item)
    return tuple(target for target in targets if target)


def interface_scope_required(path: str) -> bool:
    return path.strip("/") in _INTERFACE_SCOPE_ROUTES


def interface_validation_required(path: str) -> bool:
    normalized = path.strip("/")
    return normalized in _INTERFACE_SCOPE_ROUTES or normalized in _INTERFACE_VALIDATION_ROUTES


def validate_interface_cidr(cidr: str | None, authorized_targets: str | None) -> None:
    if not cidr:
        raise HTTPException(
            status_code=403,
            detail="No se pudo asociar la interfaz con una red CIDR verificable. Restaura el modo normal y vuelve a seleccionar el ámbito.",
        )
    authorized = parse_authorized_targets(authorized_targets)
    if not target_is_authorized(cidr, authorized):
        raise HTTPException(
            status_code=403,
            detail=f"La red de la interfaz «{cidr}» no está incluida por completo en el ámbito autorizado seleccionado.",
        )


def validate_scope_targets(path: str, payload: object, authorized_targets: str | None,
                           authorized_ipv6_targets: str | None = None) -> None:
    explicit_targets = request_targets(path, payload)
    if not explicit_targets:
        return
    authorized = parse_authorized_targets(authorized_targets) + parse_authorized_ipv6_targets(
        authorized_ipv6_targets
    )
    if not authorized:
        raise HTTPException(
            status_code=403,
            detail="El ámbito no contiene objetivos IP, rangos, dominios o MAC que se puedan validar.",
        )
    for target in explicit_targets:
        if not target_is_authorized(target, authorized):
            raise HTTPException(
                status_code=403,
                detail=f"El objetivo «{target}» no está incluido en el ámbito autorizado seleccionado.",
            )


def validate_interface_ipv6_cidrs(cidrs: object, authorized_ipv6_targets: str | None) -> None:
    try:
        authorized = parse_authorized_ipv6_targets(authorized_ipv6_targets)
    except ValueError as exc:
        raise HTTPException(403, "El ámbito IPv6 contiene CIDR no válidos; MITM6 permanece bloqueado.") from exc
    if not isinstance(cidrs, list) or not cidrs:
        raise HTTPException(403, "La interfaz no publica una red IPv6 verificable; MITM6 permanece bloqueado.")
    for cidr in cidrs:
        if not isinstance(cidr, str):
            continue
        try:
            network = ipaddress.ip_network(cidr, strict=False)
        except ValueError:
            continue
        if network.version == 6 and any(network.subnet_of(allowed.value) for allowed in authorized):
            return
    raise HTTPException(403, "La red IPv6 de la interfaz no está incluida por completo en el ámbito autorizado.")
