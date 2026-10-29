import pytest


@pytest.mark.asyncio
async def test_graph_preserves_relationships_and_recovery_cycles(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    first = await client.post("/api/v1/emails", headers=headers, json={"address": "uno@example.test"})
    second = await client.post("/api/v1/emails", headers=headers, json={
        "address": "dos@example.test", "recovery_email_id": first.json()["id"],
    })
    assert first.status_code == second.status_code == 200
    updated = await client.put(f"/api/v1/emails/{first.json()['id']}", headers=headers, json={
        "recovery_email_id": second.json()["id"],
    })
    assert updated.status_code == 200
    payment = await client.post("/api/v1/payments", headers=headers, json={
        "issuer": "Banco ficticio", "alias": "Tarjeta de prueba", "last_four": "1234",
    })
    assert payment.status_code == 200
    platform = await client.post("/api/v1/platforms", headers=headers, json={
        "name": "Servicio ficticio", "email_id": first.json()["id"], "payment_method_id": payment.json()["id"],
    })
    assert platform.status_code == 200
    prospect = await client.post("/api/v1/prospects", headers=headers, json={
        "company_name": "Empresa ficticia", "email_id": first.json()["id"],
    })
    assert prospect.status_code == 200
    response = await client.get("/api/v1/graph", headers=headers)
    assert response.status_code == 200
    graph = response.json()
    assert {node["type"] for node in graph["nodes"]} == {"email", "platform", "prospect", "payment"}
    assert {link["type"] for link in graph["links"]} == {"recovery", "child", "payment", "prospect"}
    assert graph["cycles_detected"]
    assert f"email_{first.json()['id']}" in graph["critical_nodes"]


@pytest.mark.asyncio
async def test_activity_and_trash_restore_preserve_existing_record(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    created = await client.post("/api/v1/prospects", headers=headers, json={
        "company_name": "Empresa para restaurar", "notes": "Nota ficticia conservada",
    })
    assert created.status_code == 200
    prospect_id = created.json()["id"]
    assert (await client.delete(f"/api/v1/prospects/{prospect_id}", headers=headers)).status_code == 200
    assert (await client.get(f"/api/v1/prospects/{prospect_id}", headers=headers)).status_code == 404
    restored = await client.post(f"/api/v1/trash/restore/prospect/{prospect_id}", headers=headers)
    assert restored.status_code == 200
    detail = await client.get(f"/api/v1/prospects/{prospect_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["notes"] == "Nota ficticia conservada"
    activity = await client.get("/api/v1/audit/logs", headers=headers)
    assert activity.status_code == 200
    actions = {event["action"] for event in activity.json()["items"] if event["entity_id"] == prospect_id}
    assert {"create", "delete", "restore"}.issubset(actions)


@pytest.mark.asyncio
async def test_purge_only_removes_records_already_in_trash(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    created = await client.post("/api/v1/prospects", headers=headers, json={"company_name": "Empresa ficticia"})
    assert created.status_code == 200
    prospect_id = created.json()["id"]
    attempted = await client.delete(f"/api/v1/trash/purge/prospect/{prospect_id}", headers=headers)
    assert attempted.status_code == 404
    assert (await client.get(f"/api/v1/prospects/{prospect_id}", headers=headers)).status_code == 200
    assert (await client.delete(f"/api/v1/prospects/{prospect_id}", headers=headers)).status_code == 200
    assert (await client.delete(f"/api/v1/trash/purge/prospect/{prospect_id}", headers=headers)).status_code == 200
    assert (await client.post(f"/api/v1/trash/restore/prospect/{prospect_id}", headers=headers)).status_code == 404
