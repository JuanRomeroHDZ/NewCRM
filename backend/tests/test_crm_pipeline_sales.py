import pytest
from app.models import Prospect
from app.models.crm_sales import Client, Proposal, Sale, PaymentInstallment, PaymentRecord, Invoice
from app.services.crm_sales import CrmSalesService

@pytest.mark.asyncio
async def test_prospect_cadence_transitions_to_sin_respuesta_preserving_history(db_session):
    prospect = Prospect(
        company_name="Taller Mecanico El Aguila",
        contact_name="Don Pedro",
        whatsapp="+526649876543",
        status="demo_creada",
        followup_count=0,
        max_followup_attempts=3
    )
    db_session.add(prospect)
    await db_session.commit()
    await db_session.refresh(prospect)

    # Attempt 1
    p1 = await CrmSalesService.advance_prospect_cadence(
        session=db_session,
        prospect_id=prospect.id,
        channel="whatsapp",
        user_id="test-user"
    )
    assert p1.followup_count == 1
    assert p1.status == "primer_contacto"

    # Attempt 2
    p2 = await CrmSalesService.advance_prospect_cadence(
        session=db_session,
        prospect_id=prospect.id,
        channel="llamada",
        user_id="test-user"
    )
    assert p2.followup_count == 2
    assert p2.status == "en_cotizacion"

    # Attempt 3 (Reaches max attempts -> transitions to sin_respuesta)
    p3 = await CrmSalesService.advance_prospect_cadence(
        session=db_session,
        prospect_id=prospect.id,
        channel="correo",
        user_id="test-user"
    )
    assert p3.followup_count == 3
    assert p3.status == "sin_respuesta"
    assert p3.is_deleted is False  # Preserved in history, not deleted

@pytest.mark.asyncio
async def test_locked_folio_generation_has_no_gaps(db_session):
    folio1 = await CrmSalesService.get_next_folio(db_session, "proposal", "PROP-")
    folio2 = await CrmSalesService.get_next_folio(db_session, "proposal", "PROP-")
    folio3 = await CrmSalesService.get_next_folio(db_session, "proposal", "PROP-")

    assert folio1 == "PROP-0001"
    assert folio2 == "PROP-0002"
    assert folio3 == "PROP-0003"

@pytest.mark.asyncio
async def test_close_sale_atomic_creates_full_entity_graph(db_session):
    prospect = Prospect(
        company_name="Restaurante La Fogata",
        contact_name="Chef Marco",
        contact_email="marco@la-fogata.com",
        whatsapp="+526645551234"
    )
    db_session.add(prospect)
    await db_session.commit()
    await db_session.refresh(prospect)

    # Create proposal first
    prop = await CrmSalesService.create_proposal(
        session=db_session,
        prospect_id=prospect.id,
        title="Sistema de Reservaciones y Web",
        service_type="proyecto_unico",
        amount=15000.0,
        currency="MXN"
    )
    assert prop.folio.startswith("PROP-")
    assert prop.is_viewed_by_user is False

    # Mark viewed
    await CrmSalesService.mark_proposal_viewed(db_session, prop.id, user_id="test-user")
    await db_session.refresh(prop)
    assert prop.is_viewed_by_user is True

    # Close sale atomically: 15,000 total, 5,000 advance payment
    sale, client, installments = await CrmSalesService.close_sale_atomic(
        session=db_session,
        user_id="test-user",
        company_name="Restaurante La Fogata",
        title="Desarrollo Web y Reservas",
        total_amount=15000.0,
        prospect_id=prospect.id,
        proposal_id=prop.id,
        contact_name="Chef Marco",
        contact_email="marco@la-fogata.com",
        phone="+526645551234",
        tax_rfc="XAXX010101000",
        advance_payment=5000.0,
        currency="MXN"
    )

    assert sale.folio.startswith("VENTA-")
    assert sale.total_amount == 15000.0
    assert sale.advance_payment == 5000.0
    assert sale.balance_amount == 10000.0

    assert client.company_name == "Restaurante La Fogata"
    assert client.tax_rfc == "XAXX010101000"

    assert len(installments) == 2
    assert installments[0].amount == 5000.0
    assert installments[0].status == "pagado"
    assert installments[1].amount == 10000.0
    assert installments[1].status == "pendiente"

    # Verify prospect and proposal status updated atomically
    await db_session.refresh(prospect)
    await db_session.refresh(prop)
    assert prospect.status == "cliente"
    assert prop.status == "aceptada"

@pytest.mark.asyncio
async def test_payment_reversal_does_not_delete_record(db_session):
    sale, client, installments = await CrmSalesService.close_sale_atomic(
        session=db_session,
        user_id="test-user",
        company_name="Farmacia Central",
        title="Consultoria de Ciberseguridad",
        total_amount=8000.0,
        advance_payment=8000.0,
        currency="MXN"
    )
    inst = installments[0]
    payments = (await db_session.execute(inst.payments.select() if hasattr(inst.payments, "select") else inst.payments)).all() if hasattr(inst, "_") else []
    
    from sqlalchemy import select
    res = await db_session.execute(select(PaymentRecord).where(PaymentRecord.installment_id == inst.id))
    payment_rec = res.scalars().first()
    assert payment_rec is not None
    assert payment_rec.is_reversed is False

    # Reverse payment
    reversed_rec = await CrmSalesService.reverse_payment(
        session=db_session,
        payment_id=payment_rec.id,
        reason="Cheque sin fondos",
        user_id="test-user"
    )
    assert reversed_rec.id == payment_rec.id
    assert reversed_rec.is_reversed is True
    assert reversed_rec.reversal_reason == "Cheque sin fondos"
    assert reversed_rec.reversed_at is not None

    # Installment status should be reset to pendiente
    await db_session.refresh(inst)
    assert inst.paid_amount == 0.0
    assert inst.status == "pendiente"

@pytest.mark.asyncio
async def test_invoice_cancellation_preserves_record(db_session):
    inv = await CrmSalesService.record_invoice(
        session=db_session,
        sale_id=None,
        client_id="dummy-client-1",
        folio="FAC-0012",
        uuid="9C6F69D0-6B8E-479D-9F9B-6A382834A81B",
        rfc="XAXX010101000",
        amount=15000.0,
        issue_date="2026-10-28",
        cfdi_usage="G03"
    )
    assert inv.status == "emitida"
    assert inv.uuid == "9C6F69D0-6B8E-479D-9F9B-6A382834A81B"

    # Cancel invoice
    cancelled_inv = await CrmSalesService.cancel_invoice(
        session=db_session,
        invoice_id=inv.id,
        reason="Error en clave del producto CFDI",
        user_id="test-user"
    )
    assert cancelled_inv.status == "cancelada"
    assert cancelled_inv.cancellation_reason == "Error en clave del producto CFDI"
    assert cancelled_inv.cancelled_at is not None

    # Verify still in database
    from sqlalchemy import select
    check = await db_session.scalar(select(Invoice).where(Invoice.id == inv.id))
    assert check is not None
    assert check.status == "cancelada"
