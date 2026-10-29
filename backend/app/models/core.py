import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

def gen_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

class User(Base):
    __tablename__ = "core_users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="owner", index=True)  # owner, business_admin, seller, readonly
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
    
    # 2FA / TOTP
    is_totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)  # Base32 secret
    recovery_codes: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array of hashed recovery codes
    
    # Account status & lockout
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    sessions: Mapped[list["DbSession"]] = relationship("DbSession", back_populates="user", cascade="all, delete-orphan")


class DbSession(Base):
    __tablename__ = "core_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)  # jti
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("core_users.id"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    user: Mapped["User"] = relationship("User", back_populates="sessions")


class ConfigParameter(Base):
    __tablename__ = "core_config_parameters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    key: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    scope: Mapped[str] = mapped_column(String(32), default="system", index=True)  # system, host, user
    category: Mapped[str] = mapped_column(String(64), default="general", index=True)
    value_json: Mapped[str] = mapped_column(Text, nullable=False)  # JSON-encoded value
    is_encrypted: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class JobQueue(Base):
    __tablename__ = "core_job_queue"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    queue_name: Mapped[str] = mapped_column(String(64), default="default", index=True)
    job_type: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)  # pending, processing, completed, failed, uncertain
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, index=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class ActivityEvent(Base):
    __tablename__ = "core_activity_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utc_now, index=True)
    module: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # vault, finances, crm, agenda, comms, workshop, system
    action: Mapped[str] = mapped_column(String(32), nullable=False)  # create, update, delete, restore, unlock, export, reverse
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    user_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    summary: Mapped[str] = mapped_column(String(255), nullable=False)  # Friendly redacted text
    details_before: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON for admin audit
    details_after: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON for admin audit
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_redacted: Mapped[bool] = mapped_column(Boolean, default=True)
