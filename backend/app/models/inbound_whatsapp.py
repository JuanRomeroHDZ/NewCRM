import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

def gen_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

class InboundMessageDedup(Base):
    __tablename__ = "comm_inbound_dedup"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    provider_message_id: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    idempotency_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    sender_phone: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pendiente", index=True)  # pendiente, procesado, duplicado
    received_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class InboundAdapterConfig(Base):
    __tablename__ = "comm_inbound_adapter_config"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    provider_name: Mapped[str] = mapped_column(String(64), default="proveedor_intermedio_pull")
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)  # Inactive by default per Phase 11
    polling_interval_seconds: Mapped[int] = mapped_column(Integer, default=60)
    requires_user_approval: Mapped[bool] = mapped_column(Boolean, default=True)
    last_poll_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
