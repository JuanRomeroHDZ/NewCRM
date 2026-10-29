import pytest
from app.security.pwned import check_pwned_password
from app.config import settings

@pytest.mark.asyncio
async def test_settings_master_password_change_requires_verification(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    original_pw = "MasterPasswordTest123!"

    # 1. Attempt to change master password without current password -> 400
    res_no_cur = await client.put(
        "/api/v1/settings",
        json={"new_master_password": "BrandNewMasterPass2026!"},
        headers=headers
    )
    assert res_no_cur.status_code == 400

    # 2. Attempt to change with WRONG current password -> 401
    res_wrong_cur = await client.put(
        "/api/v1/settings",
        json={
            "current_master_password": "WrongCurrentPassword123!",
            "new_master_password": "BrandNewMasterPass2026!"
        },
        headers=headers
    )
    assert res_wrong_cur.status_code == 401

    # 3. Change with CORRECT current password -> 200
    res_success = await client.put(
        "/api/v1/settings",
        json={
            "current_master_password": original_pw,
            "new_master_password": "BrandNewMasterPass2026!"
        },
        headers=headers
    )
    assert res_success.status_code == 200

    # 4. Old token is now invalidated by revocation
    old_token_res = await client.get("/api/v1/emails", headers=headers)
    assert old_token_res.status_code == 401

    # 5. Unlock with new password succeeds
    new_unlock = await client.post("/api/v1/auth/unlock", json={"master_password": "BrandNewMasterPass2026!"})
    assert new_unlock.status_code == 200
    new_token = new_unlock.json()["token"]

    # Restore master password back for other tests
    await client.put(
        "/api/v1/settings",
        json={
            "current_master_password": "BrandNewMasterPass2026!",
            "new_master_password": original_pw
        },
        headers={"X-Vault-Token": new_token}
    )

@pytest.mark.asyncio
async def test_pwned_checker_offline_safety():
    # Very safe / random complex password that is never pwned or fails gracefully
    is_pwned, count, status = await check_pwned_password("XyZ#9981__SuperUnlikelyPasswordToEverBePwned__2026!!")
    assert status in ("safe", "unknown")
    if status == "safe":
        assert is_pwned is False
        assert count == 0


@pytest.mark.asyncio
async def test_local_mode_blocks_external_requests(client, auth_token, monkeypatch):
    monkeypatch.setattr(settings, "LOCAL_MODE", True)

    def fail_if_called(*args, **kwargs):
        raise AssertionError("El modo local no debe abrir conexiones externas")

    monkeypatch.setattr("app.services.currency.httpx.AsyncClient", fail_if_called)
    sync = await client.post("/api/v1/exchange/sync", headers={"X-Vault-Token": auth_token})
    assert sync.status_code == 200
    assert sync.json()["synced"] is False
    assert sync.json()["source"] == "modo_local"
    compromised, count, status = await check_pwned_password("Clave ficticia única para modo local 458!")
    assert (compromised, count, status) == (None, 0, "unknown")
