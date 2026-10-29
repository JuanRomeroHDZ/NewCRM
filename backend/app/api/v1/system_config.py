from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.core import User
from app.schemas import CatalogUpdateRequest, ConfigParamUpdateRequest
from app.services.config_service import (
    DEFAULT_CATALOGS, get_config_parameter, set_config_parameter,
    export_sanitized_config, initialize_default_catalogs
)
from app.services.core_auth import require_role
from app.services.activity_service import record_event

router = APIRouter(prefix="/config", tags=["config"])

@router.get("/catalogs")
async def get_all_catalogs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin", "seller", "readonly"]))
):
    await initialize_default_catalogs(db)
    result = {}
    for key in DEFAULT_CATALOGS.keys():
        result[key] = await get_config_parameter(db, key, DEFAULT_CATALOGS[key])
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
    return val

@router.put("/catalogs/{key}")
async def update_single_catalog(
    key: str,
    payload: CatalogUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin"]))
):
    old_val = await get_config_parameter(db, key)
    await set_config_parameter(
        db,
        key=key,
        value=payload.items,
        scope="system",
        category="catalogs",
        description=f"Catálogo actualizado para {key}"
    )
    await record_event(
        db,
        module="system",
        action="update",
        entity_type="catalog",
        summary=f"Actualización de catálogo: {key}",
        details_before={"items": old_val},
        details_after={"items": payload.items},
        user_id=current_user.id,
        user_name=current_user.username
    )
    await db.commit()
    return {"message": "Catálogo actualizado exitosamente.", "key": key, "items": payload.items}

@router.get("/export")
async def export_system_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"]))
):
    await initialize_default_catalogs(db)
    return await export_sanitized_config(db)

@router.post("/import")
async def import_system_config(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"]))
):
    parameters = payload.get("parameters", {})
    if not isinstance(parameters, dict):
        raise HTTPException(status_code=400, detail="Formato de exportación no válido.")
    
    count = 0
    for key, val in parameters.items():
        # Never allow sensitive keys to be overwritten via generic import
        if "secret" in key.lower() or "password" in key.lower() or "token" in key.lower():
            continue
        await set_config_parameter(db, key=key, value=val, scope="system", category="imported")
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
    return {"message": f"Se importaron {count} parámetros correctamente."}
