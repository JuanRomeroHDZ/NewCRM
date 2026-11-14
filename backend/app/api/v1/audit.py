from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy import select, func, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import AuditLog
from app.security.tokens import verify_vault_token

router = APIRouter(prefix="/audit", tags=["audit"])

def require_vault_unlocked(x_vault_token: str | None = Header(None)):
    if not verify_vault_token(x_vault_token):
        raise HTTPException(
            status_code=401,
            detail="El espacio seguro está bloqueado. Ingrese su contraseña de acceso para acceder a los registros de auditoría."
        )
    return True

@router.get("/logs")
async def get_audit_logs(
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    action: str | None = Query(None, max_length=32),
    entity_type: str | None = Query(None, max_length=32),
    search: str | None = Query(None, max_length=120),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_vault_unlocked)
):
    conditions = []

    if action:
        conditions.append(AuditLog.action == action)
    if entity_type:
        conditions.append(AuditLog.entity_type == entity_type)

    search_value = (search or "").strip().lower()
    if search_value:
        escaped_search = search_value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        search_filter = or_(
            func.lower(AuditLog.action).like(f"%{escaped_search}%", escape="\\"),
            func.lower(AuditLog.entity_type).like(f"%{escaped_search}%", escape="\\"),
            func.lower(AuditLog.entity_name).like(f"%{escaped_search}%", escape="\\"),
        )
        conditions.append(search_filter)

    total_res = await db.execute(select(func.count(AuditLog.id)).where(*conditions))
    total_count = total_res.scalar_one()

    res = await db.execute(
        select(
            AuditLog.id,
            AuditLog.timestamp,
            AuditLog.action,
            AuditLog.entity_type,
            AuditLog.entity_id,
            AuditLog.entity_name,
            AuditLog.details,
            AuditLog.ip_address,
        ).where(*conditions)
        .order_by(desc(AuditLog.timestamp), desc(AuditLog.id))
        .offset(offset)
        .limit(limit)
    )
    logs = res.mappings().all()

    return {
        "total": total_count,
        "offset": offset,
        "limit": limit,
        "items": [
            {
                "id": log["id"],
                "timestamp": log["timestamp"].isoformat(),
                "action": log["action"],
                "entity_type": log["entity_type"],
                "entity_id": log["entity_id"],
                "entity_name": log["entity_name"],
                "details": log["details"],
                "ip_address": log["ip_address"]
            }
            for log in logs
        ]
    }
