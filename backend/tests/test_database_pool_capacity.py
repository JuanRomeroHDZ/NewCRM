import asyncio

import pytest
from pydantic import ValidationError

from app.config import Settings, settings
from app.security.tokens import _vault_request_gate


def _settings(**overrides) -> Settings:
    return Settings(
        _env_file=None,
        SERVER_SECRET_KEY="test-server-secret-key-long-enough-123456",
        FALLBACK_USD_MXN_RATE=18.5,
        **overrides,
    )


def test_database_pool_requires_two_connections_for_protected_requests():
    with pytest.raises(ValidationError, match="al menos 2"):
        _settings(DB_POOL_SIZE=1, DB_MAX_OVERFLOW=0)

    # A one-connection base pool can work when one overflow connection is
    # explicitly budgeted for the second connection held by protected routes.
    assert _settings(DB_POOL_SIZE=1, DB_MAX_OVERFLOW=1).DB_POOL_SIZE == 1


@pytest.mark.asyncio
async def test_protected_request_gate_reserves_two_pool_connections(monkeypatch):
    monkeypatch.setattr(settings, "DB_POOL_SIZE", 4)
    monkeypatch.setattr(settings, "DB_MAX_OVERFLOW", 0)
    gate = _vault_request_gate()
    active = 0
    peak = 0

    async def protected_request():
        nonlocal active, peak
        async with gate:
            active += 1
            peak = max(peak, active)
            await asyncio.sleep(0)
            active -= 1

    await asyncio.gather(*(protected_request() for _ in range(8)))
    assert peak == 2
