import pytest
import base64
import hashlib
import json
import secrets


def _seal_test_backup(dump, password="BackupPasswordForTest123!", *, checksum=True):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from app.api.v1.vault_backup import derive_export_key

    raw = json.dumps(dump, separators=(",", ":")).encode("utf-8")
    salt, nonce = secrets.token_bytes(16), secrets.token_bytes(12)
    encrypted = AESGCM(derive_export_key(password, salt)).encrypt(nonce, raw, None)
    payload = {
        "format": "emailsaver-encrypted-vault",
        "version": "2.0",
        "salt": base64.b64encode(salt).decode("ascii"),
        "nonce": base64.b64encode(nonce).decode("ascii"),
        "ciphertext": base64.b64encode(encrypted).decode("ascii"),
    }
    if checksum:
        payload["checksum"] = hashlib.sha256(raw).hexdigest()
    return password, payload

@pytest.mark.asyncio
async def test_encrypted_backup_and_restore_roundtrip(client, auth_token, db_session):
    """
    Tests the partial AES-256-GCM export, non-mutating verification, and additive restore.
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

    # Verification must authenticate the file without changing the database.
    from sqlalchemy import func, select
    from app.models import AuditLog, EmailAccount, UserSettings

    before = (
        await db_session.scalar(select(func.count(EmailAccount.id))),
        await db_session.scalar(select(func.count(UserSettings.id))),
        await db_session.scalar(select(func.count(AuditLog.id))),
    )
    verified = await client.post(
        "/api/v1/vault/verify-encrypted",
        json={"export_password": export_pw, "backup_data": backup_data},
        headers=headers,
    )
    assert verified.status_code == 200
    assert verified.json()["valid"] is True
    assert verified.json()["partial"] is True
    assert set(verified.json()["counts"]) == {
        "emails", "platforms", "payments", "incomes", "renewals", "expenses", "projects", "resources"
    }
    invalid = await client.post(
        "/api/v1/vault/verify-encrypted",
        json={"export_password": "incorrect", "backup_data": backup_data},
        headers=headers,
    )
    assert invalid.status_code == 400
    after = (
        await db_session.scalar(select(func.count(EmailAccount.id))),
        await db_session.scalar(select(func.count(UserSettings.id))),
        await db_session.scalar(select(func.count(AuditLog.id))),
    )
    assert after == before

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
async def test_verify_rejects_authenticated_but_malformed_backup_without_writes(client, db_session, auth_token):
    from sqlalchemy import func, select
    from app.models import AuditLog, EmailAccount

    headers = {"X-Vault-Token": auth_token}
    malformed_dumps = (
        {"metadata": {}, "emails": ["not-a-record"]},
        {"metadata": {"total_emails": 2}, "emails": [{"id": "same"}]},
        {"metadata": {}, "emails": [{"id": "same"}, {"id": "same"}]},
        {"metadata": [], "emails": []},
    )
    before = (
        await db_session.scalar(select(func.count(EmailAccount.id))),
        await db_session.scalar(select(func.count(AuditLog.id))),
    )

    for dump in malformed_dumps:
        password, backup = _seal_test_backup(dump)
        response = await client.post(
            "/api/v1/vault/verify-encrypted",
            json={"export_password": password, "backup_data": backup},
            headers=headers,
        )
        assert response.status_code == 400

    after = (
        await db_session.scalar(select(func.count(EmailAccount.id))),
        await db_session.scalar(select(func.count(AuditLog.id))),
    )
    assert after == before


@pytest.mark.asyncio
async def test_verify_rejects_invalid_envelope_dimensions(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    backup = {
        "format": "emailsaver-encrypted-vault",
        "version": "2.0",
        "salt": "AA==",  # Salt must decode to 16 bytes.
        "nonce": base64.b64encode(b"n" * 12).decode("ascii"),
        "ciphertext": base64.b64encode(b"ciphertext-is-long-enough").decode("ascii"),
    }
    response = await client.post(
        "/api/v1/vault/verify-encrypted",
        json={"export_password": "BackupPasswordForTest123!", "backup_data": backup},
        headers=headers,
    )
    assert response.status_code == 400

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
    password = 'Only-Test-P' + 'assword-123'
    salt, nonce = b"s" * 16, b"n" * 12
    ciphertext = AESGCM(derive_export_key(password, salt)).encrypt(nonce, json.dumps(dump).encode(), None)
    backup = {"format": "emailsaver-encrypted-vault", "salt": base64.b64encode(salt).decode(), "nonce": base64.b64encode(nonce).decode(), "ciphertext": base64.b64encode(ciphertext).decode()}
    result = await restore_encrypted_vault(RestoreEncryptedRequest(export_password=password, backup_data=backup), db_session)
    assert result["restored_emails"] == 2
    primary = (await db_session.execute(select(EmailAccount).where(EmailAccount.address == "primary@example.test"))).scalar_one()
    assert primary.recovery_email_id == "destination-id"
