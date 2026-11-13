import pytest

from app.services.crm_capture import CrmCaptureService


@pytest.mark.asyncio
async def test_map_endpoints_require_active_vault_session(client, auth_token, monkeypatch):
    async def fake_search(**kwargs):
        return {"source": "cache", "results": []}

    monkeypatch.setattr(CrmCaptureService, "search_osm_leads", staticmethod(fake_search))
    paths = (
        ("GET", "/api/v1/crm/capture/zones", None),
        ("GET", "/api/v1/crm/capture/map-config", None),
        ("POST", "/api/v1/crm/capture/search", {"sector": "cafe", "zone": "centro"}),
    )

    for method, path, payload in paths:
        response = await client.request(method, path, json=payload)
        assert response.status_code == 401
        response = await client.request(method, path, json=payload, headers={"X-Vault-Token": auth_token})
        assert response.status_code == 200

    await client.post("/api/v1/auth/lock", headers={"X-Vault-Token": auth_token})
    for method, path, payload in paths:
        response = await client.request(method, path, json=payload, headers={"X-Vault-Token": auth_token})
        assert response.status_code == 401
