import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Float, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

def gen_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

class AgendaEvent(Base):
    __tablename__ = "agenda_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    event_type: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    # visita, reunion, llamada, seguimiento, entrega, mantenimiento, cobro, revision, activo_vencimiento, fin_autorizacion_pentesting, recordatorio_personal, finanzas
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    start_time: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    
    client_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("crm_clients.id"), nullable=True, index=True)
    prospect_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("prospects.id"), nullable=True, index=True)
    sale_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("crm_sales.id"), nullable=True, index=True)
    
    status: Mapped[str] = mapped_column(String(32), default="programado", index=True)  # programado, completado, cancelado, reprogramado
    is_financial: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    
    # Recurrence engine: maintenance automatically generates next visit upon completion
    recurrence_interval_days: Mapped[int | None] = mapped_column(Integer, nullable=True)  # e.g. 30, 90, 180, 365
    next_event_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class OperationTask(Base):
    __tablename__ = "operation_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    event_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("agenda_events.id"), nullable=True, index=True)
    client_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("crm_clients.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pendiente", index=True)  # pendiente, en_progreso, completada
    due_date: Mapped[str | None] = mapped_column(String(32), nullable=True)  # YYYY-MM-DD
    checklist_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array of checklist items
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class ClientAsset(Base):
    __tablename__ = "client_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("crm_clients.id"), nullable=False, index=True)
    asset_name: Mapped[str] = mapped_column(String(180), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(64), default="dominio")  # dominio, certificado_ssl, licencia, servidor, respaldo
    identifier: Mapped[str | None] = mapped_column(String(255), nullable=True)  # e.g. example.com, serial, ip
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class PentestEngagement(Base):
    __tablename__ = "pentest_engagements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("crm_clients.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    scope_written_summary: Mapped[str] = mapped_column(Text, nullable=False)  # Obligatorio por escrito
    authorized_targets: Mapped[str] = mapped_column(Text, nullable=False)  # IPs or domains strictly authorized
    window_start: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    window_end: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="autorizado", index=True)  # autorizado, en_ejecucion, finalizado, cancelado
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    findings: Mapped[list["PentestFinding"]] = relationship("PentestFinding", back_populates="engagement")


class PentestFinding(Base):
    __tablename__ = "pentest_findings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    engagement_id: Mapped[str] = mapped_column(String(36), ForeignKey("pentest_engagements.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    severity: Mapped[str] = mapped_column(String(32), default="media")  # informativa, baja, media, alta, critica
    cvss_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    remediation: Mapped[str] = mapped_column(Text, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    status: Mapped[str] = mapped_column(String(32), default="abierta")  # abierta, mitigada, falso_positivo

    engagement: Mapped["PentestEngagement"] = relationship("PentestEngagement", back_populates="findings")
