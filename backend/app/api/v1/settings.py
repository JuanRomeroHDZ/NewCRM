import json
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import UserSettings, EmailAccount, PlatformAccount, PaymentMethod, PasswordHistory
from app.schemas import SettingsResponse, SettingsUpdate
from app.security.crypto import hash_master_password, verify_master_password, derive_vault_key
from app.security.tokens import require_vault_unlocked
from app.security.sessions import session_manager
from app.services.audit import log_audit_event

# All settings routes strictly require an unlocked Level 2 vault session
router = APIRouter(prefix="/settings", tags=["settings"], dependencies=[Depends(require_vault_unlocked)])

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
            canvas_style="dot-grid",
            budget_cap_amount=0.0,
            budget_cap_currency="MXN",
            password_rotation_days_root=90,
            password_rotation_days_secondary=180,
            trash_retention_days=0,
            max_followup_attempts=3
        )
    return SettingsResponse(
        vault_timeout_minutes=s.vault_timeout_minutes,
        clipboard_clear_seconds=s.clipboard_clear_seconds,
        allow_reveal_passwords=s.allow_reveal_passwords,
        search_hotkey=s.search_hotkey,
        accent_color=s.accent_color or "#6366f1",
        canvas_style=s.canvas_style or "dot-grid",
        budget_cap_amount=float(getattr(s, "budget_cap_amount", 0.0) or 0.0),
        budget_cap_currency=getattr(s, "budget_cap_currency", "MXN") or "MXN",
        password_rotation_days_root=int(getattr(s, "password_rotation_days_root", 90) or 90),
        password_rotation_days_secondary=int(getattr(s, "password_rotation_days_secondary", 180) or 180),
        trash_retention_days=int(getattr(s, "trash_retention_days", 0) or 0),
        max_followup_attempts=int(getattr(s, "max_followup_attempts", 3) or 3)
    )

@router.put("", response_model=SettingsResponse)
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
    if payload.budget_cap_amount is not None:
        s.budget_cap_amount = max(0.0, float(payload.budget_cap_amount))
    if payload.budget_cap_currency is not None and payload.budget_cap_currency in ("MXN", "USD"):
        s.budget_cap_currency = payload.budget_cap_currency
    if payload.password_rotation_days_root is not None:
        s.password_rotation_days_root = int(payload.password_rotation_days_root)
    if payload.password_rotation_days_secondary is not None:
        s.password_rotation_days_secondary = int(payload.password_rotation_days_secondary)
    if payload.trash_retention_days is not None and payload.trash_retention_days in (0, 30, 60, 90):
        s.trash_retention_days = int(payload.trash_retention_days)
    if payload.max_followup_attempts is not None:
        s.max_followup_attempts = max(1, min(10, int(payload.max_followup_attempts)))

    # Secure Master Password Change: verifies current master password before updating
    if payload.new_master_password:
        if not payload.current_master_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Debes ingresar tu contraseña maestra actual para autorizar el cambio."
            )
        if not verify_master_password(s.master_password_hash, payload.current_master_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="La contraseña maestra actual ingresada es incorrecta."
            )
        if len(payload.new_master_password) < 8:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La nueva contraseña maestra debe tener al menos 8 caracteres."
            )

        new_salt = secrets.token_bytes(32).hex()
        s.master_password_hash = hash_master_password(payload.new_master_password)
        s.vault_salt = new_salt
        # Invalidate active sessions to force re-authentication with new password
        session_manager.revoke_all_sessions()

    await log_audit_event(
        db, action="update", entity_type="settings",
        details="Ajustes de seguridad, políticas operativas y bóveda actualizados"
    )
    await db.commit()
    await db.refresh(s)

    return SettingsResponse(
        vault_timeout_minutes=s.vault_timeout_minutes,
        clipboard_clear_seconds=s.clipboard_clear_seconds,
        allow_reveal_passwords=s.allow_reveal_passwords,
        search_hotkey=s.search_hotkey,
        accent_color=s.accent_color,
        canvas_style=s.canvas_style,
        budget_cap_amount=float(getattr(s, "budget_cap_amount", 0.0) or 0.0),
        budget_cap_currency=getattr(s, "budget_cap_currency", "MXN") or "MXN",
        password_rotation_days_root=int(getattr(s, "password_rotation_days_root", 90) or 90),
        password_rotation_days_secondary=int(getattr(s, "password_rotation_days_secondary", 180) or 180),
        trash_retention_days=int(getattr(s, "trash_retention_days", 0) or 0),
        max_followup_attempts=int(getattr(s, "max_followup_attempts", 3) or 3)
    )

@router.get("/export")
async def export_vault(db: AsyncSession = Depends(get_db)):
    """Exports entire encrypted vault snapshot."""
    emails = (await db.execute(select(EmailAccount))).scalars().all()
    platforms = (await db.execute(select(PlatformAccount))).scalars().all()
    payments = (await db.execute(select(PaymentMethod))).scalars().all()

    dump = {
        "export_date": datetime.now(timezone.utc).isoformat(),
        "total_records": len(emails) + len(platforms) + len(payments),
        "emails": [
            {
                "id": e.id, "address": e.address, "provider": e.provider,
                "encrypted_password": e.encrypted_password,
                "notes": e.notes, "is_deleted": e.is_deleted
            }
            for e in emails
        ],
        "platforms": [
            {
                "id": p.id, "name": p.name, "username": p.username,
                "login_url": p.login_url, "encrypted_password": p.encrypted_password,
                "notes": p.notes, "is_deleted": p.is_deleted
            }
            for p in platforms
        ],
        "payments": [
            {
                "id": m.id, "issuer": m.issuer, "alias": m.alias,
                "last_four": m.last_four, "is_deleted": m.is_deleted
            }
            for m in payments
        ]
    }
    return dump
