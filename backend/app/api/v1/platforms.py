import calendar
import json
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import PlatformAccount, EmailAccount, PaymentMethod, PasswordHistory, BillingRecord, utc_now
from app.schemas import (
    PlatformCreate, PlatformUpdate, PlatformResponse, ApiKeyItem, EnvVarItem,
    TagItem, TotpSetupRequest, TotpResponse, BillingRecordResponse
)
from app.security.crypto import encrypt_secret, decrypt_secret, encrypt_note, decrypt_note
from app.security.tokens import require_vault_unlocked
from app.security.totp import generate_totp_code
from app.services.favicon import extract_favicon_url, generate_initials_svg
from app.services.audit import log_audit_event

# All platform routes strictly require an unlocked Level 2 vault session
router = APIRouter(prefix="/platforms", tags=["platforms"], dependencies=[Depends(require_vault_unlocked)])

def parse_json_safely(val: str | None, default_val=None):
    if not val:
        return default_val if default_val is not None else []
    try:
        return json.loads(val)
    except Exception:
        return default_val if default_val is not None else []

def advance_billing_date(d: date, cycle: str) -> date:
    if cycle == "daily":
        return d + timedelta(days=1)
    if cycle == "weekly":
        return d + timedelta(days=7)
    if cycle == "monthly":
        year = d.year + (d.month // 12)
        month = (d.month % 12) + 1
        last_day = calendar.monthrange(year, month)[1]
        return date(year, month, min(d.day, last_day))
    if cycle == "yearly":
        year = d.year + 1
        last_day = calendar.monthrange(year, d.month)[1]
        return date(year, d.month, min(d.day, last_day))
    return d

async def process_due_subscriptions(platforms: list[PlatformAccount], db: AsyncSession) -> bool:
    """
    Checks active paid subscriptions whose next_billing_date is today or in the past.
    Advances next_billing_date to the next cycle, records BillingRecord, and logs an AuditLog event.
    """
    today = datetime.now(timezone.utc).date()
    mutated = False
    for p in platforms:
        if p.is_deleted or p.subscription_status != "active" or (p.subscription_cost or 0) <= 0:
            continue
        if p.billing_cycle not in ("daily", "weekly", "monthly", "yearly") or not p.next_billing_date:
            continue
        try:
            due = date.fromisoformat(p.next_billing_date.strip()[:10])
        except Exception:
            continue

        iterations = 0
        while due <= today and iterations < 24:
            charged_str = due.isoformat()
            db.add(BillingRecord(
                platform_id=p.id,
                platform_name=p.name,
                amount=float(p.subscription_cost or 0.0),
                currency=p.currency or "MXN",
                billing_cycle=p.billing_cycle,
                charged_date=charged_str,
                payment_method_id=p.payment_method_id
            ))
            await log_audit_event(
                db,
                action="billing_renewal",
                entity_type="platform",
                entity_id=p.id,
                entity_name=p.name,
                details=f"Renovación automática registrada: {p.name} - ${p.subscription_cost:,.2f} {p.currency or 'MXN'} (Fecha: {charged_str})"
            )
            due = advance_billing_date(due, p.billing_cycle)
            p.next_billing_date = due.isoformat()
            mutated = True
            iterations += 1

    if mutated:
        await db.commit()
    return mutated

async def _build_platform_response(
    p: PlatformAccount,
    db: AsyncSession,
    email_map: dict[str, str] | None = None,
    pay_map: dict[str, str] | None = None
) -> PlatformResponse:
    # Resolve email address
    email_addr = "Sin correo vinculado"
    if p.email_id:
        if email_map and p.email_id in email_map:
            email_addr = email_map[p.email_id]
        else:
            email_stmt = select(EmailAccount.address).where(EmailAccount.id == p.email_id)
            email_addr = (await db.execute(email_stmt)).scalar_one_or_none() or "Sin correo vinculado"

    # Resolve payment alias
    payment_alias = None
    if p.payment_method_id:
        if pay_map and p.payment_method_id in pay_map:
            payment_alias = pay_map[p.payment_method_id]
        else:
            pay_stmt = select(PaymentMethod.alias).where(PaymentMethod.id == p.payment_method_id)
            payment_alias = (await db.execute(pay_stmt)).scalar_one_or_none()

    api_keys_raw = parse_json_safely(p.api_keys, [])
    api_keys = []
    for ak in api_keys_raw:
        decrypted_k = decrypt_secret(ak.get("encrypted_key"))
        api_keys.append(ApiKeyItem(
            id=ak.get("id", ""),
            label=ak.get("label", "Default"),
            key=decrypted_k,
            key_masked="••••••••••••••••",
            created_at=ak.get("created_at"),
            expires_at=ak.get("expires_at")
        ))

    env_vars_raw = parse_json_safely(p.env_variables, [])
    env_vars = []
    for ev in env_vars_raw:
        decrypted_v = decrypt_secret(ev.get("encrypted_value"))
        env_vars.append(EnvVarItem(
            key=ev.get("key", ""),
            value=decrypted_v,
            value_masked="••••••••"
        ))

    tags_raw = parse_json_safely(p.tags, [])
    tags = [TagItem(**t) if isinstance(t, dict) else TagItem(name=str(t)) for t in tags_raw]

    plain_pw = decrypt_secret(p.encrypted_password) if p.encrypted_password else None
    plain_pin = decrypt_secret(p.encrypted_pin) if p.encrypted_pin else None
    plain_rec = decrypt_secret(p.encrypted_recovery_codes) if p.encrypted_recovery_codes else None

    totp_code = None
    totp_remaining = None
    if p.has_totp and p.encrypted_totp_secret:
        try:
            dec_totp = decrypt_secret(p.encrypted_totp_secret)
            if dec_totp:
                totp_code, totp_remaining = generate_totp_code(dec_totp)
        except Exception:
            pass

    return PlatformResponse(
        id=p.id,
        name=p.name,
        email_id=p.email_id,
        prospect_id=getattr(p, "prospect_id", None),
        project_id=getattr(p, "project_id", None),
        ownership_type=getattr(p, "ownership_type", "own") or "own",
        scope=getattr(p, "scope", "business") or "business",
        business_share_percent=float(p.business_share_percent if p.business_share_percent is not None else 100.0),
        email_address=email_addr,
        payment_alias=payment_alias,
        specific_alias=p.specific_alias,
        login_url=p.login_url,
        username=p.username,
        notes=decrypt_note(p.notes),
        icon_url=p.icon_url,
        icon_type=p.icon_type,
        access_type=p.access_type,
        has_password=bool(p.encrypted_password),
        password_masked="••••••••" if p.encrypted_password else ("Inicio con correo" if p.access_type == "sso" else "Sin clave"),
        password_plain=plain_pw,
        pin_masked="••••" if p.encrypted_pin else None,
        pin_plain=plain_pin,
        recovery_codes_plain=plain_rec,
        has_totp=bool(p.has_totp),
        totp_code=totp_code,
        totp_remaining=totp_remaining,
        api_keys=api_keys,
        env_variables=env_vars,
        subscription_status=p.subscription_status,
        subscription_cost=float(p.subscription_cost or 0.0),
        currency=p.currency,
        billing_cycle=p.billing_cycle,
        start_date=p.start_date,
        next_billing_date=p.next_billing_date,
        trial_end_date=p.trial_end_date,
        payment_method_id=p.payment_method_id,
        tags=tags,
        is_deleted=p.is_deleted,
        created_at=p.created_at,
        updated_at=p.updated_at
    )

@router.get("/billing-history", response_model=list[BillingRecordResponse])
async def get_billing_history(
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(BillingRecord).order_by(BillingRecord.charged_date.desc(), BillingRecord.created_at.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        BillingRecordResponse(
            id=r.id,
            platform_id=r.platform_id,
            platform_name=r.platform_name,
            amount=float(r.amount or 0.0),
            currency=r.currency,
            billing_cycle=r.billing_cycle,
            charged_date=r.charged_date,
            payment_method_id=r.payment_method_id,
            created_at=r.created_at
        )
        for r in rows
    ]

@router.post("/process-subscriptions")
async def trigger_process_due_subscriptions(db: AsyncSession = Depends(get_db)):
    """Explicitly advances and records due recurring platform subscriptions (idempotent, safe)."""
    stmt = select(PlatformAccount).where(PlatformAccount.is_deleted == False)
    platforms = list((await db.execute(stmt)).scalars().all())
    mutated = await process_due_subscriptions(platforms, db)
    return {"mutated": mutated, "message": "Procesamiento de suscripciones vencidas completado."}

@router.get("", response_model=list[PlatformResponse])
async def list_platforms(
    email_id: str | None = None,
    status: str | None = None,
    search: str | None = None,
    tag: str | None = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PlatformAccount).where(PlatformAccount.is_deleted == False)
    if email_id:
        stmt = stmt.where(PlatformAccount.email_id == email_id)
    if status:
        stmt = stmt.where(PlatformAccount.subscription_status == status)
    if search:
        stmt = stmt.where(PlatformAccount.name.ilike(f"%{search.strip()}%") | PlatformAccount.username.ilike(f"%{search.strip()}%"))

    stmt = stmt.order_by(PlatformAccount.name.asc())
    res = await db.execute(stmt)
    platforms = list(res.scalars().all())

    # Pre-fetch emails and payments for labels
    email_res = await db.execute(select(EmailAccount.id, EmailAccount.address))
    email_map = dict(email_res.all())

    pay_res = await db.execute(select(PaymentMethod.id, PaymentMethod.alias))
    pay_map = dict(pay_res.all())

    output = []
    for p in platforms:
        if tag:
            tags_raw = parse_json_safely(p.tags, [])
            tags = [TagItem(**t) if isinstance(t, dict) else TagItem(name=str(t)) for t in tags_raw]
            if not any(t.name.lower() == tag.lower() for t in tags):
                continue
        output.append(await _build_platform_response(p, db=db, email_map=email_map, pay_map=pay_map))

    return output

@router.get("/{platform_id}", response_model=PlatformResponse)
async def get_platform_detail(
    platform_id: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PlatformAccount).where(PlatformAccount.id == platform_id, PlatformAccount.is_deleted == False)
    res = await db.execute(stmt)
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Plataforma no encontrada.")

    return await _build_platform_response(p, db=db)

@router.post("", response_model=PlatformResponse)
async def create_platform(
    payload: PlatformCreate,
    db: AsyncSession = Depends(get_db)
):
    enc_pw = None
    if payload.password and payload.access_type != "sso":
        enc_pw = encrypt_secret(payload.password)

    enc_pin = encrypt_secret(payload.pin) if payload.pin else None
    enc_rec = encrypt_secret(payload.recovery_codes) if payload.recovery_codes else None
    enc_totp = encrypt_secret(payload.totp_secret) if payload.totp_secret else None

    # Process and encrypt API keys
    stored_keys = []
    for ak in payload.api_keys:
        if ak.key and ak.key.strip():
            stored_keys.append({
                "id": ak.id or f"key_{datetime.now(timezone.utc).timestamp()}",
                "label": ak.label or "Default",
                "encrypted_key": encrypt_secret(ak.key.strip()),
                "created_at": ak.created_at or datetime.now(timezone.utc).isoformat(),
                "expires_at": ak.expires_at
            })

    # Process and encrypt Env variables
    stored_env = []
    for ev in payload.env_variables:
        if ev.key and ev.key.strip():
            stored_env.append({
                "key": ev.key.strip(),
                "encrypted_value": encrypt_secret(ev.value.strip()) if ev.value else None
            })

    # Icon handling: try auto-extracting favicon if login_url provided and no custom icon
    icon_url = payload.icon_url
    icon_type = payload.icon_type or "catalog"
    if not icon_url and payload.login_url:
        extracted = await extract_favicon_url(payload.login_url)
        if extracted:
            icon_url = extracted
            icon_type = "initials" if extracted.startswith("data:image/svg+xml") else "extracted"
        else:
            icon_url = generate_initials_svg(payload.name)
            icon_type = "initials"
    elif not icon_url:
        icon_url = generate_initials_svg(payload.name)
        icon_type = "initials"

    platform = PlatformAccount(
        name=payload.name.strip(),
        email_id=payload.email_id if payload.email_id != "" else None,
        prospect_id=payload.prospect_id if payload.prospect_id != "" else None,
        project_id=payload.project_id if payload.project_id != "" else None,
        ownership_type=payload.ownership_type or "own",
        scope=payload.scope or "business",
        business_share_percent=float(payload.business_share_percent if payload.business_share_percent is not None else 100.0),
        specific_alias=payload.specific_alias.strip() if payload.specific_alias else None,
        login_url=payload.login_url.strip() if payload.login_url else None,
        username=payload.username.strip() if payload.username else None,
        notes=encrypt_note(payload.notes),
        icon_url=icon_url,
        icon_type=icon_type,
        access_type=payload.access_type,
        encrypted_password=enc_pw,
        encrypted_pin=enc_pin,
        encrypted_recovery_codes=enc_rec,
        encrypted_totp_secret=enc_totp,
        has_totp=bool(enc_totp),
        password_updated_at=utc_now() if enc_pw else None,
        api_keys=json.dumps(stored_keys),
        env_variables=json.dumps(stored_env),
        subscription_status=payload.subscription_status,
        subscription_cost=payload.subscription_cost,
        currency=payload.currency,
        billing_cycle=payload.billing_cycle,
        start_date=payload.start_date,
        next_billing_date=payload.next_billing_date,
        trial_end_date=payload.trial_end_date,
        payment_method_id=payload.payment_method_id if payload.payment_method_id != "" else None,
        tags=json.dumps([t.model_dump() for t in payload.tags])
    )
    db.add(platform)
    await db.flush()

    if enc_pw:
        db.add(PasswordHistory(
            target_type="platform",
            target_id=platform.id,
            target_name=platform.name,
            encrypted_password=enc_pw,
            reason="creation"
        ))

    await log_audit_event(
        db, action="create", entity_type="platform", entity_id=platform.id, entity_name=platform.name,
        details=f"Plataforma {platform.name} registrada con credenciales cifradas"
    )
    await db.commit()
    return await _build_platform_response(platform, db=db)

@router.put("/{platform_id}", response_model=PlatformResponse)
async def update_platform(
    platform_id: str,
    payload: PlatformUpdate,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PlatformAccount).where(PlatformAccount.id == platform_id, PlatformAccount.is_deleted == False)
    platform = (await db.execute(stmt)).scalar_one_or_none()
    if not platform:
        raise HTTPException(status_code=404, detail="Plataforma no encontrada.")

    if payload.name is not None:
        platform.name = payload.name.strip()
    if payload.email_id is not None:
        platform.email_id = payload.email_id if payload.email_id.strip() != "" else None
    if payload.prospect_id is not None:
        platform.prospect_id = payload.prospect_id if payload.prospect_id.strip() != "" else None
    if payload.project_id is not None:
        platform.project_id = payload.project_id if payload.project_id.strip() != "" else None
    if payload.ownership_type is not None:
        platform.ownership_type = payload.ownership_type
    if payload.scope is not None:
        platform.scope = payload.scope
    if payload.business_share_percent is not None:
        platform.business_share_percent = float(payload.business_share_percent)
    if payload.specific_alias is not None:
        platform.specific_alias = payload.specific_alias.strip() if payload.specific_alias else None
    if payload.login_url is not None:
        platform.login_url = payload.login_url.strip() if payload.login_url else None
    if payload.username is not None:
        platform.username = payload.username.strip() if payload.username else None
    if payload.notes is not None:
        platform.notes = encrypt_note(payload.notes)
    if payload.icon_url is not None:
        platform.icon_url = payload.icon_url
    if payload.icon_type is not None:
        platform.icon_type = payload.icon_type
    if payload.access_type is not None:
        platform.access_type = payload.access_type
    if payload.subscription_status is not None:
        platform.subscription_status = payload.subscription_status
    if payload.subscription_cost is not None:
        platform.subscription_cost = payload.subscription_cost
    if payload.currency is not None:
        platform.currency = payload.currency
    if payload.billing_cycle is not None:
        platform.billing_cycle = payload.billing_cycle
    if payload.start_date is not None:
        platform.start_date = payload.start_date
    if payload.next_billing_date is not None:
        platform.next_billing_date = payload.next_billing_date
    if payload.trial_end_date is not None:
        platform.trial_end_date = payload.trial_end_date
    if payload.payment_method_id is not None:
        platform.payment_method_id = payload.payment_method_id if payload.payment_method_id != "" else None
    if payload.tags is not None:
        platform.tags = json.dumps([t.model_dump() for t in payload.tags])

    # Update credentials
    if payload.password is not None and payload.password != "":
        new_enc = encrypt_secret(payload.password)
        platform.encrypted_password = new_enc
        platform.password_updated_at = utc_now()
        db.add(PasswordHistory(
            target_type="platform",
            target_id=platform.id,
            target_name=platform.name,
            encrypted_password=new_enc,
            reason="update"
        ))

    if payload.pin is not None:
        platform.encrypted_pin = encrypt_secret(payload.pin) if payload.pin.strip() else None
    if payload.recovery_codes is not None:
        platform.encrypted_recovery_codes = encrypt_secret(payload.recovery_codes) if payload.recovery_codes.strip() else None

    if payload.totp_secret is not None:
        if payload.totp_secret.strip():
            platform.encrypted_totp_secret = encrypt_secret(payload.totp_secret.strip())
            platform.has_totp = True
        else:
            platform.encrypted_totp_secret = None
            platform.has_totp = False

    if payload.api_keys is not None:
        stored_keys = []
        for ak in payload.api_keys:
            if ak.key and ak.key.strip():
                stored_keys.append({
                    "id": ak.id or f"key_{datetime.now(timezone.utc).timestamp()}",
                    "label": ak.label or "Default",
                    "encrypted_key": encrypt_secret(ak.key.strip()),
                    "created_at": ak.created_at or datetime.now(timezone.utc).isoformat(),
                    "expires_at": ak.expires_at
                })
        platform.api_keys = json.dumps(stored_keys)

    if payload.env_variables is not None:
        stored_env = []
        for ev in payload.env_variables:
            if ev.key and ev.key.strip():
                stored_env.append({
                    "key": ev.key.strip(),
                    "encrypted_value": encrypt_secret(ev.value.strip()) if ev.value else None
                })
        platform.env_variables = json.dumps(stored_env)

    await log_audit_event(
        db, action="update", entity_type="platform", entity_id=platform.id, entity_name=platform.name,
        details="Actualización de datos y credenciales de la plataforma"
    )
    await db.commit()
    return await _build_platform_response(platform, db=db)

@router.delete("/{platform_id}")
async def delete_platform_soft(
    platform_id: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PlatformAccount).where(PlatformAccount.id == platform_id, PlatformAccount.is_deleted == False)
    platform = (await db.execute(stmt)).scalar_one_or_none()
    if not platform:
        raise HTTPException(status_code=404, detail="Plataforma no encontrada.")

    platform.is_deleted = True
    platform.deleted_at = utc_now()
    await log_audit_event(
        db, action="delete", entity_type="platform", entity_id=platform.id, entity_name=platform.name,
        details="Plataforma enviada a la papelera (Soft delete)"
    )
    await db.commit()
    return {"message": f"Plataforma {platform.name} enviada a la papelera con éxito."}

@router.get("/{platform_id}/secret")
async def get_single_secret(
    platform_id: str,
    secret_type: str = Query("password", enum=["password", "pin", "api_key", "env_var"]),
    item_id: str | None = None,
    db: AsyncSession = Depends(get_db)
):
    """Secure endpoint for copying a specific secret to clipboard."""
    stmt = select(PlatformAccount).where(PlatformAccount.id == platform_id, PlatformAccount.is_deleted == False)
    p = (await db.execute(stmt)).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Plataforma no encontrada.")

    val = None
    label = secret_type
    if secret_type == "password":
        val = decrypt_secret(p.encrypted_password)
    elif secret_type == "pin":
        val = decrypt_secret(p.encrypted_pin)
    elif secret_type == "api_key":
        keys = parse_json_safely(p.api_keys, [])
        for k in keys:
            if k.get("id") == item_id or item_id is None:
                val = decrypt_secret(k.get("encrypted_key"))
                label = k.get("label", "API Key")
                break
    elif secret_type == "env_var":
        evs = parse_json_safely(p.env_variables, [])
        for ev in evs:
            if ev.get("key") == item_id:
                val = decrypt_secret(ev.get("encrypted_value"))
                label = ev.get("key")
                break

    if not val:
        raise HTTPException(status_code=404, detail="Secreto no encontrado o vacío.")

    await log_audit_event(
        db, action="copy_secret", entity_type="platform", entity_id=p.id, entity_name=p.name,
        details=f"Copia de secreto '{label}' al portapapeles"
    )
    await db.commit()
    return {"value": val, "label": label}

@router.post("/{platform_id}/totp", response_model=TotpResponse)
async def setup_platform_totp(
    platform_id: str,
    payload: TotpSetupRequest,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PlatformAccount).where(PlatformAccount.id == platform_id, PlatformAccount.is_deleted == False)
    platform = (await db.execute(stmt)).scalar_one_or_none()
    if not platform:
        raise HTTPException(status_code=404, detail="Plataforma no encontrada.")

    try:
        code, remaining = generate_totp_code(payload.totp_secret)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Clave secreta TOTP inválida (debe ser formato Base32): {str(e)}")

    platform.encrypted_totp_secret = encrypt_secret(payload.totp_secret)
    platform.has_totp = True
    await log_audit_event(
        db, action="update_2fa", entity_type="platform", entity_id=platform.id, entity_name=platform.name,
        details="Configuración de autenticador TOTP 2FA"
    )
    await db.commit()
    return TotpResponse(code=code, remaining_seconds=remaining)

@router.get("/{platform_id}/totp", response_model=TotpResponse)
async def get_platform_totp(
    platform_id: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PlatformAccount).where(PlatformAccount.id == platform_id, PlatformAccount.is_deleted == False)
    platform = (await db.execute(stmt)).scalar_one_or_none()
    if not platform:
        raise HTTPException(status_code=404, detail="Plataforma no encontrada.")

    if not platform.has_totp or not platform.encrypted_totp_secret:
        raise HTTPException(status_code=404, detail="Esta plataforma no tiene TOTP 2FA configurado.")

    dec_secret = decrypt_secret(platform.encrypted_totp_secret)
    if not dec_secret:
        raise HTTPException(status_code=500, detail="Error al descifrar la clave TOTP.")

    code, remaining = generate_totp_code(dec_secret)
    return TotpResponse(code=code, remaining_seconds=remaining)

@router.delete("/{platform_id}/totp")
async def delete_platform_totp(
    platform_id: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PlatformAccount).where(PlatformAccount.id == platform_id, PlatformAccount.is_deleted == False)
    platform = (await db.execute(stmt)).scalar_one_or_none()
    if not platform:
        raise HTTPException(status_code=404, detail="Plataforma no encontrada.")

    platform.encrypted_totp_secret = None
    platform.has_totp = False
    await log_audit_event(
        db, action="delete_2fa", entity_type="platform", entity_id=platform.id, entity_name=platform.name,
        details="Eliminación de autenticador TOTP 2FA"
    )
    await db.commit()
    return {"message": "Autenticador TOTP eliminado con éxito."}
