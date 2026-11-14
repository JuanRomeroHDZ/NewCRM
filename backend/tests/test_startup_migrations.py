from types import SimpleNamespace

import pytest

from app import main as main_module


class FakeConnection:
    def __init__(self, dialect_name="sqlite", fail=False):
        self.dialect = SimpleNamespace(name=dialect_name)
        self.columns = {"platform_accounts": {"email_id": False}}
        self.executed = []
        self.fail = fail

    async def run_sync(self, callback):
        return callback(self)

    async def execute(self, statement):
        sql = str(statement)
        self.executed.append(sql)
        if self.fail:
            raise RuntimeError("Fallo controlado de migración")
        parts = sql.split()
        if len(parts) > 5 and parts[:3] == ["ALTER", "TABLE", parts[2]] and parts[3:5] == ["ADD", "COLUMN"]:
            table_name, column_name = parts[2], parts[5]
            self.columns.setdefault(table_name, {})[column_name] = True


class FakeTransaction:
    def __init__(self, connection):
        self.connection = connection

    async def __aenter__(self):
        return self.connection

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class FakeEngine:
    def __init__(self, connection):
        self.connection = connection

    def begin(self):
        return FakeTransaction(self.connection)


@pytest.mark.asyncio
async def test_sqlite_schema_changes_are_idempotent_and_skip_unsupported_alters(monkeypatch):
    connection = FakeConnection()

    def fake_inspect(sync_connection):
        return SimpleNamespace(
            get_columns=lambda table: [
                {"name": name, "nullable": nullable}
                for name, nullable in sync_connection.columns.get(table, {}).items()
            ]
        )

    monkeypatch.setattr(main_module, "inspect", fake_inspect)
    engine = FakeEngine(connection)

    await main_module.run_additive_schema_migrations(engine)
    statement_count = len(connection.executed)
    await main_module.run_additive_schema_migrations(engine)

    assert connection.columns["email_accounts"]["scope"] is True
    assert len(connection.executed) == statement_count
    assert not any("ALTER COLUMN" in statement for statement in connection.executed)


@pytest.mark.asyncio
async def test_schema_migration_failure_is_logged_and_stops_startup(caplog):
    connection = FakeConnection(dialect_name="postgresql", fail=True)

    with pytest.raises(RuntimeError, match="migración del esquema"):
        await main_module.run_additive_schema_migrations(FakeEngine(connection))

    assert "platform_accounts.icon_url" in caplog.text
