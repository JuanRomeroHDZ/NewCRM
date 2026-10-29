import pytest
import asyncio
from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import EmailAccount
from app.security.crypto import encrypt_note, encrypt_secret, get_server_seed_key


@pytest.mark.asyncio
async def test_change_password_preserves_encrypted_records(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    email = await client.post("/api/v1/emails", headers=headers, json={
        "address": "ficticio@example.test", "password": "Clave ficticia de correo",
        "notes": "Nota ficticia", "backup_codes": [{"code": "CODIGO-FICTICIO"}],
        "security_questions": [{"question": "Pregunta ficticia", "answer": "Respuesta ficticia"}],
    })
    assert email.status_code == 200
    platform = await client.post("/api/v1/platforms", headers=headers, json={
        "name": "Servicio ficticio", "password": "Clave ficticia de servicio",
        "api_keys": [{"id": "prueba", "label": "Prueba", "key": "Llave ficticia"}],
        "env_variables": [{"key": "VARIABLE", "value": "Valor ficticio"}],
    })
    assert platform.status_code == 200
    prospect = await client.post("/api/v1/prospects", headers=headers, json={
        "company_name": "Empresa ficticia", "notes": "Nota comercial ficticia",
    })
    assert prospect.status_code == 200
    payment = await client.post("/api/v1/payments", headers=headers, json={
        "issuer": "Prueba", "alias": "Tarjeta ficticia", "last_four": "1111",
        "card_number": "4111111111111111", "billing_notes": "Nota de tarjeta ficticia",
    })
    assert payment.status_code == 200

    changed = await client.put("/api/v1/settings", headers=headers, json={
        "current_master_password": "MasterPasswordTest123!", "new_master_password": "NuevaClaveFicticia456!",
        "clipboard_clear_seconds": 45,
    })
    assert changed.status_code == 200
    assert changed.json()["clipboard_clear_seconds"] == 45
    assert (await client.get("/api/v1/emails", headers=headers)).status_code == 401
    unlock = await client.post("/api/v1/auth/unlock", json={"master_password": "NuevaClaveFicticia456!"})
    assert unlock.status_code == 200
    new_headers = {"X-Vault-Token": unlock.json()["token"]}

    saved_email = (await client.get(f"/api/v1/emails/{email.json()['id']}", headers=new_headers)).json()
    assert saved_email["password_plain"] == "Clave ficticia de correo"
    assert saved_email["updated_at"] == email.json()["updated_at"]
    assert saved_email["notes"] == "Nota ficticia"
    assert saved_email["backup_codes"][0]["code"] == "CODIGO-FICTICIO"
    assert saved_email["security_questions"][0]["answer"] == "Respuesta ficticia"
    saved_platform = (await client.get(f"/api/v1/platforms/{platform.json()['id']}", headers=new_headers)).json()
    assert saved_platform["password_plain"] == "Clave ficticia de servicio"
    assert saved_platform["api_keys"][0]["key"] == "Llave ficticia"
    assert saved_platform["env_variables"][0]["value"] == "Valor ficticio"
    assert (await client.get(f"/api/v1/prospects/{prospect.json()['id']}", headers=new_headers)).json()["notes"] == "Nota comercial ficticia"
    assert (await client.get("/api/v1/payments", headers=new_headers)).json()[0]["card_number_plain"] == "4111111111111111"


@pytest.mark.asyncio
async def test_password_change_rolls_back_if_ciphertext_is_corrupt(client, auth_token, test_engine):
    headers = {"X-Vault-Token": auth_token}
    email = await client.post("/api/v1/emails", headers=headers, json={
        "address": "dano@example.test", "password": "Clave ficticia", "notes": "Nota conservada",
    })
    assert email.status_code == 200
    async with async_sessionmaker(test_engine)() as session:
        await session.execute(update(EmailAccount).where(EmailAccount.id == email.json()["id"]).values(encrypted_password="datos-corruptos"))
        await session.commit()

    result = await client.put("/api/v1/settings", headers=headers, json={
        "current_master_password": "MasterPasswordTest123!", "new_master_password": "NuevaClaveFicticia456!",
    })
    assert result.status_code == 409
    assert (await client.post("/api/v1/auth/unlock", json={"master_password": "NuevaClaveFicticia456!"})).status_code == 401
    old_login = await client.post("/api/v1/auth/unlock", json={"master_password": "MasterPasswordTest123!"})
    assert old_login.status_code == 200
    saved = await client.get(f"/api/v1/emails/{email.json()['id']}", headers={"X-Vault-Token": old_login.json()["token"]})
    assert saved.json()["notes"] == "Nota conservada"


@pytest.mark.asyncio
async def test_password_change_preserves_legacy_server_key_data(client, auth_token, test_engine):
    headers = {"X-Vault-Token": auth_token}
    email = await client.post("/api/v1/emails", headers=headers, json={"address": "antigua@example.test"})
    assert email.status_code == 200
    legacy_key = get_server_seed_key()
    async with async_sessionmaker(test_engine)() as session:
        await session.execute(update(EmailAccount).where(EmailAccount.id == email.json()["id"]).values(
            encrypted_password=encrypt_secret("Clave antigua ficticia", key=legacy_key),
            notes=encrypt_note("Nota antigua ficticia", key=legacy_key),
        ))
        await session.commit()
    change = await client.put("/api/v1/settings", headers=headers, json={
        "current_master_password": "MasterPasswordTest123!", "new_master_password": "NuevaClaveFicticia456!",
    })
    assert change.status_code == 200
    unlock = await client.post("/api/v1/auth/unlock", json={"master_password": "NuevaClaveFicticia456!"})
    saved = await client.get(f"/api/v1/emails/{email.json()['id']}", headers={"X-Vault-Token": unlock.json()["token"]})
    assert saved.json()["password_plain"] == "Clave antigua ficticia"
    assert saved.json()["notes"] == "Nota antigua ficticia"


@pytest.mark.asyncio
async def test_password_change_and_concurrent_write_do_not_lose_a_secret(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    changed, created = await asyncio.gather(
        client.put("/api/v1/settings", headers=headers, json={
            "current_master_password": "MasterPasswordTest123!", "new_master_password": "NuevaClaveFicticia456!",
        }),
        client.post("/api/v1/emails", headers=headers, json={
            "address": "simultaneo@example.test", "password": "Clave simultanea ficticia",
        }),
    )
    assert changed.status_code == 200
    assert created.status_code in (200, 401)
    unlock = await client.post("/api/v1/auth/unlock", json={"master_password": "NuevaClaveFicticia456!"})
    assert unlock.status_code == 200
    emails = await client.get("/api/v1/emails", headers={"X-Vault-Token": unlock.json()["token"]})
    assert emails.status_code == 200
    if created.status_code == 200:
        assert emails.json()[0]["password_plain"] == "Clave simultanea ficticia"
    else:
        assert emails.json() == []
