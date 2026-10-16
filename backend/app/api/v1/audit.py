from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import AuditLog
from app.security.tokens import verify_vault_token

router = APIRouter(prefix="/audit", tags=["audit"])

def require_vault_unlocked(x_vault_token: str | None = Header(None)):
    if not verify_vault_token(x_vault_token):
        raise HTTPException(
            status_code=401,
            detail="Bóveda cifrada bloqueada. Ingrese su contraseña maestra para acceder a los registros de auditoría."
        )
    return True

@router.get("/logs")
async def get_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    action: str | None = Query(None),
    entity_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_vault_unlocked)
):
    stmt = select(AuditLog)
    count_stmt = select(func.count(AuditLog.id))

    if action:
        stmt = stmt.where(AuditLog.action == action)
        count_stmt = count_stmt.where(AuditLog.action == action)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
        count_stmt = count_stmt.where(AuditLog.entity_type == entity_type)

    stmt = stmt.order_by(desc(AuditLog.timestamp)).offset(offset).limit(limit)

    total_res = await db.execute(count_stmt)
    total_count = total_res.scalar_one()

    res = await db.execute(stmt)
    logs = res.scalars().all()

    return {
        "total": total_count,
        "offset": offset,
        "limit": limit,
        "items": [
            {
                "id": log.id,
                "timestamp": log.timestamp.isoformat(),
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
                "entity_name": log.entity_name,
                "details": log.details,
                "ip_address": log.ip_address
            }
            for log in logs
        ]
    }
