import pytest
from app.models.communications import UnifiedThread, CommunicationMessage, DoNotContactList
from app.services.communications_service import CommunicationsService

@pytest.mark.asyncio
async def test_manual_links_generation_and_message_logging(db_session):
    # Test manual links without any API keys
    links = CommunicationsService.generate_manual_links(
        recipient="+526641234567",
        subject="Propuesta Comercial LESSSO",
        body="Hola estimado, le comparto la propuesta solicitada."
    )
    assert "https://wa.me/526641234567" in links["whatsapp_link"]
    assert "https://mail.zoho.com/zm/#compose" in links["zoho_mail_link"]
    assert "mailto:+526641234567" in links["mailto_link"]

    # Create thread
    thread = UnifiedThread(
        title="Conversación Prospecto Clínica Dental",
        status="abierto"
    )
    db_session.add(thread)
    await db_session.commit()
    await db_session.refresh(thread)

    # Record manual message
    msg = await CommunicationsService.record_manual_message(
        session=db_session,
        thread_id=thread.id,
        channel="whatsapp",
        direction="saliente",
        sender="LESSSO Ventas",
        recipient="+526641234567",
        body="Mensaje manual enviado directamente desde dispositivo",
        user_id="test-user"
    )
    assert msg.status == "enviado"
    assert msg.is_manual is True
    assert msg.sent_at is not None

@pytest.mark.asyncio
async def test_cross_channel_do_not_contact_blocking(db_session):
    # Add phone to Do Not Contact list
    blocked_phone = "+526649998877"
    await CommunicationsService.add_to_do_not_contact(
        session=db_session,
        identifier=blocked_phone,
        reason="Solicitud expresa del cliente de no ser contactado",
        channel="todos",
        user_id="test-user"
    )

    # Create thread
    thread = UnifiedThread(title="Hilo Bloqueado", status="abierto")
    db_session.add(thread)
    await db_session.commit()
    await db_session.refresh(thread)

    # Attempting to record manual message to blocked phone MUST raise ValueError
    with pytest.raises(ValueError, match="está en la lista de no contactar"):
        await CommunicationsService.record_manual_message(
            session=db_session,
            thread_id=thread.id,
            channel="whatsapp",
            direction="saliente",
            sender="LESSSO Ventas",
            recipient=blocked_phone,
            body="Hola de nuevo",
            user_id="test-user"
        )

@pytest.mark.asyncio
async def test_uncertain_state_message_is_not_automatically_retried(db_session):
    thread = UnifiedThread(title="Hilo Outbox", status="abierto")
    db_session.add(thread)
    await db_session.commit()
    await db_session.refresh(thread)

    # Create message with status 'incierto'
    msg = CommunicationMessage(
        thread_id=thread.id,
        channel="whatsapp",
        direction="saliente",
        sender="LESSSO Ventas",
        recipient="+526645550011",
        body="Confirmación de cita técnica",
        status="incierto",
        is_manual=False
    )
    db_session.add(msg)
    await db_session.commit()
    await db_session.refresh(msg)

    # Attempting to process outbox queue MUST refuse automatic retry
    with pytest.raises(ValueError, match="no se reenvía automáticamente"):
        await CommunicationsService.process_outbox_queue(db_session, msg.id)

def test_template_rendering():
    template = "Hola {{nombre}}, confirmamos tu cita con {{empresa}} para el folio {{folio}}."
    variables = {
        "nombre": "Lic. Mendoza",
        "empresa": "LESSSO Ciberseguridad",
        "folio": "VENTA-0042"
    }
    rendered = CommunicationsService.render_template(template, variables)
    assert rendered == "Hola Lic. Mendoza, confirmamos tu cita con LESSSO Ciberseguridad para el folio VENTA-0042."

def test_eml_sanitization_removes_scripts():
    raw_eml = b"""From: contacto@cliente.com
To: ventas@lessso.local
Subject: Cotizacion Urgente
Date: Wed, 28 Oct 2026 10:00:00 -0700
Content-Type: text/html; charset="utf-8"

<html>
<body>
<h1>Detalles del Proyecto</h1>
<p>Requerimos soporte para nuestra infraestructura.</p>
<script>alert("XSS payload attack");</script>
<img src="https://example.com/logo.png" onload="javascript:eval('attack')" />
</body>
</html>
"""
    result = CommunicationsService.sanitize_eml(raw_eml)
    assert result["headers"]["subject"] == "Cotizacion Urgente"
    assert "<script" not in result["sanitized_html_body"].lower()
    assert "onload" not in result["sanitized_html_body"].lower()
    assert "javascript:" not in result["sanitized_html_body"].lower()
    assert "Requerimos soporte" in result["sanitized_html_body"]
