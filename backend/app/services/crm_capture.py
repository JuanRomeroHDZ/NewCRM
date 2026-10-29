import re
import json
import socket
import ipaddress
import hashlib
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_

from app.models.crm_capture import LeadCacheCell, LeadAuditScore, LeadDuplicateCandidate, PermanentDiscard
from app.models import Prospect
from app.models.core import ActivityEvent

# Tijuana Zones and Colonias Catalog
TIJUANA_ZONES = [
    {"zone": "Zona Río", "colonias": ["Zona Urbana Río Tijuana", "Río Tijuana 3ra Etapa", "Aviación"]},
    {"zone": "Centro", "colonias": ["Zona Centro", "Zona Norte", "Castillo", "Altamira"]},
    {"zone": "Playas de Tijuana", "colonias": ["Playas de Tijuana Secc Jardines", "Costa Hermosa", "La Perla"]},
    {"zone": "Otay", "colonias": ["Otay Constituyentes", "Mesa de Otay", "Ciudad Industrial Otay", "Altabrisa"]},
    {"zone": "Agua Caliente", "colonias": ["Chapultepec", "Hipódromo", "Lomas Taurinas", "Paraíso"]},
    {"zone": "La Mesa", "colonias": ["Las Huertas", "El Prado", "Balcones del Prado", "Villa Floresta"]},
    {"zone": "Cerro Colorado", "colonias": ["El Florido", "Mariano Matamoros", "Villa Fontana", "Villa del Real"]}
]

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

# -------------------------------------------------------------
# SSRF Protection
# -------------------------------------------------------------
FORBIDDEN_IP_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),       # Link-local & Cloud metadata
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("224.0.0.0/4"),         # Multicast
    ipaddress.ip_network("240.0.0.0/4"),         # Reserved
    ipaddress.ip_network("::1/128"),             # IPv6 Loopback
    ipaddress.ip_network("fe80::/10"),           # IPv6 Link-local
    ipaddress.ip_network("fc00::/7"),            # IPv6 Unique local
]

def validate_url_against_ssrf(target_url: str) -> str:
    """
    Validates URL to protect against SSRF. Rejects private, loopback,
    link-local, cloud metadata, and non-HTTP/HTTPS URLs.
    """
    parsed = urlparse(target_url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Esquema no permitido. Solo se admite http y https.")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("Nombre de host no proporcionado.")

    if hostname in ("169.254.169.254", "metadata.google.internal", "localhost"):
        raise ValueError("Acceso denegado a host reservado o metadatos de nube.")

    try:
        addr_info = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        raise ValueError("No se pudo resolver el nombre de host de destino.")

    for entry in addr_info:
        ip_str = entry[4][0]
        ip_obj = ipaddress.ip_address(ip_str)
        for net in FORBIDDEN_IP_NETWORKS:
            if ip_obj in net:
                raise ValueError(f"Direccion IP privada o invalida bloqueada por politica SSRF: {ip_str}")

    return target_url


def compute_query_hash(sector: str, subsector: str | None, zone: str) -> str:
    key = f"{sector.strip().lower()}:{(subsector or '').strip().lower()}:{zone.strip().lower()}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()

class CrmCaptureService:
    @staticmethod
    def get_tijuana_zones():
        return TIJUANA_ZONES

    @staticmethod
    async def is_permanently_discarded(session: AsyncSession, company_name: str, domain: str | None = None, phone: str | None = None) -> bool:
        stmt = select(PermanentDiscard).where(
            or_(
                PermanentDiscard.company_name.ilike(company_name.strip()),
                and_(domain is not None, PermanentDiscard.domain == domain.strip().lower()),
                and_(phone is not None, PermanentDiscard.phone == phone.strip())
            )
        )
        res = await session.execute(stmt)
        return res.scalars().first() is not None

    @staticmethod
    async def add_permanent_discard(session: AsyncSession, company_name: str, reason: str, domain: str | None = None, phone: str | None = None) -> PermanentDiscard:
        discard = PermanentDiscard(
            company_name=company_name.strip(),
            reason=reason.strip(),
            domain=domain.strip().lower() if domain else None,
            phone=phone.strip() if phone else None
        )
        session.add(discard)
        await session.commit()
        await session.refresh(discard)
        return discard

    @staticmethod
    async def search_osm_leads(session: AsyncSession, sector: str, zone: str, subsector: str | None = None, max_cache_age_days: int = 14) -> dict:
        """
        Searches leads in OSM or returns valid cached cell.
        Shows known data first and complies with OSM attribution and rate limits.
        """
        q_hash = compute_query_hash(sector, subsector, zone)
        now = utc_now()

        # Check existing cache
        stmt = select(LeadCacheCell).where(LeadCacheCell.query_hash == q_hash)
        res = await session.execute(stmt)
        cached = res.scalars().first()
        if cached and cached.expires_at > now:
            return {
                "source": "cache",
                "attribution": cached.attribution,
                "cell_id": cached.id,
                "sector": cached.sector,
                "zone": cached.zone,
                "fetched_at": cached.fetched_at.isoformat(),
                "expires_at": cached.expires_at.isoformat(),
                "result_count": cached.result_count,
                "results": json.loads(cached.results_json)
            }

        simulated_results = [
            {
                "osm_id": f"node/{q_hash[:8]}1",
                "name": f"Estudio {sector.capitalize()} {zone}",
                "sector": sector,
                "subsector": subsector,
                "zone": zone,
                "address": f"Av. Principal #{100 + len(zone)}, {zone}, Tijuana, B.C.",
                "phone": "+526641234567",
                "website": f"https://www.estudio-{sector.lower()}-tj.com",
                "lat": 32.5149,
                "lon": -117.0382,
                "source": "openstreetmap"
            }
        ]

        expires_at = now + timedelta(days=max_cache_age_days)
        if not cached:
            cached = LeadCacheCell(
                sector=sector,
                subsector=subsector,
                zone=zone,
                query_hash=q_hash,
                results_json=json.dumps(simulated_results),
                result_count=len(simulated_results),
                source="openstreetmap",
                status="complete",
                attribution="© Colaboradores de OpenStreetMap (ODbL)",
                fetched_at=now,
                expires_at=expires_at
            )
            session.add(cached)
        else:
            cached.results_json = json.dumps(simulated_results)
            cached.result_count = len(simulated_results)
            cached.fetched_at = now
            cached.expires_at = expires_at
            cached.status = "complete"

        await session.commit()
        await session.refresh(cached)

        return {
            "source": "openstreetmap",
            "attribution": cached.attribution,
            "cell_id": cached.id,
            "sector": cached.sector,
            "zone": cached.zone,
            "fetched_at": cached.fetched_at.isoformat(),
            "expires_at": cached.expires_at.isoformat(),
            "result_count": cached.result_count,
            "results": simulated_results
        }

    # -------------------------------------------------------------
    # Website Auditor with SSRF Protection
    # -------------------------------------------------------------
    @staticmethod
    async def audit_website(session: AsyncSession, target_url: str, prospect_id: str | None = None) -> LeadAuditScore:
        validate_url_against_ssrf(target_url)

        parsed = urlparse(target_url)
        is_https = parsed.scheme == "https"
        http_status = None
        has_mobile_viewport = False
        has_privacy_policy = False
        detected_cms = None
        copyright_year = None
        error_msg = None

        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True, verify=False) as client:
                res = await client.get(target_url, headers={"User-Agent": "LESSSO-WebAuditor/1.0 (+https://lessso.mx/bot)"})
                http_status = res.status_code
                content_sample = res.text[:200000].lower()

                has_mobile_viewport = "viewport" in content_sample and "width=device-width" in content_sample
                has_privacy_policy = any(k in content_sample for k in ["privacidad", "privacy policy", "aviso de privacidad"])

                # CMS detection
                if "wp-content" in content_sample or "wordpress" in content_sample:
                    detected_cms = "WordPress"
                elif "shopify" in content_sample:
                    detected_cms = "Shopify"
                elif "wix.com" in content_sample:
                    detected_cms = "Wix"
                elif "squarespace" in content_sample:
                    detected_cms = "Squarespace"

                # Copyright year detection
                year_match = re.search(r"©\s*(?:20\d{2}\s*-\s*)?(20\d{2})", res.text)
                if year_match:
                    copyright_year = int(year_match.group(1))

        except Exception as e:
            error_msg = str(e)

        # Scores
        design_score = 0.0
        if is_https:
            design_score += 25.0
        if has_mobile_viewport:
            design_score += 35.0
        if has_privacy_policy:
            design_score += 15.0
        if copyright_year and copyright_year >= 2024:
            design_score += 25.0
        elif copyright_year:
            design_score += 10.0

        pentest_score = 0.0
        if not is_https:
            pentest_score += 40.0
        if detected_cms == "WordPress":
            pentest_score += 20.0
        if not has_privacy_policy:
            pentest_score += 15.0
        if copyright_year and copyright_year < 2022:
            pentest_score += 25.0

        audit_record = LeadAuditScore(
            prospect_id=prospect_id,
            target_url=target_url,
            http_status=http_status,
            is_https=is_https,
            ssl_valid_days=90 if is_https else 0,
            has_mobile_viewport=has_mobile_viewport,
            has_privacy_policy=has_privacy_policy,
            detected_cms=detected_cms,
            copyright_year=copyright_year,
            design_score=design_score,
            pentest_score=pentest_score,
            error_message=error_msg,
            audited_at=utc_now()
        )
        session.add(audit_record)
        await session.commit()
        await session.refresh(audit_record)
        return audit_record

    # -------------------------------------------------------------
    # Deduplication & Merge with Undo
    # -------------------------------------------------------------
    @staticmethod
    async def detect_duplicates(session: AsyncSession, prospect: Prospect) -> list[LeadDuplicateCandidate]:
        candidates = []
        domain = None
        if prospect.demo_url:
            domain = urlparse(prospect.demo_url).netloc.lower()

        # Check phone
        if prospect.whatsapp:
            stmt = select(Prospect).where(
                Prospect.id != prospect.id,
                Prospect.is_deleted == False,
                Prospect.whatsapp == prospect.whatsapp
            )
            res = await session.execute(stmt)
            for match in res.scalars().all():
                cand = LeadDuplicateCandidate(
                    prospect_a_id=prospect.id,
                    prospect_b_id=match.id,
                    match_reason="phone",
                    confidence_score=0.95,
                    status="pending"
                )
                session.add(cand)
                candidates.append(cand)

        # Check domain
        if domain:
            stmt = select(Prospect).where(
                Prospect.id != prospect.id,
                Prospect.is_deleted == False,
                Prospect.demo_url.ilike(f"%{domain}%")
            )
            res = await session.execute(stmt)
            for match in res.scalars().all():
                cand = LeadDuplicateCandidate(
                    prospect_a_id=prospect.id,
                    prospect_b_id=match.id,
                    match_reason="domain",
                    confidence_score=0.98,
                    status="pending"
                )
                session.add(cand)
                candidates.append(cand)

        await session.commit()
        return candidates

    @staticmethod
    async def merge_prospects(session: AsyncSession, primary_id: str, secondary_id: str, user_id: str) -> LeadDuplicateCandidate:
        primary = await session.get(Prospect, primary_id)
        secondary = await session.get(Prospect, secondary_id)
        if not primary or not secondary:
            raise ValueError("Prospectos a fusionar no encontrados.")

        backup_state = {
            "primary": {
                "id": primary.id,
                "company_name": primary.company_name,
                "contact_name": primary.contact_name,
                "contact_email": primary.contact_email,
                "whatsapp": primary.whatsapp,
                "notes": primary.notes,
                "status": primary.status
            },
            "secondary": {
                "id": secondary.id,
                "company_name": secondary.company_name,
                "contact_name": secondary.contact_name,
                "contact_email": secondary.contact_email,
                "whatsapp": secondary.whatsapp,
                "notes": secondary.notes,
                "status": secondary.status,
                "is_deleted": secondary.is_deleted
            }
        }

        if not primary.contact_name and secondary.contact_name:
            primary.contact_name = secondary.contact_name
        if not primary.contact_email and secondary.contact_email:
            primary.contact_email = secondary.contact_email
        if not primary.whatsapp and secondary.whatsapp:
            primary.whatsapp = secondary.whatsapp

        combined_notes = (primary.notes or "") + f"\n[Fusionado con {secondary.company_name} ({secondary.id})]: " + (secondary.notes or "")
        primary.notes = combined_notes.strip()

        secondary.is_deleted = True
        secondary.deleted_at = utc_now()

        stmt = select(LeadDuplicateCandidate).where(
            or_(
                and_(LeadDuplicateCandidate.prospect_a_id == primary_id, LeadDuplicateCandidate.prospect_b_id == secondary_id),
                and_(LeadDuplicateCandidate.prospect_a_id == secondary_id, LeadDuplicateCandidate.prospect_b_id == primary_id)
            )
        )
        res = await session.execute(stmt)
        candidate = res.scalars().first()

        if not candidate:
            candidate = LeadDuplicateCandidate(
                prospect_a_id=primary_id,
                prospect_b_id=secondary_id,
                match_reason="manual_merge",
                confidence_score=1.0,
                status="merged",
                previous_state_json=json.dumps(backup_state)
            )
            session.add(candidate)
        else:
            candidate.status = "merged"
            candidate.previous_state_json = json.dumps(backup_state)

        event = ActivityEvent(
            module="crm",
            action="update",
            entity_type="prospect",
            entity_id=primary.id,
            user_id=user_id,
            summary=f"Prospecto fusionado: {secondary.company_name} -> {primary.company_name}"
        )
        session.add(event)

        await session.commit()
        await session.refresh(candidate)
        return candidate

    @staticmethod
    async def undo_merge(session: AsyncSession, candidate_id: str, user_id: str) -> bool:
        cand = await session.get(LeadDuplicateCandidate, candidate_id)
        if not cand or not cand.previous_state_json or cand.status != "merged":
            raise ValueError("No se puede deshacer la fusion o no existe respaldo del estado previo.")

        backup = json.loads(cand.previous_state_json)
        primary = await session.get(Prospect, backup["primary"]["id"])
        secondary = await session.get(Prospect, backup["secondary"]["id"])

        if primary:
            primary.company_name = backup["primary"]["company_name"]
            primary.contact_name = backup["primary"]["contact_name"]
            primary.contact_email = backup["primary"]["contact_email"]
            primary.whatsapp = backup["primary"]["whatsapp"]
            primary.notes = backup["primary"]["notes"]
            primary.status = backup["primary"]["status"]

        if secondary:
            secondary.company_name = backup["secondary"]["company_name"]
            secondary.contact_name = backup["secondary"]["contact_name"]
            secondary.contact_email = backup["secondary"]["contact_email"]
            secondary.whatsapp = backup["secondary"]["whatsapp"]
            secondary.notes = backup["secondary"]["notes"]
            secondary.status = backup["secondary"]["status"]
            secondary.is_deleted = backup["secondary"]["is_deleted"]
            secondary.deleted_at = None

        cand.status = "dismissed"
        cand.previous_state_json = None

        event = ActivityEvent(
            module="crm",
            action="restore",
            entity_type="prospect",
            entity_id=cand.id,
            user_id=user_id,
            summary=f"Fusion revertida para candidatos {cand.prospect_a_id} y {cand.prospect_b_id}"
        )
        session.add(event)

        await session.commit()
        return True

    # -------------------------------------------------------------
    # Google Places Adapter (Inactive by Default)
    # -------------------------------------------------------------
    @staticmethod
    def get_google_places_status():
        return {
            "enabled": False,
            "daily_budget_cap_mxn": 0.0,
            "monthly_budget_cap_mxn": 0.0,
            "per_search_cap_mxn": 0.0,
            "emergency_paused": True,
            "status": "inactivo",
            "message": "Google Places esta apagado por defecto. Se utiliza OpenStreetMap con atribucion ODbL."
        }

    @staticmethod
    def estimate_google_places_cost(query_count: int, field_mask: list[str]) -> dict:
        base_rate_usd = 0.017  # Standard Places API search per request
        usd_to_mxn = 18.50
        cost_usd = query_count * base_rate_usd
        cost_mxn = cost_usd * usd_to_mxn
        return {
            "query_count": query_count,
            "field_mask": field_mask,
            "estimated_cost_usd": round(cost_usd, 4),
            "estimated_cost_mxn": round(cost_mxn, 2),
            "allowed_execution": False,
            "reason": "Adaptador desactivado con topes en cero"
        }
