import asyncio

import pytest
from sqlalchemy import select

from app.models.core import ConfigParameter, User
from app.services.core_auth import get_or_create_initial_owner

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
    assert created.json()["user"]["role"] == "seller"
    assert created.json()["user"]["must_change_password"] is False
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
        select(ConfigParameter).where(ConfigParameter.key == "auth.initial_ordinary_account_claimed")
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
    sellers = await db_session.scalars(select(User).where(User.role == "seller"))
    assert len(list(sellers)) == 1
    claim = await db_session.scalar(
        select(ConfigParameter).where(ConfigParameter.key == "auth.initial_ordinary_account_claimed")
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
