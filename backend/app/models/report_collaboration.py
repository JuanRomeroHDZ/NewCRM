"""Durable collaboration metadata for report documents and Excalidraw canvases."""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models import gen_uuid, utc_now


class ReportCollaborator(Base):
    __tablename__ = "report_collaborators"
    __table_args__ = (UniqueConstraint("resource_type", "resource_id", "user_id", name="uq_report_collaborator_resource_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    resource_type: Mapped[str] = mapped_column(String(16), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(36), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("core_users.id", ondelete="CASCADE"), nullable=False)
    permission: Mapped[str] = mapped_column(String(16), nullable=False, default="viewer")
    granted_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("core_users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class ReportCollaborationState(Base):
    __tablename__ = "report_collaboration_states"
    __table_args__ = (UniqueConstraint("resource_type", "resource_id", name="uq_report_collaboration_state_resource"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    resource_type: Mapped[str] = mapped_column(String(16), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(36), nullable=False)
    encrypted_state: Mapped[str] = mapped_column(Text, nullable=False)
    checkpoint_seq: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    generation: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class ReportCollaborationUpdate(Base):
    __tablename__ = "report_collaboration_updates"
    __table_args__ = (
        UniqueConstraint("resource_type", "resource_id", "update_id", name="uq_report_collaboration_update_id"),
        Index("ix_report_collaboration_updates_resource_seq", "resource_type", "resource_id", "id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    resource_type: Mapped[str] = mapped_column(String(16), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(36), nullable=False)
    update_id: Mapped[str] = mapped_column(String(36), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("core_users.id", ondelete="CASCADE"), nullable=False)
    # Acknowledgement identifiers remain for 30 days after checkpoint compaction
    # so transient retries are idempotent without retaining the update payload.
    encrypted_update: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now)


class ReportRevision(Base):
    __tablename__ = "report_revisions"
    __table_args__ = (
        UniqueConstraint("resource_type", "resource_id", "revision_number", name="uq_report_revision_number"),
        Index("ix_report_revisions_resource_created", "resource_type", "resource_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    resource_type: Mapped[str] = mapped_column(String(16), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(36), nullable=False)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    encrypted_content: Mapped[str] = mapped_column(Text, nullable=False)
    encrypted_state: Mapped[str] = mapped_column(Text, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(String(32), nullable=False, default="checkpoint")
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("core_users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now)


class ReportComment(Base):
    __tablename__ = "report_comments"
    __table_args__ = (Index("ix_report_comments_resource_created", "resource_type", "resource_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    resource_type: Mapped[str] = mapped_column(String(16), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(36), nullable=False)
    anchor: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_body: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("core_users.id"), nullable=False)
    resolved_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("core_users.id"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class ReportReview(Base):
    __tablename__ = "report_reviews"
    __table_args__ = (UniqueConstraint("revision_id", "reviewer_id", name="uq_report_review_revision_reviewer"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    revision_id: Mapped[str] = mapped_column(String(36), ForeignKey("report_revisions.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id: Mapped[str] = mapped_column(String(36), ForeignKey("core_users.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    encrypted_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    requested_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("core_users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ReportCollaborationTicket(Base):
    __tablename__ = "report_collaboration_tickets"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    resource_type: Mapped[str] = mapped_column(String(16), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(36), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("core_users.id", ondelete="CASCADE"), nullable=False)
    auth_session_id: Mapped[str] = mapped_column(String(36), ForeignKey("core_sessions.id", ondelete="CASCADE"), nullable=False)
    vault_session_id: Mapped[str] = mapped_column(String(64), ForeignKey("vault_sessions.id", ondelete="CASCADE"), nullable=False)
    sealed_vault_key: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ReportCollaborationPresence(Base):
    __tablename__ = "report_collaboration_presence"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    resource_type: Mapped[str] = mapped_column(String(16), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(36), nullable=False)
    client_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("core_users.id", ondelete="CASCADE"), nullable=False)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    state_json: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    __table_args__ = (
        UniqueConstraint("resource_type", "resource_id", "client_id", name="uq_report_collab_presence_client"),
        Index("ix_report_collab_presence_resource_expiry", "resource_type", "resource_id", "expires_at"),
    )
