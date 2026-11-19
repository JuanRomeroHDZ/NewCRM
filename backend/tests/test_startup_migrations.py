from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.data_migrations import migrate_plaintext_notes_to_encrypted
from app.models import CoreDataMigration, EmailAccount
from app.security.crypto import NOTE_ENC_PREFIX, decrypt_note


def test_migration_graph_has_one_current_head():
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    scripts = ScriptDirectory.from_config(config)
    assert scripts.get_current_head() == "20261118_0003"
    assert len(scripts.get_heads()) == 1


@pytest.mark.asyncio
async def test_plaintext_note_migration_is_lossless_and_idempotent(test_engine, db_session):
    row = EmailAccount(
        id="legacy-note-record",
        address="legacy-note@example.test",
        notes="Nota privada anterior a la migración",
    )
    db_session.add(row)
    await db_session.commit()

    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    await migrate_plaintext_notes_to_encrypted(session_factory)
    await db_session.refresh(row)
    encrypted_value = row.notes
    assert encrypted_value.startswith(NOTE_ENC_PREFIX)
    assert decrypt_note(encrypted_value) == "Nota privada anterior a la migración"

    await migrate_plaintext_notes_to_encrypted(session_factory)
    await db_session.refresh(row)
    assert row.notes == encrypted_value
    marker = await db_session.get(CoreDataMigration, "legacy_plaintext_notes_v1")
    assert marker is not None
