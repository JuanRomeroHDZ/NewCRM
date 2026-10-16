import time
import jwt
from fastapi import Header, HTTPException, status
from app.config import settings

def create_vault_token(timeout_minutes: int | None = None) -> str:
    """Generates a signed Vault Level 2 token."""
    if timeout_minutes is None:
        timeout_minutes = settings.VAULT_SESSION_TIMEOUT_MINUTES
    exp = int(time.time()) + (timeout_minutes * 60)
    payload = {
        "scope": "level2_vault",
        "exp": exp,
        "iat": int(time.time())
    }
    return jwt.encode(payload, settings.SERVER_SECRET_KEY, algorithm="HS256")

def verify_vault_token(token: str | None) -> bool:
    """Checks if vault token is valid and not expired."""
    if not token:
        return False
    try:
        payload = jwt.decode(token, settings.SERVER_SECRET_KEY, algorithms=["HS256"])
        return payload.get("scope") == "level2_vault"
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return False

def get_vault_remaining_seconds(token: str | None) -> int:
    """Returns remaining seconds until vault locks."""
    if not token:
        return 0
    try:
        payload = jwt.decode(token, settings.SERVER_SECRET_KEY, algorithms=["HS256"])
        exp = payload.get("exp", 0)
        remaining = exp - int(time.time())
        return max(0, remaining)
    except Exception:
        return 0

def require_vault_unlocked(x_vault_token: str | None = Header(None)) -> bool:
    """FastAPI dependency to strictly guard Level 2 endpoints."""
    if not verify_vault_token(x_vault_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bóveda cifrada bloqueada. Ingrese su contraseña maestra para acceder a este recurso."
        )
    return True
