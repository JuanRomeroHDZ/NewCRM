import calendar
import json
from datetime import datetime, timezone, date
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import (
    ClientIncome,
    DomainRenewal,
    OneTimeExpense,
    InternalProject,
    SecureResource,
    EmailAccount,
)
from app.schemas import (
    ClientIncomeCreate, ClientIncomeUpdate, ClientIncomeResponse,
    DomainRenewalCreate, DomainRenewalUpdate, DomainRenewalResponse,
    AdvanceRenewalRequest,
    OneTimeExpenseCreate, OneTimeExpenseUpdate, OneTimeExpenseResponse,
    InternalProjectCreate, InternalProjectUpdate, InternalProjectResponse,
    SecureResourceCreate, SecureResourceUpdate, SecureResourceResponse,
    TagItem,
)
from app.security.crypto import encrypt_note, decrypt_note
from app.security.tokens import require_vault_unlocked
from app.services.audit import log_audit_event

router = APIRouter(prefix="/finances", tags=["finances"], dependencies=[Depends(require_vault_unlocked)])


def _add_billing_period(src_date: date, billing_cycle: str) -> date:
    if billing_cycle == "monthly":
        month = src_date.month + 1
        year = src_date.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
    else:
        year = src_date.year + 1
        month = src_date.month
    max_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(src_date.day, max_day))


def _compute_renewal_expiry(renewal_date_str: str, status_val: str) -> tuple[int, str]:
    """Returns (days_remaining, expiry_semaphore) where semaphore is 'en_orden', 'proximo', 'urgente', 'vencido'."""
    if status_val == "cancelado":
        return 0, "cancelado"
    try:
        target_date = date.fromisoformat(renewal_date_str.strip()[:10])
        today = datetime.now(timezone.utc).date()
        days_rem = (target_date - today).days
        if days_rem < 0 or status_val == "vencido":
            return days_rem, "vencido"
        if days_rem <= 7:
            return days_rem, "urgente"
        if days_rem <= 30:
            return days_rem, "proximo"
        return days_rem, "en_orden"
    except Exception:
        return 0, "en_orden"


def _parse_json_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(x) for x in parsed if x]
    except Exception:
        pass
    return []


def _parse_tags(raw: str | None) -> list[TagItem]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [TagItem(**t) if isinstance(t, dict) else TagItem(name=str(t)) for t in parsed]
    except Exception:
        pass
    return []


def _build_income_response(row: ClientIncome) -> ClientIncomeResponse:
    return ClientIncomeResponse(
        id=row.id,
        prospect_id=row.prospect_id,
        project_id=getattr(row, "project_id", None),
        ownership_type=getattr(row, "ownership_type", None) or "client",
        scope=getattr(row, "scope", None) or "business",
        business_share_percent=float(getattr(row, "business_share_percent", 100.0) or 100.0),
        client_name=row.client_name,
        concept=row.concept,
        category=row.category or "anticipo",
        amount=float(row.amount or 0.0),
        currency=row.currency or "MXN",
        status=row.status or "cobrado",
        received_date=row.received_date,
        payment_method_label=row.payment_method_label,
        is_recurring=bool(row.is_recurring),
        notes=decrypt_note(row.notes) if row.notes else None,
        is_deleted=bool(row.is_deleted),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _build_renewal_response(
    row: DomainRenewal,
    created_income_id: str | None = None,
    margin_amount: float | None = None,
) -> DomainRenewalResponse:
    days_rem, semaphore = _compute_renewal_expiry(row.renewal_date, row.status or "activo")
    return DomainRenewalResponse(
        id=row.id,
        prospect_id=row.prospect_id,
        project_id=getattr(row, "project_id", None),
        platform_id=row.platform_id,
        ownership_type=getattr(row, "ownership_type", None) or "client",
        scope=getattr(row, "scope", None) or "business",
        business_share_percent=float(getattr(row, "business_share_percent", 100.0) or 100.0),
        client_name=row.client_name,
        domain_or_service=row.domain_or_service,
        service_type=row.service_type or "dominio",
        provider=row.provider,
        renewal_date=row.renewal_date,
        renewal_cost=float(row.renewal_cost or 0.0),
        client_charge_amount=float(getattr(row, "client_charge_amount", 0.0) or 0.0),
        currency=row.currency or "MXN",
        billing_cycle=row.billing_cycle or "yearly",
        paid_by=row.paid_by or "client",
        status=row.status or "activo",
        auto_renew=bool(row.auto_renew),
        notes=decrypt_note(row.notes) if row.notes else None,
        days_remaining=days_rem,
        expiry_semaphore=semaphore,
        created_income_id=created_income_id,
        margin_amount=margin_amount,
        is_deleted=bool(row.is_deleted),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _build_expense_response(row: OneTimeExpense) -> OneTimeExpenseResponse:
    return OneTimeExpenseResponse(
        id=row.id,
        concept=row.concept,
        category=row.category or "Hardware / Equipo",
        amount=float(row.amount or 0.0),
        currency=row.currency or "MXN",
        expense_date=row.expense_date,
        scope=row.scope or "business",
        business_share_percent=float(row.business_share_percent or 100.0),
        ownership_type=row.ownership_type or "own",
        vendor=row.vendor,
        payment_method_label=row.payment_method_label,
        prospect_id=row.prospect_id,
        project_id=row.project_id,
        notes=decrypt_note(row.notes) if row.notes else None,
        is_deleted=bool(row.is_deleted),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _build_project_response(row: InternalProject, email_map: dict[str, str] | None = None) -> InternalProjectResponse:
    email_addr = email_map.get(row.email_id) if (email_map and row.email_id) else None
    return InternalProjectResponse(
        id=row.id,
        name=row.name,
        category=row.category or "Sistema / SaaS",
        status=row.status or "en_desarrollo",
        scope=row.scope or "business",
        email_id=row.email_id,
        email_address=email_addr,
        production_url=row.production_url,
        repo_url=row.repo_url,
        tech_stack=row.tech_stack,
        monthly_maintenance_cost=float(row.monthly_maintenance_cost or 0.0),
        currency=row.currency or "MXN",
        linked_platform_ids=_parse_json_list(row.linked_platform_ids),
        linked_domain_ids=_parse_json_list(row.linked_domain_ids),
        tags=_parse_tags(row.tags),
        notes=decrypt_note(row.notes) if row.notes else None,
        is_deleted=bool(row.is_deleted),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _build_resource_response(row: SecureResource) -> SecureResourceResponse:
    decrypted_content = decrypt_note(row.encrypted_content) if row.encrypted_content else ""
    masked = "••••••••••••••••"
    if decrypted_content:
        clean = decrypted_content.strip()
        if len(clean) > 8:
            masked = f"{clean[:4]}••••••••{clean[-4:]}"
    return SecureResourceResponse(
        id=row.id,
        title=row.title,
        resource_type=row.resource_type or "nota_segura",
        scope=row.scope or "business",
        ownership_type=row.ownership_type or "own",
        content=decrypted_content,
        content_masked=masked,
        email_id=row.email_id,
        platform_id=row.platform_id,
        prospect_id=row.prospect_id,
        project_id=row.project_id,
        tags=_parse_tags(row.tags),
        notes=decrypt_note(row.notes) if row.notes else None,
        is_deleted=bool(row.is_deleted),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


# ==========================================
# 1. CONTROL DE INGRESOS / PAGOS RECIBIDOS
# ==========================================

@router.get("/incomes", response_model=list[ClientIncomeResponse])
async def list_incomes(db: AsyncSession = Depends(get_db)):
    stmt = (
        select(ClientIncome)
        .where(ClientIncome.is_deleted == False)
        .order_by(ClientIncome.received_date.desc(), ClientIncome.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_build_income_response(r) for r in rows]


@router.post("/incomes", response_model=ClientIncomeResponse)
async def create_income(payload: ClientIncomeCreate, db: AsyncSession = Depends(get_db)):
    if not payload.concept.strip():
        raise HTTPException(status_code=400, detail="El concepto del pago es obligatorio.")

    fallback_name = "Uso Propio / Interno" if payload.ownership_type == "own" else "Independiente"
    clean_client_name = (payload.client_name or "").strip() or fallback_name

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    item = ClientIncome(
        prospect_id=payload.prospect_id or None,
        project_id=payload.project_id or None,
        ownership_type=payload.ownership_type or "client",
        scope=payload.scope or "business",
        business_share_percent=max(0.0, min(100.0, float(payload.business_share_percent if payload.business_share_percent is not None else 100.0))),
        client_name=clean_client_name,
        concept=payload.concept.strip(),
        category=(payload.category or "anticipo").strip() or "anticipo",
        amount=max(0.0, float(payload.amount or 0.0)),
        currency=payload.currency or "MXN",
        status=payload.status or "cobrado",
        received_date=payload.received_date.strip(),
        payment_method_label=payload.payment_method_label.strip() if payload.payment_method_label else None,
        is_recurring=bool(payload.is_recurring),
        notes=encrypt_note(payload.notes) if payload.notes else None,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(item)
    await log_audit_event(
        db,
        action="create",
        entity_type="income",
        entity_id=item.id,
        entity_name=f"{item.client_name} - {item.concept}",
        details=f"Ingreso registrado: ${item.amount:.2f} {item.currency} ({item.status})",
    )
    await db.commit()
    await db.refresh(item)
    return _build_income_response(item)


@router.post("/incomes/{income_id}/clone-next-month", response_model=ClientIncomeResponse)
async def clone_income_next_month(income_id: str, db: AsyncSession = Depends(get_db)):
    """Atomically clones a recurring income/retainer record to the next month."""
    stmt = select(ClientIncome).where(ClientIncome.id == income_id, ClientIncome.is_deleted == False)
    source = (await db.execute(stmt)).scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Registro de ingreso no encontrado.")

    try:
        src_dt = date.fromisoformat(source.received_date.strip()[:10])
    except Exception:
        src_dt = datetime.now(timezone.utc).date()

    next_dt = _add_billing_period(src_dt, "monthly")
    next_date_str = next_dt.isoformat()

    # Idempotency check: don't create duplicate if already cloned for this target month
    dup_stmt = select(ClientIncome).where(
        ClientIncome.client_name == source.client_name,
        ClientIncome.concept == source.concept,
        ClientIncome.received_date == next_date_str,
        ClientIncome.is_deleted == False
    )
    existing_clone = (await db.execute(dup_stmt)).scalar_one_or_none()
    if existing_clone:
        return _build_income_response(existing_clone)

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

    cloned = ClientIncome(
        prospect_id=source.prospect_id,
        project_id=getattr(source, "project_id", None),
        ownership_type=getattr(source, "ownership_type", None) or "client",
        scope=getattr(source, "scope", None) or "business",
        business_share_percent=float(getattr(source, "business_share_percent", 100.0) or 100.0),
        client_name=source.client_name,
        concept=source.concept,
        category=source.category or "iguala_mensual",
        amount=float(source.amount or 0.0),
        currency=source.currency or "MXN",
        status="cobrado",
        received_date=next_date_str,
        payment_method_label=source.payment_method_label,
        is_recurring=True,
        notes=source.notes,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(cloned)
    await log_audit_event(
        db,
        action="create",
        entity_type="income",
        entity_id=cloned.id,
        entity_name=f"{cloned.client_name} - {cloned.concept}",
        details=f"Cobro recurrente repetido (+1 mes) para {cloned.received_date}: ${cloned.amount:.2f} {cloned.currency}",
    )
    await db.commit()
    await db.refresh(cloned)
    return _build_income_response(cloned)


@router.put("/incomes/{income_id}", response_model=ClientIncomeResponse)
async def update_income(income_id: str, payload: ClientIncomeUpdate, db: AsyncSession = Depends(get_db)):
    stmt = select(ClientIncome).where(ClientIncome.id == income_id, ClientIncome.is_deleted == False)
    item = (await db.execute(stmt)).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Registro de ingreso no encontrado.")

    if "prospect_id" in payload.model_fields_set:
        item.prospect_id = payload.prospect_id or None
    if "project_id" in payload.model_fields_set:
        item.project_id = payload.project_id or None
    if payload.ownership_type is not None:
        item.ownership_type = payload.ownership_type
    if payload.scope is not None:
        item.scope = payload.scope
    if payload.business_share_percent is not None:
        item.business_share_percent = max(0.0, min(100.0, float(payload.business_share_percent)))
    if payload.client_name is not None:
        item.client_name = payload.client_name.strip() or "Independiente"
    if payload.concept is not None:
        item.concept = payload.concept.strip()
    if payload.category is not None:
        item.category = payload.category.strip() or "anticipo"
    if payload.amount is not None:
        item.amount = max(0.0, float(payload.amount))
    if payload.currency is not None:
        item.currency = payload.currency
    if payload.status is not None:
        item.status = payload.status
    if payload.received_date is not None:
        item.received_date = payload.received_date.strip()
    if payload.payment_method_label is not None:
        item.payment_method_label = payload.payment_method_label.strip() if payload.payment_method_label else None
    if payload.is_recurring is not None:
        item.is_recurring = bool(payload.is_recurring)
    if payload.notes is not None:
        item.notes = encrypt_note(payload.notes) if payload.notes.strip() else None

    item.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await log_audit_event(
        db,
        action="update",
        entity_type="income",
        entity_id=item.id,
        entity_name=f"{item.client_name} - {item.concept}",
        details=f"Actualización de ingreso: ${item.amount:.2f} {item.currency} ({item.status})",
    )
    await db.commit()
    await db.refresh(item)
    return _build_income_response(item)


@router.delete("/incomes/{income_id}")
async def delete_income(income_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(ClientIncome).where(ClientIncome.id == income_id, ClientIncome.is_deleted == False)
    item = (await db.execute(stmt)).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Registro de ingreso no encontrado.")

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    item.is_deleted = True
    item.deleted_at = now_utc
    item.updated_at = now_utc

    await log_audit_event(
        db,
        action="delete",
        entity_type="income",
        entity_id=item.id,
        entity_name=f"{item.client_name} - {item.concept}",
        details=f"Ingreso enviado a la papelera: {item.client_name} (${item.amount:.2f} {item.currency})",
    )
    await db.commit()
    return {"message": "Ingreso enviado a la papelera."}


# ==========================================
# 2. MONITOR DE VENCIMIENTOS (DOMINIOS / HOSTING)
# ==========================================

@router.get("/renewals", response_model=list[DomainRenewalResponse])
async def list_renewals(db: AsyncSession = Depends(get_db)):
    stmt = (
        select(DomainRenewal)
        .where(DomainRenewal.is_deleted == False)
        .order_by(DomainRenewal.renewal_date.asc(), DomainRenewal.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_build_renewal_response(r) for r in rows]


@router.post("/renewals", response_model=DomainRenewalResponse)
async def create_renewal(payload: DomainRenewalCreate, db: AsyncSession = Depends(get_db)):
    if not payload.domain_or_service.strip():
        raise HTTPException(status_code=400, detail="El nombre del dominio o servicio de hosting es obligatorio.")

    fallback_name = "Uso Propio / Interno" if payload.ownership_type == "own" else "Independiente"
    clean_client_name = (payload.client_name or "").strip() or fallback_name

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    item = DomainRenewal(
        prospect_id=payload.prospect_id or None,
        project_id=payload.project_id or None,
        platform_id=payload.platform_id or None,
        ownership_type=payload.ownership_type or "client",
        scope=payload.scope or "business",
        business_share_percent=max(0.0, min(100.0, float(payload.business_share_percent if payload.business_share_percent is not None else 100.0))),
        client_name=clean_client_name,
        domain_or_service=payload.domain_or_service.strip(),
        service_type=(payload.service_type or "dominio").strip() or "dominio",
        provider=payload.provider.strip() if payload.provider else None,
        renewal_date=payload.renewal_date.strip(),
        renewal_cost=max(0.0, float(payload.renewal_cost or 0.0)),
        client_charge_amount=max(0.0, float(payload.client_charge_amount or 0.0)),
        currency=payload.currency or "MXN",
        billing_cycle=payload.billing_cycle or "yearly",
        paid_by=payload.paid_by or "client",
        status=payload.status or "activo",
        auto_renew=bool(payload.auto_renew),
        notes=encrypt_note(payload.notes) if payload.notes else None,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(item)
    await log_audit_event(
        db,
        action="create",
        entity_type="renewal",
        entity_id=item.id,
        entity_name=f"{item.domain_or_service} ({item.client_name})",
        details=f"Vencimiento registrado: {item.domain_or_service} vence el {item.renewal_date}",
    )
    await db.commit()
    await db.refresh(item)
    return _build_renewal_response(item)


@router.put("/renewals/{renewal_id}", response_model=DomainRenewalResponse)
async def update_renewal(renewal_id: str, payload: DomainRenewalUpdate, db: AsyncSession = Depends(get_db)):
    stmt = select(DomainRenewal).where(DomainRenewal.id == renewal_id, DomainRenewal.is_deleted == False)
    item = (await db.execute(stmt)).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Registro de vencimiento no encontrado.")

    if "prospect_id" in payload.model_fields_set:
        item.prospect_id = payload.prospect_id or None
    if "project_id" in payload.model_fields_set:
        item.project_id = payload.project_id or None
    if "platform_id" in payload.model_fields_set:
        item.platform_id = payload.platform_id or None
    if payload.ownership_type is not None:
        item.ownership_type = payload.ownership_type
    if payload.scope is not None:
        item.scope = payload.scope
    if payload.business_share_percent is not None:
        item.business_share_percent = max(0.0, min(100.0, float(payload.business_share_percent)))
    if payload.client_name is not None:
        item.client_name = payload.client_name.strip() or "Independiente"
    if payload.domain_or_service is not None:
        item.domain_or_service = payload.domain_or_service.strip()
    if payload.service_type is not None:
        item.service_type = payload.service_type.strip() or "dominio"
    if payload.provider is not None:
        item.provider = payload.provider.strip() if payload.provider else None
    if payload.renewal_date is not None:
        item.renewal_date = payload.renewal_date.strip()
    if payload.renewal_cost is not None:
        item.renewal_cost = max(0.0, float(payload.renewal_cost))
    if payload.client_charge_amount is not None:
        item.client_charge_amount = max(0.0, float(payload.client_charge_amount))
    if payload.currency is not None:
        item.currency = payload.currency
    if payload.billing_cycle is not None:
        item.billing_cycle = payload.billing_cycle
    if payload.paid_by is not None:
        item.paid_by = payload.paid_by
    if payload.status is not None:
        item.status = payload.status
    if payload.auto_renew is not None:
        item.auto_renew = bool(payload.auto_renew)
    if payload.notes is not None:
        item.notes = encrypt_note(payload.notes) if payload.notes.strip() else None

    item.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await log_audit_event(
        db,
        action="update",
        entity_type="renewal",
        entity_id=item.id,
        entity_name=f"{item.domain_or_service} ({item.client_name})",
        details=f"Actualización de vencimiento: {item.domain_or_service} ({item.renewal_date})",
    )
    await db.commit()
    await db.refresh(item)
    return _build_renewal_response(item)


@router.post("/renewals/{renewal_id}/advance-cycle", response_model=DomainRenewalResponse)
async def advance_renewal_cycle(
    renewal_id: str,
    payload: AdvanceRenewalRequest | None = Body(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Advances the renewal date by 1 cycle and marks status as 'activo'.
    If payload.create_income is True, atomically creates a ClientIncome record in the same transaction
    and computes the profit margin.
    """
    stmt = select(DomainRenewal).where(DomainRenewal.id == renewal_id, DomainRenewal.is_deleted == False)
    item = (await db.execute(stmt)).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Registro de vencimiento no encontrado.")

    try:
        current_dt = date.fromisoformat(item.renewal_date.strip()[:10])
    except Exception:
        current_dt = datetime.now(timezone.utc).date()

    next_dt = _add_billing_period(current_dt, item.billing_cycle or "yearly")
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    today_iso = datetime.now(timezone.utc).date().isoformat()

    item.renewal_date = next_dt.isoformat()
    item.status = "activo"
    item.updated_at = now_utc

    created_income_id: str | None = None
    margin_amount: float | None = None

    if payload and payload.create_income:
        charged = float(
            payload.charged_amount
            if payload.charged_amount is not None
            else (item.client_charge_amount or item.renewal_cost or 0.0)
        )
        charged_curr = payload.charged_currency or item.currency or "MXN"
        if charged > 0:
            item.client_charge_amount = charged
            margin_amount = charged - float(item.renewal_cost or 0.0)
            note_summary = (
                f"Renovación de {item.service_type}: {item.domain_or_service} "
                f"(Costo base: ${float(item.renewal_cost or 0.0):.2f} {item.currency}, "
                f"Margen: ${margin_amount:.2f} {charged_curr})"
            )
            income_row = ClientIncome(
                prospect_id=item.prospect_id,
                project_id=getattr(item, "project_id", None),
                ownership_type=getattr(item, "ownership_type", None) or "client",
                scope=getattr(item, "scope", None) or "business",
                business_share_percent=float(getattr(item, "business_share_percent", 100.0) or 100.0),
                client_name=item.client_name or "Cliente",
                concept=f"Renovación {item.domain_or_service}",
                category="renovacion_dominio_hosting",
                amount=max(0.0, charged),
                currency=charged_curr,
                status=payload.income_status or "cobrado",
                received_date=today_iso,
                payment_method_label=payload.payment_method_label or "Transferencia",
                is_recurring=False,
                notes=encrypt_note(note_summary),
                created_at=now_utc,
                updated_at=now_utc,
            )
            db.add(income_row)
            await db.flush()
            created_income_id = income_row.id
            await log_audit_event(
                db,
                action="create",
                entity_type="income",
                entity_id=income_row.id,
                entity_name=f"{income_row.client_name} - {income_row.concept}",
                details=f"Ingreso generado automáticamente al renovar {item.domain_or_service}: ${charged:.2f} {charged_curr}",
            )

    await log_audit_event(
        db,
        action="update",
        entity_type="renewal",
        entity_id=item.id,
        entity_name=f"{item.domain_or_service} ({item.client_name})",
        details=f"Renovación registrada (+1 ciclo). Nueva fecha de vencimiento: {item.renewal_date}",
    )
    await db.commit()
    await db.refresh(item)
    return _build_renewal_response(item, created_income_id=created_income_id, margin_amount=margin_amount)


@router.delete("/renewals/{renewal_id}")
async def delete_renewal(renewal_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(DomainRenewal).where(DomainRenewal.id == renewal_id, DomainRenewal.is_deleted == False)
    item = (await db.execute(stmt)).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Registro de vencimiento no encontrado.")

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    item.is_deleted = True
    item.deleted_at = now_utc
    item.updated_at = now_utc

    await log_audit_event(
        db,
        action="delete",
        entity_type="renewal",
        entity_id=item.id,
        entity_name=f"{item.domain_or_service} ({item.client_name})",
        details=f"Vencimiento enviado a la papelera: {item.domain_or_service}",
    )
    await db.commit()
    return {"message": "Registro de vencimiento enviado a la papelera."}


# ==========================================
# 3. GASTOS ÚNICOS / COMPRAS VARIABLES
# ==========================================

@router.get("/expenses", response_model=list[OneTimeExpenseResponse])
async def list_expenses(db: AsyncSession = Depends(get_db)):
    stmt = (
        select(OneTimeExpense)
        .where(OneTimeExpense.is_deleted == False)
        .order_by(OneTimeExpense.expense_date.desc(), OneTimeExpense.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_build_expense_response(r) for r in rows]


@router.post("/expenses", response_model=OneTimeExpenseResponse)
async def create_expense(payload: OneTimeExpenseCreate, db: AsyncSession = Depends(get_db)):
    if not payload.concept.strip():
        raise HTTPException(status_code=400, detail="El concepto del gasto único es obligatorio.")

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    item = OneTimeExpense(
        concept=payload.concept.strip(),
        category=(payload.category or "Hardware / Equipo").strip() or "Hardware / Equipo",
        amount=max(0.0, float(payload.amount or 0.0)),
        currency=payload.currency or "MXN",
        expense_date=payload.expense_date.strip(),
        scope=payload.scope or "business",
        business_share_percent=max(0.0, min(100.0, float(payload.business_share_percent if payload.business_share_percent is not None else 100.0))),
        ownership_type=payload.ownership_type or "own",
        vendor=payload.vendor.strip() if payload.vendor else None,
        payment_method_label=payload.payment_method_label.strip() if payload.payment_method_label else None,
        prospect_id=payload.prospect_id or None,
        project_id=payload.project_id or None,
        notes=encrypt_note(payload.notes) if payload.notes else None,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(item)
    await log_audit_event(
        db,
        action="create",
        entity_type="expense",
        entity_id=item.id,
        entity_name=item.concept,
        details=f"Gasto único registrado: ${item.amount:.2f} {item.currency} ({item.category})",
    )
    await db.commit()
    await db.refresh(item)
    return _build_expense_response(item)


@router.put("/expenses/{expense_id}", response_model=OneTimeExpenseResponse)
async def update_expense(expense_id: str, payload: OneTimeExpenseUpdate, db: AsyncSession = Depends(get_db)):
    stmt = select(OneTimeExpense).where(OneTimeExpense.id == expense_id, OneTimeExpense.is_deleted == False)
    item = (await db.execute(stmt)).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Gasto único no encontrado.")

    if payload.concept is not None:
        item.concept = payload.concept.strip()
    if payload.category is not None:
        item.category = payload.category.strip() or "Hardware / Equipo"
    if payload.amount is not None:
        item.amount = max(0.0, float(payload.amount))
    if payload.currency is not None:
        item.currency = payload.currency
    if payload.expense_date is not None:
        item.expense_date = payload.expense_date.strip()
    if payload.scope is not None:
        item.scope = payload.scope
    if payload.business_share_percent is not None:
        item.business_share_percent = max(0.0, min(100.0, float(payload.business_share_percent)))
    if payload.ownership_type is not None:
        item.ownership_type = payload.ownership_type
    if payload.vendor is not None:
        item.vendor = payload.vendor.strip() if payload.vendor else None
    if payload.payment_method_label is not None:
        item.payment_method_label = payload.payment_method_label.strip() if payload.payment_method_label else None
    if "prospect_id" in payload.model_fields_set:
        item.prospect_id = payload.prospect_id or None
    if "project_id" in payload.model_fields_set:
        item.project_id = payload.project_id or None
    if payload.notes is not None:
        item.notes = encrypt_note(payload.notes) if payload.notes.strip() else None

    item.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await log_audit_event(
        db,
        action="update",
        entity_type="expense",
        entity_id=item.id,
        entity_name=item.concept,
        details=f"Actualización de gasto único: ${item.amount:.2f} {item.currency}",
    )
    await db.commit()
    await db.refresh(item)
    return _build_expense_response(item)


@router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(OneTimeExpense).where(OneTimeExpense.id == expense_id, OneTimeExpense.is_deleted == False)
    item = (await db.execute(stmt)).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Gasto único no encontrado.")

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    item.is_deleted = True
    item.deleted_at = now_utc
    item.updated_at = now_utc

    await log_audit_event(
        db,
        action="delete",
        entity_type="expense",
        entity_id=item.id,
        entity_name=item.concept,
        details=f"Gasto único enviado a la papelera: {item.concept} (${item.amount:.2f} {item.currency})",
    )
    await db.commit()
    return {"message": "Gasto único enviado a la papelera."}


# ==========================================
# 4. PROYECTOS PROPIOS E INFRAESTRUCTURA
# ==========================================

@router.get("/projects", response_model=list[InternalProjectResponse])
async def list_projects(db: AsyncSession = Depends(get_db)):
    stmt = (
        select(InternalProject)
        .where(InternalProject.is_deleted == False)
        .order_by(InternalProject.updated_at.desc(), InternalProject.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    e_rows = (await db.execute(select(EmailAccount))).scalars().all()
    email_map = {e.id: e.address for e in e_rows}
    return [_build_project_response(r, email_map) for r in rows]


@router.post("/projects", response_model=InternalProjectResponse)
async def create_project(payload: InternalProjectCreate, db: AsyncSession = Depends(get_db)):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="El nombre del proyecto es obligatorio.")

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    item = InternalProject(
        name=payload.name.strip(),
        category=(payload.category or "Sistema / SaaS").strip() or "Sistema / SaaS",
        status=payload.status or "en_desarrollo",
        scope=payload.scope or "business",
        email_id=payload.email_id or None,
        production_url=payload.production_url.strip() if payload.production_url else None,
        repo_url=payload.repo_url.strip() if payload.repo_url else None,
        tech_stack=payload.tech_stack.strip() if payload.tech_stack else None,
        monthly_maintenance_cost=max(0.0, float(payload.monthly_maintenance_cost or 0.0)),
        currency=payload.currency or "MXN",
        linked_platform_ids=json.dumps(payload.linked_platform_ids or []),
        linked_domain_ids=json.dumps(payload.linked_domain_ids or []),
        tags=json.dumps([t.model_dump() for t in (payload.tags or [])]),
        notes=encrypt_note(payload.notes) if payload.notes else None,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(item)
    await log_audit_event(
        db,
        action="create",
        entity_type="project",
        entity_id=item.id,
        entity_name=item.name,
        details=f"Proyecto propio creado: {item.name} ({item.status})",
    )
    await db.commit()
    await db.refresh(item)
    e_rows = (await db.execute(select(EmailAccount))).scalars().all()
    email_map = {e.id: e.address for e in e_rows}
    return _build_project_response(item, email_map)


@router.put("/projects/{project_id}", response_model=InternalProjectResponse)
async def update_project(project_id: str, payload: InternalProjectUpdate, db: AsyncSession = Depends(get_db)):
    stmt = select(InternalProject).where(InternalProject.id == project_id, InternalProject.is_deleted == False)
    item = (await db.execute(stmt)).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Proyecto propio no encontrado.")

    if payload.name is not None:
        item.name = payload.name.strip()
    if payload.category is not None:
        item.category = payload.category.strip() or "Sistema / SaaS"
    if payload.status is not None:
        item.status = payload.status
    if payload.scope is not None:
        item.scope = payload.scope
    if "email_id" in payload.model_fields_set:
        item.email_id = payload.email_id or None
    if payload.production_url is not None:
        item.production_url = payload.production_url.strip() if payload.production_url else None
    if payload.repo_url is not None:
        item.repo_url = payload.repo_url.strip() if payload.repo_url else None
    if payload.tech_stack is not None:
        item.tech_stack = payload.tech_stack.strip() if payload.tech_stack else None
    if payload.monthly_maintenance_cost is not None:
        item.monthly_maintenance_cost = max(0.0, float(payload.monthly_maintenance_cost))
    if payload.currency is not None:
        item.currency = payload.currency
    if payload.linked_platform_ids is not None:
        item.linked_platform_ids = json.dumps(payload.linked_platform_ids)
    if payload.linked_domain_ids is not None:
        item.linked_domain_ids = json.dumps(payload.linked_domain_ids)
    if payload.tags is not None:
        item.tags = json.dumps([t.model_dump() for t in payload.tags])
    if payload.notes is not None:
        item.notes = encrypt_note(payload.notes) if payload.notes.strip() else None

    item.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await log_audit_event(
        db,
        action="update",
        entity_type="project",
        entity_id=item.id,
        entity_name=item.name,
        details=f"Actualización de proyecto propio: {item.name} ({item.status})",
    )
    await db.commit()
    await db.refresh(item)
    e_rows = (await db.execute(select(EmailAccount))).scalars().all()
    email_map = {e.id: e.address for e in e_rows}
    return _build_project_response(item, email_map)


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(InternalProject).where(InternalProject.id == project_id, InternalProject.is_deleted == False)
    item = (await db.execute(stmt)).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Proyecto propio no encontrado.")

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    item.is_deleted = True
    item.deleted_at = now_utc
    item.updated_at = now_utc

    await log_audit_event(
        db,
        action="delete",
        entity_type="project",
        entity_id=item.id,
        entity_name=item.name,
        details=f"Proyecto propio enviado a la papelera: {item.name}",
    )
    await db.commit()
    return {"message": "Proyecto enviado a la papelera."}


# ==========================================
# 5. BÓVEDA DE RECURSOS LIBRES Y NOTAS SEGURAS
# ==========================================

@router.get("/resources", response_model=list[SecureResourceResponse])
async def list_resources(db: AsyncSession = Depends(get_db)):
    stmt = (
        select(SecureResource)
        .where(SecureResource.is_deleted == False)
        .order_by(SecureResource.updated_at.desc(), SecureResource.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_build_resource_response(r) for r in rows]


@router.post("/resources", response_model=SecureResourceResponse)
async def create_resource(payload: SecureResourceCreate, db: AsyncSession = Depends(get_db)):
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="El título del recurso seguro es obligatorio.")

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    item = SecureResource(
        title=payload.title.strip(),
        resource_type=(payload.resource_type or "nota_segura").strip() or "nota_segura",
        scope=payload.scope or "business",
        ownership_type=payload.ownership_type or "own",
        encrypted_content=encrypt_note(payload.content) if payload.content else None,
        email_id=payload.email_id or None,
        platform_id=payload.platform_id or None,
        prospect_id=payload.prospect_id or None,
        project_id=payload.project_id or None,
        tags=json.dumps([t.model_dump() for t in (payload.tags or [])]),
        notes=encrypt_note(payload.notes) if payload.notes else None,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(item)
    await log_audit_event(
        db,
        action="create",
        entity_type="resource",
        entity_id=item.id,
        entity_name=item.title,
        details=f"Recurso seguro cifrado creado: {item.title} ({item.resource_type})",
    )
    await db.commit()
    await db.refresh(item)
    return _build_resource_response(item)


@router.put("/resources/{resource_id}", response_model=SecureResourceResponse)
async def update_resource(resource_id: str, payload: SecureResourceUpdate, db: AsyncSession = Depends(get_db)):
    stmt = select(SecureResource).where(SecureResource.id == resource_id, SecureResource.is_deleted == False)
    item = (await db.execute(stmt)).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Recurso seguro no encontrado.")

    if payload.title is not None:
        item.title = payload.title.strip()
    if payload.resource_type is not None:
        item.resource_type = payload.resource_type.strip() or "nota_segura"
    if payload.scope is not None:
        item.scope = payload.scope
    if payload.ownership_type is not None:
        item.ownership_type = payload.ownership_type
    if payload.content is not None:
        item.encrypted_content = encrypt_note(payload.content) if payload.content.strip() else None
    if "email_id" in payload.model_fields_set:
        item.email_id = payload.email_id or None
    if "platform_id" in payload.model_fields_set:
        item.platform_id = payload.platform_id or None
    if "prospect_id" in payload.model_fields_set:
        item.prospect_id = payload.prospect_id or None
    if "project_id" in payload.model_fields_set:
        item.project_id = payload.project_id or None
    if payload.tags is not None:
        item.tags = json.dumps([t.model_dump() for t in payload.tags])
    if payload.notes is not None:
        item.notes = encrypt_note(payload.notes) if payload.notes.strip() else None

    item.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await log_audit_event(
        db,
        action="update",
        entity_type="resource",
        entity_id=item.id,
        entity_name=item.title,
        details=f"Recurso seguro actualizado: {item.title}",
    )
    await db.commit()
    await db.refresh(item)
    return _build_resource_response(item)


@router.delete("/resources/{resource_id}")
async def delete_resource(resource_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(SecureResource).where(SecureResource.id == resource_id, SecureResource.is_deleted == False)
    item = (await db.execute(stmt)).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Recurso seguro no encontrado.")

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    item.is_deleted = True
    item.deleted_at = now_utc
    item.updated_at = now_utc

    await log_audit_event(
        db,
        action="delete",
        entity_type="resource",
        entity_id=item.id,
        entity_name=item.title,
        details=f"Recurso seguro enviado a la papelera: {item.title}",
    )
    await db.commit()
    return {"message": "Recurso seguro enviado a la papelera."}
