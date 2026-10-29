import pytest

from app.config import settings
from app.services.favicon import extract_favicon_url


@pytest.mark.asyncio
async def test_favicon_does_not_access_network_by_default(monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_EXTERNAL_FAVICONS", True)
    monkeypatch.setattr(settings, "LOCAL_MODE", True)

    def fail_if_called(*args, **kwargs):
        raise AssertionError("La consulta externa no debe ejecutarse")

    monkeypatch.setattr("app.services.favicon.httpx.AsyncClient", fail_if_called)
    icon = await extract_favicon_url("https://empresa.example.test")
    assert icon.startswith("data:image/svg+xml")


@pytest.mark.asyncio
async def test_platform_with_url_can_be_created_without_network(client, auth_token, monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_EXTERNAL_FAVICONS", False)
    response = await client.post("/api/v1/platforms", headers={"X-Vault-Token": auth_token}, json={
        "name": "Servicio ficticio", "login_url": "https://empresa.example.test", "business_share_percent": 0,
    })
    assert response.status_code == 200
    assert response.json()["icon_type"] == "initials"
    assert response.json()["business_share_percent"] == 0
