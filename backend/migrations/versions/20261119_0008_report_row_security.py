"""Apply row policies to report documents and canvases."""

from alembic import op

revision = "20261119_0008"
down_revision = "20261119_0007"
branch_labels = None
depends_on = None

TABLES = (("report_documents", "document"), ("report_canvases", "canvas"))


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    actor = "nullif(current_setting('lessso.actor_id', true), '')"
    administrator = "current_setting('lessso.actor_role', true) IN ('owner', 'business_admin')"
    for table, kind in TABLES:
        owned = f"({actor} IS NOT NULL AND ({administrator} OR created_by_id = {actor}))"
        shared = f"""EXISTS (
            SELECT 1 FROM report_collaborators c
            WHERE c.resource_type = '{kind}' AND c.resource_id = {table}.id AND c.user_id = {actor}
        """
        view = f"{owned} OR {shared})"
        edit = f"{owned} OR {shared} AND c.permission = 'editor')"
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY report_view ON {table} FOR SELECT USING ({view})")
        op.execute(f"CREATE POLICY report_create ON {table} FOR INSERT WITH CHECK ({owned})")
        op.execute(f"CREATE POLICY report_edit ON {table} FOR UPDATE USING ({edit}) WITH CHECK ({edit})")
        op.execute(f"CREATE POLICY report_delete ON {table} FOR DELETE USING ({owned})")


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for table, _ in TABLES:
        for policy in ("report_view", "report_create", "report_edit", "report_delete"):
            op.execute(f"DROP POLICY {policy} ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
