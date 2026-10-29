from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.database import get_db
from app.services.core_auth import get_current_user_from_token
from app.models.core import User
from app.models.agenda import AgendaEvent, OperationTask, ClientAsset, PentestEngagement, PentestFinding
from app.services.agenda_service import AgendaService

router = APIRouter(prefix="/agenda", tags=["Agenda & Operations"])

class EventCreateRequest(BaseModel):
    event_type: str = Field(..., min_length=2, max_length=64)
    title: str = Field(..., min_length=2, max_length=180)
    start_time: datetime
    end_time: datetime
    description: str | None = None
    location: str | None = None
    client_id: str | None = None
    prospect_id: str | None = None
    sale_id: str | None = None
    recurrence_interval_days: int | None = Field(None, ge=1, le=365)

class PentestEngagementCreate(BaseModel):
    client_id: str
    title: str = Field(..., min_length=2, max_length=180)
    scope_written_summary: str = Field(..., min_length=10)
    authorized_targets: str = Field(..., min_length=3)
    window_start: datetime
    window_end: datetime

class PentestFindingCreate(BaseModel):
    engagement_id: str
    title: str = Field(..., min_length=2, max_length=180)
    severity: str = Field("media", pattern="^(informativa|baja|media|alta|critica)$")
    description: str = Field(..., min_length=5)
    remediation: str = Field(..., min_length=5)
    cvss_score: float | None = Field(None, ge=0.0, le=10.0)

@router.get("/events")
async def list_events(
    event_type: str | None = None,
    include_financial: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    stmt = select(AgendaEvent).order_by(AgendaEvent.start_time.asc())
    if event_type:
        stmt = stmt.where(AgendaEvent.event_type == event_type)
    if not include_financial:
        stmt = stmt.where(AgendaEvent.is_financial == False)

    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/events")
async def create_event(
    req: EventCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    try:
        event, overlaps = await AgendaService.create_event(
            session=db,
            user_id=current_user.id,
            event_type=req.event_type,
            title=req.title,
            start_time=req.start_time,
            end_time=req.end_time,
            description=req.description,
            location=req.location,
            client_id=req.client_id,
            prospect_id=req.prospect_id,
            sale_id=req.sale_id,
            recurrence_interval_days=req.recurrence_interval_days
        )
        return {
            "event": event,
            "has_overlaps": len(overlaps) > 0,
            "overlapping_event_ids": [o.id for o in overlaps]
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/events/{event_id}/complete")
async def complete_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    try:
        event, next_event = await AgendaService.complete_event(
            session=db,
            event_id=event_id,
            user_id=current_user.id
        )
        return {
            "completed_event_id": event.id,
            "status": event.status,
            "next_scheduled_event_id": next_event.id if next_event else None
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/availability")
async def get_availability(
    target_date: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    duration_minutes: int = 60,
    buffer_minutes: int = 15,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    return await AgendaService.calculate_availability(
        session=db,
        target_date=target_date,
        duration_minutes=duration_minutes,
        buffer_minutes=buffer_minutes
    )

@router.get("/export/ics")
async def export_ics(
    include_financial: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    ics_text = await AgendaService.export_events_to_ics(session=db, include_financial=include_financial)
    return Response(content=ics_text, media_type="text/calendar", headers={"Content-Disposition": "attachment; filename=agenda_contact_lessso.ics"})

@router.get("/google-calendar/status")
async def google_calendar_status(current_user: User = Depends(get_current_user_from_token)):
    return AgendaService.get_google_calendar_status()

# Pentesting
@router.post("/pentest/engagements")
async def create_pentest_engagement(
    req: PentestEngagementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    if req.window_end <= req.window_start:
        raise HTTPException(status_code=400, detail="La fecha de término de la ventana debe ser posterior al inicio.")

    eng = PentestEngagement(
        client_id=req.client_id,
        title=req.title,
        scope_written_summary=req.scope_written_summary,
        authorized_targets=req.authorized_targets,
        window_start=req.window_start,
        window_end=req.window_end,
        status="autorizado"
    )
    db.add(eng)
    await db.commit()
    await db.refresh(eng)
    return eng

@router.post("/pentest/findings")
async def record_pentest_finding(
    req: PentestFindingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    try:
        finding = await AgendaService.record_pentest_finding(
            session=db,
            engagement_id=req.engagement_id,
            title=req.title,
            severity=req.severity,
            description=req.description,
            remediation=req.remediation,
            user_id=current_user.id,
            cvss_score=req.cvss_score
        )
        return finding
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
