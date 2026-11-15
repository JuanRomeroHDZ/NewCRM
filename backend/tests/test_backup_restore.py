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

@pytest.mark.asyncio
async def test_restore_remaps_recovery_links_when_existing_addresses_have_new_ids(db_session):
    """A recovery link follows the matched email, not its old backup ID."""
    import base64
    import json
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from sqlalchemy import select
    from app.api.v1.vault_backup import derive_export_key, restore_encrypted_vault, RestoreEncryptedRequest
    from app.models import EmailAccount

    existing = EmailAccount(id="destination-id", address="recovery@example.test", provider="Custom")
    db_session.add(existing)
    await db_session.commit()
    dump = {
        "emails": [
            {"id": "primary-old-id", "address": "primary@example.test", "provider": "Custom", "recovery_email_id": "recovery-old-id"},
            {"id": "recovery-old-id", "address": "recovery@example.test", "provider": "Custom"},
        ],
        "payments": [], "platforms": [], "incomes": [], "renewals": [],
    }
    password = "Only-Test-Password-123"
    salt, nonce = b"s" * 16, b"n" * 12
    ciphertext = AESGCM(derive_export_key(password, salt)).encrypt(nonce, json.dumps(dump).encode(), None)
    backup = {"format": "emailsaver-encrypted-vault", "salt": base64.b64encode(salt).decode(), "nonce": base64.b64encode(nonce).decode(), "ciphertext": base64.b64encode(ciphertext).decode()}
    result = await restore_encrypted_vault(RestoreEncryptedRequest(export_password=password, backup_data=backup), db_session)
    assert result["restored_emails"] == 2
    primary = (await db_session.execute(select(EmailAccount).where(EmailAccount.address == "primary@example.test"))).scalar_one()
    assert primary.recovery_email_id == "destination-id"
