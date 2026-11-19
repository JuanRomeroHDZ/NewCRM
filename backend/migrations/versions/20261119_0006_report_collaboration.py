"""Add encrypted collaboration, ACL, revision and review records for reports."""

import sqlalchemy as sa
from alembic import op


revision = "20261119_0006"
down_revision = "20261118_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
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
    op.create_table(
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
    op.create_table(
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
    op.create_index(
        "ix_report_collaboration_updates_resource_seq",
        "report_collaboration_updates",
        ["resource_type", "resource_id", "id"],
    )
    op.create_table(
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
    op.create_index("ix_report_revisions_resource_created", "report_revisions", ["resource_type", "resource_id", "created_at"])
    op.create_table(
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
    op.create_index("ix_report_comments_resource_created", "report_comments", ["resource_type", "resource_id", "created_at"])
    op.create_table(
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
    op.create_index("ix_report_reviews_revision_id", "report_reviews", ["revision_id"])
    op.create_table(
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
    op.create_index("ix_report_collaboration_tickets_expires_at", "report_collaboration_tickets", ["expires_at"])
    op.create_table(
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
    op.create_index("ix_report_collab_presence_resource_expiry", "report_collaboration_presence", ["resource_type", "resource_id", "expires_at"])
    op.create_index("ix_report_collaboration_presence_expires_at", "report_collaboration_presence", ["expires_at"])


def downgrade() -> None:
    raise RuntimeError("Revisión irreversible: conserva el historial colaborativo. Restaura una copia previa verificada.")
