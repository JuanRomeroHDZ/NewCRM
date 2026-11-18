from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.models import gen_uuid, utc_now


class ReportDocument(Base):
    """Encrypted Typst document with optional CRM / engagement linkage."""

    __tablename__ = "report_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    title: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="borrador", index=True)
    encrypted_source: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Optional CRM / Pentest links (for future cross-module integration)
    prospect_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("prospects.id"), nullable=True, index=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    engagement_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("pentest_engagements.id"), nullable=True, index=True)
    created_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("core_users.id"), nullable=True, index=True)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class ReportCanvas(Base):
    """Encrypted Excalidraw canvas with optional document / CRM linkage."""

    __tablename__ = "report_canvases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    title: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    encrypted_scene_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    element_count: Mapped[int] = mapped_column(Integer, default=0)

    # Optional links (ready for future Document <-> Canvas integration)
    linked_document_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("report_documents.id", ondelete="SET NULL"), nullable=True, index=True
    )
    prospect_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("prospects.id"), nullable=True, index=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    engagement_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("pentest_engagements.id"), nullable=True, index=True)
    created_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("core_users.id"), nullable=True, index=True)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)
