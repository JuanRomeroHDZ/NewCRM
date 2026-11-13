from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from app.models import gen_uuid, utc_now


class Writeup(Base):
    """Pentesting technical writeup with encrypted markdown, summary, and CRM linkage."""

    __tablename__ = "writeups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    title: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="borrador", index=True)  # borrador, en_revision, finalizado, entregado
    severity: Mapped[str] = mapped_column(String(32), default="media", index=True)  # informativa, baja, media, alta, critica
    cvss_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    cvss_vector: Mapped[str | None] = mapped_column(String(128), nullable=True)
    cwe_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    cve_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    target_scope: Mapped[str | None] = mapped_column(String(500), nullable=True)
    tags_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Encrypted at rest using AES-256-GCM (enc:v1: prefix)
    encrypted_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_executive_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_findings_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Optional CRM / Pentest links
    prospect_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("prospects.id"), nullable=True, index=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    engagement_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("pentest_engagements.id"), nullable=True, index=True)
    created_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("core_users.id"), nullable=True, index=True)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    boards: Mapped[list["WriteupBoard"]] = relationship(
        "WriteupBoard", back_populates="writeup", cascade="all, delete-orphan"
    )
    citations: Mapped[list["WriteupCitation"]] = relationship(
        "WriteupCitation", back_populates="writeup", cascade="all, delete-orphan"
    )
    assets: Mapped[list["WriteupAsset"]] = relationship(
        "WriteupAsset", back_populates="writeup", cascade="all, delete-orphan"
    )
    revisions: Mapped[list["WriteupRevision"]] = relationship(
        "WriteupRevision", back_populates="writeup", cascade="all, delete-orphan"
    )
    export_logs: Mapped[list["WriteupExportLog"]] = relationship(
        "WriteupExportLog", back_populates="writeup", cascade="all, delete-orphan"
    )


class WriteupBoard(Base):
    """Interactive whiteboard diagram linked to a pentest writeup."""

    __tablename__ = "writeup_boards"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    writeup_id: Mapped[str] = mapped_column(String(36), ForeignKey("writeups.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False, default="Pizarra de ataque")
    encrypted_scene_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_svg_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    element_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    writeup: Mapped["Writeup"] = relationship("Writeup", back_populates="boards")
    citations: Mapped[list["WriteupCitation"]] = relationship(
        "WriteupCitation", back_populates="board", cascade="all, delete-orphan"
    )


class WriteupCitation(Base):
    """Bidirectional link between a Markdown text anchor/selection and a whiteboard card."""

    __tablename__ = "writeup_citations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    writeup_id: Mapped[str] = mapped_column(String(36), ForeignKey("writeups.id"), nullable=False, index=True)
    board_id: Mapped[str] = mapped_column(String(36), ForeignKey("writeup_boards.id"), nullable=False, index=True)
    anchor_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    board_element_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    heading_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    line_start: Mapped[int] = mapped_column(Integer, default=1)
    line_end: Mapped[int] = mapped_column(Integer, default=1)
    quoted_text: Mapped[str] = mapped_column(Text, nullable=False)  # Encrypted at rest
    quote_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str] = mapped_column(String(32), default="#6366f1")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)  # Encrypted at rest
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    writeup: Mapped["Writeup"] = relationship("Writeup", back_populates="citations")
    board: Mapped["WriteupBoard"] = relationship("WriteupBoard", back_populates="citations")


class WriteupAsset(Base):
    """EXIF-stripped, resized/compressed, AES-256-GCM encrypted image evidence."""

    __tablename__ = "writeup_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    writeup_id: Mapped[str] = mapped_column(String(36), ForeignKey("writeups.id"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(180), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(64), nullable=False)
    original_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    optimized_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    exif_stripped: Mapped[bool] = mapped_column(Boolean, default=True)
    encrypted_blob: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    caption: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    writeup: Mapped["Writeup"] = relationship("Writeup", back_populates="assets")


class WriteupRevision(Base):
    """Immutable encrypted snapshot for rollback & diff comparison."""

    __tablename__ = "writeup_revisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    writeup_id: Mapped[str] = mapped_column(String(36), ForeignKey("writeups.id"), nullable=False, index=True)
    revision_number: Mapped[int] = mapped_column(Integer, default=1)
    change_note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    encrypted_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("core_users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    writeup: Mapped["Writeup"] = relationship("Writeup", back_populates="revisions")


class WriteupExportLog(Base):
    """Audit trail and SHA-256 hash log of exported deliverables."""

    __tablename__ = "writeup_export_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    writeup_id: Mapped[str] = mapped_column(String(36), ForeignKey("writeups.id"), nullable=False, index=True)
    export_format: Mapped[str] = mapped_column(String(24), nullable=False)
    redacted_for_client: Mapped[bool] = mapped_column(Boolean, default=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, default=0)
    exported_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("core_users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    writeup: Mapped["Writeup"] = relationship("Writeup", back_populates="export_logs")
