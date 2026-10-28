import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import Prospect, EmailAccount
from app.schemas import ProspectCreate, ProspectUpdate, ProspectResponse, ProspectContactAttemptRequest, TagItem
from app.security.crypto import encrypt_note, decrypt_note
from app.security.tokens import require_vault_unlocked
from app.services.audit import log_audit_event

router = APIRouter(prefix="/prospects", tags=["prospects"], dependencies=[Depends(require_vault_unlocked)])

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

def compute_followup_metrics(p: Prospect) -> tuple[int, int, int, str]:
    """
    Computes the secondary follow-up cadence timer:
    Returns (followup_elapsed_seconds, followup_sla_seconds, followup_remaining_seconds, followup_status)
    followup_status values:
      - 'completado': Prospect already responded
      - 'sin_iniciar': No follow-up contact attempt recorded yet
      - 'en_tiempo': Within current follow-up SLA window
      - 'vencido': Current follow-up SLA window expired without response
    """
    now = datetime.now(timezone.utc)
    f_sla_hours = float(getattr(p, "followup_sla_hours", 48.0) or 48.0)
    f_sla_seconds = max(60, int(f_sla_hours * 3600))

    if p.responded_at is not None or p.status == "respondido":
        return 0, f_sla_seconds, 0, "completado"

    last_contact = ensure_utc(getattr(p, "last_contacted_at", None))
    if last_contact is None:
        return 0, f_sla_seconds, f_sla_seconds, "sin_iniciar"

    f_elapsed = max(0, int((now - last_contact).total_seconds()))
    f_remaining = max(0, f_sla_seconds - f_elapsed)
    f_status = "vencido" if f_elapsed > f_sla_seconds else "en_tiempo"
    return f_elapsed, f_sla_seconds, f_remaining, f_status

async def evaluate_auto_archive_cold_prospects(prospects: list[Prospect], db: AsyncSession) -> bool:
    """
    Automatically transitions unresponded prospects to 'archivado_frio' if they reached
    max_followup_attempts and their latest SLA window has expired.
    """
    mutated = False
    for p in prospects:
        if p.responded_at is not None or p.status in ("respondido", "archivado_frio"):
            continue
        max_attempts = int(getattr(p, "max_followup_attempts", 3) or 3)
        followup_count = int(getattr(p, "followup_count", 0) or 0)
        if followup_count >= max_attempts:
            _, _, sla_status, _ = compute_sla_metrics(p)
            _, _, _, f_status = compute_followup_metrics(p)
            last_contact = getattr(p, "last_contacted_at", None)
            is_expired = (f_status == "vencido") if last_contact is not None else (sla_status == "vencido")
            if is_expired:
                p.status = "archivado_frio"
                mutated = True
                await log_audit_event(
                    db,
                    action="auto_archive",
                    entity_type="prospect",
                    entity_id=p.id,
                    entity_name=p.company_name,
                    details=f"Prospecto '{p.company_name}' movido automáticamente a Archivado / Frío tras {followup_count}/{max_attempts} seguimientos sin respuesta y vencimiento de SLA"
                )
    if mutated:
        await db.commit()
    return mutated

def build_prospect_response(
    p: Prospect,
    email_map: dict[str, tuple[str, str]]
) -> ProspectResponse:
    tags_raw = parse_json_safely(p.tags, [])
    tags = [TagItem(**t) if isinstance(t, dict) else TagItem(name=str(t)) for t in tags_raw]

    elapsed_seconds, sla_seconds, sla_status, met_sla = compute_sla_metrics(p)
    f_elapsed, f_sla_seconds, f_remaining, f_status = compute_followup_metrics(p)
    email_info = email_map.get(p.email_id) if p.email_id else None

    started_utc = ensure_utc(p.started_at) or ensure_utc(p.created_at)
    responded_utc = ensure_utc(p.responded_at)
    last_contact_utc = ensure_utc(getattr(p, "last_contacted_at", None))
    followup_count = int(getattr(p, "followup_count", 0) or 0)
    last_channel = getattr(p, "last_contact_channel", None)
    followup_sla_hours = float(getattr(p, "followup_sla_hours", 48.0) or 48.0)
    max_attempts = int(getattr(p, "max_followup_attempts", 3) or 3)
    estimated_value = float(getattr(p, "estimated_value", 0.0) or 0.0)
    currency = getattr(p, "currency", "MXN") or "MXN"
    billing_type = getattr(p, "billing_type", "one_time") or "one_time"

    effective_status = p.status
    unresponded_active = (
        p.responded_at is None
        and effective_status not in ("respondido", "archivado_frio")
    )
    # Needs re-contact if active & unresponded AND (follow-up SLA expired OR initial SLA expired OR > 50% initial SLA without contact)
    needs_recontact = bool(
        unresponded_active and (
            f_status == "vencido"
            or (last_contact_utc is None and (sla_status == "vencido" or effective_status == "tiempo_agotado" or elapsed_seconds >= int(sla_seconds * 0.5)))
            or (last_contact_utc is not None and f_elapsed >= int(f_sla_seconds * 0.75))
        )
    )

    return ProspectResponse(
        id=p.id,
        company_name=p.company_name,
        contact_name=p.contact_name,
        contact_email=p.contact_email,
        email_id=p.email_id,
        email_address=email_info[0] if email_info else None,
        email_provider=email_info[1] if email_info else None,
        specific_alias=p.specific_alias,
        scope=getattr(p, "scope", "business") or "business",
        workflow_type=p.workflow_type or "demo_first",
        status=effective_status,
        demo_url=p.demo_url,
        estimated_value=estimated_value,
        currency=currency,
        billing_type=billing_type,
        whatsapp=p.whatsapp,
        phones=p.phones,
        maps_url=p.maps_url,
        social_links=p.social_links,
        notes=decrypt_note(p.notes),
        tags=tags,
        started_at=started_utc.isoformat() if started_utc else None,
        sla_hours=p.sla_hours or 48.0,
        responded_at=responded_utc.isoformat() if responded_utc else None,
        response_time_seconds=p.response_time_seconds if p.response_time_seconds is not None else (elapsed_seconds if p.responded_at else None),
        met_sla=met_sla,
        elapsed_seconds=elapsed_seconds,
        sla_seconds=sla_seconds,
        sla_status=sla_status,
        last_contacted_at=last_contact_utc.isoformat() if last_contact_utc else None,
        followup_count=followup_count,
        last_contact_channel=last_channel,
        followup_sla_hours=followup_sla_hours,
        followup_elapsed_seconds=f_elapsed,
        followup_sla_seconds=f_sla_seconds,
        followup_remaining_seconds=f_remaining,
        followup_status=f_status,
        max_followup_attempts=max_attempts,
        needs_recontact=needs_recontact,
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
    prospects = list(res.scalars().all())

    # Evaluate auto-archiving rules before filtering by status
    await evaluate_auto_archive_cold_prospects(prospects, db)

    if status:
        prospects = [p for p in prospects if p.status == status]

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

    await evaluate_auto_archive_cold_prospects([p], db)

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
            raise HTTPException(status_code=400, detail="El correo principal seleccionado no existe o está en la papelera.")

    now = datetime.now(timezone.utc)
    started_dt = parse_iso_datetime(payload.started_at) or now
    sla_hours = max(0.1, float(payload.sla_hours or 48.0))
    followup_sla_hours = max(1.0, float(payload.followup_sla_hours or 48.0))
    max_attempts = max(1, min(10, int(payload.max_followup_attempts or 3)))

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
        specific_alias=payload.specific_alias.strip() if payload.specific_alias else None,
        scope=payload.scope or "business",
        workflow_type=payload.workflow_type or "demo_first",
        status=payload.status or ("demo_creada" if payload.workflow_type == "demo_first" else "en_cotizacion"),
        demo_url=payload.demo_url.strip() if payload.demo_url else None,
        estimated_value=max(0.0, float(payload.estimated_value or 0.0)),
        currency=payload.currency if payload.currency in ("MXN", "USD") else "MXN",
        billing_type=payload.billing_type if payload.billing_type in ("one_time", "monthly_retainer") else "one_time",
        whatsapp=payload.whatsapp.strip() if payload.whatsapp else None,
        phones=payload.phones.strip() if payload.phones else None,
        maps_url=payload.maps_url.strip() if payload.maps_url else None,
        social_links=payload.social_links.strip() if payload.social_links else None,
        notes=encrypt_note(payload.notes),
        tags=json.dumps([t.model_dump() for t in payload.tags]),
        started_at=to_naive_utc(started_dt),
        sla_hours=sla_hours,
        responded_at=to_naive_utc(responded_dt),
        response_time_seconds=response_secs,
        met_sla=met_sla,
        last_contacted_at=to_naive_utc(now) if payload.status in ("primer_contacto", "en_cotizacion") else None,
        followup_count=1 if payload.status in ("primer_contacto", "en_cotizacion") else 0,
        last_contact_channel="initial" if payload.status in ("primer_contacto", "en_cotizacion") else None,
        followup_sla_hours=followup_sla_hours,
        max_followup_attempts=max_attempts
    )
    db.add(prospect)
    await db.flush()

    await log_audit_event(
        db,
        action="create",
        entity_type="prospect",
        entity_id=prospect.id,
        entity_name=prospect.company_name,
        details=f"Prospecto / Demo '{prospect.company_name}' registrado con plazo de {sla_hours:g}h"
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
        p.specific_alias = payload.specific_alias.strip() if payload.specific_alias != "" else None
    if payload.scope is not None:
        p.scope = payload.scope
    if payload.workflow_type is not None:
        p.workflow_type = payload.workflow_type
    if payload.demo_url is not None:
        p.demo_url = payload.demo_url.strip() if payload.demo_url else None
    if payload.estimated_value is not None:
        p.estimated_value = max(0.0, float(payload.estimated_value))
    if payload.currency is not None and payload.currency in ("MXN", "USD"):
        p.currency = payload.currency
    if payload.billing_type is not None and payload.billing_type in ("one_time", "monthly_retainer"):
        p.billing_type = payload.billing_type
    if payload.whatsapp is not None:
        p.whatsapp = payload.whatsapp.strip() if payload.whatsapp else None
    if payload.phones is not None:
        p.phones = payload.phones.strip() if payload.phones else None
    if payload.maps_url is not None:
        p.maps_url = payload.maps_url.strip() if payload.maps_url else None
    if payload.social_links is not None:
        p.social_links = payload.social_links.strip() if payload.social_links else None
    if payload.notes is not None:
        p.notes = encrypt_note(payload.notes)
    if payload.tags is not None:
        p.tags = json.dumps([t.model_dump() for t in payload.tags])

    if payload.started_at is not None:
        parsed_start = parse_iso_datetime(payload.started_at)
        if parsed_start:
            p.started_at = to_naive_utc(parsed_start)

    if payload.sla_hours is not None:
        p.sla_hours = max(0.1, float(payload.sla_hours))
        if p.responded_at is not None and p.response_time_seconds is not None:
            p.met_sla = p.response_time_seconds <= int(p.sla_hours * 3600)

    if payload.last_contacted_at is not None:
        parsed_lc = parse_iso_datetime(payload.last_contacted_at)
        p.last_contacted_at = to_naive_utc(parsed_lc) if parsed_lc else None
    if payload.followup_count is not None:
        p.followup_count = max(0, int(payload.followup_count))
    if payload.last_contact_channel is not None:
        p.last_contact_channel = payload.last_contact_channel
    if payload.followup_sla_hours is not None:
        p.followup_sla_hours = max(1.0, float(payload.followup_sla_hours))
    if payload.max_followup_attempts is not None:
        p.max_followup_attempts = max(1, min(10, int(payload.max_followup_attempts)))

    if payload.status is not None:
        old_status = p.status
        p.status = payload.status
        if payload.status == "respondido" and p.responded_at is None:
            now = datetime.now(timezone.utc)
            started_utc = ensure_utc(p.started_at) or now
            elapsed = max(0, int((now - started_utc).total_seconds()))
            p.responded_at = to_naive_utc(now)
            p.response_time_seconds = elapsed
            p.met_sla = elapsed <= int((p.sla_hours or 48.0) * 3600)
        elif old_status == "respondido" and payload.status != "respondido":
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

@router.post("/{prospect_id}/contact-attempt", response_model=ProspectResponse)
async def record_prospect_contact_attempt(
    prospect_id: str,
    payload: ProspectContactAttemptRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Records a direct contact or follow-up attempt (WhatsApp, Email client, Phone, or Template copy).
    Preserves the original started_at/sla_hours intact while resetting the secondary followup_sla timer (+24h, +48h, +72h).
    """
    stmt = select(Prospect).where(Prospect.id == prospect_id, Prospect.is_deleted == False)
    p = (await db.execute(stmt)).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado.")

    now = datetime.now(timezone.utc)
    p.last_contacted_at = to_naive_utc(now)
    p.followup_count = int(getattr(p, "followup_count", 0) or 0) + 1
    p.last_contact_channel = payload.channel or "whatsapp"
    if payload.followup_sla_hours is not None:
        p.followup_sla_hours = max(1.0, float(payload.followup_sla_hours))
    elif not getattr(p, "followup_sla_hours", None):
        p.followup_sla_hours = 48.0

    if payload.auto_advance_status and p.status in ("demo_creada", "tiempo_agotado", "archivado_frio") and p.responded_at is None:
        p.status = "primer_contacto"

    if payload.note and payload.note.strip():
        existing_plain = decrypt_note(p.notes) or ""
        stamp = now.strftime("%Y-%m-%d %H:%M UTC")
        new_entry = f"[{stamp} · {p.last_contact_channel.upper()}] {payload.note.strip()}"
        combined = f"{existing_plain}\n{new_entry}".strip() if existing_plain else new_entry
        p.notes = encrypt_note(combined)

    channel_labels = {
        "whatsapp": "WhatsApp Directo",
        "email": "Cliente de Correo",
        "phone": "Llamada Telefónica",
        "template": "Plantilla de Seguimiento"
    }
    ch_label = channel_labels.get(p.last_contact_channel, p.last_contact_channel)

    await log_audit_event(
        db,
        action="contact_followup",
        entity_type="prospect",
        entity_id=p.id,
        entity_name=p.company_name,
        details=f"Intento de contacto #{p.followup_count} vía {ch_label} para '{p.company_name}' (Próximo seguimiento: +{p.followup_sla_hours:g}h)"
    )
    await db.commit()
    return await get_prospect_detail(p.id, db=db)

@router.post("/{prospect_id}/reactivate", response_model=ProspectResponse)
async def reactivate_cold_prospect(
    prospect_id: str,
    followup_sla_hours: float = Query(48.0, ge=1.0, le=720.0),
    db: AsyncSession = Depends(get_db)
):
    """Reactivates a cold/archived prospect back into active follow-up."""
    stmt = select(Prospect).where(Prospect.id == prospect_id, Prospect.is_deleted == False)
    p = (await db.execute(stmt)).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado.")

    now = datetime.now(timezone.utc)
    p.status = "primer_contacto" if p.workflow_type == "demo_first" else "en_cotizacion"
    p.followup_count = 0
    p.last_contacted_at = to_naive_utc(now)
    p.followup_sla_hours = followup_sla_hours
    p.responded_at = None

    await log_audit_event(
        db,
        action="reactivate",
        entity_type="prospect",
        entity_id=p.id,
        entity_name=p.company_name,
        details=f"Prospecto '{p.company_name}' reactivado desde archivo frío con ventana de seguimiento de +{followup_sla_hours:g}h"
    )
    await db.commit()
    return await get_prospect_detail(p.id, db=db)

@router.post("/{prospect_id}/recycle-demo", response_model=ProspectResponse)
async def recycle_prospect_demo(
    prospect_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Frees/recycles the demo URL from a cold prospect so the template can be reused for another client."""
    stmt = select(Prospect).where(Prospect.id == prospect_id, Prospect.is_deleted == False)
    p = (await db.execute(stmt)).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado.")

    now = datetime.now(timezone.utc)
    old_url = p.demo_url or "Sin URL asignada"
    existing_plain = decrypt_note(p.notes) or ""
    stamp = now.strftime("%Y-%m-%d %H:%M UTC")
    recycle_note = f"[{stamp} · DEMO RECICLADA] Plantilla liberada para otro cliente (URL anterior: {old_url})"
    p.notes = encrypt_note(f"{existing_plain}\n{recycle_note}".strip() if existing_plain else recycle_note)
    p.demo_url = None
    p.status = "archivado_frio"

    await log_audit_event(
        db,
        action="recycle_demo",
        entity_type="prospect",
        entity_id=p.id,
        entity_name=p.company_name,
        details=f"Plantilla Demo liberada/reciclada del prospecto '{p.company_name}' ({old_url})"
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
    if p.status in ("respondido", "tiempo_agotado", "archivado_frio"):
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
    p.deleted_at = to_naive_utc(datetime.now(timezone.utc))
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
