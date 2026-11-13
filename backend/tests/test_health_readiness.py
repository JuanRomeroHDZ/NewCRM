import json

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.v1.health import health_check


@pytest.mark.asyncio
async def test_health_fails_when_database_schema_is_missing():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    try:
        session_factory = async_sessionmaker(engine)
        async with session_factory() as session:
            response = await health_check(session)
        assert response.status_code == 503
        assert json.loads(response.body)["database"] == "schema_not_ready"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_health_does_not_expose_database_errors():
    class FailedSession:
        async def execute(self, _statement):
            raise RuntimeError("database credentials must not be exposed")

    response = await health_check(FailedSession())
    body = response.body.decode("utf-8")
    assert response.status_code == 503
    assert "unavailable" in body
    assert "credentials" not in body
