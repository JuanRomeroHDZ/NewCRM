from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.security.tokens import require_vault_unlocked
from app.services.core_auth import ADMIN_ROLES, require_role
from app.services.activity_service import get_activity_feed, get_audit_trail

router = APIRouter(prefix="/activity", tags=["activity"], dependencies=[
    Depends(require_vault_unlocked), Depends(require_role(ADMIN_ROLES)),
])

@router.get("/feed")
async def activity_feed_endpoint(
    module: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """User-friendly activity feed with redacted, easy-to-read events."""
    return await get_activity_feed(db, module=module, limit=limit, offset=offset)

@router.get("/audit")
async def audit_trail_endpoint(
    module: str | None = None,
    entity_type: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Administrator immutable audit trail with before and after state diffs."""
    return await get_audit_trail(db, module=module, entity_type=entity_type, limit=limit, offset=offset)
