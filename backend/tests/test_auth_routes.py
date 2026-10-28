import pytest

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
