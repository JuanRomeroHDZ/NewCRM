import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Float, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

def gen_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

class UnifiedThread(Base):
    __tablename__ = "comm_unified_threads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    prospect_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("prospects.id"), nullable=True, index=True)
    client_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("crm_clients.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="abierto", index=True)  # abierto, archivado
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    messages: Mapped[list["CommunicationMessage"]] = relationship("CommunicationMessage", back_populates="thread")


class CommunicationMessage(Base):
    __tablename__ = "comm_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    thread_id: Mapped[str] = mapped_column(String(36), ForeignKey("comm_unified_threads.id"), nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # correo, whatsapp, telegram, llamada, nota_interna
    direction: Mapped[str] = mapped_column(String(16), default="saliente", index=True)  # saliente, entrante
    sender: Mapped[str] = mapped_column(String(128), nullable=False)
    recipient: Mapped[str] = mapped_column(String(128), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Status: un mensaje en estado incierto no se reenvía solo
    status: Mapped[str] = mapped_column(String(32), default="redactado", index=True)  # redactado, pendiente_envio, enviado, entregado, leido, fallido, incierto
    is_manual: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    cost_estimated_usd: Mapped[float] = mapped_column(Float, default=0.0)
    
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    thread: Mapped["UnifiedThread"] = relationship("UnifiedThread", back_populates="messages")


class DoNotContactList(Base):
    __tablename__ = "comm_do_not_contact"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    channel: Mapped[str] = mapped_column(String(32), default="todos", index=True)  # todos, correo, whatsapp, telegram
    identifier: Mapped[str] = mapped_column(String(180), index=True, nullable=False)  # Phone number, email, or domain
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    added_by_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class MessageTemplate(Base):
    __tablename__ = "comm_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    channel: Mapped[str] = mapped_column(String(32), default="whatsapp", index=True)  # correo, whatsapp, telegram
    category: Mapped[str] = mapped_column(String(64), default="utilidad", index=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    language: Mapped[str] = mapped_column(String(16), default="es_MX")
    subject_template: Mapped[str | None] = mapped_column(String(255), nullable=True)
    body_template: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class WhatsAppConfig(Base):
    __tablename__ = "comm_whatsapp_config"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    phone_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    phone_number_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    business_account_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    api_version: Mapped[str] = mapped_column(String(16), default="v20.0")
    access_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(32), default="inactiva")  # inactiva, incompleta, activa, suspendida
    monthly_budget_cap_usd: Mapped[float] = mapped_column(Float, default=0.0)
    current_monthly_spent_usd: Mapped[float] = mapped_column(Float, default=0.0)
    emergency_paused: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class TelegramConfig(Base):
    __tablename__ = "comm_telegram_config"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    bot_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    authorized_chat_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array of authorized chat IDs
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(32), default="inactiva")  # inactiva, activa
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)
