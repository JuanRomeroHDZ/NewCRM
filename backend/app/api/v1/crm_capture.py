from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx

from app.database import get_db
from app.services.core_auth import get_current_user_from_token, require_role
from app.security.tokens import require_vault_unlocked
from app.models.core import User
from app.models.crm_capture import LeadCacheCell, LeadAuditScore, LeadDuplicateCandidate, PermanentDiscard
from app.services.crm_capture import CrmCaptureService, OSMProviderError
from app.config import settings

from pydantic import BaseModel, Field, field_validator, model_validator
from app.schemas.validators import validate_single_phone
from app.schemas import validate_nonblank_input

router = APIRouter(prefix="/crm/capture", tags=["CRM Capture"])

class SearchBounds(BaseModel):
    min_lat: float = Field(..., ge=-90, le=90, allow_inf_nan=False)
    min_lon: float = Field(..., ge=-180, le=180, allow_inf_nan=False)
    max_lat: float = Field(..., ge=-90, le=90, allow_inf_nan=False)
    max_lon: float = Field(..., ge=-180, le=180, allow_inf_nan=False)

    @model_validator(mode="after")
    def check_bounds_order(self):
        if self.min_lat >= self.max_lat or self.min_lon >= self.max_lon:
            raise ValueError("El cuadrante geográfico es inválido: min debe ser menor que max.")
        return self


class SearchRequest(BaseModel):
    sector: str = Field(..., min_length=2, max_length=64)
    zone: str = Field(..., min_length=2, max_length=128)
    subsector: str | None = Field(None, max_length=64)
    max_cache_age_days: int = Field(14, ge=1, le=90)
    bbox: SearchBounds | None = None

class AuditRequest(BaseModel):
    target_url: str = Field(..., min_length=4, max_length=512)
    prospect_id: str | None = Field(None, max_length=36)

class MergeRequest(BaseModel):
    primary_id: str = Field(..., min_length=1, max_length=36)
    secondary_id: str = Field(..., min_length=1, max_length=36)

    @model_validator(mode="after")
    def check_distinct_ids(self):
        if self.primary_id.strip() == self.secondary_id.strip():
            raise ValueError("No puedes fusionar un prospecto consigo mismo.")
        return self

class DiscardRequest(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=180)
    reason: str = Field(..., min_length=2, max_length=255)
    domain: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=32)

    _valid_text = field_validator("company_name", "reason")(validate_nonblank_input)
    _valid_phone = field_validator("phone")(validate_single_phone)

class GoogleEstimateRequest(BaseModel):
    query_count: int = Field(..., ge=1, le=1000)
    field_mask: list[str] = Field(default_factory=list, max_length=50)

@router.get("/zones")
async def get_zones(_: bool = Depends(require_vault_unlocked)):
    return {"zones": CrmCaptureService.get_tijuana_zones()}


@router.get("/map-config")
async def get_map_config(_: bool = Depends(require_vault_unlocked)):
    return {
        "tile_url_template": settings.OSM_TILE_URL_TEMPLATE,
        "center": [settings.MAP_DEFAULT_CENTER_LAT, settings.MAP_DEFAULT_CENTER_LON],
        "zoom": settings.MAP_DEFAULT_ZOOM,
        "default_city": settings.MAP_DEFAULT_CITY,
        "default_zone": settings.MAP_DEFAULT_ZONE_SLUG,
        "default_sector": settings.MAP_DEFAULT_SECTOR,
        "attribution": settings.MAP_ATTRIBUTION_HTML,
    }

@router.post("/search")
async def search_leads(
    req: SearchRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_vault_unlocked)
):
    try:
        result = await CrmCaptureService.search_osm_leads(
            session=db,
            sector=req.sector,
            zone=req.zone,
            subsector=req.subsector,
            max_cache_age_days=req.max_cache_age_days,
            custom_bbox=req.bbox.model_dump() if req.bbox else None,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except OSMProviderError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="OpenStreetMap tardó demasiado en responder.")
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="No se pudo conectar con OpenStreetMap.")

@router.post("/audit-url")
async def audit_website(
    req: AuditRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin", "seller", "operator"]))
):
    try:
        audit = await CrmCaptureService.audit_website(
            session=db,
            target_url=req.target_url,
            prospect_id=req.prospect_id
        )
        return {
            "id": audit.id,
            "target_url": audit.target_url,
            "http_status": audit.http_status,
            "is_https": audit.is_https,
            "has_mobile_viewport": audit.has_mobile_viewport,
            "has_privacy_policy": audit.has_privacy_policy,
            "detected_cms": audit.detected_cms,
            "copyright_year": audit.copyright_year,
            "design_score": audit.design_score,
            "pentest_score": audit.pentest_score,
            "error_message": audit.error_message,
            "audited_at": audit.audited_at.isoformat()
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en auditoria: {str(e)}")

@router.get("/duplicates")
async def get_duplicate_candidates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    stmt = select(LeadDuplicateCandidate).where(LeadDuplicateCandidate.status == "pending")
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/merge")
async def merge_candidates(
    req: MergeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin", "seller", "operator"]))
):
    try:
        cand = await CrmCaptureService.merge_prospects(
            session=db,
            primary_id=req.primary_id,
            secondary_id=req.secondary_id,
            user_id=current_user.id
        )
        return {
            "candidate_id": cand.id,
            "status": cand.status,
            "message": "Prospectos fusionados exitosamente. Puede revertir con el ID de la operacion."
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/undo-merge/{candidate_id}")
async def undo_merge(
    candidate_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin", "seller", "operator"]))
):
    try:
        await CrmCaptureService.undo_merge(session=db, candidate_id=candidate_id, user_id=current_user.id)
        return {"status": "undone", "message": "Fusion revertida exitosamente a sus estados individuales."}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/discards")
async def get_discards(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    stmt = select(PermanentDiscard).order_by(PermanentDiscard.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/discard")
async def add_discard(
    req: DiscardRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin", "seller", "operator"]))
):
    discard = await CrmCaptureService.add_permanent_discard(
        session=db,
        company_name=req.company_name,
        reason=req.reason,
        domain=req.domain,
        phone=req.phone
    )
    return {
        "id": discard.id,
        "company_name": discard.company_name,
        "reason": discard.reason,
        "created_at": discard.created_at.isoformat()
    }

@router.get("/google-places/status")
async def google_places_status(current_user: User = Depends(get_current_user_from_token)):
    return CrmCaptureService.get_google_places_status()

@router.post("/google-places/estimate")
async def google_places_estimate(
    req: GoogleEstimateRequest,
    current_user: User = Depends(require_role(["owner", "business_admin", "seller", "operator"]))
):
    return CrmCaptureService.estimate_google_places_cost(
        query_count=req.query_count,
        field_mask=req.field_mask
    )
