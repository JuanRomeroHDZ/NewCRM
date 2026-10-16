import httpx
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import ExchangeRate

# Fallback default rate if completely offline and DB empty
FALLBACK_USD_MXN_RATE = 18.50

async def get_current_exchange_rate(db: AsyncSession) -> float:
    """Returns the current USD to MXN exchange rate.
    Prioritizes manual user setting or recent cached rate.
    Never blocks or throws on network failure.
    """
    stmt = select(ExchangeRate).where(
        ExchangeRate.base_currency == "USD",
        ExchangeRate.target_currency == "MXN"
    ).limit(1)
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()

    if record:
        return float(record.rate)
    
    # If no record exists in DB, create initial record
    new_rate = ExchangeRate(
        base_currency="USD",
        target_currency="MXN",
        rate=FALLBACK_USD_MXN_RATE,
        is_manual=False,
        updated_at=datetime.now(timezone.utc).replace(tzinfo=None)
    )
    db.add(new_rate)
    await db.commit()
    return FALLBACK_USD_MXN_RATE

async def sync_external_exchange_rate(db: AsyncSession) -> tuple[float, bool]:
    """Attempts to sync with open exchange rate API with strict timeout (2.0s).
    If network is unavailable or rate is marked manual, returns cached rate without error.
    """
    stmt = select(ExchangeRate).where(
        ExchangeRate.base_currency == "USD",
        ExchangeRate.target_currency == "MXN"
    ).limit(1)
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()

    if record and record.is_manual:
        return record.rate, False  # Manual override locked by user

    # Public free endpoint
    api_url = "https://open.er-api.com/v6/latest/USD"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(api_url)
            if resp.status_code == 200:
                data = resp.json()
                rate = data.get("rates", {}).get("MXN")
                if rate and isinstance(rate, (int, float)):
                    if not record:
                        record = ExchangeRate(
                            base_currency="USD",
                            target_currency="MXN",
                            rate=float(rate),
                            is_manual=False
                        )
                        db.add(record)
                    else:
                        record.rate = float(rate)
                        record.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    await db.commit()
                    return float(rate), True
    except Exception:
        # Offline or remote failure: Graceful fallback to existing DB rate
        pass

    if record:
        return float(record.rate), False
    return FALLBACK_USD_MXN_RATE, False
