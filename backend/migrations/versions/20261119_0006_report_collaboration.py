"""Add encrypted collaboration, ACL, revision and review records for reports."""

import sqlalchemy as sa
from alembic import op


revision = "20261119_0006"
down_revision = "20261118_0005"
branch_labels = None
depends_on = None


def _create_table_if_missing(name: str, *elements) -> None:
    """Adopt tables created by the legacy-schema bootstrap without replacing data."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(name):
        op.create_table(name, *elements)
        return

    expected_columns = {
        element.name: element
        for element in elements
        if isinstance(element, sa.Column)
    }
    actual_columns = {column["name"]: column for column in inspector.get_columns(name)}
    missing_columns = expected_columns.keys() - actual_columns.keys()
    if missing_columns:
        missing = ", ".join(sorted(missing_columns))
        raise RuntimeError(f"La tabla existente {name} no coincide con la migración; faltan columnas: {missing}.")

    for column_name, expected in expected_columns.items():
        actual = actual_columns[column_name]
        if expected.type.compile(dialect=bind.dialect) != actual["type"].compile(dialect=bind.dialect):
            raise RuntimeError(f"La columna existente {name}.{column_name} tiene un tipo incompatible.")
        expected_nullable = expected.nullable if expected.nullable is not None else not expected.primary_key
        if expected_nullable != actual["nullable"]:
            raise RuntimeError(f"La columna existente {name}.{column_name} tiene una nulabilidad incompatible.")

    expected_primary_key = {
        column.name for column in expected_columns.values() if column.primary_key
    }
    actual_primary_key = set((inspector.get_pk_constraint(name).get("constrained_columns") or []))
    if expected_primary_key != actual_primary_key:
        raise RuntimeError(f"La clave primaria existente de {name} no coincide con la migración.")

    expected_unique_names = {
        element.name
        for element in elements
        if isinstance(element, sa.UniqueConstraint)
    }
    actual_unique_names = {
        constraint.get("name")
        for constraint in inspector.get_unique_constraints(name)
    }
    if not expected_unique_names.issubset(actual_unique_names):
        raise RuntimeError(f"Las restricciones únicas existentes de {name} no coinciden con la migración.")

    expected_foreign_keys = {
        (
            column.name,
            foreign_key.target_fullname.rsplit(".", 1)[0],
            foreign_key.target_fullname.rsplit(".", 1)[1],
            (foreign_key.ondelete or "").upper(),
        )
        for column in expected_columns.values()
        for foreign_key in column.foreign_keys
    }
    actual_foreign_keys = {
        (
            local_column,
            constraint["referred_table"],
            referred_column,
            (constraint.get("options", {}).get("ondelete") or "").upper(),
        )
        for constraint in inspector.get_foreign_keys(name)
        for local_column, referred_column in zip(
            constraint.get("constrained_columns") or [],
            constraint.get("referred_columns") or [],
        )
    }
    if not expected_foreign_keys.issubset(actual_foreign_keys):
        raise RuntimeError(f"Las relaciones existentes de {name} no coinciden con la migración.")


def _create_index_if_missing(name: str, table: str, columns: list[str]) -> None:
    indexes = {index["name"]: index for index in sa.inspect(op.get_bind()).get_indexes(table)}
    existing = indexes.get(name)
    if existing is None:
        op.create_index(name, table, columns)
        return
    if existing.get("column_names") != columns:
        raise RuntimeError(f"El índice existente {name} no coincide con la migración.")


def upgrade() -> None:
    _create_table_if_missing(
        "report_collaborators",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("resource_type", sa.String(16), nullable=False),
        sa.Column("resource_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("core_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("permission", sa.String(16), nullable=False, server_default="viewer"),
        sa.Column("granted_by_id", sa.String(36), sa.ForeignKey("core_users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("resource_type", "resource_id", "user_id", name="uq_report_collaborator_resource_user"),
    )
    _create_table_if_missing(
        "report_collaboration_states",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("resource_type", sa.String(16), nullable=False),
        sa.Column("resource_id", sa.String(36), nullable=False),
        sa.Column("encrypted_state", sa.Text(), nullable=False),
        sa.Column("checkpoint_seq", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("generation", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("content_hash", sa.String(64), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("resource_type", "resource_id", name="uq_report_collaboration_state_resource"),
    )
    _create_table_if_missing(
        "report_collaboration_updates",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("resource_type", sa.String(16), nullable=False),
        sa.Column("resource_id", sa.String(36), nullable=False),
        sa.Column("update_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("core_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("encrypted_update", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("resource_type", "resource_id", "update_id", name="uq_report_collaboration_update_id"),
    )
    _create_index_if_missing(
        "ix_report_collaboration_updates_resource_seq",
        "report_collaboration_updates",
        ["resource_type", "resource_id", "id"],
    )
    _create_table_if_missing(
        "report_revisions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("resource_type", sa.String(16), nullable=False),
        sa.Column("resource_id", sa.String(36), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("status", sa.String(32), nullable=True),
        sa.Column("encrypted_content", sa.Text(), nullable=False),
        sa.Column("encrypted_state", sa.Text(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("reason", sa.String(32), nullable=False, server_default="checkpoint"),
        sa.Column("created_by_id", sa.String(36), sa.ForeignKey("core_users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("resource_type", "resource_id", "revision_number", name="uq_report_revision_number"),
    )
    _create_index_if_missing("ix_report_revisions_resource_created", "report_revisions", ["resource_type", "resource_id", "created_at"])
    _create_table_if_missing(
        "report_comments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("resource_type", sa.String(16), nullable=False),
        sa.Column("resource_id", sa.String(36), nullable=False),
        sa.Column("anchor", sa.Text(), nullable=True),
        sa.Column("encrypted_body", sa.Text(), nullable=False),
        sa.Column("created_by_id", sa.String(36), sa.ForeignKey("core_users.id"), nullable=False),
        sa.Column("resolved_by_id", sa.String(36), sa.ForeignKey("core_users.id"), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    _create_index_if_missing("ix_report_comments_resource_created", "report_comments", ["resource_type", "resource_id", "created_at"])
    _create_table_if_missing(
        "report_reviews",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("revision_id", sa.String(36), sa.ForeignKey("report_revisions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reviewer_id", sa.String(36), sa.ForeignKey("core_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="pending"),
        sa.Column("encrypted_note", sa.Text(), nullable=True),
        sa.Column("requested_by_id", sa.String(36), sa.ForeignKey("core_users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("responded_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("revision_id", "reviewer_id", name="uq_report_review_revision_reviewer"),
    )
    _create_index_if_missing("ix_report_reviews_revision_id", "report_reviews", ["revision_id"])
    _create_table_if_missing(
        "report_collaboration_tickets",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("resource_type", sa.String(16), nullable=False),
        sa.Column("resource_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("core_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("auth_session_id", sa.String(36), sa.ForeignKey("core_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("vault_session_id", sa.String(64), sa.ForeignKey("vault_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sealed_vault_key", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
    )
    _create_index_if_missing("ix_report_collaboration_tickets_expires_at", "report_collaboration_tickets", ["expires_at"])
    _create_table_if_missing(
        "report_collaboration_presence",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("resource_type", sa.String(16), nullable=False),
        sa.Column("resource_id", sa.String(36), nullable=False),
        sa.Column("client_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("core_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("display_name", sa.String(128), nullable=False),
        sa.Column("state_json", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("resource_type", "resource_id", "client_id", name="uq_report_collab_presence_client"),
    )
    _create_index_if_missing("ix_report_collab_presence_resource_expiry", "report_collaboration_presence", ["resource_type", "resource_id", "expires_at"])
    _create_index_if_missing("ix_report_collaboration_presence_expires_at", "report_collaboration_presence", ["expires_at"])


def downgrade() -> None:
    raise RuntimeError("Revisión irreversible: conserva el historial colaborativo. Restaura una copia previa verificada.")
