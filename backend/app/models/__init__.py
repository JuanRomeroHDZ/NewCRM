import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Float, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

def gen_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

class EmailAccount(Base):
    __tablename__ = "email_accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    address: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(64), default="Google")
    inbox_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Encrypted credentials
    encrypted_password: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_entropy: Mapped[int] = mapped_column(Integer, default=0)
    
    # Recovery Chain & 2FA
    recovery_email_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("email_accounts.id"), nullable=True)
    recovery_phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    two_factor_method: Mapped[str] = mapped_column(String(32), default="none")  # authenticator, passkey, sms, email, none
    
    # Emergency & Dynamic info
    encrypted_backup_codes: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array
    encrypted_security_questions: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array
    aliases: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array
    
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    # Relationships
    platforms: Mapped[list["PlatformAccount"]] = relationship(
        "PlatformAccount", back_populates="email", cascade="all, delete-orphan"
    )
    prospects: Mapped[list["Prospect"]] = relationship(
        "Prospect", back_populates="email"
    )
    recovery_email: Mapped["EmailAccount | None"] = relationship(
        "EmailAccount", remote_side=[id], foreign_keys=[recovery_email_id]
    )

class PlatformAccount(Base):
    __tablename__ = "platform_accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    email_id: Mapped[str] = mapped_column(String(36), ForeignKey("email_accounts.id"), nullable=False, index=True)
    specific_alias: Mapped[str | None] = mapped_column(String(255), nullable=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    login_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    username: Mapped[str | None] = mapped_column(String(128), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Icon management
    icon_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    icon_type: Mapped[str] = mapped_column(String(32), default="catalog")  # catalog, extracted, custom, initials
    
    # Access type
    access_type: Mapped[str] = mapped_column(String(32), default="own_password")  # own_password, sso
    encrypted_password: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_pin: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_recovery_codes: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_totp_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    has_totp: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Technical module
    api_keys: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array
    env_variables: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array
    
    # Financial & Subscription module
    subscription_status: Mapped[str] = mapped_column(String(32), default="active")  # active, paused, cancelled, free_trial, free
    subscription_cost: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="MXN")  # MXN, USD
    billing_cycle: Mapped[str] = mapped_column(String(32), default="monthly")  # daily, weekly, monthly, yearly, one_time, free
    start_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    next_billing_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    trial_end_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    payment_method_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("payment_methods.id"), nullable=True)
    
    # Tags
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array
    
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    # Relationships
    email: Mapped["EmailAccount"] = relationship("EmailAccount", back_populates="platforms")
    payment_method: Mapped["PaymentMethod | None"] = relationship("PaymentMethod", back_populates="platforms")

class PaymentMethod(Base):
    __tablename__ = "payment_methods"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    issuer: Mapped[str] = mapped_column(String(64), nullable=False)  # Visa, MasterCard, Nu, Amex, PayPal, MercadoPago
    alias: Mapped[str] = mapped_column(String(128), nullable=False)
    last_four: Mapped[str] = mapped_column(String(8), nullable=False)
    
    # Vault protected details
    encrypted_card_number: Mapped[str | None] = mapped_column(Text, nullable=True)
    expiry_month: Mapped[str | None] = mapped_column(String(4), nullable=True)
    expiry_year: Mapped[str | None] = mapped_column(String(4), nullable=True)
    encrypted_cvv: Mapped[str | None] = mapped_column(Text, nullable=True)
    billing_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    platforms: Mapped[list["PlatformAccount"]] = relationship("PlatformAccount", back_populates="payment_method")

class PasswordHistory(Base):
    __tablename__ = "password_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    target_type: Mapped[str] = mapped_column(String(32), nullable=False)  # email, platform
    target_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    target_name: Mapped[str] = mapped_column(String(255), nullable=False)
    encrypted_password: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str] = mapped_column(String(64), default="rotation")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utc_now, index=True)
    action: Mapped[str] = mapped_column(String(32), nullable=False)  # create, update, delete, restore, vault_unlock, export
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    entity_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)

class ExchangeRate(Base):
    __tablename__ = "exchange_rates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    base_currency: Mapped[str] = mapped_column(String(8), default="USD")
    target_currency: Mapped[str] = mapped_column(String(8), default="MXN")
    rate: Mapped[float] = mapped_column(Float, default=18.50)
    is_manual: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

class UserSettings(Base):
    __tablename__ = "user_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    master_password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    vault_timeout_minutes: Mapped[int] = mapped_column(Integer, default=10)
    clipboard_clear_seconds: Mapped[int] = mapped_column(Integer, default=30)
    allow_reveal_passwords: Mapped[bool] = mapped_column(Boolean, default=False)
    search_hotkey: Mapped[str] = mapped_column(String(32), default="ctrl+k")
    accent_color: Mapped[str] = mapped_column(String(32), default="#6366f1")
    canvas_style: Mapped[str] = mapped_column(String(32), default="dot-grid")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

class Prospect(Base):
    __tablename__ = "prospects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    email_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("email_accounts.id"), nullable=True, index=True)
    specific_alias: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Prospect & Demo Info
    company_name: Mapped[str] = mapped_column(String(180), nullable=False, index=True)
    contact_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    workflow_type: Mapped[str] = mapped_column(String(32), default="demo_first")  # demo_first, direct_quote
    status: Mapped[str] = mapped_column(String(32), default="demo_creada", index=True)  # demo_creada, primer_contacto, en_cotizacion, respondido, tiempo_agotado
    demo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Contact & Location Info
    whatsapp: Mapped[str | None] = mapped_column(String(64), nullable=True)
    phones: Mapped[str | None] = mapped_column(Text, nullable=True)
    maps_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    social_links: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array

    # SLA & Response Timer
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    sla_hours: Mapped[float] = mapped_column(Float, default=48.0)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    response_time_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    met_sla: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    # Relationships
    email: Mapped["EmailAccount | None"] = relationship("EmailAccount", back_populates="prospects")

