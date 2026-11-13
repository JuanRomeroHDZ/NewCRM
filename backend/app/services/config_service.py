import json
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.core import ConfigParameter
from pydantic import ValidationError

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
    description: str | None = None,
    *,
    commit: bool = True,
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
    if commit:
        await session.commit()
    else:
        await session.flush()
    await session.refresh(param)
    return param

async def get_runtime_config(session: AsyncSession) -> dict:
    """Reads merged runtime configuration from ConfigParameter with env/default fallbacks."""
    from app.schemas.runtime_config import (
        RuntimeConfigUpdate,
        RuntimeCurrencyConfig,
        RuntimeMapDefaults,
        RuntimeWriteupDefaults,
    )

    def as_dict(value) -> dict:
        return value if isinstance(value, dict) else {}

    defaults = build_default_currency_config()
    currency_config = {**defaults, **as_dict(await get_config_parameter(session, "currency_config", {}))}
    try:
        currency_config = RuntimeCurrencyConfig.model_validate(currency_config).model_dump(exclude_none=True)
        currencies = RuntimeConfigUpdate.model_validate({
            "currencies": await get_config_parameter(session, "currencies", DEFAULT_CATALOGS["currencies"])
        }).currencies
        currencies = [item.model_dump() for item in currencies or []]
        if currency_config.get("base_currency") not in {item["code"] for item in currencies}:
            raise ValueError("La moneda base no está en el catálogo activo.")
        if currency_config.get("base_currency") != "MXN" or currency_config.get("exchange_pair") != {
            "base": "USD", "target": "MXN"
        }:
            raise ValueError("La conversión admitida debe ser de USD a MXN.")
        if len([item for item in currencies if item["is_base"]]) != 1 or next(
            item["code"] for item in currencies if item["is_base"]
        ) != currency_config.get("base_currency"):
            raise ValueError("El catálogo no identifica correctamente su moneda base.")
    except (ValidationError, ValueError, TypeError, StopIteration):
        currencies = DEFAULT_CATALOGS["currencies"]
        currency_config = defaults

    map_defaults = {**build_default_map_defaults(), **as_dict(await get_config_parameter(session, "map_defaults", {}))}
    try:
        map_defaults = RuntimeMapDefaults.model_validate(map_defaults).model_dump(exclude_none=True)
    except (ValidationError, ValueError, TypeError):
        map_defaults = build_default_map_defaults()

    try:
        map_zones = [item.model_dump() for item in RuntimeConfigUpdate.model_validate({
            "map_zones": await get_config_parameter(session, "map_zones", None) or build_default_map_zones()
        }).map_zones or []]
    except (ValidationError, ValueError, TypeError):
        map_zones = build_default_map_zones()

    try:
        map_sectors = [item.model_dump() for item in RuntimeConfigUpdate.model_validate({
            "map_sectors": await get_config_parameter(session, "map_sectors", None) or build_default_map_sectors()
        }).map_sectors or []]
    except (ValidationError, ValueError, TypeError):
        map_sectors = build_default_map_sectors()

    zone_slugs = {zone["slug"] for zone in map_zones}
    if map_defaults.get("default_zone") not in zone_slugs:
        map_defaults["default_zone"] = map_zones[0]["slug"]
    if map_defaults.get("full_bounds_zone_slug") not in zone_slugs:
        fallback_full_zone = next(
            (zone for zone in map_zones if zone["slug"] == build_default_map_defaults().get("full_bounds_zone_slug")),
            None,
        )
        map_defaults["full_bounds_zone_slug"] = fallback_full_zone["slug"] if fallback_full_zone else map_zones[0]["slug"]

    writeup_defaults = {
        **build_default_writeup_defaults(),
        **as_dict(await get_config_parameter(session, "writeup_defaults", {})),
    }
    try:
        writeup_defaults = RuntimeWriteupDefaults.model_validate(writeup_defaults).model_dump(exclude_none=True)
    except (ValidationError, ValueError, TypeError):
        writeup_defaults = build_default_writeup_defaults()
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
    """Validates and stages a complete partial update in the caller's transaction."""
    from app.schemas.runtime_config import RuntimeConfigUpdate

    validated = RuntimeConfigUpdate.model_validate(payload)
    payload = validated.model_dump(exclude_unset=True, exclude_none=True, mode="json")
    current = await get_runtime_config(session)
    next_currencies = payload.get("currencies", current["currencies"])
    currency_config = {**current["currency_config"], **payload.get("currency_config", {})}
    base_currency = currency_config.get("base_currency")
    if base_currency != "MXN" or currency_config.get("exchange_pair") != {"base": "USD", "target": "MXN"}:
        raise ValueError("La moneda base debe ser MXN y la conversión debe usar el par USD a MXN.")
    if base_currency not in {item["code"] for item in next_currencies}:
        raise ValueError("La moneda base debe existir en el catálogo de monedas activas.")
    base_options = [item["code"] for item in next_currencies if item.get("is_base")]
    if base_options != [base_currency]:
        raise ValueError("La única moneda marcada como base debe coincidir con la moneda base configurada.")

    next_zones = payload.get("map_zones", current["map_zones"])
    map_defaults = {**current["map_defaults"], **payload.get("map_defaults", {})}
    zone_slugs = {zone["slug"] for zone in next_zones}
    if map_defaults.get("default_zone") not in zone_slugs:
        raise ValueError("La zona predeterminada debe existir en la lista de zonas.")
    full_bounds_slug = map_defaults.get("full_bounds_zone_slug")
    if full_bounds_slug and full_bounds_slug not in zone_slugs:
        raise ValueError("La zona que limita las búsquedas debe existir en la lista de zonas.")

    writes = []
    if "currencies" in payload:
        writes.append(("currencies", payload["currencies"], "catalogs", "Monedas activas del sistema"))
    if "currency_config" in payload:
        writes.append(("currency_config", currency_config, "runtime_config", "Moneda base, par de tipo de cambio y formato"))
    if "map_defaults" in payload:
        writes.append(("map_defaults", map_defaults, "runtime_config", "Configuración geográfica por defecto del mapa"))
    if "map_zones" in payload:
        writes.append(("map_zones", next_zones, "catalogs", "Zonas configurables para captura geográfica"))
    if "map_sectors" in payload:
        writes.append(("map_sectors", payload["map_sectors"], "catalogs", "Sectores y mapeos OSM para captura"))
    if "writeup_defaults" in payload:
        writes.append((
            "writeup_defaults",
            {**current["writeup_defaults"], **payload["writeup_defaults"]},
            "runtime_config",
            "Organización y marca de agua para reportes",
        ))

    for key, value, category, description in writes:
        await set_config_parameter(
            session,
            key,
            value,
            scope="system",
            category=category,
            description=description,
            commit=False,
        )
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
