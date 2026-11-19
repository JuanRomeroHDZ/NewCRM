import pytest


@pytest.mark.asyncio
async def test_followup_reminders_filter_before_pagination_and_can_be_cleared(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    path = "/api/v1/prospects"
    earliest_id = None
    records = (
        ("Primero", "2026-11-16", "shared", "respondido"),
        ("Segundo", "2026-11-23", "business", "nuevo"),
        ("Privado", "2026-11-17", "personal", "nuevo"),
        ("Archivado", "2026-11-18", "business", "archivado_frio"),
        ("Fuera del periodo", "2026-12-01", "business", "nuevo"),
    )
    for name, date, scope, status in records:
        result = await client.post(path, headers=headers, json={
            "company_name": name, "followup_due_date": date, "scope": scope, "status": status,
        })
        assert result.status_code == 200, result.text
        if name == "Primero":
            earliest_id = result.json()["id"]

    params = {"scope": "business", "reminder_through": "2026-11-25", "limit": 1}
    first_page = await client.get(path, headers=headers, params=params)
    assert first_page.headers["X-Total-Count"] == "2"
    assert first_page.headers["X-Has-More"] == "true"
    assert [row["company_name"] for row in first_page.json()] == ["Primero"]
    second_page = await client.get(path, headers=headers, params={**params, "offset": 1})
    assert [row["company_name"] for row in second_page.json()] == ["Segundo"]

    update = await client.put(f"{path}/{earliest_id}", headers=headers, json={"contact_name": "Ana"})
    assert update.json()["followup_due_date"] == "2026-11-16"
    invalid = await client.put(f"{path}/{earliest_id}", headers=headers, json={"followup_due_date": "2026-02-30"})
    assert invalid.status_code == 422
    clear = await client.put(f"{path}/{earliest_id}", headers=headers, json={"followup_due_date": None})
    assert clear.json()["followup_due_date"] is None
    remaining = await client.get(path, headers=headers, params=params)
    assert remaining.headers["X-Total-Count"] == "1"
    assert [row["company_name"] for row in remaining.json()] == ["Segundo"]


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
