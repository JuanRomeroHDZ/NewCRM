from datetime import datetime, timezone
import re

import dns.exception
import dns.resolver


def _txt_records(name: str, resolver: dns.resolver.Resolver) -> list[str] | None:
    """Return TXT records, [] when absent and None when the resolver could not decide."""
    try:
        answer = resolver.resolve(name, "TXT", lifetime=1.5)
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
        return []
    except (dns.resolver.NoNameservers, dns.exception.Timeout, dns.resolver.LifetimeTimeout, OSError):
        return None
    except dns.exception.DNSException:
        return None

    records: list[str] = []
    for item in answer:
        chunks = getattr(item, "strings", ())
        if chunks:
            value = b"".join(chunks).decode("utf-8", "replace")
        else:
            value = str(item).strip('"')
        records.append(value[:500])
    return records


def _indeterminate(summary: str) -> dict:
    return {"status": "no_determinado", "summary": summary, "records": []}


def check_email_domain_posture(domain: str, selector: str | None = None) -> dict:
    try:
        resolver = dns.resolver.Resolver(configure=True)
    except (dns.exception.DNSException, OSError):
        unavailable = _indeterminate("No se pudo inicializar el resolvedor DNS del servidor.")
        return {
            "domain": domain,
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "spf": unavailable,
            "dmarc": unavailable,
            "dkim": unavailable,
        }
    resolver.timeout = 0.75
    resolver.lifetime = 1.5

    root_records = _txt_records(domain, resolver)
    if root_records is None:
        spf = _indeterminate("El resolvedor DNS no respondió a tiempo.")
    else:
        spf_records = [record for record in root_records if re.match(r"^v=spf1(?:\s|$)", record, re.IGNORECASE)]
        if not spf_records:
            spf = {"status": "faltante", "summary": "No se encontró un registro SPF.", "records": []}
        elif len(spf_records) > 1:
            spf = {"status": "múltiple", "summary": "Hay más de un SPF; conviene consolidarlos en un solo registro.", "records": spf_records[:5]}
        else:
            spf = {"status": "publicado", "summary": "Se encontró un único registro SPF.", "records": spf_records[:5]}

    dmarc_records_all = _txt_records(f"_dmarc.{domain}", resolver)
    if dmarc_records_all is None:
        dmarc = _indeterminate("El resolvedor DNS no respondió a tiempo.")
    else:
        dmarc_records = [record for record in dmarc_records_all if re.match(r"^v=dmarc1(?:\s*;|$)", record, re.IGNORECASE)]
        if not dmarc_records:
            dmarc = {"status": "faltante", "summary": "No se encontró una política DMARC.", "records": []}
        elif len(dmarc_records) > 1:
            dmarc = {"status": "múltiple", "summary": "Hay más de un registro DMARC publicado.", "records": dmarc_records[:5]}
        else:
            policy = re.search(r"(?:^|;)\s*p\s*=\s*(none|quarantine|reject)(?:;|$)", dmarc_records[0], re.IGNORECASE)
            policy_value = policy.group(1).lower() if policy else ""
            if policy_value in {"", "none"}:
                dmarc = {"status": "débil", "summary": "DMARC está en modo de observación (p=none o política p sin declarar).", "records": dmarc_records[:5]}
            elif policy_value in {"quarantine", "reject"}:
                dmarc = {"status": "publicado", "summary": f"DMARC aplica p={policy_value}.", "records": dmarc_records[:5]}
            else:
                dmarc = {"status": "débil", "summary": "DMARC está publicado, pero no declara una política p reconocida.", "records": dmarc_records[:5]}

    if not selector:
        dkim = {"status": "no_revisado", "summary": "Indica el selector DKIM para revisar su clave pública.", "records": []}
    else:
        dkim_records_all = _txt_records(f"{selector}._domainkey.{domain}", resolver)
        if dkim_records_all is None:
            dkim = _indeterminate("El resolvedor DNS no respondió a tiempo.")
        else:
            dkim_records = [record for record in dkim_records_all if re.match(r"^v=dkim1(?:\s*;|$)", record, re.IGNORECASE)]
            dkim_keys = [re.search(r"(?:^|;)\s*p\s*=\s*([^;]*)", record, re.IGNORECASE) for record in dkim_records]
            if len(dkim_records) > 1:
                dkim = {"status": "múltiple", "summary": f"Hay más de un registro DKIM para el selector {selector}.", "records": dkim_records[:5]}
            elif dkim_records and dkim_keys[0] and not dkim_keys[0].group(1).strip():
                dkim = {"status": "débil", "summary": f"El selector {selector} está publicado, pero la clave vacía la revoca.", "records": dkim_records[:5]}
            elif dkim_records and dkim_keys[0]:
                dkim = {"status": "publicado", "summary": f"Se encontró una clave DKIM para el selector {selector}.", "records": dkim_records[:5]}
            elif dkim_records:
                dkim = {"status": "débil", "summary": f"El registro de {selector} existe, pero no incluye una clave p válida.", "records": dkim_records[:5]}
            else:
                dkim = {"status": "faltante", "summary": f"No se encontró DKIM con el selector {selector}; confirma que sea el selector correcto.", "records": []}

    return {
        "domain": domain,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "spf": spf,
        "dmarc": dmarc,
        "dkim": dkim,
    }
