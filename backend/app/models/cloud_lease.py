import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

def gen_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

class ServerLease(Base):
    __tablename__ = "core_server_leases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    resource_name: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False) # e.g. "cloud_backup_google_drive"
    server_name: Mapped[str] = mapped_column(String(64), nullable=False)
    acquired_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
