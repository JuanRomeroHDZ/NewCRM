import re
import json
import socket
import ipaddress
import hashlib
import unicodedata
import asyncio
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_

from app.models.crm_capture import LeadCacheCell, LeadAuditScore, LeadDuplicateCandidate, PermanentDiscard
from app.models import Prospect
from app.models.core import ActivityEvent
from app.config import settings

# Tijuana Zones and Colonias Catalog
TIJUANA_ZONES = [
    {"slug": "zona-rio", "zone": "Zona Río", "center": [32.5265, -117.0175], "zoom": 14, "bbox": {"min_lat": 32.5150, "min_lon": -117.0300, "max_lat": 32.5380, "max_lon": -117.0050}, "colonias": ["Zona Urbana Río Tijuana", "Río Tijuana 3ra Etapa", "Aviación"]},
    {"slug": "centro", "zone": "Centro", "center": [32.5350, -117.0390], "zoom": 14, "bbox": {"min_lat": 32.5250, "min_lon": -117.0480, "max_lat": 32.5450, "max_lon": -117.0300}, "colonias": ["Zona Centro", "Zona Norte", "Castillo", "Altamira"]},
    {"slug": "otay", "zone": "Otay", "center": [32.5360, -116.9625], "zoom": 12, "bbox": {"min_lat": 32.5200, "min_lon": -116.9950, "max_lat": 32.5520, "max_lon": -116.9300}, "colonias": ["Otay Constituyentes", "Mesa de Otay", "Ciudad Industrial Otay", "Altabrisa"]},
    {"slug": "la-mesa", "zone": "La Mesa", "center": [32.5000, -116.9675], "zoom": 13, "bbox": {"min_lat": 32.4850, "min_lon": -116.9900, "max_lat": 32.5150, "max_lon": -116.9450}, "colonias": ["Las Huertas", "El Prado", "Balcones del Prado", "Villa Floresta"]},
    {"slug": "playas", "zone": "Playas de Tijuana", "center": [32.5175, -117.1125], "zoom": 13, "bbox": {"min_lat": 32.5000, "min_lon": -117.1300, "max_lat": 32.5350, "max_lon": -117.0950}, "colonias": ["Playas de Tijuana Secc. Jardines", "Costa Hermosa", "La Perla"]},
    {"slug": "chapultepec-hipodromo", "zone": "Chapultepec e Hipódromo", "center": [32.5100, -117.0100], "zoom": 14, "bbox": {"min_lat": 32.5000, "min_lon": -117.0250, "max_lat": 32.5200, "max_lon": -116.9950}, "colonias": ["Chapultepec", "Hipódromo", "Lomas Taurinas", "Paraíso"]},
    {"slug": "el-florido", "zone": "El Florido", "center": [32.4600, -116.8550], "zoom": 12, "bbox": {"min_lat": 32.4400, "min_lon": -116.8900, "max_lat": 32.4800, "max_lon": -116.8200}, "colonias": ["El Florido", "Mariano Matamoros", "Villa Fontana", "Villa del Real"]},
    {"slug": "insurgentes", "zone": "Insurgentes", "center": [32.4950, -116.9150], "zoom": 13, "bbox": {"min_lat": 32.4800, "min_lon": -116.9400, "max_lat": 32.5100, "max_lon": -116.8900}, "colonias": []},
    {"slug": "santa-fe", "zone": "Santa Fe", "center": [32.4400, -117.0300], "zoom": 12, "bbox": {"min_lat": 32.4200, "min_lon": -117.0600, "max_lat": 32.4600, "max_lon": -117.0000}, "colonias": []},
    {"slug": "tijuana-full", "zone": "Tijuana completa", "center": [32.4775, -116.9775], "zoom": 11, "bbox": {"min_lat": 32.4000, "min_lon": -117.1350, "max_lat": 32.5550, "max_lon": -116.8200}, "colonias": []},
]

COMMON_OSM_MAPPINGS = {
    "dentist": [("amenity", "dentist"), ("healthcare", "dentist")],
    "dental": [("amenity", "dentist"), ("healthcare", "dentist")],
    "denti": [("amenity", "dentist"), ("healthcare", "dentist")],
    "contab": [("office", "accountant"), ("office", "tax_advisor")],
    "fiscal": [("office", "tax_advisor"), ("office", "accountant")],
    "veterin": [("amenity", "veterinary")],
    "gimnas": [("leisure", "fitness_centre")],
    "fit": [("leisure", "fitness_centre")],
    "restauran": [("amenity", "restaurant"), ("amenity", "cafe")],
    "cafe": [("amenity", "cafe")],
    "taller": [("shop", "car_repair")],
    "mecanic": [("shop", "car_repair")],
    "belleza": [("shop", "beauty"), ("shop", "hairdresser")],
    "estetica": [("shop", "beauty"), ("shop", "hairdresser")],
    "lash": [("shop", "beauty")],
    "spa": [("shop", "beauty"), ("leisure", "spa")],
    "abogad": [("office", "lawyer")],
    "legal": [("office", "lawyer")],
    "medico": [("amenity", "doctors"), ("amenity", "clinic")],
    "doctor": [("amenity", "doctors"), ("amenity", "clinic")],
    "farmacia": [("amenity", "pharmacy")],
}

DEFAULT_SECTOR_CATALOG = [
    {"id": "dentistas", "label": "Dentistas", "stems": ["dentist", "dental", "denti"], "osm_tags": [["amenity", "dentist"], ["healthcare", "dentist"]]},
    {"id": "contadores", "label": "Contadores y Fiscales", "stems": ["contab", "fiscal"], "osm_tags": [["office", "accountant"], ["office", "tax_advisor"]]},
    {"id": "veterinarias", "label": "Veterinarias", "stems": ["veterin"], "osm_tags": [["amenity", "veterinary"]]},
    {"id": "gimnasios", "label": "Gimnasios y Fitness", "stems": ["gimnas", "fit"], "osm_tags": [["leisure", "fitness_centre"]]},
    {"id": "restaurantes", "label": "Restaurantes y Cafés", "stems": ["restauran", "cafe"], "osm_tags": [["amenity", "restaurant"], ["amenity", "cafe"]]},
    {"id": "talleres", "label": "Talleres Mecánicos", "stems": ["taller", "mecanic"], "osm_tags": [["shop", "car_repair"]]},
    {"id": "belleza", "label": "Estéticas y Spa", "stems": ["belleza", "estetica", "lash", "spa"], "osm_tags": [["shop", "beauty"], ["shop", "hairdresser"]]},
    {"id": "abogados", "label": "Despachos Legales", "stems": ["abogad", "legal"], "osm_tags": [["office", "lawyer"]]},
    {"id": "medicos", "label": "Clínicas y Médicos", "stems": ["medico", "doctor"], "osm_tags": [["amenity", "doctors"], ["amenity", "clinic"]]},
    {"id": "farmacias", "label": "Farmacias", "stems": ["farmacia"], "osm_tags": [["amenity", "pharmacy"]]},
]


class OSMProviderError(RuntimeError):
    def __init__(self, message: str, status_code: int = 503):
        super().__init__(message)
        self.status_code = status_code

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

# -------------------------------------------------------------
# SSRF Protection
# -------------------------------------------------------------
def validate_url_against_ssrf(target_url: str) -> str:
    """
    Validates URL to protect against SSRF. Rejects private, loopback,
    link-local, cloud metadata, and non-HTTP/HTTPS URLs.
    """
    parsed = urlparse(target_url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Esquema no permitido. Solo se admite http y https.")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("La URL no puede incluir credenciales.")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("Nombre de host no proporcionado.")

    if hostname.rstrip(".").lower() in ("169.254.169.254", "metadata.google.internal", "localhost"):
        raise ValueError("Acceso denegado a host reservado o metadatos de nube.")

    try:
        addr_info = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        raise ValueError("No se pudo resolver el nombre de host de destino.")

    for entry in addr_info:
        ip_str = entry[4][0]
        ip_obj = ipaddress.ip_address(ip_str)
        # Only globally routable targets are allowed, including for IPv6.
        if not ip_obj.is_global:
            raise ValueError(f"Direccion IP no publica bloqueada por politica SSRF: {ip_str}")

    return target_url


def normalize_search_term(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.strip().lower())
    return "".join(char for char in normalized if not unicodedata.combining(char))


def compute_query_hash(sector: str, subsector: str | None, zone: str, bbox: dict[str, float] | None = None) -> str:
    bounds = bbox or {}
    bounds_key = ",".join(f"{key}={bounds[key]:.5f}" for key in ("min_lat", "min_lon", "max_lat", "max_lon") if key in bounds)
    key = f"{normalize_search_term(sector)}:{normalize_search_term(subsector or '')}:{zone.strip().lower()}:{bounds_key}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def validate_search_bounds(
    bounds: dict[str, float],
    zones: list[dict] | None = None,
    map_defaults: dict | None = None,
) -> dict[str, float]:
    clean = {key: float(bounds[key]) for key in ("min_lat", "min_lon", "max_lat", "max_lon")}
    if not (-90 <= clean["min_lat"] < clean["max_lat"] <= 90 and -180 <= clean["min_lon"] < clean["max_lon"] <= 180):
        raise ValueError("El área del mapa no tiene coordenadas válidas.")

    active_zones = zones or TIJUANA_ZONES
    defaults = map_defaults or {}
    full_slug = defaults.get("full_bounds_zone_slug") or settings.MAP_FULL_BOUNDS_ZONE_SLUG
    city_name = defaults.get("default_city") or settings.MAP_DEFAULT_CITY
    max_area_deg = float(defaults.get("max_search_area_deg") or settings.MAP_MAX_SEARCH_AREA_DEG)

    full_bounds = next((zone.get("bbox") for zone in active_zones if zone.get("slug") == full_slug), None)
    if full_bounds and (
        clean["min_lat"] < full_bounds["min_lat"]
        or clean["max_lat"] > full_bounds["max_lat"]
        or clean["min_lon"] < full_bounds["min_lon"]
        or clean["max_lon"] > full_bounds["max_lon"]
    ):
        raise ValueError(f"La búsqueda se limita al área de {city_name}.")
    area = (clean["max_lat"] - clean["min_lat"]) * (clean["max_lon"] - clean["min_lon"])
    if area > max_area_deg:
        raise ValueError("Selecciona un área más pequeña para evitar una consulta demasiado amplia.")
    return clean


def build_overpass_query(
    sector: str,
    subsector: str | None,
    bounds: dict[str, float],
    sector_catalog: list[dict] | None = None,
) -> str:
    bbox = ",".join(f"{bounds[key]:.5f}" for key in ("min_lat", "min_lon", "max_lat", "max_lon"))

    def tags_for(value: str) -> list[tuple[str, str]]:
        search_text = normalize_search_term(value)
        if not search_text:
            return []
        if sector_catalog:
            for entry in sector_catalog:
                stems = [normalize_search_term(str(s)) for s in (entry.get("stems") or [])]
                label = normalize_search_term(str(entry.get("label") or ""))
                entry_id = normalize_search_term(str(entry.get("id") or ""))
                if any(stem and stem in search_text for stem in stems) or (entry_id and entry_id in search_text) or (label and label in search_text):
                    return [(pair[0], pair[1]) for pair in (entry.get("osm_tags") or []) if isinstance(pair, (list, tuple)) and len(pair) == 2]
        return next((tags for stem, tags in COMMON_OSM_MAPPINGS.items() if stem in search_text), [])

    mappings = list(dict.fromkeys(tags_for(sector) or tags_for(subsector or "")))
    # Catalogs can be edited/imported in the database. Accept only ordinary
    # OSM key/value tokens before interpolating them into Overpass QL.
    mappings = [
        (key, value)
        for key, value in mappings
        if re.fullmatch(r"[a-zA-Z][a-zA-Z0-9:_-]{0,63}", str(key))
        and re.fullmatch(r"[a-zA-Z0-9 _:-]{1,96}", str(value))
    ]
    statements: list[str] = []
    if mappings:
        for key, value in mappings:
            for element_type in ("node", "way", "relation"):
                statements.append(f'{element_type}["{key}"="{value}"]({bbox});')
    search_name = subsector.strip() if subsector else (sector.strip() if not mappings else "")
    if search_name:
        # Escape both the regular expression and the Overpass string literal.
        escaped = json.dumps(re.escape(search_name), ensure_ascii=False)
        for element_type in ("node", "way", "relation"):
            statements.append(f'{element_type}["name"~{escaped},i]({bbox});')
    timeout_seconds = int(settings.OSM_REQUEST_TIMEOUT_SECONDS)
    max_results = settings.OSM_MAX_RESULTS
    return f"[out:json][timeout:{timeout_seconds}];\n(\n  " + "\n  ".join(statements) + f"\n);\nout center tags {max_results};"

class CrmCaptureService:
    @staticmethod
    def get_tijuana_zones():
        return TIJUANA_ZONES

    @staticmethod
    async def get_zones(session: AsyncSession) -> list[dict]:
        from app.services.config_service import get_runtime_config
        cfg = await get_runtime_config(session)
        return cfg.get("map_zones") or TIJUANA_ZONES

    @staticmethod
    async def get_map_config(session: AsyncSession) -> dict:
        from app.services.config_service import get_runtime_config
        cfg = await get_runtime_config(session)
        defaults = cfg.get("map_defaults") or {}
        sectors = cfg.get("map_sectors") or DEFAULT_SECTOR_CATALOG
        attribution = defaults.get("attribution") or settings.MAP_ATTRIBUTION_HTML
        # Older imported settings may contain arbitrary markup. Leaflet renders
        # attribution as HTML, so only retain plain text or the OSM copyright
        # link from the validated configuration contract.
        safe_osm_link = re.fullmatch(
            r'<a href="https://www\.openstreetmap\.org/copyright" target="_blank" '
            r'rel="noopener noreferrer">[^<>]{1,160}</a>',
            str(attribution),
        )
        if "<" in str(attribution) or ">" in str(attribution):
            attribution = attribution if safe_osm_link else "© OpenStreetMap contributors"
        return {
            "tile_url_template": defaults.get("tile_url_template") or settings.OSM_TILE_URL_TEMPLATE,
            "center": defaults.get("center") or [settings.MAP_DEFAULT_CENTER_LAT, settings.MAP_DEFAULT_CENTER_LON],
            "zoom": defaults.get("zoom") or settings.MAP_DEFAULT_ZOOM,
            "default_city": defaults.get("default_city") or settings.MAP_DEFAULT_CITY,
            "default_zone": defaults.get("default_zone") or settings.MAP_DEFAULT_ZONE_SLUG,
            "default_sector": defaults.get("default_sector") or settings.MAP_DEFAULT_SECTOR,
            "attribution": attribution,
            "sectors": sectors,
        }

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
    async def fetch_osm_elements(query: str) -> list[dict]:
        urls = list(dict.fromkeys(
            url.strip() for url in [settings.OSM_OVERPASS_URL, *settings.OSM_OVERPASS_FALLBACK_URLS.split(',')]
            if url.strip()
        ))
        if not urls:
            raise OSMProviderError("No hay un proveedor de OpenStreetMap configurado.", 503)

        # Share one bounded time budget among providers so a failed server does
        # not leave the interface waiting for a full timeout on every attempt.
        total_timeout = settings.OSM_REQUEST_TIMEOUT_SECONDS
        deadline = asyncio.get_running_loop().time() + total_timeout
        last_error = OSMProviderError("No se pudo consultar OpenStreetMap.", 503)
        try:
            async with asyncio.timeout(total_timeout):
                # Do not follow a public provider's redirect into a private
                # service or metadata endpoint.
                async with httpx.AsyncClient(timeout=total_timeout, follow_redirects=False) as client:
                    for index, url in enumerate(urls):
                        remaining = max(0.001, deadline - asyncio.get_running_loop().time())
                        attempt_timeout = remaining if index == len(urls) - 1 else max(1.0, remaining * 0.75)
                        try:
                            response = await client.post(
                                url,
                                data={"data": query},
                                timeout=attempt_timeout,
                                headers={
                                    "User-Agent": settings.OSM_USER_AGENT,
                                    "Accept": "application/json",
                                    "Content-Type": "application/x-www-form-urlencoded",
                                },
                            )
                        except httpx.TimeoutException:
                            last_error = OSMProviderError("OpenStreetMap tardó demasiado en responder. Intenta de nuevo más tarde.", 504)
                            continue
                        except httpx.RequestError:
                            last_error = OSMProviderError("No se pudo conectar con el servicio de OpenStreetMap.", 503)
                            continue

                        if response.status_code == 429:
                            last_error = OSMProviderError("OpenStreetMap está limitando consultas. Espera un momento antes de reintentar.", 429)
                            continue
                        if not response.is_success:
                            last_error = OSMProviderError("El servicio de OpenStreetMap no pudo completar la consulta.", 503 if response.status_code >= 500 else 502)
                            continue
                        try:
                            payload = response.json()
                            if not isinstance(payload, dict) or not isinstance(payload.get("elements"), list) or payload.get("remark"):
                                raise ValueError("invalid or incomplete Overpass response")
                        except (ValueError, AttributeError):
                            last_error = OSMProviderError("OpenStreetMap devolvió una respuesta incompleta o inválida.", 502)
                            continue
                        return payload["elements"]
        except TimeoutError as exc:
            raise OSMProviderError("OpenStreetMap tardó demasiado en responder. Intenta de nuevo más tarde.", 504) from exc

        raise last_error

    @staticmethod
    async def search_osm_leads(
        session: AsyncSession,
        sector: str,
        zone: str,
        subsector: str | None = None,
        max_cache_age_days: int = 14,
        custom_bbox: dict[str, float] | None = None,
    ) -> dict:
        """
        Search a bounded area through Overpass or return a fresh cached cell.
        Results contain only data returned by OpenStreetMap; no lead is fabricated.
        """
        from app.services.config_service import get_runtime_config
        runtime_cfg = await get_runtime_config(session)
        active_zones = runtime_cfg.get("map_zones") or TIJUANA_ZONES
        map_defaults = runtime_cfg.get("map_defaults") or {}
        sector_catalog = runtime_cfg.get("map_sectors") or DEFAULT_SECTOR_CATALOG
        city_name = map_defaults.get("default_city") or settings.MAP_DEFAULT_CITY

        zone_info = next(
            (item for item in active_zones if item.get("slug") == zone or str(item.get("zone") or "").casefold() == zone.casefold()),
            None,
        )
        if not zone_info:
            raise ValueError(f"Selecciona una zona válida de {city_name}.")
        bounds = validate_search_bounds(custom_bbox or zone_info["bbox"], zones=active_zones, map_defaults=map_defaults)
        zone_key = zone_info["slug"]
        q_hash = compute_query_hash(sector, subsector, zone_key, bounds)
        now = utc_now()

        # Check existing cache
        stmt = select(LeadCacheCell).where(LeadCacheCell.query_hash == q_hash)
        res = await session.execute(stmt)
        cached = res.scalars().first()
        max_age = timedelta(days=max(1, min(90, max_cache_age_days)))
        # A previous version cached a made-up sample. Never show it as real
        # search data, but leave the cache row untouched until a fresh query
        # succeeds so a normal search cannot delete unrelated user data.
        contains_legacy_sample = cached is not None and "+526641234567" in cached.results_json
        if cached and not contains_legacy_sample and cached.expires_at > now and cached.fetched_at >= now - max_age:
            return {
                "source": "cache",
                "attribution": cached.attribution,
                "cell_id": cached.id,
                "sector": cached.sector,
                "zone": zone_info["zone"],
                "search_bounds": bounds,
                "fetched_at": cached.fetched_at.isoformat(),
                "expires_at": cached.expires_at.isoformat(),
                "result_count": cached.result_count,
                "results": json.loads(cached.results_json)
            }

        query = build_overpass_query(sector, subsector, bounds, sector_catalog=sector_catalog)
        elements = await CrmCaptureService.fetch_osm_elements(query)

        results = []
        seen_ids: set[str] = set()
        for element in elements:
            tags = element.get("tags") or {}
            osm_type = element.get("type")
            osm_id = element.get("id")
            if not osm_type or not osm_id:
                continue
            external_id = f"{osm_type}/{osm_id}"
            if external_id in seen_ids:
                continue
            seen_ids.add(external_id)

            coordinates = element if osm_type == "node" else element.get("center") or {}
            lat, lon = coordinates.get("lat"), coordinates.get("lon")
            name = (tags.get("name") or tags.get("name:es") or tags.get("brand") or tags.get("operator") or "").strip()
            if not name or lat is None or lon is None:
                continue

            street = tags.get("addr:street")
            house_number = tags.get("addr:housenumber")
            neighborhood = tags.get("addr:suburb") or tags.get("addr:neighbourhood")
            address = ", ".join(part for part in [
                " ".join(part for part in [street, house_number] if part),
                neighborhood,
                tags.get("addr:postcode"),
                tags.get("addr:city") or city_name,
            ] if part)
            published_email = tags.get("contact:email") or tags.get("email")
            if published_email:
                published_email = published_email.strip()
                if len(published_email) > 254 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", published_email):
                    published_email = None
            published_whatsapp = tags.get("contact:whatsapp") or tags.get("whatsapp")
            if published_whatsapp:
                published_whatsapp = published_whatsapp.strip()
                if not re.fullmatch(r"\+?[0-9() .-]{7,32}", published_whatsapp):
                    published_whatsapp = None
            category = next((tags.get(key) for key in ("amenity", "healthcare", "office", "shop", "leisure", "craft") if tags.get(key)), sector)
            results.append({
                "osm_id": external_id,
                "osm_url": settings.OSM_OBJECT_URL_TEMPLATE.format(osm_type=osm_type, osm_id=osm_id),
                "name": name,
                "sector": sector,
                "subsector": subsector,
                "category": category,
                "zone": zone_info["zone"],
                "address": address or None,
                "phone": tags.get("contact:phone") or tags.get("phone") or tags.get("telephone"),
                "email": published_email,
                "whatsapp": published_whatsapp,
                "website": tags.get("contact:website") or tags.get("website") or tags.get("url"),
                "opening_hours": tags.get("opening_hours"),
                "lat": float(lat),
                "lon": float(lon),
                "source": "openstreetmap",
            })
            if len(results) >= settings.OSM_MAX_RESULTS:
                break

        expires_at = now + max_age
        if not cached:
            cached = LeadCacheCell(
                sector=sector,
                subsector=subsector,
                zone=zone_key,
                query_hash=q_hash,
                results_json=json.dumps(results, ensure_ascii=False),
                result_count=len(results),
                source="openstreetmap",
                status="complete",
                attribution=settings.MAP_DATA_ATTRIBUTION,
                fetched_at=now,
                expires_at=expires_at
            )
            session.add(cached)
        else:
            cached.results_json = json.dumps(results, ensure_ascii=False)
            cached.result_count = len(results)
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
            "zone": zone_info["zone"],
            "search_bounds": bounds,
            "fetched_at": cached.fetched_at.isoformat(),
            "expires_at": cached.expires_at.isoformat(),
            "result_count": cached.result_count,
            "results": results
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
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=False, verify=True) as client:
                res = await client.get(target_url, headers={"User-Agent": settings.WEBSITE_AUDITOR_USER_AGENT})
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
        base_rate_usd = settings.GOOGLE_PLACES_ESTIMATED_USD_PER_QUERY
        usd_to_mxn = settings.FALLBACK_USD_MXN_RATE
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
