import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Float, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

def gen_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

class FolioSequence(Base):
    __tablename__ = "crm_folio_sequences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    sequence_type: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False) # proposal, invoice, sale
    prefix: Mapped[str] = mapped_column(String(16), default="PROP-")
    current_number: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class Client(Base):
    __tablename__ = "crm_clients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    prospect_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("prospects.id"), nullable=True, index=True)
    company_name: Mapped[str] = mapped_column(String(180), nullable=False, index=True)
    contact_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="activo", index=True)  # activo, perdido, pausado
    
    # Minimal fiscal data for RESICO
    tax_rfc: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    fiscal_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    fiscal_regime: Mapped[str | None] = mapped_column(String(64), default="626 - Régimen Simplificado de Confianza (RESICO)")
    cfdi_usage: Mapped[str | None] = mapped_column(String(32), default="G03")  # G03 - Gastos en general
    fiscal_postal_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    sales: Mapped[list["Sale"]] = relationship("Sale", back_populates="client")


class Proposal(Base):
    __tablename__ = "crm_proposals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    folio: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    prospect_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("prospects.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    service_type: Mapped[str] = mapped_column(String(64), default="proyecto_unico")  # proyecto_unico, mensualidad, mantenimiento, pentesting
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="MXN")
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="borrador", index=True)  # borrador, enviada, en_revision, aceptada, rechazada, vencida
    is_viewed_by_user: Mapped[bool] = mapped_column(Boolean, default=False)  # "Vista" solo si el usuario la marca
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class Sale(Base):
    __tablename__ = "crm_sales"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("crm_clients.id"), nullable=False, index=True)
    prospect_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("prospects.id"), nullable=True, index=True)
    proposal_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("crm_proposals.id"), nullable=True, index=True)
    folio: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    service_type: Mapped[str] = mapped_column(String(64), default="proyecto_unico")
    total_amount: Mapped[float] = mapped_column(Float, default=0.0)
    tax_amount: Mapped[float] = mapped_column(Float, default=0.0)
    discount_amount: Mapped[float] = mapped_column(Float, default=0.0)
    advance_payment: Mapped[float] = mapped_column(Float, default=0.0)
    balance_amount: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="MXN")
    status: Mapped[str] = mapped_column(String(32), default="activa", index=True)  # activa, completada, cancelada
    closed_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    client: Mapped["Client"] = relationship("Client", back_populates="sales")
    installments: Mapped[list["PaymentInstallment"]] = relationship("PaymentInstallment", back_populates="sale")


class PaymentInstallment(Base):
    __tablename__ = "crm_payment_installments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    sale_id: Mapped[str] = mapped_column(String(36), ForeignKey("crm_sales.id"), nullable=False, index=True)
    installment_number: Mapped[int] = mapped_column(Integer, default=1)
    concept: Mapped[str] = mapped_column(String(180), nullable=False)
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    paid_amount: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="MXN")
    due_date: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # YYYY-MM-DD
    status: Mapped[str] = mapped_column(String(32), default="pendiente", index=True)  # pendiente, parcial, pagado, vencido, cancelado
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    sale: Mapped["Sale"] = relationship("Sale", back_populates="installments")
    payments: Mapped[list["PaymentRecord"]] = relationship("PaymentRecord", back_populates="installment")


class PaymentRecord(Base):
    __tablename__ = "crm_payment_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    installment_id: Mapped[str] = mapped_column(String(36), ForeignKey("crm_payment_installments.id"), nullable=False, index=True)
    sale_id: Mapped[str] = mapped_column(String(36), ForeignKey("crm_sales.id"), nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="MXN")
    payment_method: Mapped[str] = mapped_column(String(64), default="transferencia")  # efectivo, transferencia, etc.
    reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    payment_date: Mapped[str] = mapped_column(String(32), nullable=False)  # YYYY-MM-DD
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Audit Reversal (Payments are NEVER deleted; reversed with audit log)
    is_reversed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    reversal_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    installment: Mapped["PaymentInstallment"] = relationship("PaymentInstallment", back_populates="payments")


class Invoice(Base):
    __tablename__ = "crm_invoices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    sale_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("crm_sales.id"), nullable=True, index=True)
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("crm_clients.id"), nullable=False, index=True)
    folio: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    uuid: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)  # CFDI UUID / Folio Fiscal
    rfc: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    cfdi_usage: Mapped[str] = mapped_column(String(32), default="G03")
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="MXN")
    issue_date: Mapped[str] = mapped_column(String(32), nullable=False)  # YYYY-MM-DD
    xml_file_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    pdf_file_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    service_reference: Mapped[str | None] = mapped_column(String(180), nullable=True)
    
    # Factura nunca se elimina; se cancela con motivo
    status: Mapped[str] = mapped_column(String(32), default="emitida", index=True)  # emitida, cancelada
    cancellation_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
