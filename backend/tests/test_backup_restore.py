import pytest

@pytest.mark.asyncio
async def test_encrypted_backup_and_restore_roundtrip(client, auth_token):
    """
    Tests full AES-256-GCM encrypted backup export and validated round-trip restore.
    """
    headers = {"X-Vault-Token": auth_token}

    # 1. Export encrypted vault
    export_pw = "BackupPasswordForExport123!"
    export_res = await client.post(
        "/api/v1/vault/export-encrypted",
        json={"export_password": export_pw},
        headers=headers
    )
    assert export_res.status_code == 200
    backup_data = export_res.json()
    assert backup_data["format"] == "emailsaver-encrypted-vault"
    assert backup_data["version"] == "2.0"
    assert "ciphertext" in backup_data
    assert "salt" in backup_data
    assert "nonce" in backup_data

    # 2. Restore with wrong password must fail 400
    bad_restore = await client.post(
        "/api/v1/vault/restore-encrypted",
        json={"export_password": "WrongExportPassword!", "backup_data": backup_data},
        headers=headers
    )
    assert bad_restore.status_code == 400

    # 3. Restore with correct password must succeed
    restore_res = await client.post(
        "/api/v1/vault/restore-encrypted",
        json={"export_password": export_pw, "backup_data": backup_data},
        headers=headers
    )
    assert restore_res.status_code == 200
    res_data = restore_res.json()
    assert "restored_emails" in res_data
    assert "restored_payments" in res_data
