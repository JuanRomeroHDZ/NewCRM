from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import UserSettings
from app.schemas import MasterPasswordSetup, VaultUnlockRequest, VaultStatusResponse
from app.security.crypto import hash_master_password, verify_master_password
from app.security.tokens import create_vault_token, verify_vault_token, get_vault_remaining_seconds
from app.services.audit import log_audit_event

router = APIRouter(prefix="/auth", tags=["auth"])

@router.get("/status", response_model=VaultStatusResponse)
async def get_vault_status(
    x_vault_token: str | None = Header(None),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(UserSettings).limit(1)
    res = await db.execute(stmt)
    user_settings = res.scalar_one_or_none()

    is_setup = user_settings is not None
    is_unlocked = verify_vault_token(x_vault_token) if is_setup else False
    remaining = get_vault_remaining_seconds(x_vault_token) if is_unlocked else 0

    return VaultStatusResponse(
        is_setup=is_setup,
        is_unlocked=is_unlocked,
        remaining_seconds=remaining,
        timeout_minutes=user_settings.vault_timeout_minutes if user_settings else 10,
        clipboard_clear_seconds=user_settings.clipboard_clear_seconds if user_settings else 30,
        allow_reveal_passwords=user_settings.allow_reveal_passwords if user_settings else False,
        search_hotkey=user_settings.search_hotkey if user_settings else "ctrl+k",
        accent_color=user_settings.accent_color if user_settings else "#6366f1",
        canvas_style=user_settings.canvas_style if user_settings else "dot-grid"
    )

@router.post("/setup")
async def setup_master_password(payload: MasterPasswordSetup, db: AsyncSession = Depends(get_db)):
    stmt = select(UserSettings).limit(1)
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="La contraseña maestra ya fue configurada previamente.")

    hashed = hash_master_password(payload.master_password)
    settings = UserSettings(
        master_password_hash=hashed,
        vault_timeout_minutes=10,
        clipboard_clear_seconds=30,
        allow_reveal_passwords=False,
        search_hotkey="ctrl+k"
    )
    db.add(settings)
    await log_audit_event(db, action="create", entity_type="vault", details="Configuración inicial de contraseña maestra")
    await db.commit()

    token = create_vault_token(settings.vault_timeout_minutes)
    return {
        "message": "Bóveda configurada exitosamente.",
        "token": token,
        "timeout_minutes": settings.vault_timeout_minutes
    }

@router.post("/unlock")
async def unlock_vault(payload: VaultUnlockRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(UserSettings).limit(1)
    res = await db.execute(stmt)
    settings = res.scalar_one_or_none()
    if not settings:
        raise HTTPException(status_code=400, detail="Bóveda no inicializada. Configure una contraseña maestra primero.")

    if not verify_master_password(settings.master_password_hash, payload.master_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Contraseña maestra incorrecta."
        )

    await log_audit_event(db, action="vault_unlock", entity_type="vault", details="Bóveda desbloqueada con éxito")
    await db.commit()

    token = create_vault_token(settings.vault_timeout_minutes)
    return {
        "message": "Bóveda desbloqueada.",
        "token": token,
        "timeout_minutes": settings.vault_timeout_minutes,
        "remaining_seconds": settings.vault_timeout_minutes * 60
    }

@router.post("/lock")
async def lock_vault():
    return {"message": "Bóveda bloqueada exitosamente."}
