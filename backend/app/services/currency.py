import httpx
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import ExchangeRate
from app.config import settings

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

async def sync_external_exchange_rate(db: AsyncSession, force: bool = False) -> tuple[float, bool, str]:
    """Attempts to sync with public exchange rate APIs (Primary + 2 Backups).
    If network is unavailable, returns cached rate without error.
    """
    stmt = select(ExchangeRate).where(
        ExchangeRate.base_currency == "USD",
        ExchangeRate.target_currency == "MXN"
    ).limit(1)
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()

    if record and record.is_manual and not force:
        return float(record.rate), False, "manual"

    if settings.LOCAL_MODE:
        return (float(record.rate) if record else FALLBACK_USD_MXN_RATE), False, "modo_local"

    providers = [
        (
            "Open Exchange Rates",
            "https://open.er-api.com/v6/latest/USD",
            lambda data: data.get("rates", {}).get("MXN"),
        ),
        (
            "ExchangeRate-API",
            "https://api.exchangerate-api.com/v4/latest/USD",
            lambda data: data.get("rates", {}).get("MXN"),
        ),
        (
            "Currency-API",
            "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
            lambda data: data.get("usd", {}).get("mxn"),
        ),
    ]

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

    async with httpx.AsyncClient(timeout=4.5, follow_redirects=True) as client:
        for provider_name, api_url, extractor in providers:
            try:
                resp = await client.get(api_url)
                if resp.status_code == 200:
                    data = resp.json()
                    raw_rate = extractor(data)
                    if raw_rate and isinstance(raw_rate, (int, float)) and float(raw_rate) > 1.0:
                        clean_rate = round(float(raw_rate), 4)
                        if not record:
                            record = ExchangeRate(
                                base_currency="USD",
                                target_currency="MXN",
                                rate=clean_rate,
                                is_manual=False,
                                updated_at=now_utc,
                            )
                            db.add(record)
                        else:
                            record.rate = clean_rate
                            record.is_manual = False
                            record.updated_at = now_utc
                        await db.commit()
                        await db.refresh(record)
                        return clean_rate, True, provider_name
            except Exception:
                continue

    if record:
        return float(record.rate), False, "cache_local"
    return FALLBACK_USD_MXN_RATE, False, "fallback_local"

