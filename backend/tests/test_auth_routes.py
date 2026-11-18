import asyncio

import pytest
from sqlalchemy import select

from app.models.core import ConfigParameter, User
from app.security.crypto import hash_master_password
from app.config import settings

@pytest.fixture(autouse=True)
def legacy_owner_configuration(monkeypatch):
    monkeypatch.setattr(settings, "INITIAL_OWNER_USERNAME", "propietario")
    monkeypatch.setattr(settings, "INITIAL_OWNER_EMAIL", "legacy@example.test")

async def get_or_create_initial_owner(session):
    user = User(username=settings.INITIAL_OWNER_USERNAME, email=settings.INITIAL_OWNER_EMAIL,
                full_name="Legacy", role="owner", is_active=True, must_change_password=True,
                hashed_password=hash_master_password("LegacyTemporaryPassword123!"))
    session.add(user)
    await session.commit()
    return user

@pytest.mark.asyncio
async def test_auth_setup_and_unlock_lifecycle(client):
    status_res = await client.get("/api/v1/auth/status")
    data = status_res.json()
    master_pw = "MasterPasswordTest123!"

    if not data["is_setup"]:
        # Fresh setup
        setup_res = await client.post("/api/v1/auth/setup", json={"master_password": master_pw})
        assert setup_res.status_code == 200
        token = setup_res.json()["token"]
    else:
        # Unlock
        unlock_res = await client.post("/api/v1/auth/unlock", json={"master_password": master_pw})
        assert unlock_res.status_code == 200
        token = unlock_res.json()["token"]

    assert token is not None

    # Status check with token
    status_check = await client.get("/api/v1/auth/status", headers={"X-Vault-Token": token})
    assert status_check.status_code == 200
    assert status_check.json()["is_unlocked"] is True

    # Lock vault
    lock_res = await client.post("/api/v1/auth/lock", headers={"X-Vault-Token": token})
    assert lock_res.status_code == 200

    # Token is revoked
    status_after_lock = await client.get("/api/v1/auth/status", headers={"X-Vault-Token": token})
    assert status_after_lock.json()["is_unlocked"] is False

    # Bad unlock
    bad_unlock = await client.post("/api/v1/auth/unlock", json={"master_password": "WrongPassword!"})
    assert bad_unlock.status_code == 401

    # Re-unlock
    good_unlock = await client.post("/api/v1/auth/unlock", json={"master_password": master_pw})
    assert good_unlock.status_code == 200


@pytest.mark.asyncio
async def test_bootstrap_creates_one_ordinary_account_after_vault_unlock(
    client, db_session, auth_token, monkeypatch
):
    import app.api.v1.auth as auth_api

    await get_or_create_initial_owner(db_session)
    monkeypatch.setattr(auth_api.app_settings, "INITIAL_OWNER_USERNAME", "PROPIETARIO")
    payload = {
        "username": " First.User ",
        "email": " First.User@Example.test ",
        "full_name": "First User",
        "password": "FirstUserStrongPassword123!",
    }
    no_vault = await client.post("/api/v1/auth/bootstrap-account", json=payload)
    available_before = await client.get(
        "/api/v1/auth/bootstrap-status",
        headers={"X-Vault-Token": auth_token},
    )
    created = await client.post(
        "/api/v1/auth/bootstrap-account",
        headers={"X-Vault-Token": auth_token},
        json=payload,
    )
    duplicate = await client.post(
        "/api/v1/auth/bootstrap-account",
        headers={"X-Vault-Token": auth_token},
        json=payload,
    )

    assert no_vault.status_code == 401
    assert available_before.status_code == 200
    assert available_before.json() == {"available": True}
    assert created.status_code == 201
    assert created.json()["user"]["username"] == "first.user"
    assert created.json()["user"]["email"] == "first.user@example.test"
    assert created.json()["user"]["role"] == "owner"
    assert created.json()["user"]["must_change_password"] is True
    assert duplicate.status_code == 409

    available_after = await client.get(
        "/api/v1/auth/bootstrap-status",
        headers={"X-Vault-Token": auth_token},
    )
    assert available_after.status_code == 200
    assert available_after.json() == {"available": False}

    profile = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {created.json()['token']}"},
    )
    assert profile.status_code == 200
    assert profile.json()["id"] == created.json()["user"]["id"]


@pytest.mark.asyncio
async def test_bootstrap_rolls_back_user_and_claim_when_audit_recording_fails(
    client, db_session, auth_token, monkeypatch
):
    import app.api.v1.auth as auth_api

    async def fail_recording(*args, **kwargs):
        raise RuntimeError("simulated activity storage failure")

    monkeypatch.setattr(auth_api, "record_event", fail_recording)
    with pytest.raises(RuntimeError, match="simulated activity storage failure"):
        await client.post(
            "/api/v1/auth/bootstrap-account",
            headers={"X-Vault-Token": auth_token},
            json={
                "username": "atomic.user",
                "email": "atomic.user@example.test",
                "full_name": "Atomic User",
                "password": "AtomicUserStrongPassword123!",
            },
        )

    db_session.expire_all()
    created_user = await db_session.scalar(select(User).where(User.username == "atomic.user"))
    claim = await db_session.scalar(
        select(ConfigParameter).where(ConfigParameter.key == "auth.initial_owner_claimed")
    )
    assert created_user is None
    assert claim is None


@pytest.mark.asyncio
async def test_concurrent_bootstrap_requests_are_serialized_by_unique_claim(
    client, db_session, auth_token
):
    await get_or_create_initial_owner(db_session)
    requests = [
        client.post(
            "/api/v1/auth/bootstrap-account",
            headers={"X-Vault-Token": auth_token},
            json={
                "username": f"seller{index}",
                "email": f"seller{index}@example.test",
                "full_name": f"Seller {index}",
                "password": f"SellerPassword{index}Strong!",
            },
        )
        for index in (1, 2)
    ]

    responses = await asyncio.gather(*requests)

    assert sorted(response.status_code for response in responses) == [201, 409]
    db_session.expire_all()
    sellers = await db_session.scalars(select(User).where(User.role == "owner", User.is_active.is_(True)))
    assert len(list(sellers)) == 1
    claim = await db_session.scalar(
        select(ConfigParameter).where(ConfigParameter.key == "auth.initial_owner_claimed")
    )
    assert claim is not None


@pytest.mark.asyncio
async def test_bootstrap_is_closed_after_owner_password_is_changed(client, db_session, auth_token):
    owner = await get_or_create_initial_owner(db_session)
    owner.must_change_password = False
    await db_session.commit()

    response = await client.post(
        "/api/v1/auth/bootstrap-account",
        headers={"X-Vault-Token": auth_token},
        json={
            "username": "late.user",
            "email": "late.user@example.test",
            "full_name": "Late User",
            "password": "LateUserStrongPassword123!",
        },
    )

    assert response.status_code == 409


@pytest.mark.asyncio
@pytest.mark.parametrize("active", [True, False])
async def test_established_owner_cannot_be_reclaimed_even_when_disabled(client, db_session, auth_token, active):
    db_session.add(User(
        username="existing.owner", email="owner@example.test", full_name="Existing Owner",
        role="owner", is_active=active, must_change_password=False,
        hashed_password=hash_master_password("ExistingOwnerPassword123!"),
    ))
    await db_session.commit()
    headers = {"X-Vault-Token": auth_token}
    assert (await client.get('/api/v1/auth/bootstrap-status', headers=headers)).json() == {"available": False}
    response = await client.post('/api/v1/auth/bootstrap-account', headers=headers, json={
        "username": "new.owner", "email": "new@example.test", "full_name": "New Owner",
        "password": "NewOwnerPassword123!",
    })
    assert response.status_code == 409
    assert await db_session.scalar(select(User.id).where(User.username == 'new.owner')) is None


@pytest.mark.asyncio
async def test_fresh_bootstrap_is_one_time_and_requires_password_change(client, db_session, auth_token):
    headers = {"X-Vault-Token": auth_token}
    payload = {"username": "fresh.owner", "email": "fresh@example.test", "full_name": "Fresh Owner", "password": "FreshOwnerPassword123!"}
    assert (await client.get('/api/v1/auth/bootstrap-status', headers=headers)).json() == {"available": True}
    created = await client.post('/api/v1/auth/bootstrap-account', headers=headers, json=payload)
    assert created.status_code == 201
    assert created.json()['user']['role'] == 'owner'
    assert created.json()['user']['must_change_password'] is True
    assert (await client.post('/api/v1/auth/bootstrap-account', headers=headers, json=payload)).status_code == 409


@pytest.mark.asyncio
async def test_logout_revokes_account_session_without_locking_vault(client, auth_token):
    vault_headers = {"X-Vault-Token": auth_token}
    account = await client.post(
        "/api/v1/auth/bootstrap-account",
        headers=vault_headers,
        json={
            "username": "session.owner",
            "email": "session@example.test",
            "full_name": "Session Owner",
            "password": "SessionOwnerPassword123!",
        },
    )
    assert account.status_code == 201
    account_headers = {"Authorization": f"Bearer {account.json()['token']}"}
    assert (await client.get("/api/v1/auth/me", headers=account_headers)).status_code == 200
    assert (await client.post("/api/v1/auth/logout", headers=account_headers)).status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=account_headers)).status_code == 401
    assert (await client.get("/api/v1/auth/status", headers=vault_headers)).json()["is_unlocked"]


@pytest.mark.asyncio
async def test_login_handles_whitespace_and_case_insensitive_identifiers(client, db_session, auth_token):
    import app.api.v1.auth as auth_api

    await get_or_create_initial_owner(db_session)
    # Create an ordinary user with mixed-case email/username
    create_res = await client.post(
        "/api/v1/auth/bootstrap-account",
        headers={"X-Vault-Token": auth_token},
        json={
            "username": "Op.Operator",
            "email": "Op.Operator@Example.TEST",
            "full_name": "Operator Case",
            "password": "OperatorCasePassword123!",
        },
    )
    assert create_res.status_code == 201

    res_username = await client.post(
        "/api/v1/auth/login",
        json={"username_or_email": " OP.OPERATOR ", "password": "OperatorCasePassword123!"},
    )
    assert res_username.status_code == 200
    assert res_username.json()["user"]["username"] == "op.operator"

    res_email = await client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "  op.operator@EXAMPLE.test ", "password": "OperatorCasePassword123!"},
    )
    assert res_email.status_code == 200
    assert res_email.json()["user"]["email"] == "op.operator@example.test"
