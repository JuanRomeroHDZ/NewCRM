from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import ExchangeRate
from app.schemas import ExchangeRateResponse, ExchangeRateUpdate
from app.security.tokens import require_vault_unlocked
from app.services.currency import get_current_exchange_rate, sync_external_exchange_rate
from app.services.audit import log_audit_event

router = APIRouter(prefix="/exchange", tags=["exchange"], dependencies=[Depends(require_vault_unlocked)])

@router.get("", response_model=ExchangeRateResponse)
async def get_exchange_rate(db: AsyncSession = Depends(get_db)):
    stmt = select(ExchangeRate).where(
        ExchangeRate.base_currency == "USD",
        ExchangeRate.target_currency == "MXN"
    ).limit(1)
    res = await db.execute(stmt)
    record = res.scalar_one_or_none()
    if not record:
        await get_current_exchange_rate(db)
        res = await db.execute(stmt)
        record = res.scalar_one()

    return ExchangeRateResponse(
        base_currency=record.base_currency,
        target_currency=record.target_currency,
        rate=record.rate,
        is_manual=record.is_manual,
        updated_at=record.updated_at,
        synced=True,
        source="manual" if record.is_manual else "database",
    )

@router.post("/manual", response_model=ExchangeRateResponse)
async def set_manual_exchange_rate(payload: ExchangeRateUpdate, db: AsyncSession = Depends(get_db)):
    if payload.rate <= 0 or payload.rate > 1000:
        raise HTTPException(status_code=400, detail="Ingresa un tipo de cambio válido mayor a 0.")

    stmt = select(ExchangeRate).where(
        ExchangeRate.base_currency == "USD",
        ExchangeRate.target_currency == "MXN"
    ).limit(1)
    res = await db.execute(stmt)
    record = res.scalar_one_or_none()
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    if not record:
        record = ExchangeRate(base_currency="USD", target_currency="MXN")
        db.add(record)

    record.rate = round(float(payload.rate), 4)
    record.is_manual = payload.is_manual
    record.updated_at = now_utc
    await log_audit_event(
        db, action="update", entity_type="exchange_rate",
        details=f"Ajuste manual de tipo de cambio USD/MXN a ${record.rate:.2f}"
    )
    await db.commit()
    await db.refresh(record)

    return ExchangeRateResponse(
        base_currency=record.base_currency,
        target_currency=record.target_currency,
        rate=record.rate,
        is_manual=record.is_manual,
        updated_at=record.updated_at,
        synced=True,
        source="manual",
    )

@router.post("/sync", response_model=ExchangeRateResponse)
async def trigger_exchange_rate_sync(db: AsyncSession = Depends(get_db)):
    rate, synced, provider = await sync_external_exchange_rate(db, force=True)
    stmt = select(ExchangeRate).where(
        ExchangeRate.base_currency == "USD",
        ExchangeRate.target_currency == "MXN"
    ).limit(1)
    res = await db.execute(stmt)
    record = res.scalar_one_or_none()
    if not record:
        await get_current_exchange_rate(db)
        res = await db.execute(stmt)
        record = res.scalar_one()

    if synced:
        await log_audit_event(
            db, action="update", entity_type="exchange_rate",
            details=f"Actualización automática USD/MXN a ${record.rate:.2f} ({provider})"
        )
        await db.commit()

    return ExchangeRateResponse(
        base_currency=record.base_currency,
        target_currency=record.target_currency,
        rate=record.rate,
        is_manual=record.is_manual,
        updated_at=record.updated_at,
        synced=synced,
        source=provider,
    )

