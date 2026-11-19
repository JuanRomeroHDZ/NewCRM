"""One-shot schema and data migration entry point used by Docker Compose."""

import asyncio
import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text

from app.database import AsyncSessionLocal, Base, engine
from app.data_migrations import migrate_plaintext_notes_to_encrypted
from app.seed_data import initialize_default_exchange_rate
from app.services.config_service import initialize_default_catalogs
from app import models  # noqa: F401 - register all application models
from app.models import reports as report_models  # noqa: F401

logger = logging.getLogger("lessso.migrate")
_MIGRATION_LOCK_ID = 0x4C4553534D
_BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _alembic_config() -> Config:
    return Config(str(_BACKEND_ROOT / "alembic.ini"))


async def _run_migrations() -> None:
    config = _alembic_config()
    scripts = ScriptDirectory.from_config(config)
    baseline_revision = scripts.get_base()

    # Keep one lock connection open through schema and data migration work. If
    # deployments overlap, only one adopts the schema and encrypts legacy rows.
    async with engine.connect() as lock_connection:
        if lock_connection.dialect.name == "postgresql":
            await lock_connection.execute(
                text("SELECT pg_advisory_lock(:lock_id)"),
                {"lock_id": _MIGRATION_LOCK_ID},
            )

        try:
            tables = await lock_connection.run_sync(lambda sync: set(inspect(sync).get_table_names()))
            app_tables = set(Base.metadata.tables)
            has_version_table = "alembic_version" in tables
            revision_rows = []
            if has_version_table:
                result = await lock_connection.execute(text("SELECT version_num FROM alembic_version"))
                revision_rows = [row[0] for row in result.fetchall()]

            if not revision_rows and tables.intersection(app_tables):
                logger.warning(
                    "Adoptando un esquema LESSSO sin versión Alembic. Se conservarán tablas y filas existentes."
                )
                async with engine.begin() as connection:
                    await connection.run_sync(Base.metadata.create_all)
                await asyncio.to_thread(command.stamp, config, baseline_revision)

            await asyncio.to_thread(command.upgrade, config, "head")

            # Idempotent data migrations run once in this job, never in each
            # API replica's startup hook. The advisory lock prevents two
            # concurrent migration jobs from scanning and converting together.
            await migrate_plaintext_notes_to_encrypted()
            async with AsyncSessionLocal() as session:
                await initialize_default_exchange_rate(session)
                await initialize_default_catalogs(session)

            result = await lock_connection.execute(text("SELECT version_num FROM alembic_version"))
            revision = result.scalar_one()
            logger.info("Migraciones e inicialización completadas en revisión %s.", revision)
        finally:
            if lock_connection.dialect.name == "postgresql":
                await lock_connection.execute(
                    text("SELECT pg_advisory_unlock(:lock_id)"),
                    {"lock_id": _MIGRATION_LOCK_ID},
                )
                await lock_connection.rollback()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    async def run_and_dispose() -> None:
        try:
            await _run_migrations()
        finally:
            await engine.dispose()

    asyncio.run(run_and_dispose())


if __name__ == "__main__":
    main()
