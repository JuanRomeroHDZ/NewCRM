import pytest


@pytest.mark.asyncio
async def test_prospect_list_followup_and_response(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    created = await client.post("/api/v1/prospects", headers=headers, json={
        "company_name": "  Empresa de prueba  ", "contact_name": "Contacto ficticio"
    })
    assert created.status_code == 200
    prospect = created.json()
    assert prospect["company_name"] == "Empresa de prueba"

    listing = await client.get("/api/v1/prospects", headers=headers)
    assert listing.status_code == 200
    assert any(item["id"] == prospect["id"] for item in listing.json())

    contact = await client.post(
        f"/api/v1/prospects/{prospect['id']}/contact-attempt",
        headers=headers, json={"channel": "email", "note": "Contacto de prueba"},
    )
    assert contact.status_code == 200
    assert contact.json()["followup_count"] == 1
    assert contact.json()["last_contact_channel"] == "email"

    response = await client.post(f"/api/v1/prospects/{prospect['id']}/respond", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "respondido"
    assert response.json()["followup_status"] == "completado"


@pytest.mark.asyncio
async def test_invalid_prospect_name_and_email_link_are_rejected(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    for name in ("   ", "a" * 181):
        response = await client.post("/api/v1/prospects", headers=headers, json={"company_name": name})
        assert response.status_code == 422

    created = await client.post("/api/v1/prospects", headers=headers, json={"company_name": "Prueba"})
    prospect_id = created.json()["id"]
    invalid_name = await client.put(f"/api/v1/prospects/{prospect_id}", headers=headers, json={"company_name": "  "})
    assert invalid_name.status_code == 422
    invalid_email = await client.put(f"/api/v1/prospects/{prospect_id}", headers=headers, json={"email_id": "no-existe"})
    assert invalid_email.status_code == 400
    listing = await client.get(f"/api/v1/prospects/{prospect_id}", headers=headers)
    assert listing.json()["email_id"] is None
