import jwt
import pytest
from datetime import timedelta

from app.config import settings
from app.security import sessions
from app.security.tokens import create_vault_token, get_vault_remaining_seconds, touch_vault_token, verify_vault_token, revoke_vault_token
from app.models.core import User
from app.security.crypto import hash_master_password
from app.services.core_auth import create_user_session, utc_now


def test_activity_extends_deadline_but_cannot_revive_or_revoke(monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(sessions.time, 'time', lambda: now[0])
    token = create_vault_token(1, b'key')
    now[0] += 50
    assert 9 <= get_vault_remaining_seconds(token) <= 10
    assert touch_vault_token(token) >= 59
    now[0] += 20
    assert verify_vault_token(token)
    assert revoke_vault_token(token)
    assert not touch_vault_token(token)
    token = create_vault_token(1, b'key')
    now[0] += 61
    assert not touch_vault_token(token)
    assert not verify_vault_token(token)


def test_activity_rejects_forged_or_wrong_scope_token():
    forged = jwt.encode({'scope': 'other', 'jti': 'x'}, settings.SERVER_SECRET_KEY, algorithm='HS256')
    assert touch_vault_token(forged) == 0
    assert touch_vault_token('invalid') == 0


@pytest.mark.asyncio
async def test_activity_renews_valid_account_and_marks_expired_account(client, db_session, auth_token):
    user = User(username='activity_owner', email='activity@example.test', full_name='Owner', role='owner',
                hashed_password=hash_master_password('ExamplePassword123!'), is_active=True)
    db_session.add(user)
    await db_session.commit()
    token, session = await create_user_session(db_session, user)
    session.expires_at = utc_now() + timedelta(seconds=20)
    await db_session.commit()
    headers = {'X-Vault-Token': auth_token, 'Authorization': f'Bearer {token}'}
    response = await client.post('/api/v1/auth/activity', headers=headers)
    assert response.status_code == 200 and response.json()['account_active'] is True
    await db_session.refresh(session)
    assert session.expires_at > utc_now() + timedelta(seconds=30)
    session.expires_at = utc_now() - timedelta(seconds=1)
    await db_session.commit()
    response = await client.post('/api/v1/auth/activity', headers=headers)
    assert response.status_code == 200 and response.json()['account_active'] is False
    denied = await client.get('/api/v1/writeups', headers=headers)
    assert denied.status_code == 401 and denied.headers['x-auth-scope'] == 'user'
