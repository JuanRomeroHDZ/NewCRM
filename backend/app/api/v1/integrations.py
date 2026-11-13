from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.core_auth import get_current_user_from_token, require_role
from app.models.core import User
from app.config import settings
from app.services.cloud_lease import CloudLeaseService

router = APIRouter(prefix="/integrations", tags=["Integrations & Real World Tests"])


class LeaseAcquireRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    resource_name: Literal["cloud_backup_google_drive"] = "cloud_backup_google_drive"
    duration_seconds: int = Field(300, ge=30, le=86400)


class LeaseReleaseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    resource_name: Literal["cloud_backup_google_drive"] = "cloud_backup_google_drive"


@router.get("/status")
async def get_all_integrations_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    return await CloudLeaseService.test_all_integrations(session=db, server_name=settings.SERVER_NAME)


@router.post("/cloud-lease/acquire")
async def acquire_cloud_lease(
    req: LeaseAcquireRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin", "operator"]))
):
    try:
        lease = await CloudLeaseService.acquire_lease(
            session=db,
            resource_name=req.resource_name,
            server_name=settings.SERVER_NAME,
            duration_seconds=req.duration_seconds
        )
        return {
            "resource_name": lease.resource_name,
            "server_name": lease.server_name,
            "acquired_at": lease.acquired_at.isoformat(),
            "expires_at": lease.expires_at.isoformat(),
            "is_active": lease.is_active
        }
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/cloud-lease/release")
async def release_cloud_lease(
    req: LeaseReleaseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin", "operator"]))
):
    released = await CloudLeaseService.release_lease(
        session=db,
        resource_name=req.resource_name,
        server_name=settings.SERVER_NAME
    )
    return {"released": released, "resource_name": req.resource_name, "server_name": settings.SERVER_NAME}


@router.get("/map-tiles")
async def get_map_tiles_status(current_user: User = Depends(get_current_user_from_token)):
    return CloudLeaseService.check_baja_california_tiles()
