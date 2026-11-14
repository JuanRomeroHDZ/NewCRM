import pytest


@pytest.mark.asyncio
async def test_email_list_pages_results_and_batches_relation_counts(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    first = await client.post(
        "/api/v1/emails",
        headers=headers,
        json={"address": "alpha-page@example.test"},
    )
    second = await client.post(
        "/api/v1/emails",
        headers=headers,
        json={"address": "beta-page@example.test"},
    )
    assert first.status_code == second.status_code == 200

    platform = await client.post(
        "/api/v1/platforms",
        headers=headers,
        json={"name": "Servicio ligado", "email_id": first.json()["id"]},
    )
    prospect = await client.post(
        "/api/v1/prospects",
        headers=headers,
        json={"company_name": "Prospecto ligado", "email_id": first.json()["id"]},
    )
    assert platform.status_code == prospect.status_code == 200

    page = await client.get("/api/v1/emails?limit=1&offset=0", headers=headers)
    assert page.status_code == 200
    assert page.headers["x-total-count"] == "2"
    assert len(page.json()) == 1
    assert page.json()[0]["address"] == "alpha-page@example.test"
    assert page.json()[0]["platform_count"] == 1
    assert page.json()[0]["prospect_count"] == 1

    next_page = await client.get("/api/v1/emails?limit=1&offset=1", headers=headers)
    assert next_page.status_code == 200
    assert next_page.json()[0]["address"] == "beta-page@example.test"

    oversized = await client.get("/api/v1/emails?limit=501", headers=headers)
    assert oversized.status_code == 422


@pytest.mark.asyncio
async def test_prospect_list_pages_results_after_database_filters(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    for company in ("Alfa pagina", "Beta pagina", "Gamma pagina"):
        created = await client.post(
            "/api/v1/prospects",
            headers=headers,
            json={"company_name": company},
        )
        assert created.status_code == 200

    page = await client.get(
        "/api/v1/prospects?search=pagina&limit=1&offset=1",
        headers=headers,
    )
    assert page.status_code == 200
    assert page.headers["x-total-count"] == "3"
    assert len(page.json()) == 1

    oversized = await client.get("/api/v1/prospects?limit=501", headers=headers)
    assert oversized.status_code == 422
