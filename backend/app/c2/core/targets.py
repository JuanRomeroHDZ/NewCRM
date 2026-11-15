"""Validación de rangos para operaciones que enumeran direcciones."""
from ipaddress import ip_network

MAX_SCAN_ADDRESSES = 4096


def bounded_network(target: str, *, ipv4_only: bool = False):
    try:
        network = ip_network(target, strict=False)
    except ValueError as exc:
        raise ValueError("Ingresa una dirección IP o un rango CIDR válido.") from exc
    if ipv4_only and network.version != 4:
        raise ValueError("El descubrimiento ARP requiere un rango IPv4.")
    if network.num_addresses > MAX_SCAN_ADDRESSES:
        raise ValueError(
            f"El rango supera {MAX_SCAN_ADDRESSES} direcciones; divídelo en rangos más pequeños."
        )
    return network
