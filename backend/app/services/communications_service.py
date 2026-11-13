import email
from email import policy
import math
import re
from urllib.parse import quote
from datetime import datetime, timezone
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.communications import (
    UnifiedThread, CommunicationMessage, DoNotContactList,
    MessageTemplate, WhatsAppConfig, TelegramConfig
)
from app.models.core import ActivityEvent
from app.services.workshop_sanitizer import sanitize_svg_content

MAX_TEMPLATE_RENDERED_CHARS = 200_000
MAX_TEMPLATE_VARIABLES = 100
MAX_TEMPLATE_SOURCE_CHARS = 50_000
MAX_TEMPLATE_VARIABLE_CHARS = 5_000

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

class CommunicationsService:
    @staticmethod
    async def is_in_do_not_contact(
        session: AsyncSession,
        identifier: str,
        channel: str = "todos"
    ) -> bool:
        """
        Cross-channel Do Not Contact verification.
        Matches phone numbers, emails, or company domains.
        """
        clean_id = identifier.strip().lower()
        stmt = select(DoNotContactList).where(
            or_(DoNotContactList.channel == "todos", DoNotContactList.channel == channel),
            DoNotContactList.identifier.ilike(f"%{clean_id}%")
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none() is not None

    @staticmethod
    async def add_to_do_not_contact(
        session: AsyncSession,
        identifier: str,
        reason: str,
        channel: str = "todos",
        user_id: str | None = None
    ) -> DoNotContactList:
        entry = DoNotContactList(
            channel=channel,
            identifier=identifier.strip(),
            reason=reason.strip(),
            added_by_user_id=user_id
        )
        session.add(entry)
        await session.commit()
        await session.refresh(entry)
        return entry

    @staticmethod
    def render_template(template_str: str, variables: dict) -> str:
        """Renders bounded scalar variables without interpreting replacement text."""
        if len(template_str) > MAX_TEMPLATE_SOURCE_CHARS:
            raise ValueError("La plantilla supera el límite permitido.")
        if not isinstance(variables, dict) or len(variables) > MAX_TEMPLATE_VARIABLES:
            raise ValueError("La plantilla supera el límite de variables permitidas.")

        normalized_variables: dict[str, str] = {}
        for key, value in variables.items():
            if not isinstance(key, str) or not key.strip() or len(key) > 64:
                raise ValueError("Cada nombre de variable debe tener entre 1 y 64 caracteres.")
            normalized_key = key.strip().casefold()
            if normalized_key in normalized_variables:
                raise ValueError("No se pueden repetir nombres de variables ignorando mayúsculas.")
            if not (value is None or isinstance(value, (str, int, float, bool))):
                raise ValueError("Las variables solo pueden ser texto, números o valores booleanos.")
            if isinstance(value, float) and not math.isfinite(value):
                raise ValueError("Las variables numéricas deben ser finitas.")
            if isinstance(value, int) and not isinstance(value, bool) and value.bit_length() > 3322:
                raise ValueError("El tamaño de una variable excede el límite permitido.")
            replacement = str(value if value is not None else "")
            if len(replacement) > MAX_TEMPLATE_VARIABLE_CHARS:
                raise ValueError("El tamaño de las variables de plantilla excede el límite.")
            normalized_variables[normalized_key] = replacement

        placeholder = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}", re.IGNORECASE)
        parts: list[str] = []
        source_cursor = 0
        output_size = 0
        for match in placeholder.finditer(template_str):
            prefix = template_str[source_cursor:match.start()]
            replacement = normalized_variables.get(match.group(1).strip().casefold(), match.group(0))
            output_size += len(prefix) + len(replacement)
            if output_size > MAX_TEMPLATE_RENDERED_CHARS:
                raise ValueError("El resultado de la plantilla supera el límite de 200,000 caracteres.")
            parts.extend((prefix, replacement))
            source_cursor = match.end()

        tail = template_str[source_cursor:]
        if output_size + len(tail) > MAX_TEMPLATE_RENDERED_CHARS:
            raise ValueError("El resultado de la plantilla supera el límite de 200,000 caracteres.")
        parts.append(tail)
        return "".join(parts)

    @staticmethod
    def generate_manual_links(recipient: str, body: str, subject: str | None = None) -> dict:
        """
        Generates functional manual links for WhatsApp, Zoho Mail, and standard mailto.
        Works 100% without external API tokens.
        """
        clean_phone = re.sub(r"[^\d+]", "", recipient)
        encoded_body = quote(body)
        encoded_subject = quote(subject or "")

        whatsapp_base = settings.WHATSAPP_SHARE_BASE_URL.rstrip("/")
        zoho_base = settings.ZOHO_MAIL_COMPOSE_URL
        separator = "&" if "?" in zoho_base else "?"
        whatsapp_url = f"{whatsapp_base}/{clean_phone.replace('+', '')}?text={encoded_body}"
        zoho_url = f"{zoho_base}{separator}to={quote(recipient)}&subject={encoded_subject}&body={encoded_body}"
        mailto_url = f"mailto:{recipient}?subject={encoded_subject}&body={encoded_body}"

        return {
            "whatsapp_link": whatsapp_url,
            "zoho_mail_link": zoho_url,
            "mailto_link": mailto_url,
            "copiable_body": body
        }

    @staticmethod
    def sanitize_eml(raw_eml_bytes: bytes) -> dict:
        """
        Parses and sanitizes uploaded .eml files.
        Never executes scripts; strips script tags, onload handlers, and dangerous URIs.
        """
        msg = email.message_from_bytes(raw_eml_bytes, policy=policy.default)
        headers = {
            "from": msg.get("From", ""),
            "to": msg.get("To", ""),
            "subject": msg.get("Subject", ""),
            "date": msg.get("Date", "")
        }

        body_text = ""
        body_html = ""

        if msg.is_multipart():
            for part in msg.walk():
                ctype = part.get_content_type()
                if ctype == "text/plain":
                    body_text += part.get_content()
                elif ctype == "text/html":
                    body_html += part.get_content()
        else:
            ctype = msg.get_content_type()
            if ctype == "text/plain":
                body_text = msg.get_content()
            elif ctype == "text/html":
                body_html = msg.get_content()

        # Sanitize HTML body using workshop sanitizer
        sanitized_html = sanitize_svg_content(body_html) if body_html else ""

        return {
            "headers": headers,
            "text_body": body_text.strip(),
            "sanitized_html_body": sanitized_html,
            "is_safe": True
        }

    @staticmethod
    async def record_manual_message(
        session: AsyncSession,
        thread_id: str,
        channel: str,
        direction: str,
        sender: str,
        recipient: str,
        body: str,
        user_id: str,
        subject: str | None = None
    ) -> CommunicationMessage:
        """
        Records a manually sent or received message after verifying Do Not Contact list.
        """
        is_blocked = await CommunicationsService.is_in_do_not_contact(session, recipient, channel)
        if is_blocked:
            raise ValueError(f"El destinatario '{recipient}' está en la lista de no contactar.")

        msg = CommunicationMessage(
            thread_id=thread_id,
            channel=channel,
            direction=direction,
            sender=sender,
            recipient=recipient,
            subject=subject,
            body=body,
            status="enviado" if direction == "saliente" else "entregado",
            is_manual=True,
            sent_at=utc_now()
        )
        session.add(msg)

        audit = ActivityEvent(
            module="comms",
            action="create",
            entity_type="comm_message",
            entity_id=msg.id,
            user_id=user_id,
            summary=f"Mensaje manual registrado ({channel}) para {recipient}"
        )
        session.add(audit)

        await session.commit()
        await session.refresh(msg)
        return msg

    @staticmethod
    async def process_outbox_queue(
        session: AsyncSession,
        message_id: str
    ) -> CommunicationMessage:
        """
        Outbox queue processor.
        CRITICAL RULE: Un mensaje en estado 'incierto' NO se reenvía solo.
        Must raise error or require user review.
        """
        msg = await session.get(CommunicationMessage, message_id)
        if not msg:
            raise ValueError("Mensaje no encontrado.")

        if msg.status == "incierto":
            raise ValueError(
                "El mensaje se encuentra en estado incierto. "
                "Por política de seguridad contra envíos duplicados, no se reenvía automáticamente. "
                "Requiere confirmación manual del usuario."
            )

        # Integrations inactive by default
        msg.status = "redactado"
        msg.error_message = "Integración automática inactiva. Utilice el flujo manual (WhatsApp / Zoho / Enlace)."
        await session.commit()
        await session.refresh(msg)
        return msg

    @staticmethod
    def get_whatsapp_rates():
        """
        Cost table for WhatsApp Meta Cloud API (in USD).
        Marked 'por verificar' per Section 13.3 instructions.
        """
        return {
            "status": "inactivo",
            "rates_verified": False,
            "currency": "USD",
            "categories": {
                "marketing": {"mexico_usd": 0.0435, "note": "Por verificar en Meta Developers"},
                "utilidad": {"mexico_usd": 0.0210, "note": "Por verificar en Meta Developers"},
                "autenticacion": {"mexico_usd": 0.0380, "note": "Por verificar en Meta Developers"},
                "servicio": {"mexico_usd": 0.0150, "note": "Por verificar en Meta Developers"}
            },
            "monthly_budget_cap_usd": 0.0,
            "current_monthly_spent_usd": 0.0,
            "emergency_paused": True
        }
