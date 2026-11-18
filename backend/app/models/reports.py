from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, LargeBinary, String, Text
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


class ReportDocumentAsset(Base):
    """Encrypted, metadata-stripped image evidence belonging to one Typst document."""

    __tablename__ = "report_document_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("report_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(180), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(64), nullable=False)
    original_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    optimized_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    exif_stripped: Mapped[bool] = mapped_column(Boolean, default=True)
    encrypted_blob: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class ReportCanvas(Base):
    """Encrypted Excalidraw canvas with optional document / CRM linkage."""

    __tablename__ = "report_canvases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    title: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    encrypted_scene_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_svg_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
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
