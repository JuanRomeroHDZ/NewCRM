from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import event, text
from sqlalchemy.orm import DeclarativeBase, Session
from app.config import settings

class Base(DeclarativeBase):
    pass

engine_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    engine_args["connect_args"] = {"check_same_thread": False}
else:
    engine_args["pool_size"] = settings.DB_POOL_SIZE
    engine_args["max_overflow"] = settings.DB_MAX_OVERFLOW
    engine_args["pool_timeout"] = settings.DB_POOL_TIMEOUT_SECONDS
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


_ACTOR_SQL = text("SELECT set_config('lessso.actor_id', :actor, true), set_config('lessso.actor_role', :role, true)")


@event.listens_for(Session, "after_begin")
def _restore_transaction_actor(session, _transaction, connection):
    actor = session.info.get("report_actor")
    if actor and connection.dialect.name == "postgresql":
        connection.execute(_ACTOR_SQL, actor)


async def set_report_actor(db: AsyncSession, user) -> None:
    if db.bind is None or db.bind.dialect.name != "postgresql":
        return
    actor = {"actor": user.id, "role": user.role}
    if db.info.get("report_actor") != actor:
        db.info["report_actor"] = actor
        if db.in_transaction():
            await db.execute(_ACTOR_SQL, actor)
