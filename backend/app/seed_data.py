from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import ExchangeRate

async def seed_initial_demo_data(db: AsyncSession):
    """
    Inicializa únicamente la tasa de cambio base del sistema si la base de datos está vacía.
    NO crea UserSettings con contraseñas por defecto; la configuración de la contraseña
    maestra debe ser realizada explícitamente por el usuario a través de /auth/setup.
    """
    rate_stmt = select(ExchangeRate).limit(1)
    rate_res = await db.execute(rate_stmt)
    if not rate_res.scalar_one_or_none():
        rate = ExchangeRate(
            base_currency="USD",
            target_currency="MXN",
            rate=18.50,
            is_manual=False
        )
        db.add(rate)
        await db.commit()
