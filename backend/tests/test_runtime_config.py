import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_runtime_config_requires_vault_auth(client: AsyncClient):
    res_get = await client.get("/api/v1/settings/runtime-config")
    res_put = await client.put("/api/v1/settings/runtime-config", json={})
    assert res_get.status_code == 401
    assert res_put.status_code == 401


@pytest.mark.asyncio
async def test_runtime_config_overrides_currencies_map_and_writeup_defaults(
    client: AsyncClient, auth_token: str
):
    headers = {"X-Vault-Token": auth_token}

    res_initial = await client.get("/api/v1/settings/runtime-config", headers=headers)
    assert res_initial.status_code == 200
    initial_data = res_initial.json()
    assert any(c["code"] == "MXN" for c in initial_data["currencies"])
    assert len(initial_data["map_zones"]) >= 1
    assert len(initial_data["map_sectors"]) >= 1

    custom_payload = {
        "currencies": [
            {"code": "MXN", "name": "Peso Mexicano", "symbol": "$", "is_base": True},
            {"code": "USD", "name": "Dolar", "symbol": "US$", "is_base": False},
        ],
        "currency_config": {
            "base_currency": "MXN",
            "exchange_pair": {"base": "USD", "target": "MXN"},
            "locale": "es-MX",
        },
        "map_defaults": {
            "default_city": "Ciudad de Mexico",
            "default_zone": "roma-norte",
            "default_sector": "clinicas",
            "center": [19.4195, -99.1617],
            "zoom": 13,
            "max_search_area_deg": 0.08,
            "full_bounds_zone_slug": "cdmx-full",
        },
        "map_zones": [
            {
                "slug": "roma-norte",
                "zone": "Roma Norte",
                "center": [19.4195, -99.1617],
                "zoom": 14,
                "bbox": {"min_lat": 19.410, "min_lon": -99.172, "max_lat": 19.428, "max_lon": -99.152},
                "colonias": ["Roma Norte"],
            },
            {
                "slug": "cdmx-full",
                "zone": "CDMX Completa",
                "center": [19.4326, -99.1332],
                "zoom": 11,
                "bbox": {"min_lat": 19.25, "min_lon": -99.30, "max_lat": 19.55, "max_lon": -99.00},
                "colonias": [],
            },
        ],
        "writeup_defaults": {
            "organization_name": "RedTeam Custom Labs",
            "watermark_default": "USO ESTRICTAMENTE INTERNO - CUSTOM",
        },
    }

    res_update = await client.put("/api/v1/settings/runtime-config", headers=headers, json=custom_payload)
    assert res_update.status_code == 200
    updated = res_update.json()
    assert updated["currency_config"]["base_currency"] == "MXN"
    assert updated["map_defaults"]["default_city"] == "Ciudad de Mexico"
    assert updated["writeup_defaults"]["organization_name"] == "RedTeam Custom Labs"

    # Both configured currencies remain supported by the settings endpoint.
    res_settings = await client.put(
        "/api/v1/settings",
        headers=headers,
        json={"budget_cap_currency": "USD", "budget_cap_amount": 500.0},
    )
    assert res_settings.status_code == 200
    assert res_settings.json()["budget_cap_currency"] == "USD"
    unsupported_settings_currency = await client.put(
        "/api/v1/settings",
        headers=headers,
        json={"budget_cap_currency": "EUR"},
    )
    assert unsupported_settings_currency.status_code == 422

    # CRM Capture endpoints serve custom zones and map defaults without hardcoding Tijuana
    res_zones = await client.get("/api/v1/crm/capture/zones", headers=headers)
    assert res_zones.status_code == 200
    zone_slugs = [z["slug"] for z in res_zones.json()["zones"]]
    assert zone_slugs == ["roma-norte", "cdmx-full"]

    res_map_cfg = await client.get("/api/v1/crm/capture/map-config", headers=headers)
    assert res_map_cfg.status_code == 200
    assert res_map_cfg.json()["default_city"] == "Ciudad de Mexico"
    assert res_map_cfg.json()["default_zone"] == "roma-norte"

    # Writeup exports use dynamic org name and watermark when no explicit override is supplied
    res_w = await client.post(
        "/api/v1/writeups",
        headers=headers,
        json={"title": "Prueba Org Dinamica", "markdown_content": "# Hallazgo\nContenido base"},
    )
    assert res_w.status_code == 201
    wid = res_w.json()["id"]

    res_html = await client.post(
        f"/api/v1/writeups/{wid}/export",
        headers=headers,
        json={"format": "html", "include_watermark": True},
    )
    assert res_html.status_code == 200
    html_text = res_html.text
    assert "RedTeam Custom Labs" in html_text
    assert "USO ESTRICTAMENTE INTERNO - CUSTOM" in html_text

    res_sarif = await client.post(
        f"/api/v1/writeups/{wid}/export",
        headers=headers,
        json={"format": "sarif"},
    )
    assert res_sarif.status_code == 200
    assert "RedTeam Custom Labs" in res_sarif.text


@pytest.mark.asyncio
async def test_runtime_config_rejects_invalid_and_unsafe_values(client: AsyncClient, auth_token: str):
    headers = {"X-Vault-Token": auth_token}
    invalid_payloads = [
        {"currencies": [{"code": "bad\";", "name": "Moneda", "symbol": "$", "is_base": True}]},
        {"currencies": [
            {"code": "MXN", "name": "Peso", "symbol": "$", "is_base": False},
            {"code": "USD", "name": "Dólar", "symbol": "US$", "is_base": True},
        ]},
        {"currencies": [
            {"code": "MXN", "name": "Peso", "symbol": "$", "is_base": True},
            {"code": "USD", "name": "Dólar", "symbol": "US$", "is_base": False},
            {"code": "EUR", "name": "Euro", "symbol": "€", "is_base": False},
        ]},
        {"currency_config": {"base_currency": "USD"}},
        {"currency_config": {"exchange_pair": {"base": "EUR", "target": "MXN"}}},
        {"map_defaults": {"tile_url_template": "javascript:alert(1)"}},
        {"map_defaults": {"attribution": "<img src=x onerror=alert(1)>"}},
        {"map_zones": [{
            "slug": "mala-zona", "zone": "Zona inválida", "center": [91, 0], "zoom": 14,
            "bbox": {"min_lat": 0, "min_lon": 0, "max_lat": 1, "max_lon": 1}, "colonias": [],
        }]},
        {"writeup_defaults": {"organization_name": "x" * 121}},
    ]

    for payload in invalid_payloads:
        response = await client.put("/api/v1/settings/runtime-config", headers=headers, json=payload)
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_runtime_config_get_sanitizes_legacy_attribution(db_session):
    from app.services.config_service import build_default_map_defaults, set_config_parameter
    from app.services.crm_capture import CrmCaptureService

    legacy = {**build_default_map_defaults(), "attribution": "<img src=x onerror=alert(1)>"}
    await set_config_parameter(db_session, "map_defaults", legacy)
    config = await CrmCaptureService.get_map_config(db_session)

    assert "<img" not in config["attribution"]
    assert "onerror" not in config["attribution"]


@pytest.mark.asyncio
async def test_runtime_config_writes_roll_back_together(db_session, monkeypatch):
    import app.services.config_service as config_service

    original = config_service.set_config_parameter
    initial = await config_service.get_runtime_config(db_session)
    updated_currencies = [dict(item, name="Nombre temporal") for item in initial["currencies"]]

    async def fail_on_second_write(session, key, value, *args, **kwargs):
        if key == "map_zones":
            raise RuntimeError("simulated storage failure")
        return await original(session, key, value, *args, **kwargs)

    monkeypatch.setattr(config_service, "set_config_parameter", fail_on_second_write)
    with pytest.raises(RuntimeError, match="simulated storage failure"):
        await config_service.update_runtime_config(
            db_session,
            {"currencies": updated_currencies, "map_zones": initial["map_zones"]},
        )

    await db_session.rollback()
    after = await config_service.get_runtime_config(db_session)
    assert after["currencies"] == initial["currencies"]
