import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import Prospect, EmailAccount
from app.schemas import ProspectCreate, ProspectUpdate, ProspectResponse, TagItem
from app.services.audit import log_audit_event

router = APIRouter(prefix="/prospects", tags=["prospects"])

def parse_json_safely(val: str | None, default_val=None):
    if not val:
        return default_val if default_val is not None else []
    try:
        return json.loads(val)
    except Exception:
        return default_val if default_val is not None else []

def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def to_naive_utc(dt: datetime | None) -> datetime | None:
    utc_dt = ensure_utc(dt)
    return utc_dt.replace(tzinfo=None) if utc_dt is not None else None

def parse_iso_datetime(val: str | None) -> datetime | None:
    if not val:
        return None
    try:
        cleaned = val.strip()
        if cleaned.endswith("Z"):
            cleaned = cleaned[:-1] + "+00:00"
        dt = datetime.fromisoformat(cleaned)
        return ensure_utc(dt)
    except Exception:
        return None

def compute_sla_metrics(p: Prospect) -> tuple[int, int, str, bool | None]:
    """
    Returns (elapsed_seconds, sla_seconds, sla_status, met_sla)
    sla_status values:
      - 'cumplido': Client responded within the stipulated SLA limit
      - 'en_tiempo': Still waiting and within the stipulated SLA limit
      - 'vencido': Time expired without response (or responded after SLA limit)
    """
    now = datetime.now(timezone.utc)
    started = ensure_utc(p.started_at) or ensure_utc(p.created_at) or now
    sla_seconds = max(60, int((p.sla_hours or 48.0) * 3600))

    if p.responded_at is not None or p.status == "respondido":
        responded = ensure_utc(p.responded_at)
        if p.response_time_seconds is not None:
            elapsed = max(0, int(p.response_time_seconds))
        elif responded is not None:
            elapsed = max(0, int((responded - started).total_seconds()))
        else:
            elapsed = max(0, int((now - started).total_seconds()))

        met = p.met_sla if p.met_sla is not None else (elapsed <= sla_seconds)
        sla_status = "cumplido" if met else "vencido"
        return elapsed, sla_seconds, sla_status, met

    elapsed = max(0, int((now - started).total_seconds()))
    if p.status == "tiempo_agotado" or elapsed > sla_seconds:
        return elapsed, sla_seconds, "vencido", None
    return elapsed, sla_seconds, "en_tiempo", None

def build_prospect_response(
    p: Prospect,
    email_map: dict[str, tuple[str, str]]
) -> ProspectResponse:
    tags_raw = parse_json_safely(p.tags, [])
    tags = [TagItem(**t) if isinstance(t, dict) else TagItem(name=str(t)) for t in tags_raw]

    elapsed_seconds, sla_seconds, sla_status, met_sla = compute_sla_metrics(p)
    email_info = email_map.get(p.email_id) if p.email_id else None

    started_utc = ensure_utc(p.started_at) or ensure_utc(p.created_at)
    responded_utc = ensure_utc(p.responded_at)

    # Auto-reflect status if timer expired and status is still demo_creada or primer_contacto
    effective_status = p.status
    if sla_status == "vencido" and p.responded_at is None and p.status in ("demo_creada", "primer_contacto"):
        effective_status = p.status  # Keep workflow state while sla_status badge alerts 'vencido'

    return ProspectResponse(
        id=p.id,
        company_name=p.company_name,
        contact_name=p.contact_name,
        contact_email=p.contact_email,
        email_id=p.email_id,
        email_address=email_info[0] if email_info else None,
        email_provider=email_info[1] if email_info else None,
        specific_alias=p.specific_alias,
        workflow_type=p.workflow_type or "demo_first",
        status=effective_status,
        demo_url=p.demo_url,
        whatsapp=p.whatsapp,
        phones=p.phones,
        maps_url=p.maps_url,
        social_links=p.social_links,
        notes=p.notes,
        tags=tags,
        started_at=started_utc.isoformat() if started_utc else None,
        sla_hours=p.sla_hours or 48.0,
        responded_at=responded_utc.isoformat() if responded_utc else None,
        response_time_seconds=p.response_time_seconds if p.response_time_seconds is not None else (elapsed_seconds if p.responded_at else None),
        met_sla=met_sla,
        elapsed_seconds=elapsed_seconds,
        sla_seconds=sla_seconds,
        sla_status=sla_status,
        is_deleted=p.is_deleted,
        created_at=ensure_utc(p.created_at).isoformat() if p.created_at else None,
        updated_at=ensure_utc(p.updated_at).isoformat() if p.updated_at else None
    )

@router.get("", response_model=list[ProspectResponse])
async def list_prospects(
    email_id: str | None = None,
    status: str | None = None,
    workflow_type: str | None = None,
    sla_status: str | None = None,
    search: str | None = None,
    tag: str | None = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Prospect).where(Prospect.is_deleted == False)
    if email_id:
        stmt = stmt.where(Prospect.email_id == email_id)
    if status:
        stmt = stmt.where(Prospect.status == status)
    if workflow_type:
        stmt = stmt.where(Prospect.workflow_type == workflow_type)
    if search:
        q = f"%{search}%"
        stmt = stmt.where(
            Prospect.company_name.ilike(q)
            | Prospect.contact_name.ilike(q)
            | Prospect.contact_email.ilike(q)
            | Prospect.demo_url.ilike(q)
            | Prospect.whatsapp.ilike(q)
            | Prospect.phones.ilike(q)
        )

    stmt = stmt.order_by(Prospect.created_at.desc())
    res = await db.execute(stmt)
    prospects = res.scalars().all()

    email_res = await db.execute(select(EmailAccount.id, EmailAccount.address, EmailAccount.provider))
    email_map = {row[0]: (row[1], row[2]) for row in email_res.all()}

    output: list[ProspectResponse] = []
    for p in prospects:
        item = build_prospect_response(p, email_map)
        if tag and not any(t.name.lower() == tag.lower() for t in item.tags):
            continue
        if sla_status and item.sla_status != sla_status:
            continue
        output.append(item)

    return output

@router.get("/{prospect_id}", response_model=ProspectResponse)
async def get_prospect_detail(
    prospect_id: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Prospect).where(Prospect.id == prospect_id, Prospect.is_deleted == False)
    p = (await db.execute(stmt)).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado.")

    email_map = {}
    if p.email_id:
        e_stmt = select(EmailAccount.id, EmailAccount.address, EmailAccount.provider).where(EmailAccount.id == p.email_id)
        row = (await db.execute(e_stmt)).first()
        if row:
            email_map[row[0]] = (row[1], row[2])

    return build_prospect_response(p, email_map)

@router.post("", response_model=ProspectResponse)
async def create_prospect(
    payload: ProspectCreate,
    db: AsyncSession = Depends(get_db)
):
    clean_email_id = payload.email_id if payload.email_id and payload.email_id.strip() != "" else None
    if clean_email_id:
        e_stmt = select(EmailAccount).where(EmailAccount.id == clean_email_id, EmailAccount.is_deleted == False)
        if not (await db.execute(e_stmt)).scalar_one_or_none():
            raise HTTPException(status_code=400, detail="El correo raíz seleccionado no existe o está en la papelera.")

    now = datetime.now(timezone.utc)
    started_dt = parse_iso_datetime(payload.started_at) or now
    sla_hours = max(0.1, float(payload.sla_hours or 48.0))

    responded_dt = None
    response_secs = None
    met_sla = None
    if payload.status == "respondido":
        responded_dt = now
        response_secs = max(0, int((responded_dt - started_dt).total_seconds()))
        met_sla = response_secs <= int(sla_hours * 3600)

    prospect = Prospect(
        company_name=payload.company_name.strip(),
        contact_name=payload.contact_name.strip() if payload.contact_name else None,
        contact_email=payload.contact_email.strip() if payload.contact_email else None,
        email_id=clean_email_id,
        specific_alias=payload.specific_alias or None,
        workflow_type=payload.workflow_type or "demo_first",
        status=payload.status or ("demo_creada" if payload.workflow_type == "demo_first" else "en_cotizacion"),
        demo_url=payload.demo_url.strip() if payload.demo_url else None,
        whatsapp=payload.whatsapp.strip() if payload.whatsapp else None,
        phones=payload.phones.strip() if payload.phones else None,
        maps_url=payload.maps_url.strip() if payload.maps_url else None,
        social_links=payload.social_links.strip() if payload.social_links else None,
        notes=payload.notes.strip() if payload.notes else None,
        tags=json.dumps([t.model_dump() for t in payload.tags]),
        started_at=to_naive_utc(started_dt),
        sla_hours=sla_hours,
        responded_at=to_naive_utc(responded_dt),
        response_time_seconds=response_secs,
        met_sla=met_sla
    )
    db.add(prospect)
    await db.flush()

    await log_audit_event(
        db,
        action="create",
        entity_type="prospect",
        entity_id=prospect.id,
        entity_name=prospect.company_name,
        details=f"Prospecto / Demo '{prospect.company_name}' registrado con SLA de {sla_hours:g}h"
    )
    await db.commit()
    return await get_prospect_detail(prospect.id, db=db)

@router.put("/{prospect_id}", response_model=ProspectResponse)
async def update_prospect(
    prospect_id: str,
    payload: ProspectUpdate,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Prospect).where(Prospect.id == prospect_id, Prospect.is_deleted == False)
    p = (await db.execute(stmt)).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado.")

    if payload.company_name is not None:
        p.company_name = payload.company_name.strip()
    if payload.contact_name is not None:
        p.contact_name = payload.contact_name.strip() if payload.contact_name else None
    if payload.contact_email is not None:
        p.contact_email = payload.contact_email.strip() if payload.contact_email else None
    if payload.email_id is not None:
        p.email_id = payload.email_id if payload.email_id != "" else None
    if payload.specific_alias is not None:
        p.specific_alias = payload.specific_alias if payload.specific_alias != "" else None
    if payload.workflow_type is not None:
        p.workflow_type = payload.workflow_type
    if payload.demo_url is not None:
        p.demo_url = payload.demo_url.strip() if payload.demo_url else None
    if payload.whatsapp is not None:
        p.whatsapp = payload.whatsapp.strip() if payload.whatsapp else None
    if payload.phones is not None:
        p.phones = payload.phones.strip() if payload.phones else None
    if payload.maps_url is not None:
        p.maps_url = payload.maps_url.strip() if payload.maps_url else None
    if payload.social_links is not None:
        p.social_links = payload.social_links.strip() if payload.social_links else None
    if payload.notes is not None:
        p.notes = payload.notes.strip() if payload.notes else None
    if payload.tags is not None:
        p.tags = json.dumps([t.model_dump() for t in payload.tags])

    if payload.started_at is not None:
        parsed_start = parse_iso_datetime(payload.started_at)
        if parsed_start:
            p.started_at = to_naive_utc(parsed_start)

    if payload.sla_hours is not None:
        p.sla_hours = max(0.1, float(payload.sla_hours))
        # Recalculate met_sla if already responded
        if p.responded_at is not None and p.response_time_seconds is not None:
            p.met_sla = p.response_time_seconds <= int(p.sla_hours * 3600)

    if payload.status is not None:
        old_status = p.status
        p.status = payload.status
        # If transitioning to 'respondido' and not yet marked responded_at, calculate automatically
        if payload.status == "respondido" and p.responded_at is None:
            now = datetime.now(timezone.utc)
            started_utc = ensure_utc(p.started_at) or now
            elapsed = max(0, int((now - started_utc).total_seconds()))
            p.responded_at = to_naive_utc(now)
            p.response_time_seconds = elapsed
            p.met_sla = elapsed <= int((p.sla_hours or 48.0) * 3600)
        elif old_status == "respondido" and payload.status != "respondido":
            # Re-opened workflow state
            p.responded_at = None
            p.response_time_seconds = None
            p.met_sla = None

    await log_audit_event(
        db,
        action="update",
        entity_type="prospect",
        entity_id=p.id,
        entity_name=p.company_name,
        details=f"Actualización de ficha de prospecto '{p.company_name}' (Estado: {p.status})"
    )
    await db.commit()
    return await get_prospect_detail(p.id, db=db)

@router.post("/{prospect_id}/respond", response_model=ProspectResponse)
async def mark_prospect_responded(
    prospect_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Quick action to mark that the client has responded ('Ya respondió').
    Stops the SLA timer, records responded_at and response_time_seconds,
    and computes whether the response was within the stipulated SLA limit.
    """
    stmt = select(Prospect).where(Prospect.id == prospect_id, Prospect.is_deleted == False)
    p = (await db.execute(stmt)).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado.")

    now = datetime.now(timezone.utc)
    started_utc = ensure_utc(p.started_at) or ensure_utc(p.created_at) or now
    elapsed = max(0, int((now - started_utc).total_seconds()))
    sla_seconds = max(60, int((p.sla_hours or 48.0) * 3600))
    met = elapsed <= sla_seconds

    p.responded_at = to_naive_utc(now)
    p.response_time_seconds = elapsed
    p.met_sla = met
    p.status = "respondido"

    hours = elapsed // 3600
    mins = (elapsed % 3600) // 60
    sla_verdict = "DENTRO del SLA (Cumplido)" if met else "FUERA del SLA (Vencido)"

    await log_audit_event(
        db,
        action="update",
        entity_type="prospect",
        entity_id=p.id,
        entity_name=p.company_name,
        details=f"Cliente '{p.company_name}' respondió en {hours}h {mins}m — {sla_verdict}"
    )
    await db.commit()
    return await get_prospect_detail(p.id, db=db)

@router.post("/{prospect_id}/reset-timer", response_model=ProspectResponse)
async def reset_prospect_timer(
    prospect_id: str,
    restart_from_now: bool = Query(True),
    db: AsyncSession = Depends(get_db)
):
    """Resets or reopens the response SLA timer for a prospect."""
    stmt = select(Prospect).where(Prospect.id == prospect_id, Prospect.is_deleted == False)
    p = (await db.execute(stmt)).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado.")

    if restart_from_now:
        p.started_at = to_naive_utc(datetime.now(timezone.utc))
    p.responded_at = None
    p.response_time_seconds = None
    p.met_sla = None
    if p.status in ("respondido", "tiempo_agotado"):
        p.status = "primer_contacto" if p.workflow_type == "demo_first" else "en_cotizacion"

    await log_audit_event(
        db,
        action="update",
        entity_type="prospect",
        entity_id=p.id,
        entity_name=p.company_name,
        details=f"Contador SLA reiniciado para '{p.company_name}'"
    )
    await db.commit()
    return await get_prospect_detail(p.id, db=db)

@router.delete("/{prospect_id}")
async def delete_prospect_soft(
    prospect_id: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Prospect).where(Prospect.id == prospect_id, Prospect.is_deleted == False)
    p = (await db.execute(stmt)).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado.")

    p.is_deleted = True
    await log_audit_event(
        db,
        action="delete",
        entity_type="prospect",
        entity_id=p.id,
        entity_name=p.company_name,
        details=f"Prospecto '{p.company_name}' enviado a la papelera"
    )
    await db.commit()
    return {"message": f"Prospecto {p.company_name} enviado a la papelera con éxito."}
