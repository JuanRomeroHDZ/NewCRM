import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Float, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

def gen_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

class LeadCacheCell(Base):
    __tablename__ = "crm_lead_cache_cells"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    sector: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    subsector: Mapped[str | None] = mapped_column(String(64), nullable=True)
    zone: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    query_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    results_json: Mapped[str] = mapped_column(Text, nullable=False)  # Cached JSON results
    result_count: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(32), default="openstreetmap")
    status: Mapped[str] = mapped_column(String(32), default="complete")  # complete, partial, failed
    attribution: Mapped[str] = mapped_column(String(255), default="© Colaboradores de OpenStreetMap (ODbL)")
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)


class LeadAuditScore(Base):
    __tablename__ = "crm_lead_audit_scores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    prospect_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("prospects.id"), nullable=True, index=True)
    target_url: Mapped[str] = mapped_column(String(512), nullable=False)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_https: Mapped[bool] = mapped_column(Boolean, default=False)
    ssl_valid_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    has_mobile_viewport: Mapped[bool] = mapped_column(Boolean, default=False)
    has_privacy_policy: Mapped[bool] = mapped_column(Boolean, default=False)
    detected_cms: Mapped[str | None] = mapped_column(String(64), nullable=True)
    copyright_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    design_score: Mapped[float] = mapped_column(Float, default=0.0)  # 0 to 100
    pentest_score: Mapped[float] = mapped_column(Float, default=0.0)  # 0 to 100
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    audited_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class LeadDuplicateCandidate(Base):
    __tablename__ = "crm_duplicate_candidates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    prospect_a_id: Mapped[str] = mapped_column(String(36), ForeignKey("prospects.id"), nullable=False, index=True)
    prospect_b_id: Mapped[str] = mapped_column(String(36), ForeignKey("prospects.id"), nullable=False, index=True)
    match_reason: Mapped[str] = mapped_column(String(64), nullable=False)  # source_id, domain, phone, fuzzy_name
    confidence_score: Mapped[float] = mapped_column(Float, default=1.0)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)  # pending, merged, dismissed
    previous_state_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # Undo backup
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class PermanentDiscard(Base):
    __tablename__ = "crm_permanent_discards"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    company_name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    domain: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
