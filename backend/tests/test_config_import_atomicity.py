import pytest

from app.api.v1 import system_config
from app.models.core import User
from app.security.crypto import hash_master_password
from app.schemas.config_import import ConfigImportRequest
from app.services.config_service import DEFAULT_CATALOGS, get_config_parameter, set_config_parameter
from app.services.core_auth import create_user_session


async def _owner_headers(db_session, username: str) -> dict[str, str]:
    owner = User(
        username=username,
        email=f"{username}@example.test",
        full_name="Config Owner",
        role="owner",
        hashed_password=hash_master_password("OwnerPassForConfig123!"),
        is_active=True,
    )
    db_session.add(owner)
    await db_session.commit()
    token, _ = await create_user_session(db_session, owner)
    return {"Authorization": f"Bearer {token}"}


def test_config_import_limits_size_and_rejects_invalid_keys():
    assert ConfigImportRequest.model_validate({"parameters": {"theme.mode": "dark"}})

    with pytest.raises(ValueError):
        ConfigImportRequest.model_validate({"parameters": {"bad key": "value"}})

    with pytest.raises(ValueError):
        ConfigImportRequest.model_validate({"parameters": {"large": "x" * 1_048_577}})


@pytest.mark.asyncio
async def test_config_import_rolls_back_if_audit_write_fails(db_session, monkeypatch):
    user = User(
        username="config_owner",
        email="config_owner@example.test",
        full_name="Config Owner",
        role="owner",
        hashed_password="unused-in-test",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    async def fail_audit(*args, **kwargs):
        raise RuntimeError("audit storage unavailable")

    monkeypatch.setattr(system_config, "record_event", fail_audit)

    with pytest.raises(RuntimeError, match="audit storage unavailable"):
        await system_config.import_system_config(
            ConfigImportRequest(parameters={"sample.setting": {"enabled": True}}),
            db_session,
            user,
        )

    assert await get_config_parameter(db_session, "sample.setting") is None


@pytest.mark.asyncio
async def test_currency_catalog_endpoint_rejects_unsupported_codes_and_hides_legacy_values(
    client, db_session
):
    headers = await _owner_headers(db_session, "currency_catalog_owner")
    legacy_catalog = [
        {"code": "MXN", "name": "Peso", "symbol": "$", "is_base": True},
        {"code": "EUR", "name": "Euro", "symbol": "€", "is_base": False},
    ]
    await set_config_parameter(db_session, "currencies", legacy_catalog)

    response = await client.get("/api/v1/config/catalogs/currencies", headers=headers)
    assert response.status_code == 200
    assert response.json() == DEFAULT_CATALOGS["currencies"]

    rejected = await client.put(
        "/api/v1/config/catalogs/currencies",
        headers=headers,
        json={"items": legacy_catalog},
    )
    assert rejected.status_code == 422
    assert await get_config_parameter(db_session, "currencies") == legacy_catalog


@pytest.mark.asyncio
async def test_config_import_rejects_unsupported_currency_catalog_atomically(client, db_session):
    headers = await _owner_headers(db_session, "currency_import_owner")
    unsupported = [
        {"code": "MXN", "name": "Peso", "symbol": "$", "is_base": True},
        {"code": "EUR", "name": "Euro", "symbol": "€", "is_base": False},
    ]
    response = await client.post(
        "/api/v1/config/import",
        headers=headers,
        json={"parameters": {"currencies": unsupported, "ordinary.setting": {"ok": True}}},
    )
    assert response.status_code == 422
    assert await get_config_parameter(db_session, "currencies") is None
    assert await get_config_parameter(db_session, "ordinary.setting") is None


@pytest.mark.asyncio
async def test_config_import_rejects_incoherent_exchange_pair(client, db_session):
    headers = await _owner_headers(db_session, "currency_pair_owner")
    response = await client.post(
        "/api/v1/config/import",
        headers=headers,
        json={
            "parameters": {
                "currency_config": {
                    "base_currency": "MXN",
                    "exchange_pair": {"base": "MXN", "target": "USD"},
                }
            }
        },
    )
    assert response.status_code == 422
    assert await get_config_parameter(db_session, "currency_config") is None
