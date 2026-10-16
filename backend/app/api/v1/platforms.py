import json
from fastapi import APIRouter, Depends, HTTPException, Header, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import PlatformAccount, EmailAccount, PaymentMethod, PasswordHistory
from app.schemas import PlatformCreate, PlatformUpdate, PlatformResponse, ApiKeyItem, EnvVarItem, TagItem, TotpSetupRequest, TotpResponse
from app.security.crypto import encrypt_secret, decrypt_secret
from app.security.tokens import verify_vault_token, require_vault_unlocked
from app.security.totp import generate_totp_code
from app.services.favicon import extract_favicon_url, generate_initials_svg
from app.services.audit import log_audit_event

router = APIRouter(prefix="/platforms", tags=["platforms"])

def parse_json_safely(val: str | None, default_val=None):
    if not val:
        return default_val if default_val is not None else []
    try:
        return json.loads(val)
    except Exception:
        return default_val if default_val is not None else []

@router.get("", response_model=list[PlatformResponse])
async def list_platforms(
    email_id: str | None = None,
    status: str | None = None,
    search: str | None = None,
    tag: str | None = None,
    x_vault_token: str | None = Header(None),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PlatformAccount).where(PlatformAccount.is_deleted == False)
    if email_id:
        stmt = stmt.where(PlatformAccount.email_id == email_id)
    if status:
        stmt = stmt.where(PlatformAccount.subscription_status == status)
    if search:
        stmt = stmt.where(PlatformAccount.name.ilike(f"%{search}%") | PlatformAccount.username.ilike(f"%{search}%"))

    stmt = stmt.order_by(PlatformAccount.name.asc())
    res = await db.execute(stmt)
    platforms = res.scalars().all()

    # Pre-fetch emails and payments for labels
    email_res = await db.execute(select(EmailAccount.id, EmailAccount.address))
    email_map = dict(email_res.all())

    pay_res = await db.execute(select(PaymentMethod.id, PaymentMethod.alias))
    pay_map = dict(pay_res.all())

    is_unlocked = verify_vault_token(x_vault_token)

    output = []
    for p in platforms:
        tags_raw = parse_json_safely(p.tags, [])
        tags = [TagItem(**t) if isinstance(t, dict) else TagItem(name=str(t)) for t in tags_raw]

        if tag and not any(t.name.lower() == tag.lower() for t in tags):
            continue

        api_keys_raw = parse_json_safely(p.api_keys, [])
        api_keys = []
        for ak in api_keys_raw:
            decrypted_k = decrypt_secret(ak.get("encrypted_key")) if is_unlocked else None
            api_keys.append(ApiKeyItem(
                id=ak.get("id", ""),
                label=ak.get("label", "Default"),
                key=decrypted_k if is_unlocked else None,
                key_masked="••••••••••••••••",
                created_at=ak.get("created_at"),
                expires_at=ak.get("expires_at")
            ))

        env_vars_raw = parse_json_safely(p.env_variables, [])
        env_vars = []
        for ev in env_vars_raw:
            decrypted_v = decrypt_secret(ev.get("encrypted_value")) if is_unlocked else None
            env_vars.append(EnvVarItem(
                key=ev.get("key", ""),
                value=decrypted_v if is_unlocked else None,
                value_masked="••••••••"
            ))

        plain_pw = decrypt_secret(p.encrypted_password) if (is_unlocked and p.encrypted_password) else None
        plain_pin = decrypt_secret(p.encrypted_pin) if (is_unlocked and p.encrypted_pin) else None
        plain_rec = decrypt_secret(p.encrypted_recovery_codes) if (is_unlocked and p.encrypted_recovery_codes) else None

        totp_code = None
        totp_remaining = None
        if p.has_totp and is_unlocked and p.encrypted_totp_secret:
            try:
                dec_totp = decrypt_secret(p.encrypted_totp_secret)
                if dec_totp:
                    totp_code, totp_remaining = generate_totp_code(dec_totp)
            except Exception:
                pass

        output.append(PlatformResponse(
            id=p.id,
            name=p.name,
            email_id=p.email_id,
            email_address=email_map.get(p.email_id, "Desconocido"),
            payment_alias=pay_map.get(p.payment_method_id) if p.payment_method_id else None,
            specific_alias=p.specific_alias,
            login_url=p.login_url,
            username=p.username,
            notes=p.notes,
            icon_url=p.icon_url,
            icon_type=p.icon_type,
            access_type=p.access_type,
            has_password=bool(p.encrypted_password),
            password_masked="••••••••" if p.encrypted_password else ("SSO / Federado" if p.access_type == "sso" else "Sin clave"),
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
            subscription_cost=p.subscription_cost,
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
        ))

    return output

@router.get("/{platform_id}", response_model=PlatformResponse)
async def get_platform_detail(
    platform_id: str,
    x_vault_token: str | None = Header(None),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PlatformAccount).where(PlatformAccount.id == platform_id, PlatformAccount.is_deleted == False)
    res = await db.execute(stmt)
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Plataforma no encontrada.")

    # Get email and payment method labels
    email_stmt = select(EmailAccount.address).where(EmailAccount.id == p.email_id)
    email_address = (await db.execute(email_stmt)).scalar_one_or_none()

    payment_alias = None
    if p.payment_method_id:
        pay_stmt = select(PaymentMethod.alias).where(PaymentMethod.id == p.payment_method_id)
        payment_alias = (await db.execute(pay_stmt)).scalar_one_or_none()

    is_unlocked = verify_vault_token(x_vault_token)

    api_keys_raw = parse_json_safely(p.api_keys, [])
    api_keys = []
    for ak in api_keys_raw:
        decrypted_k = decrypt_secret(ak.get("encrypted_key")) if is_unlocked else None
        api_keys.append(ApiKeyItem(
            id=ak.get("id", ""),
            label=ak.get("label", "Default"),
            key=decrypted_k if is_unlocked else None,
            key_masked="••••••••••••••••",
            created_at=ak.get("created_at"),
            expires_at=ak.get("expires_at")
        ))

    env_vars_raw = parse_json_safely(p.env_variables, [])
    env_vars = []
    for ev in env_vars_raw:
        decrypted_v = decrypt_secret(ev.get("encrypted_value")) if is_unlocked else None
        env_vars.append(EnvVarItem(
            key=ev.get("key", ""),
            value=decrypted_v if is_unlocked else None,
            value_masked="••••••••"
        ))

    tags_raw = parse_json_safely(p.tags, [])
    tags = [TagItem(**t) if isinstance(t, dict) else TagItem(name=str(t)) for t in tags_raw]

    plain_pw = decrypt_secret(p.encrypted_password) if (is_unlocked and p.encrypted_password) else None
    plain_pin = decrypt_secret(p.encrypted_pin) if (is_unlocked and p.encrypted_pin) else None
    plain_rec = decrypt_secret(p.encrypted_recovery_codes) if (is_unlocked and p.encrypted_recovery_codes) else None

    totp_code = None
    totp_remaining = None
    if p.has_totp and is_unlocked and p.encrypted_totp_secret:
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
        email_address=email_address,
        payment_alias=payment_alias,
        specific_alias=p.specific_alias,
        login_url=p.login_url,
        username=p.username,
        notes=p.notes,
        icon_url=p.icon_url,
        icon_type=p.icon_type,
        access_type=p.access_type,
        has_password=bool(p.encrypted_password),
        password_masked="••••••••" if p.encrypted_password else ("SSO / Federado" if p.access_type == "sso" else "Sin clave"),
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
        subscription_cost=p.subscription_cost,
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

@router.post("", response_model=PlatformResponse)
async def create_platform(
    payload: PlatformCreate,
    _auth: bool = Depends(require_vault_unlocked),
    db: AsyncSession = Depends(get_db)
):
    # Verify parent email exists
    email_stmt = select(EmailAccount).where(EmailAccount.id == payload.email_id, EmailAccount.is_deleted == False)
    if not (await db.execute(email_stmt)).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="El correo padre seleccionado no existe o está en la papelera.")

    # Icon handling: if no icon_url, extract from login_url or generate SVG initials
    icon_url = payload.icon_url
    if not icon_url:
        if payload.login_url:
            icon_url = await extract_favicon_url(payload.login_url)
        else:
            icon_url = generate_initials_svg(payload.name)

    enc_pw = encrypt_secret(payload.password) if payload.password else None
    enc_pin = encrypt_secret(payload.pin) if payload.pin else None
    enc_rec = encrypt_secret(payload.recovery_codes) if payload.recovery_codes else None
    enc_totp = encrypt_secret(payload.totp_secret) if payload.totp_secret else None
    has_totp = bool(payload.totp_secret)

    # Encrypt API keys
    stored_api_keys = []
    for ak in payload.api_keys:
        stored_api_keys.append({
            "id": ak.id,
            "label": ak.label,
            "encrypted_key": encrypt_secret(ak.key) if ak.key else None,
            "created_at": ak.created_at,
            "expires_at": ak.expires_at
        })

    # Encrypt ENV variables
    stored_env_vars = []
    for ev in payload.env_variables:
        stored_env_vars.append({
            "key": ev.key,
            "encrypted_value": encrypt_secret(ev.value) if ev.value else None
        })

    platform = PlatformAccount(
        name=payload.name,
        email_id=payload.email_id,
        specific_alias=payload.specific_alias,
        login_url=payload.login_url,
        username=payload.username,
        notes=payload.notes,
        icon_url=icon_url,
        icon_type=payload.icon_type,
        access_type=payload.access_type,
        encrypted_password=enc_pw,
        encrypted_pin=enc_pin,
        encrypted_recovery_codes=enc_rec,
        encrypted_totp_secret=enc_totp,
        has_totp=has_totp,
        api_keys=json.dumps(stored_api_keys),
        env_variables=json.dumps(stored_env_vars),
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
        details=f"Plataforma {platform.name} vinculada al correo con credenciales cifradas"
    )
    await db.commit()
    return await get_platform_detail(platform.id, x_vault_token="valid", db=db)

@router.put("/{platform_id}", response_model=PlatformResponse)
async def update_platform(
    platform_id: str,
    payload: PlatformUpdate,
    _auth: bool = Depends(require_vault_unlocked),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PlatformAccount).where(PlatformAccount.id == platform_id, PlatformAccount.is_deleted == False)
    platform = (await db.execute(stmt)).scalar_one_or_none()
    if not platform:
        raise HTTPException(status_code=404, detail="Plataforma no encontrada.")

    if payload.name is not None:
        platform.name = payload.name
    if payload.email_id is not None:
        platform.email_id = payload.email_id
    if payload.specific_alias is not None:
        platform.specific_alias = payload.specific_alias
    if payload.login_url is not None:
        platform.login_url = payload.login_url
    if payload.username is not None:
        platform.username = payload.username
    if payload.notes is not None:
        platform.notes = payload.notes
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

    # Unit of work password rotation
    if payload.password is not None and payload.password != "":
        new_enc = encrypt_secret(payload.password)
        platform.encrypted_password = new_enc
        db.add(PasswordHistory(
            target_type="platform",
            target_id=platform.id,
            target_name=platform.name,
            encrypted_password=new_enc,
            reason="rotation"
        ))

    if payload.pin is not None:
        platform.encrypted_pin = encrypt_secret(payload.pin) if payload.pin else None

    if payload.recovery_codes is not None:
        platform.encrypted_recovery_codes = encrypt_secret(payload.recovery_codes) if payload.recovery_codes else None

    if payload.totp_secret is not None:
        if payload.totp_secret == "":
            platform.encrypted_totp_secret = None
            platform.has_totp = False
        else:
            platform.encrypted_totp_secret = encrypt_secret(payload.totp_secret)
            platform.has_totp = True

    if payload.api_keys is not None:
        stored_ak = []
        for ak in payload.api_keys:
            stored_ak.append({
                "id": ak.id,
                "label": ak.label,
                "encrypted_key": encrypt_secret(ak.key) if ak.key else ak.key_masked,
                "created_at": ak.created_at,
                "expires_at": ak.expires_at
            })
        platform.api_keys = json.dumps(stored_ak)

    if payload.env_variables is not None:
        stored_ev = []
        for ev in payload.env_variables:
            stored_ev.append({
                "key": ev.key,
                "encrypted_value": encrypt_secret(ev.value) if ev.value else None
            })
        platform.env_variables = json.dumps(stored_ev)

    await log_audit_event(
        db, action="update", entity_type="platform", entity_id=platform.id, entity_name=platform.name,
        details="Actualización de datos y credenciales de la plataforma"
    )
    await db.commit()
    return await get_platform_detail(platform.id, x_vault_token="valid", db=db)

@router.delete("/{platform_id}")
async def delete_platform_soft(
    platform_id: str,
    _auth: bool = Depends(require_vault_unlocked),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PlatformAccount).where(PlatformAccount.id == platform_id, PlatformAccount.is_deleted == False)
    platform = (await db.execute(stmt)).scalar_one_or_none()
    if not platform:
        raise HTTPException(status_code=404, detail="Plataforma no encontrada.")

    platform.is_deleted = True
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
    _auth: bool = Depends(require_vault_unlocked),
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
    _auth: bool = Depends(require_vault_unlocked),
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
    _auth: bool = Depends(require_vault_unlocked),
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
    _auth: bool = Depends(require_vault_unlocked),
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
