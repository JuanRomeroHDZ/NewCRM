import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import UserSettings, EmailAccount, PlatformAccount, PaymentMethod, PasswordHistory
from app.schemas import SettingsResponse, SettingsUpdate
from app.security.crypto import hash_master_password
from app.security.tokens import require_vault_unlocked
from app.services.audit import log_audit_event

router = APIRouter(prefix="/settings", tags=["settings"])

@router.get("", response_model=SettingsResponse)
async def get_settings(db: AsyncSession = Depends(get_db)):
    stmt = select(UserSettings).limit(1)
    res = await db.execute(stmt)
    s = res.scalar_one_or_none()
    if not s:
        return SettingsResponse(
            vault_timeout_minutes=10,
            clipboard_clear_seconds=30,
            allow_reveal_passwords=False,
            search_hotkey="ctrl+k",
            accent_color="#6366f1",
            canvas_style="dot-grid"
        )
    return SettingsResponse(
        vault_timeout_minutes=s.vault_timeout_minutes,
        clipboard_clear_seconds=s.clipboard_clear_seconds,
        allow_reveal_passwords=s.allow_reveal_passwords,
        search_hotkey=s.search_hotkey,
        accent_color=s.accent_color or "#6366f1",
        canvas_style=s.canvas_style or "dot-grid"
    )

@router.put("", response_model=SettingsResponse, dependencies=[Depends(require_vault_unlocked)])
async def update_settings(payload: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    stmt = select(UserSettings).limit(1)
    res = await db.execute(stmt)
    s = res.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=400, detail="Bóveda no inicializada.")

    if payload.vault_timeout_minutes is not None:
        s.vault_timeout_minutes = payload.vault_timeout_minutes
    if payload.clipboard_clear_seconds is not None:
        s.clipboard_clear_seconds = payload.clipboard_clear_seconds
    if payload.allow_reveal_passwords is not None:
        s.allow_reveal_passwords = payload.allow_reveal_passwords
    if payload.search_hotkey is not None:
        s.search_hotkey = payload.search_hotkey
    if payload.accent_color is not None:
        s.accent_color = payload.accent_color
    if payload.canvas_style is not None:
        s.canvas_style = payload.canvas_style
    if payload.new_master_password:
        s.master_password_hash = hash_master_password(payload.new_master_password)

    await log_audit_event(
        db, action="update", entity_type="settings",
        details="Ajustes de seguridad, estética y bóveda actualizados"
    )
    await db.commit()
    await db.refresh(s)

    return SettingsResponse(
        vault_timeout_minutes=s.vault_timeout_minutes,
        clipboard_clear_seconds=s.clipboard_clear_seconds,
        allow_reveal_passwords=s.allow_reveal_passwords,
        search_hotkey=s.search_hotkey,
        accent_color=s.accent_color,
        canvas_style=s.canvas_style
    )

@router.get("/export", dependencies=[Depends(require_vault_unlocked)])
async def export_vault(db: AsyncSession = Depends(get_db)):
    """Exports entire encrypted vault snapshot."""
    emails = (await db.execute(select(EmailAccount))).scalars().all()
    platforms = (await db.execute(select(PlatformAccount))).scalars().all()
    payments = (await db.execute(select(PaymentMethod))).scalars().all()
    history = (await db.execute(select(PasswordHistory))).scalars().all()

    export_payload = {
        "export_version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "emails": [
            {
                "id": e.id, "address": e.address, "provider": e.provider, "inbox_url": e.inbox_url,
                "encrypted_password": e.encrypted_password, "recovery_email_id": e.recovery_email_id,
                "recovery_phone": e.recovery_phone, "two_factor_method": e.two_factor_method,
                "encrypted_backup_codes": e.encrypted_backup_codes,
                "encrypted_security_questions": e.encrypted_security_questions,
                "aliases": e.aliases, "notes": e.notes, "is_deleted": e.is_deleted
            }
            for e in emails
        ],
        "platforms": [
            {
                "id": p.id, "name": p.name, "email_id": p.email_id, "specific_alias": p.specific_alias,
                "login_url": p.login_url, "username": p.username, "notes": p.notes, "icon_url": p.icon_url,
                "access_type": p.access_type, "encrypted_password": p.encrypted_password,
                "encrypted_pin": p.encrypted_pin, "encrypted_recovery_codes": p.encrypted_recovery_codes,
                "api_keys": p.api_keys, "env_variables": p.env_variables,
                "subscription_status": p.subscription_status, "subscription_cost": p.subscription_cost,
                "currency": p.currency, "billing_cycle": p.billing_cycle,
                "payment_method_id": p.payment_method_id, "tags": p.tags, "is_deleted": p.is_deleted
            }
            for p in platforms
        ],
        "payments": [
            {
                "id": pay.id, "issuer": pay.issuer, "alias": pay.alias, "last_four": pay.last_four,
                "encrypted_card_number": pay.encrypted_card_number, "expiry_month": pay.expiry_month,
                "expiry_year": pay.expiry_year, "encrypted_cvv": pay.encrypted_cvv,
                "billing_notes": pay.billing_notes, "is_deleted": pay.is_deleted
            }
            for pay in payments
        ]
    }

    await log_audit_event(
        db, action="export", entity_type="vault",
        details="Exportación de respaldo completo de la bóveda cifrada"
    )
    await db.commit()
    return export_payload
