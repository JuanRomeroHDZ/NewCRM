from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from app.database import get_db
from app.models.core import User
from app.models.finances import Budget, Debt, DebtPayment
from app.models import OneTimeExpense, PaymentMethod
from app.services.core_auth import require_role
from app.services.activity_service import record_event

router = APIRouter(prefix="/personal-finances", tags=["personal-finances"])

# Schemas
class BudgetCreate(BaseModel):
    month: str = Field(..., pattern=r"^\d{4}-\d{2}$")  # YYYY-MM
    category: str = Field(..., min_length=2, max_length=64)
    cap_amount: float = Field(..., gt=0)
    currency: str = Field("MXN", pattern="^(MXN|USD)$")

class BudgetResponse(BaseModel):
    id: str
    month: str
    category: str
    cap_amount: float
    currency: str
    spent_amount: float = 0.0

class DebtCreate(BaseModel):
    creditor: str = Field(..., min_length=2, max_length=128)
    original_amount: float = Field(..., gt=0)
    current_balance: float = Field(..., ge=0)
    currency: str = Field("MXN", pattern="^(MXN|USD)$")
    interest_rate: float = Field(0.0, ge=0)
    due_date: str | None = None
    payment_day_of_month: int | None = Field(None, ge=1, le=31)
    minimum_payment: float = Field(0.0, ge=0)
    notes: str | None = None

class DebtResponse(BaseModel):
    id: str
    creditor: str
    original_amount: float
    current_balance: float
    currency: str
    interest_rate: float
    due_date: str | None
    payment_day_of_month: int | None
    minimum_payment: float
    status: str
    notes: str | None = None

class DebtPaymentCreate(BaseModel):
    amount: float = Field(..., gt=0)
    currency: str = Field("MXN", pattern="^(MXN|USD)$")
    payment_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    payment_method_id: str | None = None
    notes: str | None = None

# Routes (Protected exclusively for Owner)
@router.get("/budgets", response_model=list[BudgetResponse])
async def list_budgets(
    month: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"]))
):
    query = select(Budget).order_by(Budget.category.asc())
    if month:
        query = query.where(Budget.month == month)
    res = await db.execute(query)
    budgets = res.scalars().all()

    # Calculate actual spending per category for this month
    target_month = month or datetime.now(timezone.utc).strftime("%Y-%m")
    exp_stmt = select(
        OneTimeExpense.category,
        func.sum(OneTimeExpense.amount)
    ).where(
        OneTimeExpense.is_deleted == False,
        OneTimeExpense.expense_date.like(f"{target_month}%")
    ).group_by(OneTimeExpense.category)
    exp_res = await db.execute(exp_stmt)
    spending_map = dict(exp_res.all())

    return [
        BudgetResponse(
            id=b.id,
            month=b.month,
            category=b.category,
            cap_amount=b.cap_amount,
            currency=b.currency,
            spent_amount=float(spending_map.get(b.category, 0.0) or 0.0)
        )
        for b in budgets
    ]

@router.post("/budgets", response_model=BudgetResponse, status_code=status.HTTP_201_CREATED)
async def create_or_update_budget(
    payload: BudgetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"]))
):
    stmt = select(Budget).where(Budget.month == payload.month, Budget.category == payload.category)
    existing = (await db.execute(stmt)).scalar_one_or_none()

    if existing:
        existing.cap_amount = payload.cap_amount
        existing.currency = payload.currency
        budget_obj = existing
    else:
        budget_obj = Budget(
            month=payload.month,
            category=payload.category,
            cap_amount=payload.cap_amount,
            currency=payload.currency
        )
        db.add(budget_obj)

    await db.commit()
    await db.refresh(budget_obj)

    await record_event(
        db,
        module="finances",
        action="update" if existing else "create",
        entity_type="budget",
        entity_id=budget_obj.id,
        summary=f"Presupuesto para {budget_obj.category} ({budget_obj.month}): ${budget_obj.cap_amount} {budget_obj.currency}",
        user_id=current_user.id,
        user_name=current_user.username
    )
    await db.commit()

    return BudgetResponse(
        id=budget_obj.id,
        month=budget_obj.month,
        category=budget_obj.category,
        cap_amount=budget_obj.cap_amount,
        currency=budget_obj.currency,
        spent_amount=0.0
    )

@router.get("/debts", response_model=list[DebtResponse])
async def list_debts(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"]))
):
    query = select(Debt).where(Debt.is_deleted == False).order_by(Debt.due_date.asc())
    if status_filter:
        query = query.where(Debt.status == status_filter)
    res = await db.execute(query)
    debts = res.scalars().all()
    return debts

@router.post("/debts", response_model=DebtResponse, status_code=status.HTTP_201_CREATED)
async def create_debt(
    payload: DebtCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"]))
):
    debt = Debt(
        creditor=payload.creditor,
        original_amount=payload.original_amount,
        current_balance=payload.current_balance,
        currency=payload.currency,
        interest_rate=payload.interest_rate,
        due_date=payload.due_date,
        payment_day_of_month=payload.payment_day_of_month,
        minimum_payment=payload.minimum_payment,
        notes=payload.notes,
        status="active" if payload.current_balance > 0 else "paid_off"
    )
    db.add(debt)
    await db.commit()
    await db.refresh(debt)

    await record_event(
        db,
        module="finances",
        action="create",
        entity_type="debt",
        entity_id=debt.id,
        summary=f"Registro de deuda con {debt.creditor} por ${debt.original_amount} {debt.currency}",
        user_id=current_user.id,
        user_name=current_user.username
    )
    await db.commit()
    return debt

@router.post("/debts/{debt_id}/payments", status_code=status.HTTP_201_CREATED)
async def record_debt_payment(
    debt_id: str,
    payload: DebtPaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"]))
):
    stmt = select(Debt).where(Debt.id == debt_id, Debt.is_deleted == False)
    debt = (await db.execute(stmt)).scalar_one_or_none()
    if not debt:
        raise HTTPException(status_code=404, detail="Deuda no encontrada")

    payment = DebtPayment(
        debt_id=debt.id,
        amount=payload.amount,
        currency=payload.currency,
        payment_date=payload.payment_date,
        payment_method_id=payload.payment_method_id,
        notes=payload.notes
    )
    db.add(payment)

    # Automatically decrement debt balance
    debt.current_balance = max(0.0, debt.current_balance - payload.amount)
    if debt.current_balance == 0.0:
        debt.status = "paid_off"

    await db.commit()

    await record_event(
        db,
        module="finances",
        action="create",
        entity_type="debt_payment",
        entity_id=payment.id,
        summary=f"Abono de ${payload.amount} {payload.currency} a deuda de {debt.creditor}. Saldo restante: ${debt.current_balance}",
        user_id=current_user.id,
        user_name=current_user.username
    )
    await db.commit()

    return {
        "message": "Abono registrado correctamente.",
        "payment_id": payment.id,
        "remaining_balance": debt.current_balance,
        "status": debt.status
    }

@router.get("/summary")
async def get_financial_summary(
    month: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"]))
):
    """Returns monthly consolidated metrics of expenses, budgets vs actuals, and total debt."""
    target_month = month or datetime.now(timezone.utc).strftime("%Y-%m")

    # Total expenses for month
    exp_res = await db.execute(
        select(func.sum(OneTimeExpense.amount)).where(
            OneTimeExpense.is_deleted == False,
            OneTimeExpense.expense_date.like(f"{target_month}%")
        )
    )
    total_expenses = float(exp_res.scalar() or 0.0)

    # Total active debt balance
    debt_res = await db.execute(
        select(func.sum(Debt.current_balance)).where(
            Debt.is_deleted == False,
            Debt.status == "active"
        )
    )
    total_debt = float(debt_res.scalar() or 0.0)

    # Next upcoming payments
    upcoming_debts = (await db.execute(
        select(Debt).where(
            Debt.is_deleted == False,
            Debt.status == "active"
        ).order_by(Debt.payment_day_of_month.asc()).limit(5)
    )).scalars().all()

    return {
        "month": target_month,
        "total_expenses": total_expenses,
        "total_active_debt": total_debt,
        "upcoming_payments": [
            {
                "creditor": d.creditor,
                "current_balance": d.current_balance,
                "minimum_payment": d.minimum_payment,
                "payment_day": d.payment_day_of_month,
                "due_date": d.due_date
            }
            for d in upcoming_debts
        ]
    }
