import json
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Body, Depends, HTTPException, Header, Request, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings as app_settings
from app.database import get_db
from app.models import UserSettings
from app.models.core import DbSession, User
from app.schemas import (
    MasterPasswordSetup,
    TotpSetupConfirmRequest,
    TotpSetupResponse,
    TotpVerifyRequest,
    UserChangePasswordRequest,
    UserLoginRequest,
    UserLoginResponse,
    UserResponse,
    VaultStatusResponse,
    VaultUnlockRequest,
)
from app.security.crypto import hash_master_password, verify_master_password, derive_vault_key
from app.security.tokens import (
    create_vault_token,
    verify_vault_token,
    revoke_vault_token,
    get_vault_remaining_seconds,
)
from app.security.totp import generate_random_totp_secret, verify_totp_code
from app.services.audit import log_audit_event
from app.services.core_auth import (
    authenticate_user,
    create_user_session,
    get_current_user_from_token,
    get_or_create_initial_owner,
    hash_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_VAULT_FAILED_ATTEMPTS: dict[str, list[datetime]] = {}


def reset_vault_lockout() -> None:
    """Clears in-memory failed vault unlock tracking (used on success or tests)."""
    _VAULT_FAILED_ATTEMPTS.clear()


def _client_key(request: Request) -> str:
    return request.client.host if request.client and request.client.host else "local"


def _is_vault_locked_out(client_key: str) -> bool:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=app_settings.LOCKOUT_MINUTES)
    attempts = [ts for ts in _VAULT_FAILED_ATTEMPTS.get(client_key, []) if ts >= cutoff]
    if attempts:
        _VAULT_FAILED_ATTEMPTS[client_key] = attempts
    else:
        _VAULT_FAILED_ATTEMPTS.pop(client_key, None)
    return len(attempts) >= app_settings.MAX_FAILED_LOGIN_ATTEMPTS


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
        timeout_minutes=user_settings.vault_timeout_minutes if user_settings else app_settings.VAULT_SESSION_TIMEOUT_MINUTES,
        clipboard_clear_seconds=user_settings.clipboard_clear_seconds if user_settings else app_settings.CLIPBOARD_CLEAR_SECONDS,
        allow_reveal_passwords=user_settings.allow_reveal_passwords if user_settings else False,
        search_hotkey=user_settings.search_hotkey if user_settings else app_settings.DEFAULT_SEARCH_HOTKEY,
        accent_color=user_settings.accent_color if user_settings else app_settings.DEFAULT_ACCENT_COLOR,
        canvas_style=user_settings.canvas_style if user_settings else app_settings.DEFAULT_CANVAS_STYLE,
        budget_cap_amount=float(getattr(user_settings, "budget_cap_amount", 0.0) or 0.0) if user_settings else 0.0,
        budget_cap_currency=(getattr(user_settings, "budget_cap_currency", app_settings.DEFAULT_CURRENCY) or app_settings.DEFAULT_CURRENCY) if user_settings else app_settings.DEFAULT_CURRENCY,
        password_rotation_days_root=int(getattr(user_settings, "password_rotation_days_root", app_settings.DEFAULT_PASSWORD_ROTATION_DAYS_ROOT) or app_settings.DEFAULT_PASSWORD_ROTATION_DAYS_ROOT) if user_settings else app_settings.DEFAULT_PASSWORD_ROTATION_DAYS_ROOT,
        password_rotation_days_secondary=int(getattr(user_settings, "password_rotation_days_secondary", app_settings.DEFAULT_PASSWORD_ROTATION_DAYS_SECONDARY) or app_settings.DEFAULT_PASSWORD_ROTATION_DAYS_SECONDARY) if user_settings else app_settings.DEFAULT_PASSWORD_ROTATION_DAYS_SECONDARY,
        trash_retention_days=int(getattr(user_settings, "trash_retention_days", 0) or 0) if user_settings else 0,
        max_followup_attempts=int(getattr(user_settings, "max_followup_attempts", app_settings.DEFAULT_MAX_FOLLOWUP_ATTEMPTS) or app_settings.DEFAULT_MAX_FOLLOWUP_ATTEMPTS) if user_settings else app_settings.DEFAULT_MAX_FOLLOWUP_ATTEMPTS
    )

@router.post("/setup")
async def setup_master_password(payload: MasterPasswordSetup, db: AsyncSession = Depends(get_db)):
    stmt = select(UserSettings).limit(1)
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="La contraseña de acceso ya fue configurada previamente.")

    if len(payload.master_password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña de acceso debe tener al menos 8 caracteres.")

    # Generate a unique cryptographic salt for this vault instance
    vault_salt = secrets.token_bytes(32).hex()
    hashed = hash_master_password(payload.master_password)
    derived_aes_key = derive_vault_key(payload.master_password, vault_salt)

    settings = UserSettings(
        master_password_hash=hashed,
        vault_salt=vault_salt,
        vault_timeout_minutes=app_settings.VAULT_SESSION_TIMEOUT_MINUTES,
        clipboard_clear_seconds=app_settings.CLIPBOARD_CLEAR_SECONDS,
        allow_reveal_passwords=False,
        search_hotkey=app_settings.DEFAULT_SEARCH_HOTKEY
    )
    db.add(settings)
    await log_audit_event(db, action="create", entity_type="vault", details="Configuración inicial de contraseña de acceso")
    await db.commit()

    reset_vault_lockout()
    token = create_vault_token(settings.vault_timeout_minutes, encryption_key=derived_aes_key)
    return {
        "message": "Bóveda configurada exitosamente.",
        "token": token,
        "timeout_minutes": settings.vault_timeout_minutes
    }

@router.post("/unlock")
async def unlock_vault(
    payload: VaultUnlockRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_key = _client_key(request)
    if _is_vault_locked_out(client_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos fallidos. Espera unos minutos antes de intentar de nuevo."
        )

    stmt = select(UserSettings).limit(1)
    res = await db.execute(stmt)
    settings = res.scalar_one_or_none()
    if not settings:
        raise HTTPException(status_code=400, detail="El espacio seguro aún no está configurado. Configure una contraseña de acceso primero.")

    if not verify_master_password(settings.master_password_hash, payload.master_password):
        _VAULT_FAILED_ATTEMPTS.setdefault(client_key, []).append(datetime.now(timezone.utc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Contraseña de acceso incorrecta."
        )

    reset_vault_lockout()

    # If vault_salt was missing from a legacy DB migration, generate and save it
    vault_salt = getattr(settings, "vault_salt", None)
    if not vault_salt:
        vault_salt = secrets.token_bytes(32).hex()
        settings.vault_salt = vault_salt
        await db.commit()

    derived_aes_key = derive_vault_key(payload.master_password, vault_salt)

    await log_audit_event(db, action="vault_unlock", entity_type="vault", details="Bóveda desbloqueada con éxito")
    await db.commit()

    token = create_vault_token(settings.vault_timeout_minutes, encryption_key=derived_aes_key)
    return {
        "message": "Bóveda desbloqueada.",
        "token": token,
        "timeout_minutes": settings.vault_timeout_minutes,
        "remaining_seconds": settings.vault_timeout_minutes * 60
    }

@router.post("/lock")
async def lock_vault(x_vault_token: str | None = Header(None)):
    """Locks the vault immediately and revokes the active session token in the session manager."""
    if x_vault_token:
        revoke_vault_token(x_vault_token)
    return {"message": "Bóveda bloqueada exitosamente y sesión revocada."}

# Endpoints de Autenticación de Usuarios del Núcleo

@router.post("/login", response_model=UserLoginResponse)
async def user_login(
    payload: UserLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    # Ensure at least owner exists
    await get_or_create_initial_owner(db)
    
    ip_addr = request.client.host if request.client else None
    user, err = await authenticate_user(
        db,
        username_or_email=payload.username_or_email,
        password=payload.password,
        ip_address=ip_addr
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=err or "Credenciales incorrectas o cuenta bloqueada"
        )

    # If 2FA is active, verify code or recovery code
    if user.is_totp_enabled:
        if not payload.totp_code:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Se requiere código de verificación en dos pasos (2FA)."
            )
        
        valid_totp = False
        if user.totp_secret and verify_totp_code(user.totp_secret, payload.totp_code):
            valid_totp = True
        elif user.recovery_codes:
            try:
                rec_list = json.loads(user.recovery_codes)
                code_hash = hash_token(payload.totp_code.strip())
                if code_hash in rec_list:
                    rec_list.remove(code_hash)
                    user.recovery_codes = json.dumps(rec_list)
                    valid_totp = True
                    await db.commit()
            except Exception:
                pass
                
        if not valid_totp:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Código de verificación en dos pasos inválido."
            )

    user_agent = request.headers.get("User-Agent")
    token_str, db_sess = await create_user_session(
        db,
        user=user,
        ip_address=ip_addr,
        user_agent=user_agent
    )

    user_resp = UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        is_totp_enabled=user.is_totp_enabled,
        must_change_password=user.must_change_password,
        created_at=user.created_at
    )

    return UserLoginResponse(
        token=token_str,
        user=user_resp,
        expires_in_minutes=app_settings.VAULT_SESSION_TIMEOUT_MINUTES
    )

@router.post("/logout")
async def user_logout(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif request.cookies.get("lessso_session"):
        token = request.cookies.get("lessso_session")

    if token:
        thash = hash_token(token)
        await db.execute(
            update(DbSession)
            .where(DbSession.token_hash == thash)
            .values(is_revoked=True)
        )
        await db.commit()

    return {"message": "Sesión cerrada exitosamente."}

@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user_from_token)
):
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        is_active=current_user.is_active,
        is_totp_enabled=current_user.is_totp_enabled,
        must_change_password=current_user.must_change_password,
        created_at=current_user.created_at
    )

@router.post("/change-password")
async def change_user_password(
    payload: UserChangePasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    if not verify_master_password(current_user.hashed_password, payload.current_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="La contraseña actual es incorrecta.")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe ser diferente a la actual.")
    if current_user.is_totp_enabled:
        if not payload.totp_code or not current_user.totp_secret or not verify_totp_code(current_user.totp_secret, payload.totp_code):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Se requiere un código 2FA válido.")

    current_user.hashed_password = hash_master_password(payload.new_password)
    current_user.must_change_password = False

    # Revoke other sessions so only the active caller session remains valid
    auth_header = request.headers.get("Authorization")
    current_token = auth_header[7:].strip() if auth_header and auth_header.startswith("Bearer ") else request.cookies.get("lessso_session")
    current_hash = hash_token(current_token) if current_token else None
    revoke_stmt = update(DbSession).where(DbSession.user_id == current_user.id, DbSession.is_revoked == False)
    if current_hash:
        revoke_stmt = revoke_stmt.where(DbSession.token_hash != current_hash)
    await db.execute(revoke_stmt.values(is_revoked=True))

    await log_audit_event(
        db,
        action="change_password",
        entity_type="user",
        entity_id=current_user.id,
        entity_name=current_user.username,
        details=f"Contraseña actualizada para el usuario {current_user.username}",
    )
    await db.commit()
    return {"message": "Contraseña actualizada correctamente."}

@router.post("/setup-2fa", response_model=TotpSetupResponse)
async def setup_two_factor(
    payload: TotpSetupConfirmRequest | None = Body(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    if current_user.is_totp_enabled:
        if not payload or not payload.current_password or not verify_master_password(current_user.hashed_password, payload.current_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Confirma tu contraseña actual para regenerar la verificación en dos pasos."
            )

    secret = generate_random_totp_secret()
    raw_recovery_codes = [secrets.token_hex(4).upper() for _ in range(8)]
    hashed_codes = [hash_token(c) for c in raw_recovery_codes]

    current_user.totp_secret = secret
    current_user.recovery_codes = json.dumps(hashed_codes)
    await db.commit()

    return TotpSetupResponse(
        secret=secret,
        recovery_codes=raw_recovery_codes
    )

@router.post("/verify-2fa")
async def verify_two_factor(
    payload: TotpVerifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="Debe solicitar primero la configuración 2FA.")

    if not verify_totp_code(current_user.totp_secret, payload.code):
        raise HTTPException(status_code=400, detail="Código 2FA incorrecto.")

    current_user.is_totp_enabled = True
    await db.commit()
    return {"message": "Verificación en dos pasos (2FA) activada correctamente."}
