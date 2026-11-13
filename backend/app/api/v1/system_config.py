from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.core import User
from app.schemas import CatalogUpdateRequest, ConfigParamUpdateRequest
from app.schemas.config_import import ConfigImportRequest
from app.services.config_service import (
    DEFAULT_CATALOGS, get_config_parameter, set_config_parameter,
    export_sanitized_config, initialize_default_catalogs, update_runtime_config
)
from app.services.core_auth import require_role
from app.services.activity_service import record_event

router = APIRouter(prefix="/config", tags=["config"])


def _safe_currency_catalog(value):
    from app.schemas.runtime_config import RuntimeConfigUpdate

    try:
        validated = RuntimeConfigUpdate.model_validate({"currencies": value})
    except ValidationError:
        return DEFAULT_CATALOGS["currencies"]
    if not validated.currencies:
        return DEFAULT_CATALOGS["currencies"]
    return [item.model_dump() for item in validated.currencies]


@router.get("/catalogs")
async def get_all_catalogs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin", "seller", "readonly"]))
):
    await initialize_default_catalogs(db)
    result = {}
    for key in DEFAULT_CATALOGS.keys():
        value = await get_config_parameter(db, key, DEFAULT_CATALOGS[key])
        result[key] = _safe_currency_catalog(value) if key == "currencies" else value
    return result

@router.get("/catalogs/{key}")
async def get_single_catalog(
    key: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin", "seller", "readonly"]))
):
    val = await get_config_parameter(db, key)
    if val is None:
        if key in DEFAULT_CATALOGS:
            return DEFAULT_CATALOGS[key]
        raise HTTPException(status_code=404, detail="Catálogo no encontrado")
    return _safe_currency_catalog(val) if key == "currencies" else val

@router.put("/catalogs/{key}")
async def update_single_catalog(
    key: str,
    payload: CatalogUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin"]))
):
    old_val = await get_config_parameter(db, key)
    items = payload.items
    try:
        if key == "currencies":
            updated = await update_runtime_config(db, {"currencies": payload.items})
            items = updated["currencies"]
        else:
            await set_config_parameter(
                db,
                key=key,
                value=items,
                scope="system",
                category="catalogs",
                description=f"Catálogo actualizado para {key}",
                commit=False,
            )
        await record_event(
            db,
            module="system",
            action="update",
            entity_type="catalog",
            summary=f"Actualización de catálogo: {key}",
            details_before={"items": old_val},
            details_after={"items": items},
            user_id=current_user.id,
            user_name=current_user.username
        )
        await db.commit()
    except (ValidationError, ValueError) as exc:
        await db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception:
        await db.rollback()
        raise
    return {"message": "Catálogo actualizado exitosamente.", "key": key, "items": items}

@router.get("/export")
async def export_system_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"]))
):
    await initialize_default_catalogs(db)
    return await export_sanitized_config(db)

@router.post("/import")
async def import_system_config(
    payload: ConfigImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"]))
):
    runtime_keys = {
        "currencies",
        "currency_config",
        "map_defaults",
        "map_zones",
        "map_sectors",
        "writeup_defaults",
    }
    parameters = {
        key: value
        for key, value in payload.parameters.items()
        if not any(sensitive in key.lower() for sensitive in ("secret", "password", "token"))
    }
    runtime_parameters = {key: value for key, value in parameters.items() if key in runtime_keys}
    count = 0
    try:
        if runtime_parameters:
            await update_runtime_config(db, runtime_parameters)
            count += len(runtime_parameters)

        for key, val in parameters.items():
            if key in runtime_keys:
                continue
            await set_config_parameter(
                db,
                key=key,
                value=val,
                scope="system",
                category="imported",
                commit=False,
            )
            count += 1

        await record_event(
            db,
            module="system",
            action="import",
            entity_type="config",
            summary=f"Importación de {count} parámetros de configuración modular",
            user_id=current_user.id,
            user_name=current_user.username
        )
        await db.commit()
    except (ValidationError, ValueError) as exc:
        await db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception:
        await db.rollback()
        raise
    return {"message": f"Se importaron {count} parámetros correctamente."}
