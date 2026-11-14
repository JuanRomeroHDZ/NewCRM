import pytest


@pytest.mark.asyncio
async def test_eight_hour_timeout_is_saved_and_used_after_unlock(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    updated = await client.put(
        "/api/v1/settings",
        headers=headers,
        json={"vault_timeout_minutes": 480},
    )
    assert updated.status_code == 200
    assert updated.json()["vault_timeout_minutes"] == 480

    locked = await client.post("/api/v1/auth/lock", headers=headers)
    assert locked.status_code == 200

    unlocked = await client.post(
        "/api/v1/auth/unlock",
        json={"master_password": "MasterPasswordTest123!"},
    )
    assert unlocked.status_code == 200
    assert unlocked.json()["timeout_minutes"] == 480
    assert unlocked.json()["remaining_seconds"] == 8 * 60 * 60
