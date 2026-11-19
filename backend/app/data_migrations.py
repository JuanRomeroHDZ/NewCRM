"""Idempotent, one-shot data migrations executed by `python -m app.migrate`."""

import logging

from sqlalchemy import func, select, text

from app.database import AsyncSessionLocal
from app.models import (
    ClientIncome,
    Debt,
    DebtPayment,
    DomainRenewal,
    EmailAccount,
    InternalProject,
    OneTimeExpense,
    PaymentMethod,
    PlatformAccount,
    Prospect,
    SecureResource,
)
from app.security.crypto import NOTE_ENC_PREFIX, encrypt_note

logger = logging.getLogger(__name__)
_LEGACY_NOTE_ENCRYPTION_ID = "legacy_plaintext_notes_v1"


async def migrate_plaintext_notes_to_encrypted(session_factory=AsyncSessionLocal) -> None:
    """Encrypt legacy plaintext private notes in place without dropping data."""
    batch_size = 200
    targets = (
        (EmailAccount, "notes"),
        (PlatformAccount, "notes"),
        (PaymentMethod, "billing_notes"),
        (Prospect, "notes"),
        (ClientIncome, "notes"),
        (DomainRenewal, "notes"),
        (OneTimeExpense, "notes"),
        (InternalProject, "notes"),
        (SecureResource, "notes"),
        (SecureResource, "encrypted_content"),
        (Debt, "notes"),
        (DebtPayment, "notes"),
    )

    async with session_factory() as session:
        already_applied = await session.scalar(
            text("SELECT EXISTS (SELECT 1 FROM core_data_migrations WHERE id = :migration_id)"),
            {"migration_id": _LEGACY_NOTE_ENCRYPTION_ID},
        )
        if already_applied:
            logger.info("La migración de notas heredadas ya fue aplicada; se omite el escaneo.")
            return

        for model, attr in targets:
            column = getattr(model, attr)
            encrypted_count = 0
            try:
                while True:
                    rows = (
                        await session.execute(
                            select(model)
                            .where(
                                column.is_not(None),
                                func.trim(column) != "",
                                ~column.startswith(NOTE_ENC_PREFIX),
                            )
                            .order_by(model.id.asc())
                            .limit(batch_size)
                        )
                    ).scalars().all()
                    if not rows:
                        break
                    for row in rows:
                        value = getattr(row, attr, None)
                        if isinstance(value, str) and value.strip() and not value.startswith(NOTE_ENC_PREFIX):
                            setattr(row, attr, encrypt_note(value))
                            encrypted_count += 1
                    await session.commit()
                if encrypted_count:
                    logger.info(
                        "Notas cifradas migradas: tabla=%s campo=%s cantidad=%s",
                        model.__tablename__,
                        attr,
                        encrypted_count,
                    )
            except Exception as exc:
                await session.rollback()
                logger.error(
                    "Falló la migración de notas en %s.%s. error_type=%s",
                    model.__tablename__,
                    attr,
                    type(exc).__name__,
                )
                raise RuntimeError(
                    "No se pudo completar la migración de notas cifradas; revisa los logs del servidor."
                ) from exc

        await session.execute(
            text("INSERT INTO core_data_migrations (id) VALUES (:migration_id) ON CONFLICT (id) DO NOTHING"),
            {"migration_id": _LEGACY_NOTE_ENCRYPTION_ID},
        )
        await session.commit()
