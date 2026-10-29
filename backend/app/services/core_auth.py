import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status, Depends, Request
from app.config import settings
from app.models.core import User, DbSession
from app.security.crypto import hash_master_password, verify_master_password
from app.security.totp import verify_totp_code
from app.database import get_db

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def generate_temporary_password(length: int = 16) -> str:
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))

async def get_or_create_initial_owner(session: AsyncSession) -> User:
    """Ensures at least one owner user exists in the database."""
    res = await session.execute(select(User).where(User.role == "owner"))
    owner = res.scalar_one_or_none()
    if not owner:
        # Default initial owner using server secret seed
        default_pwd = hash_master_password("AdminLESSSO2026!")
        owner = User(
            username="propietario",
            email="admin@lessso.local",
            full_name="Propietario LESSSO",
            role="owner",
            hashed_password=default_pwd,
            is_active=True,
            must_change_password=False
        )
        session.add(owner)
        await session.commit()
        await session.refresh(owner)
    return owner

async def authenticate_user(
    session: AsyncSession,
    username_or_email: str,
    password: str,
    ip_address: str | None = None
) -> tuple[User | None, str | None]:
    """
    Authenticates user with Argon2id and handles lockout protection.
    Returns (user, error_message).
    """
    # Constant error message to prevent account enumeration
    GENERIC_AUTH_ERROR = "Credenciales incorrectas o cuenta bloqueada"
    
    stmt = select(User).where(
        (User.username == username_or_email) | (User.email == username_or_email)
    )
    res = await session.execute(stmt)
    user = res.scalar_one_or_none()

    now = utc_now()

    if not user:
        # Dummy verification to mitigate timing attacks
        verify_master_password(
            "$argon2id$v=19$m=65536,t=3,p=4$dummy_salt$dummy_hash",
            password
        )
        return None, GENERIC_AUTH_ERROR

    # Check if account is locked
    if user.locked_until and user.locked_until > now:
        return None, GENERIC_AUTH_ERROR

    if not user.is_active:
        return None, GENERIC_AUTH_ERROR

    is_valid = verify_master_password(user.hashed_password, password)
    if not is_valid:
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.MAX_FAILED_LOGIN_ATTEMPTS:
            user.locked_until = now + timedelta(minutes=settings.LOCKOUT_MINUTES)
        await session.commit()
        return None, GENERIC_AUTH_ERROR

    # Reset failed attempts on success
    user.failed_login_attempts = 0
    user.locked_until = None
    await session.commit()

    return user, None

async def create_user_session(
    session: AsyncSession,
    user: User,
    ip_address: str | None = None,
    user_agent: str | None = None,
    timeout_minutes: int | None = None
) -> tuple[str, DbSession]:
    """Creates a database-backed session with unique jti token."""
    if timeout_minutes is None:
        timeout_minutes = settings.VAULT_SESSION_TIMEOUT_MINUTES
    
    now = utc_now()
    expires_at = now + timedelta(minutes=timeout_minutes)
    
    raw_token = secrets.token_hex(32)
    jti = secrets.token_hex(16)
    token_str = f"sess_{jti}_{raw_token}"
    thash = hash_token(token_str)

    db_sess = DbSession(
        id=jti,
        user_id=user.id,
        token_hash=thash,
        ip_address=ip_address,
        user_agent=user_agent,
        expires_at=expires_at,
        is_revoked=False
    )
    session.add(db_sess)
    await session.commit()
    return token_str, db_sess

async def get_current_user_from_token(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> User:
    """Dependency extracting and validating user from database session token."""
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif request.cookies.get("lessso_session"):
        token = request.cookies.get("lessso_session")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticación requerida"
        )

    thash = hash_token(token)
    stmt = (
        select(DbSession)
        .where(
            DbSession.token_hash == thash,
            DbSession.is_revoked == False,
            DbSession.expires_at > utc_now()
        )
    )
    res = await db.execute(stmt)
    db_session = res.scalar_one_or_none()

    if not db_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión expirada o revocada"
        )

    user_stmt = select(User).where(User.id == db_session.user_id, User.is_active == True)
    user_res = await db.execute(user_stmt)
    user = user_res.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario inactivo o no encontrado"
        )

    return user

def require_role(allowed_roles: list[str]):
    """Role-based authorization dependency factory."""
    async def role_checker(user: User = Depends(get_current_user_from_token)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permisos insuficientes para esta acción"
            )
        return user
    return role_checker
