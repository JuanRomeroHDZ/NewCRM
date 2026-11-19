"""Shared, revocable vault sessions for multi-process and multi-replica deployments."""

import asyncio
import base64
import secrets
import weakref
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator

import jwt
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal, get_db
from app.models.core import VaultSession
from app.security.crypto import active_vault_key

# PostgreSQL advisory lock shared by all replicas. Protected requests take a
# shared lock; changing the vault password takes the exclusive form so rekeying
# cannot race with reads or writes made with the previous key.
_VAULT_REKEY_LOCK_ID = 0x4C4553534F
_VAULT_REQUEST_GATES: weakref.WeakKeyDictionary = weakref.WeakKeyDictionary()


def _vault_request_gate() -> asyncio.Semaphore:
    """Bound protected requests so each can obtain its lock and ORM connections.

    AsyncEngine pools have a finite size. Acquiring the advisory lock and the
    request's ORM session from the same pool without a gate lets concurrent
    requests reserve every connection for locks and time out while waiting for
    ORM connections. The gate is per event loop because tests and ASGI servers
    may create more than one loop in a process.
    """
    loop = asyncio.get_running_loop()
    gate = _VAULT_REQUEST_GATES.get(loop)
    if gate is None:
        pool_capacity = settings.DB_POOL_SIZE + settings.DB_MAX_OVERFLOW
        gate = asyncio.Semaphore(max(1, pool_capacity // 2))
        _VAULT_REQUEST_GATES[loop] = gate
    return gate


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _wrapping_key() -> bytes:
    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=b"lessso-vault-session-key-v1",
    ).derive(settings.SERVER_SECRET_KEY.encode("utf-8"))


def _seal_vault_key(jti: str, key: bytes | None) -> str | None:
    if key is None:
        return None
    if len(key) != 32:
        raise ValueError("La clave de bóveda debe tener 32 bytes.")
    nonce = secrets.token_bytes(12)
    ciphertext = AESGCM(_wrapping_key()).encrypt(nonce, key, jti.encode("ascii"))
    return base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")


def _open_vault_key(jti: str, sealed_key: str | None) -> bytes | None:
    if not sealed_key:
        return None
    try:
        payload = base64.urlsafe_b64decode(sealed_key.encode("ascii"))
        if len(payload) < 12 + 16:
            return None
        return AESGCM(_wrapping_key()).decrypt(payload[:12], payload[12:], jti.encode("ascii"))
    except Exception:
        return None


def _decode_token(token: str | None, *, allow_expired: bool = False) -> dict | None:
    if not token:
        return None
    try:
        payload = jwt.decode(
            token,
            settings.SERVER_SECRET_KEY,
            algorithms=["HS256"],
            options={"verify_exp": not allow_expired},
        )
        if payload.get("scope") != "level2_vault" or not payload.get("jti"):
            return None
        return payload
    except jwt.InvalidTokenError:
        return None


async def _with_session(db: AsyncSession | None):
    """Return a context manager, allowing websocket checks outside HTTP DI."""
    if db is not None:
        return _ExistingSession(db)
    return _OwnedSession()


class _ExistingSession:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def __aenter__(self) -> AsyncSession:
        return self.session

    async def __aexit__(self, *_exc) -> None:
        return None


class _OwnedSession:
    async def __aenter__(self) -> AsyncSession:
        self.manager = AsyncSessionLocal()
        return await self.manager.__aenter__()

    async def __aexit__(self, *exc) -> None:
        await self.manager.__aexit__(*exc)


async def create_vault_token(
    timeout_minutes: int | None = None,
    encryption_key: bytes | None = None,
    db: AsyncSession | None = None,
) -> str:
    """Issue a signed token with a sealed key and store only revocation metadata."""
    timeout = max(1, int(timeout_minutes or settings.VAULT_SESSION_TIMEOUT_MINUTES)) * 60
    now = _utcnow()
    jti = secrets.token_hex(32)
    payload = {
        "scope": "level2_vault",
        "jti": jti,
        "iat": int(now.replace(tzinfo=timezone.utc).timestamp()),
    }
    sealed_key = _seal_vault_key(jti, encryption_key)
    if sealed_key:
        payload["vault_key"] = sealed_key

    async with await _with_session(db) as session:
        session.add(
            VaultSession(
                id=jti,
                timeout_seconds=timeout,
                expires_at=now + timedelta(seconds=timeout),
                created_at=now,
            )
        )
        await session.commit()
    return jwt.encode(payload, settings.SERVER_SECRET_KEY, algorithm="HS256")


async def _active_session(payload: dict, db: AsyncSession) -> VaultSession | None:
    session = await db.scalar(
        select(VaultSession).where(
            VaultSession.id == payload["jti"],
            VaultSession.revoked_at.is_(None),
            VaultSession.expires_at > _utcnow(),
        )
    )
    return session


async def verify_vault_token(token: str | None, db: AsyncSession | None = None) -> bool:
    """Check signature and shared session revocation/idle-expiration state."""
    payload = _decode_token(token)
    if not payload:
        return False
    async with await _with_session(db) as session:
        return await _active_session(payload, session) is not None


async def verify_vault_token_and_release(token: str | None, db: AsyncSession) -> bool:
    """Verify a long-lived channel's token without pinning a pool connection."""
    try:
        return await verify_vault_token(token, db)
    finally:
        # A WebSocket may stay open for hours. End the read transaction after
        # each check so its AsyncSession does not reserve a connection between
        # revocation polls.
        await db.rollback()


async def revoke_vault_token(token: str | None, db: AsyncSession | None = None) -> bool:
    """Revoke a token on every replica without persisting its vault key."""
    payload = _decode_token(token, allow_expired=True)
    if not payload:
        return False
    async with await _with_session(db) as session:
        result = await session.execute(
            update(VaultSession)
            .where(VaultSession.id == payload["jti"], VaultSession.revoked_at.is_(None))
            .values(revoked_at=_utcnow())
        )
        await session.commit()
        return bool(result.rowcount)


async def revoke_all_vault_sessions(db: AsyncSession | None = None) -> int:
    """Revoke all active sessions, normally after a master-password rekey."""
    async with await _with_session(db) as session:
        result = await session.execute(
            update(VaultSession)
            .where(VaultSession.revoked_at.is_(None))
            .values(revoked_at=_utcnow())
        )
        if db is None:
            await session.commit()
        return int(result.rowcount or 0)


async def get_vault_remaining_seconds(token: str | None, db: AsyncSession | None = None) -> int:
    payload = _decode_token(token)
    if not payload:
        return 0
    async with await _with_session(db) as session:
        active = await _active_session(payload, session)
        if active is None:
            return 0
        return max(0, int((active.expires_at - _utcnow()).total_seconds()))


async def touch_vault_token(token: str | None, db: AsyncSession | None = None) -> int:
    """Extend a valid shared session's idle deadline; never revive expired sessions."""
    payload = _decode_token(token)
    if not payload:
        return 0
    async with await _with_session(db) as session:
        active = await _active_session(payload, session)
        if active is None:
            return 0
        active.expires_at = _utcnow() + timedelta(seconds=active.timeout_seconds)
        await session.commit()
        return active.timeout_seconds


@asynccontextmanager
async def _database_vault_lock(db: AsyncSession, *, exclusive: bool):
    """Hold a PostgreSQL advisory lock for the complete protected HTTP request."""
    bind = db.bind
    connection = None
    if bind is not None and bind.dialect.name == "postgresql":
        async with _vault_request_gate():
            connection = await bind.connect()
            lock_function = "pg_advisory_lock" if exclusive else "pg_advisory_lock_shared"
            unlock_function = "pg_advisory_unlock" if exclusive else "pg_advisory_unlock_shared"
            try:
                await connection.execute(text(f"SELECT {lock_function}(:lock_id)"), {"lock_id": _VAULT_REKEY_LOCK_ID})
                yield
            finally:
                try:
                    await connection.execute(text(f"SELECT {unlock_function}(:lock_id)"), {"lock_id": _VAULT_REKEY_LOCK_ID})
                finally:
                    await connection.rollback()
                    await connection.close()
    else:
        yield


async def _require_vault(
    x_vault_token: str | None,
    db: AsyncSession,
    *,
    exclusive: bool,
) -> AsyncIterator[bool]:
    async with _database_vault_lock(db, exclusive=exclusive):
        payload = _decode_token(x_vault_token)
        if not x_vault_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                headers={"X-Auth-Scope": "vault"},
                detail="La bóveda está bloqueada. Desbloquéala para continuar.",
            )
        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                headers={"X-Auth-Scope": "vault"},
                detail="La sesión venció. Desbloquea la bóveda para continuar.",
            )
        session = await _active_session(payload, db)
        if session is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                headers={"X-Auth-Scope": "vault"},
                detail="La sesión venció. Desbloquea la bóveda para continuar.",
            )
        key = _open_vault_key(payload["jti"], payload.get("vault_key"))
        if key is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                headers={"X-Auth-Scope": "vault"},
                detail="La sesión no contiene una clave de bóveda válida. Desbloquéala de nuevo.",
            )
        # The ASGI middleware binds the decrypted key for the lifetime of the
        # request. FastAPI may finalize yield-dependencies in a copied context,
        # where resetting a ContextVar token would raise ValueError.
        if len(key) != 32:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                headers={"X-Auth-Scope": "vault"},
                detail="La sesión no contiene una clave de bóveda válida. Desbloquéala de nuevo.",
            )
        yield True


def vault_key_from_token(token: str | None) -> bytes | None:
    """Return a cryptographically authenticated key for request-context binding.

    Database revocation is still enforced by the route dependency. This helper
    only opens the signed and AEAD-sealed key; the key cannot grant route access.
    """
    payload = _decode_token(token)
    if payload is None:
        return None
    return _open_vault_key(payload["jti"], payload.get("vault_key"))


class VaultKeyContextMiddleware:
    """Bind the vault encryption key in one stable ASGI request context.

    A raw ASGI middleware keeps ContextVar set/reset in the same task. In
    contrast, FastAPI's yield-dependency finalization may run in a copied
    context under concurrent requests.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {name.lower(): value for name, value in scope.get("headers", [])}
        raw_token = headers.get(b"x-vault-token")
        token = raw_token.decode("latin-1") if raw_token else None
        key = vault_key_from_token(token)
        if key is None:
            await self.app(scope, receive, send)
            return

        context_token = active_vault_key.set(key)
        try:
            await self.app(scope, receive, send)
        finally:
            active_vault_key.reset(context_token)


async def require_vault_unlocked(
    x_vault_token: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> AsyncIterator[bool]:
    """FastAPI dependency that validates a shared session and binds its key per request."""
    async for allowed in _require_vault(x_vault_token, db, exclusive=False):
        yield allowed


async def require_vault_unlocked_exclusive(
    x_vault_token: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> AsyncIterator[bool]:
    """Use on vault rekey operations to exclude concurrent readers and writers."""
    async for allowed in _require_vault(x_vault_token, db, exclusive=True):
        yield allowed
