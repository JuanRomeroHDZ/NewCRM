from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.services.core_auth import get_current_user_from_token
from app.models.core import User
from app.models.crm_capture import LeadCacheCell, LeadAuditScore, LeadDuplicateCandidate, PermanentDiscard
from app.services.crm_capture import CrmCaptureService

router = APIRouter(prefix="/crm/capture", tags=["CRM Capture"])

class SearchRequest(BaseModel):
    sector: str = Field(..., min_length=2, max_length=64)
    zone: str = Field(..., min_length=2, max_length=128)
    subsector: str | None = Field(None, max_length=64)
    max_cache_age_days: int = Field(14, ge=1, le=90)

class AuditRequest(BaseModel):
    target_url: str = Field(..., min_length=4, max_length=512)
    prospect_id: str | None = None

class MergeRequest(BaseModel):
    primary_id: str
    secondary_id: str

class DiscardRequest(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=180)
    reason: str = Field(..., min_length=2, max_length=255)
    domain: str | None = None
    phone: str | None = None

class GoogleEstimateRequest(BaseModel):
    query_count: int = Field(..., ge=1, le=1000)
    field_mask: list[str] = Field(default_factory=list)

@router.get("/zones")
async def get_zones(current_user: User = Depends(get_current_user_from_token)):
    return {"zones": CrmCaptureService.get_tijuana_zones()}

@router.post("/search")
async def search_leads(
    req: SearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    try:
        result = await CrmCaptureService.search_osm_leads(
            session=db,
            sector=req.sector,
            zone=req.zone,
            subsector=req.subsector,
            max_cache_age_days=req.max_cache_age_days
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/audit-url")
async def audit_website(
    req: AuditRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
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
    current_user: User = Depends(get_current_user_from_token)
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
    current_user: User = Depends(get_current_user_from_token)
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
    current_user: User = Depends(get_current_user_from_token)
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
    current_user: User = Depends(get_current_user_from_token)
):
    return CrmCaptureService.estimate_google_places_cost(
        query_count=req.query_count,
        field_mask=req.field_mask
    )
