import json
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.core import ConfigParameter

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

DEFAULT_CATALOGS = {
    "service_types": [
        {"id": "proyecto_fijo", "name": "Proyecto Único", "billing": "one_time", "requires_quote": True},
        {"id": "igual_mensual", "name": "Iguala Mensual", "billing": "monthly", "requires_quote": True},
        {"id": "mantenimiento", "name": "Mantenimiento Técnico", "billing": "recurring", "requires_quote": False},
        {"id": "pentesting", "name": "Pruebas de Penetración", "billing": "one_time", "requires_auth_doc": True}
    ],
    "mexico_holidays": [
        {"date": "2026-01-01", "name": "Año Nuevo"},
        {"date": "2026-02-02", "name": "Día de la Constitución Mexicana"},
        {"date": "2026-03-16", "name": "Natalicio de Benito Juárez"},
        {"date": "2026-05-01", "name": "Día del Trabajo"},
        {"date": "2026-09-16", "name": "Día de la Independencia"},
        {"date": "2026-11-16", "name": "Conmemoración de la Revolución Mexicana"},
        {"date": "2026-12-25", "name": "Navidad"}
    ],
    "pipeline_stages": [
        {"id": "captado", "label": "Captado", "is_terminal": False, "order": 1},
        {"id": "revisado", "label": "Revisado", "is_terminal": False, "order": 2},
        {"id": "contactado", "label": "Contactado", "is_terminal": False, "order": 3},
        {"id": "respondio", "label": "Respondió", "is_terminal": False, "order": 4},
        {"id": "reunion", "label": "Reunión", "is_terminal": False, "order": 5},
        {"id": "propuesta", "label": "Propuesta Enviada", "is_terminal": False, "order": 6},
        {"id": "cliente", "label": "Cerrado / Cliente", "is_terminal": True, "order": 7},
        {"id": "sin_respuesta", "label": "Sin Respuesta", "is_terminal": True, "order": 8},
        {"id": "descartado", "label": "Descartado", "is_terminal": True, "order": 9},
        {"id": "no_contactar", "label": "No Contactar", "is_terminal": True, "order": 10}
    ],
    "workshop_areas": [
        {"id": "creatividad", "name": "Creatividad y Diagramas"},
        {"id": "codigo", "name": "Código y Entornos"},
        {"id": "utilidades", "name": "Utilidades del Sistema"}
    ],
    "currencies": [
        {"code": "MXN", "name": "Peso Mexicano", "symbol": "$", "is_base": True},
        {"code": "USD", "name": "Dólar Estadounidense", "symbol": "US$", "is_base": False}
    ],
    "payment_methods": [
        {"id": "transferencia", "name": "Transferencia Bancaria SPEI"},
        {"id": "efectivo", "name": "Efectivo"},
        {"id": "tarjeta", "name": "Tarjeta Bancaria"}
    ]
}

def build_default_map_zones() -> list[dict]:
    from app.services.crm_capture import TIJUANA_ZONES
    return [dict(zone) for zone in TIJUANA_ZONES]


def build_default_map_sectors() -> list[dict]:
    from app.services.crm_capture import DEFAULT_SECTOR_CATALOG
    return [dict(item) for item in DEFAULT_SECTOR_CATALOG]


def build_default_map_defaults() -> dict:
    from app.config import settings as app_settings
    return {
        "default_city": app_settings.MAP_DEFAULT_CITY,
        "default_zone": app_settings.MAP_DEFAULT_ZONE_SLUG,
        "default_sector": app_settings.MAP_DEFAULT_SECTOR,
        "center": [app_settings.MAP_DEFAULT_CENTER_LAT, app_settings.MAP_DEFAULT_CENTER_LON],
        "zoom": app_settings.MAP_DEFAULT_ZOOM,
        "max_search_area_deg": app_settings.MAP_MAX_SEARCH_AREA_DEG,
        "full_bounds_zone_slug": app_settings.MAP_FULL_BOUNDS_ZONE_SLUG,
        "tile_url_template": app_settings.OSM_TILE_URL_TEMPLATE,
        "attribution": app_settings.MAP_ATTRIBUTION_HTML,
    }


def build_default_currency_config() -> dict:
    from app.config import settings as app_settings
    return {
        "base_currency": app_settings.DEFAULT_CURRENCY,
        "exchange_pair": {"base": "USD", "target": app_settings.DEFAULT_CURRENCY},
        "locale": "es-MX",
    }


def build_default_writeup_defaults() -> dict:
    from app.config import settings as app_settings
    return {
        "organization_name": app_settings.WRITEUP_ORGANIZATION_NAME,
        "watermark_default": app_settings.WRITEUP_WATERMARK_DEFAULT,
    }


async def initialize_default_catalogs(session: AsyncSession) -> None:
    """Populates default configuration catalogs if missing."""
    for key, items in DEFAULT_CATALOGS.items():
        stmt = select(ConfigParameter).where(ConfigParameter.key == key)
        res = await session.execute(stmt)
        param = res.scalar_one_or_none()
        if not param:
            new_param = ConfigParameter(
                key=key,
                scope="system",
                category="catalogs",
                value_json=json.dumps(items, ensure_ascii=False),
                is_encrypted=False,
                description=f"Catálogo editable para {key}"
            )
            session.add(new_param)
    await session.commit()

async def get_config_parameter(session: AsyncSession, key: str, default=None):
    stmt = select(ConfigParameter).where(ConfigParameter.key == key)
    res = await session.execute(stmt)
    param = res.scalar_one_or_none()
    if param:
        try:
            return json.loads(param.value_json)
        except Exception:
            return param.value_json
    return default

async def set_config_parameter(
    session: AsyncSession,
    key: str,
    value,
    scope: str = "system",
    category: str = "general",
    description: str | None = None
) -> ConfigParameter:
    stmt = select(ConfigParameter).where(ConfigParameter.key == key)
    res = await session.execute(stmt)
    param = res.scalar_one_or_none()
    val_json = json.dumps(value, ensure_ascii=False)
    
    if param:
        param.value_json = val_json
        param.scope = scope
        param.category = category
        if description:
            param.description = description
        param.updated_at = utc_now()
    else:
        param = ConfigParameter(
            key=key,
            scope=scope,
            category=category,
            value_json=val_json,
            is_encrypted=False,
            description=description
        )
        session.add(param)
    await session.commit()
    await session.refresh(param)
    return param

async def get_runtime_config(session: AsyncSession) -> dict:
    """Reads merged runtime configuration from ConfigParameter with env/default fallbacks."""
    currencies = await get_config_parameter(session, "currencies", DEFAULT_CATALOGS["currencies"])
    currency_config = {
        **build_default_currency_config(),
        **(await get_config_parameter(session, "currency_config", {}) or {}),
    }
    map_defaults = {
        **build_default_map_defaults(),
        **(await get_config_parameter(session, "map_defaults", {}) or {}),
    }
    map_zones = await get_config_parameter(session, "map_zones", None)
    if not isinstance(map_zones, list) or not map_zones:
        map_zones = build_default_map_zones()

    map_sectors = await get_config_parameter(session, "map_sectors", None)
    if not isinstance(map_sectors, list) or not map_sectors:
        map_sectors = build_default_map_sectors()

    writeup_defaults = {
        **build_default_writeup_defaults(),
        **(await get_config_parameter(session, "writeup_defaults", {}) or {}),
    }
    service_types = await get_config_parameter(session, "service_types", DEFAULT_CATALOGS["service_types"])
    payment_methods = await get_config_parameter(session, "payment_methods", DEFAULT_CATALOGS["payment_methods"])
    pipeline_stages = await get_config_parameter(session, "pipeline_stages", DEFAULT_CATALOGS["pipeline_stages"])

    return {
        "currencies": currencies if isinstance(currencies, list) else DEFAULT_CATALOGS["currencies"],
        "currency_config": currency_config,
        "map_defaults": map_defaults,
        "map_zones": map_zones,
        "map_sectors": map_sectors,
        "writeup_defaults": writeup_defaults,
        "service_types": service_types if isinstance(service_types, list) else DEFAULT_CATALOGS["service_types"],
        "payment_methods": payment_methods if isinstance(payment_methods, list) else DEFAULT_CATALOGS["payment_methods"],
        "pipeline_stages": pipeline_stages if isinstance(pipeline_stages, list) else DEFAULT_CATALOGS["pipeline_stages"],
    }

async def update_runtime_config(session: AsyncSession, payload: dict) -> dict:
    """Persists partial updates to runtime configuration parameters."""
    current = await get_runtime_config(session)
    if "currencies" in payload and isinstance(payload["currencies"], list) and payload["currencies"]:
        await set_config_parameter(session, "currencies", payload["currencies"], scope="system", category="catalogs", description="Monedas activas del sistema")
    if "currency_config" in payload and isinstance(payload["currency_config"], dict):
        merged = {**current["currency_config"], **payload["currency_config"]}
        await set_config_parameter(session, "currency_config", merged, scope="system", category="runtime_config", description="Moneda base, par de tipo de cambio y formato")
    if "map_defaults" in payload and isinstance(payload["map_defaults"], dict):
        merged = {**current["map_defaults"], **payload["map_defaults"]}
        await set_config_parameter(session, "map_defaults", merged, scope="system", category="runtime_config", description="Configuración geográfica por defecto del mapa")
    if "map_zones" in payload and isinstance(payload["map_zones"], list) and payload["map_zones"]:
        await set_config_parameter(session, "map_zones", payload["map_zones"], scope="system", category="catalogs", description="Zonas configurables para captura geográfica")
    if "map_sectors" in payload and isinstance(payload["map_sectors"], list) and payload["map_sectors"]:
        await set_config_parameter(session, "map_sectors", payload["map_sectors"], scope="system", category="catalogs", description="Sectores y mapeos OSM para captura")
    if "writeup_defaults" in payload and isinstance(payload["writeup_defaults"], dict):
        merged = {**current["writeup_defaults"], **payload["writeup_defaults"]}
        await set_config_parameter(session, "writeup_defaults", merged, scope="system", category="runtime_config", description="Organización y marca de agua para reportes")
    return await get_runtime_config(session)

async def export_sanitized_config(session: AsyncSession) -> dict:
    """Exports non-sensitive configuration parameters and catalogs without secrets or PII."""
    stmt = select(ConfigParameter).where(ConfigParameter.is_encrypted == False)
    res = await session.execute(stmt)
    params = res.scalars().all()
    export_data = {}
    for p in params:
        try:
            export_data[p.key] = json.loads(p.value_json)
        except Exception:
            export_data[p.key] = p.value_json
    return {
        "version": "2.0.0",
        "exported_at": utc_now().isoformat(),
        "parameters": export_data
    }
