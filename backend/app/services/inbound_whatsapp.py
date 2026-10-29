import hashlib
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inbound_whatsapp import InboundMessageDedup, InboundAdapterConfig
from app.models.core import ActivityEvent

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

class InboundWhatsAppService:
    @staticmethod
    async def process_inbound_message(
        session: AsyncSession,
        provider_message_id: str,
        sender_phone: str,
        payload_json: str
    ) -> tuple[InboundMessageDedup, bool]:
        """
        Deduplicates incoming WhatsApp messages using provider_message_id and idempotency_hash.
        Returns (record, is_new). If duplicate, is_new is False.
        """
        raw_key = f"{provider_message_id.strip()}:{sender_phone.strip()}"
        idempotency_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

        stmt = select(InboundMessageDedup).where(
            (InboundMessageDedup.provider_message_id == provider_message_id) |
            (InboundMessageDedup.idempotency_hash == idempotency_hash)
        )
        res = await session.execute(stmt)
        existing = res.scalar_one_or_none()

        if existing:
            return existing, False

        new_record = InboundMessageDedup(
            provider_message_id=provider_message_id,
            idempotency_hash=idempotency_hash,
            sender_phone=sender_phone,
            payload_json=payload_json,
            status="procesado",
            received_at=utc_now()
        )
        session.add(new_record)
        await session.commit()
        await session.refresh(new_record)
        return new_record, True

    @staticmethod
    async def get_adapter_status(session: AsyncSession) -> dict:
        stmt = select(InboundAdapterConfig)
        res = await session.execute(stmt)
        cfg = res.scalar_one_or_none()
        return {
            "status": "inactivo",
            "is_active": cfg.is_active if cfg else False,
            "provider_name": cfg.provider_name if cfg else "proveedor_intermedio_pull",
            "polling_interval_seconds": cfg.polling_interval_seconds if cfg else 60,
            "requires_user_approval": True,
            "webhook_public_exposure": False,
            "message": "Recepción de WhatsApp inactiva por defecto. Diseñado con adaptador pull intermedio e idempotencia estricta."
        }
