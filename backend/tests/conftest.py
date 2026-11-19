import pytest
import pytest_asyncio
import os
from httpx import AsyncClient, ASGITransport
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.database import Base, get_db
from app.main import app

# Production behavior (locks, foreign keys, and time types) is PostgreSQL-specific.
# Never silently fall back to SQLite or accept a live application database.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
if not TEST_DATABASE_URL:
    raise RuntimeError(
        "Configura TEST_DATABASE_URL con una PostgreSQL desechable llamada emailcrm_disposable_test."
    )
parsed_url = make_url(TEST_DATABASE_URL)
if (os.environ.get("EMAILCRM_DISPOSABLE_DATABASE") != "1"
        or parsed_url.drivername != "postgresql+asyncpg"
        or parsed_url.database != "emailcrm_disposable_test"
        or parsed_url.host not in ("localhost", "127.0.0.1")):
    raise RuntimeError("La base de pruebas debe ser una PostgreSQL temporal y autorizada explícitamente.")

@pytest_asyncio.fixture
async def test_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest_asyncio.fixture
async def client(test_engine):
    async_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with async_session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()

@pytest_asyncio.fixture
async def db_session(test_engine):
    async_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session

@pytest_asyncio.fixture
async def auth_token(client):
    """Returns an active vault token for tests."""
    status_res = await client.get("/api/v1/auth/status")
    data = status_res.json()
    master_pw = "MasterPasswordTest123!"

    if not data.get("is_setup"):
        setup_res = await client.post("/api/v1/auth/setup", json={"master_password": master_pw})
        return setup_res.json()["token"]
    else:
        unlock_res = await client.post("/api/v1/auth/unlock", json={"master_password": master_pw})
        return unlock_res.json()["token"]
