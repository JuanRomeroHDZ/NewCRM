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
    val_json = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
    
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
