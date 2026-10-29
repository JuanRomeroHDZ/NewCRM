import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Float, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

def gen_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

class Budget(Base):
    __tablename__ = "fin_budgets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    month: Mapped[str] = mapped_column(String(7), index=True, nullable=False)  # YYYY-MM
    category: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    cap_amount: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="MXN")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class Debt(Base):
    __tablename__ = "fin_debts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    creditor: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    original_amount: Mapped[float] = mapped_column(Float, default=0.0)
    current_balance: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="MXN")
    interest_rate: Mapped[float] = mapped_column(Float, default=0.0)  # Annual interest rate %
    due_date: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)  # YYYY-MM-DD
    payment_day_of_month: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1 to 31
    minimum_payment: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)  # active, paid_off, renegotiated
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)  # Encrypted at rest
    
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    payments: Mapped[list["DebtPayment"]] = relationship("DebtPayment", back_populates="debt", cascade="all, delete-orphan")


class DebtPayment(Base):
    __tablename__ = "fin_debt_payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    debt_id: Mapped[str] = mapped_column(String(36), ForeignKey("fin_debts.id"), nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="MXN")
    payment_date: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # YYYY-MM-DD
    payment_method_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    debt: Mapped["Debt"] = relationship("Debt", back_populates="payments")
