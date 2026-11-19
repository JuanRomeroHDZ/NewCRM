import jwt
import pytest

from app.config import settings
from app.models.core import VaultSession
from app.security.tokens import (
    create_vault_token,
    get_vault_remaining_seconds,
    revoke_all_vault_sessions,
    revoke_vault_token,
    verify_vault_token,
)


@pytest.mark.asyncio
async def test_token_creation_seals_key_and_verifies_from_shared_database(db_session):
    key = b"1" * 32
    token = await create_vault_token(timeout_minutes=5, encryption_key=key, db=db_session)
    payload = jwt.decode(token, settings.SERVER_SECRET_KEY, algorithms=["HS256"])

    assert token and payload.get("vault_key")
    assert await verify_vault_token(token, db_session) is True
    assert await get_vault_remaining_seconds(token, db_session) > 0
    session = await db_session.get(VaultSession, payload["jti"])
    assert session is not None
    assert not hasattr(session, "key")


@pytest.mark.asyncio
async def test_token_revocation_is_shared_and_immediate(db_session):
    token = await create_vault_token(timeout_minutes=5, encryption_key=b"2" * 32, db=db_session)
    assert await verify_vault_token(token, db_session) is True

    assert await revoke_vault_token(token, db_session) is True
    assert await verify_vault_token(token, db_session) is False
    assert await get_vault_remaining_seconds(token, db_session) == 0


@pytest.mark.asyncio
async def test_invalid_and_expired_token(db_session):
    assert await verify_vault_token(None, db_session) is False
    assert await verify_vault_token("invalid.jwt.token", db_session) is False
    assert await verify_vault_token("", db_session) is False


@pytest.mark.asyncio
async def test_revocation_rejects_forged_token_and_all_session_revocation(db_session):
    token = await create_vault_token(timeout_minutes=5, encryption_key=b"3" * 32, db=db_session)
    payload = jwt.decode(token, settings.SERVER_SECRET_KEY, algorithms=["HS256"])
    forged = jwt.encode(payload, "clave-ficticia-diferente-para-prueba-123", algorithm="HS256")
    assert await revoke_vault_token(forged, db_session) is False
    assert await verify_vault_token(token, db_session) is True

    assert await revoke_all_vault_sessions(db_session) == 1
    await db_session.commit()
    assert await verify_vault_token(token, db_session) is False
