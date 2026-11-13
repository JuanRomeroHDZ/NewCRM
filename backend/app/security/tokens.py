import time
import secrets
import jwt
from fastapi import Header, HTTPException, status
from app.config import settings
from app.security.sessions import session_manager
from app.security.crypto import active_vault_key

def create_vault_token(timeout_minutes: int | None = None, encryption_key: bytes | None = None) -> str:
    """Generates a signed Vault Level 2 token with unique session ID (jti) and registers session in RAM."""
    if timeout_minutes is None:
        timeout_minutes = settings.VAULT_SESSION_TIMEOUT_MINUTES
    now = int(time.time())
    exp = now + (timeout_minutes * 60)
    jti = secrets.token_hex(32)

    # Register ephemeral session with derived AES key in volatile memory
    session_manager.create_session(jti=jti, key=encryption_key, exp=exp)

    payload = {
        "scope": "level2_vault",
        "jti": jti,
        "exp": exp,
        "iat": now
    }
    return jwt.encode(payload, settings.SERVER_SECRET_KEY, algorithm="HS256")

def verify_vault_token(token: str | None) -> bool:
    """Checks if vault token is valid, not expired, and active in the session manager (not revoked)."""
    if not token:
        return False
    try:
        payload = jwt.decode(token, settings.SERVER_SECRET_KEY, algorithms=["HS256"])
        if payload.get("scope") != "level2_vault":
            return False
        jti = payload.get("jti")
        if not jti:
            return False
        return session_manager.is_session_active(jti)
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, Exception):
        return False

def revoke_vault_token(token: str | None) -> bool:
    """Revokes the given vault token in the session manager and wipes the derived key from RAM."""
    if not token:
        return False
    try:
        # La firma debe verificarse incluso cuando se permite un token caducado.
        payload = jwt.decode(
            token, settings.SERVER_SECRET_KEY, algorithms=["HS256"],
            options={"verify_exp": False}
        )
        if payload.get("scope") != "level2_vault":
            return False
        jti = payload.get("jti")
        if jti:
            return session_manager.revoke_session(jti)
        return False
    except Exception:
        return False

def get_vault_remaining_seconds(token: str | None) -> int:
    """Returns remaining seconds until vault locks."""
    if not token:
        return 0
    try:
        payload = jwt.decode(token, settings.SERVER_SECRET_KEY, algorithms=["HS256"])
        jti = payload.get("jti")
        if not jti or not session_manager.is_session_active(jti):
            return 0
        exp = payload.get("exp", 0)
        remaining = exp - int(time.time())
        return max(0, remaining)
    except Exception:
        return 0

async def require_vault_unlocked(x_vault_token: str | None = Header(None)) -> bool:
    """
    FastAPI dependency to strictly guard Level 2 endpoints.
    Verifies cryptographic token, verifies session is unrevoked,
    and binds the ephemeral derived AES-256 key to the current request context.
    """
    if not x_vault_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La bóveda está bloqueada. Desbloquéala para continuar."
        )

    try:
        payload = jwt.decode(x_vault_token, settings.SERVER_SECRET_KEY, algorithms=["HS256"])
        if payload.get("scope") != "level2_vault":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes acceso a este recurso. Desbloquea la bóveda e inténtalo de nuevo."
            )
        jti = payload.get("jti")
        if not jti or not session_manager.is_session_active(jti):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="La sesión venció. Desbloquea la bóveda para continuar."
            )

        # Retrieve session-derived AES key and bind to request ContextVar
        key = session_manager.get_session_key(jti)
        if key:
            active_vault_key.set(key)

        return True
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La sesión venció. Desbloquea la bóveda para continuar."
        )
