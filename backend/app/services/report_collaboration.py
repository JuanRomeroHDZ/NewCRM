"""Shared report ACL helpers used by HTTP, review, and websocket endpoints."""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import User
from app.database import set_report_actor
from app.models.reports import ReportCanvas, ReportDocument
from app.models.report_collaboration import ReportCollaborator


RESOURCE_MODELS = {
    "document": ReportDocument,
    "canvas": ReportCanvas,
}
ADMIN_ROLES = {"owner", "business_admin"}


async def get_resource(db: AsyncSession, resource_type: str, resource_id: str):
    model = RESOURCE_MODELS.get(resource_type)
    if model is None:
        raise HTTPException(status_code=404, detail="Recurso de reporte no encontrado.")
    resource = await db.scalar(
        select(model).where(model.id == resource_id, model.is_deleted.is_(False))
    )
    if resource is None:
        raise HTTPException(status_code=404, detail="Recurso de reporte no encontrado.")
    return resource


async def get_permission(
    db: AsyncSession,
    resource_type: str,
    resource_id: str,
    user: User,
) -> str | None:
    await set_report_actor(db, user)
    resource = await get_resource(db, resource_type, resource_id)
    if user.role in ADMIN_ROLES or resource.created_by_id == user.id:
        return "owner"
    return await db.scalar(
        select(ReportCollaborator.permission).where(
            ReportCollaborator.resource_type == resource_type,
            ReportCollaborator.resource_id == resource_id,
            ReportCollaborator.user_id == user.id,
        )
    )


async def require_resource_permission(
    db: AsyncSession,
    resource_type: str,
    resource_id: str,
    user: User,
    capability: str = "view",
):
    await set_report_actor(db, user)
    resource = await get_resource(db, resource_type, resource_id)
    permission = await get_permission(db, resource_type, resource_id, user)
    allowed = {
        "view": {"owner", "editor", "reviewer", "viewer"},
        "edit": {"owner", "editor"},
        "comment": {"owner", "editor", "reviewer", "viewer"},
        "manage": {"owner"},
    }.get(capability)
    if allowed is None:
        raise ValueError(f"Unsupported report capability: {capability}")
    if permission not in allowed:
        # Avoid disclosing whether an unshared document exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurso de reporte no encontrado.")
    return resource, permission


async def can_view_resource(db: AsyncSession, resource_type: str, resource_id: str, user: User) -> bool:
    try:
        await require_resource_permission(db, resource_type, resource_id, user, "view")
        return True
    except HTTPException as exc:
        if exc.status_code == 404:
            return False
        raise
