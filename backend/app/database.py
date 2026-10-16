from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

class Base(DeclarativeBase):
    pass

engine_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    engine_args["connect_args"] = {"check_same_thread": False}
else:
    engine_args["pool_size"] = 20
    engine_args["max_overflow"] = 10
    engine_args["pool_pre_ping"] = True

engine = create_async_engine(settings.DATABASE_URL, **engine_args)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
