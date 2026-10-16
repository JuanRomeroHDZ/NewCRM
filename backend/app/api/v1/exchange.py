from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import ExchangeRate
from app.schemas import ExchangeRateResponse, ExchangeRateUpdate
from app.services.currency import get_current_exchange_rate, sync_external_exchange_rate
from app.security.tokens import require_vault_unlocked
from app.services.audit import log_audit_event

router = APIRouter(prefix="/exchange", tags=["exchange"])

@router.get("", response_model=ExchangeRateResponse)
async def get_exchange_rate(db: AsyncSession = Depends(get_db)):
    stmt = select(ExchangeRate).where(
        ExchangeRate.base_currency == "USD",
        ExchangeRate.target_currency == "MXN"
    ).limit(1)
    res = await db.execute(stmt)
    record = res.scalar_one_or_none()
    if not record:
        rate = await get_current_exchange_rate(db)
        res = await db.execute(stmt)
        record = res.scalar_one()

    return ExchangeRateResponse(
        base_currency=record.base_currency,
        target_currency=record.target_currency,
        rate=record.rate,
        is_manual=record.is_manual,
        updated_at=record.updated_at
    )

@router.post("/manual", response_model=ExchangeRateResponse, dependencies=[Depends(require_vault_unlocked)])
async def set_manual_exchange_rate(payload: ExchangeRateUpdate, db: AsyncSession = Depends(get_db)):
    stmt = select(ExchangeRate).where(
        ExchangeRate.base_currency == "USD",
        ExchangeRate.target_currency == "MXN"
    ).limit(1)
    res = await db.execute(stmt)
    record = res.scalar_one_or_none()
    if not record:
        record = ExchangeRate(base_currency="USD", target_currency="MXN")
        db.add(record)

    record.rate = payload.rate
    record.is_manual = payload.is_manual
    await log_audit_event(
        db, action="update", entity_type="exchange_rate",
        details=f"Ajuste de tasa de cambio USD/MXN a {payload.rate} (Manual: {payload.is_manual})"
    )
    await db.commit()
    await db.refresh(record)

    return ExchangeRateResponse(
        base_currency=record.base_currency,
        target_currency=record.target_currency,
        rate=record.rate,
        is_manual=record.is_manual,
        updated_at=record.updated_at
    )

@router.post("/sync", response_model=ExchangeRateResponse, dependencies=[Depends(require_vault_unlocked)])
async def trigger_exchange_rate_sync(db: AsyncSession = Depends(get_db)):
    stmt = select(ExchangeRate).where(
        ExchangeRate.base_currency == "USD",
        ExchangeRate.target_currency == "MXN"
    ).limit(1)
    res = await db.execute(stmt)
    record = res.scalar_one_or_none()
    if record and record.is_manual:
        # Unlock manual flag to force sync
        record.is_manual = False
        await db.commit()

    rate, synced = await sync_external_exchange_rate(db)
    res = await db.execute(stmt)
    record = res.scalar_one()

    return ExchangeRateResponse(
        base_currency=record.base_currency,
        target_currency=record.target_currency,
        rate=record.rate,
        is_manual=record.is_manual,
        updated_at=record.updated_at
    )
