import jwt
import pytest
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.security import tokens
from app.security.tokens import (
    create_vault_token,
    get_vault_remaining_seconds,
    touch_vault_token,
    verify_vault_token,
    revoke_vault_token,
)
from app.models.core import User
from app.security.crypto import hash_master_password
from app.services.core_auth import create_user_session, utc_now


@pytest.mark.asyncio
async def test_activity_extends_deadline_but_cannot_revive_or_revoke(db_session, monkeypatch):
    now = [datetime(2026, 11, 18, 12, 0, tzinfo=timezone.utc).replace(tzinfo=None)]
    monkeypatch.setattr(tokens, "_utcnow", lambda: now[0])
    token = await create_vault_token(1, b"k" * 32, db=db_session)

    now[0] += timedelta(seconds=50)
    assert 9 <= await get_vault_remaining_seconds(token, db_session) <= 10
    assert await touch_vault_token(token, db_session) >= 59
    now[0] += timedelta(seconds=20)
    assert await verify_vault_token(token, db_session)
    assert await revoke_vault_token(token, db_session)
    assert not await touch_vault_token(token, db_session)

    token = await create_vault_token(1, b"k" * 32, db=db_session)
    now[0] += timedelta(seconds=61)
    assert await touch_vault_token(token, db_session) == 0
    assert not await verify_vault_token(token, db_session)


@pytest.mark.asyncio
async def test_activity_rejects_forged_or_wrong_scope_token(db_session):
    forged = jwt.encode({"scope": "other", "jti": "x"}, settings.SERVER_SECRET_KEY, algorithm="HS256")
    assert await touch_vault_token(forged, db_session) == 0
    assert await touch_vault_token("invalid", db_session) == 0


@pytest.mark.asyncio
async def test_activity_renews_valid_account_and_marks_expired_account(client, db_session, auth_token):
    user = User(username="activity_owner", email="activity@example.test", full_name="Owner", role="owner",
                hashed_password=hash_master_password("ExamplePassword123!"), is_active=True)
    db_session.add(user)
    await db_session.commit()
    token, session = await create_user_session(db_session, user)
    session.expires_at = utc_now() + timedelta(seconds=20)
    await db_session.commit()
    headers = {"X-Vault-Token": auth_token, "Authorization": f"Bearer {token}"}
    response = await client.post("/api/v1/auth/activity", headers=headers)
    assert response.status_code == 200 and response.json()["account_active"] is True
    await db_session.refresh(session)
    assert session.expires_at > utc_now() + timedelta(seconds=30)
    session.expires_at = utc_now() - timedelta(seconds=1)
    await db_session.commit()
    response = await client.post("/api/v1/auth/activity", headers=headers)
    assert response.status_code == 200 and response.json()["account_active"] is False
    denied = await client.get("/api/v1/writeups", headers=headers)
    assert denied.status_code == 401 and denied.headers["x-auth-scope"] == "user"
