import pytest
from app.models.crm_sales import Client, Sale, PaymentInstallment
from app.models import Prospect
from app.services.metrics_service import MetricsService
from app.services.inbound_whatsapp import InboundWhatsAppService

@pytest.mark.asyncio
async def test_executive_metrics_calculation(db_session):
    # Setup client and prospect
    client = Client(company_name="Soluciones Industriales Tijuana", status="activo")
    prospect = Prospect(company_name="Prospecto Convertido", status="cliente")
    prospect_cold = Prospect(company_name="Prospecto Frio", status="archivado_frio")
    db_session.add_all([client, prospect, prospect_cold])
    await db_session.commit()
    await db_session.refresh(client)

    # Setup sale with monthly recurring revenue
    sale = Sale(
        client_id=client.id,
        folio="VENTA-0099",
        title="Mantenimiento Mensual Nube",
        service_type="mantenimiento",
        total_amount=5000.0,
        balance_amount=2000.0,
        status="activa"
    )
    db_session.add(sale)
    await db_session.commit()
    await db_session.refresh(sale)

    # Setup installment with pending balance
    inst = PaymentInstallment(
        sale_id=sale.id,
        installment_number=1,
        concept="Saldo Pendiente",
        amount=2000.0,
        paid_amount=0.0,
        currency="MXN",
        due_date="2026-11-15",
        status="pendiente"
    )
    db_session.add(inst)
    await db_session.commit()

    # Calculate metrics
    metrics = await MetricsService.get_executive_metrics(db_session)
    assert metrics["total_billed_mxn"] >= 5000.0
    assert metrics["monthly_recurring_revenue_mrr_mxn"] >= 5000.0
    assert metrics["accounts_receivable_mxn"] >= 2000.0
    assert metrics["clients"]["active"] >= 1
    assert metrics["conversion"]["conversion_rate_percent"] > 0

@pytest.mark.asyncio
async def test_monthly_csv_report_sanitizes_formula_injection(db_session):
    client = Client(company_name="=cmd|' /C calc'!A0", status="activo")
    db_session.add(client)
    await db_session.commit()
    await db_session.refresh(client)

    sale = Sale(
        client_id=client.id,
        folio="VENTA-0100",
        title="+SUM(1+1)*cmd",
        service_type="proyecto_unico",
        total_amount=12000.0,
        status="activa"
    )
    db_session.add(sale)
    await db_session.commit()

    csv_output = await MetricsService.export_monthly_report_csv(db_session, "2026-10")
    # CSV injection vectors must be neutralized with leading single quote
    assert "'=cmd|" in csv_output
    assert "'+SUM" in csv_output

@pytest.mark.asyncio
async def test_inbound_whatsapp_deduplication_and_idempotency(db_session):
    msg_id = "wamid.HBgLMjIyMDExOTk4OA=="
    phone = "+526647778899"
    payload = '{"text": "Hola, solicito información sobre sus servicios de pentesting"}'

    # First receive must be processed as new
    rec1, is_new1 = await InboundWhatsAppService.process_inbound_message(
        session=db_session,
        provider_message_id=msg_id,
        sender_phone=phone,
        payload_json=payload
    )
    assert is_new1 is True
    assert rec1.status == "procesado"

    # Second receive with same ID must be detected as duplicate
    rec2, is_new2 = await InboundWhatsAppService.process_inbound_message(
        session=db_session,
        provider_message_id=msg_id,
        sender_phone=phone,
        payload_json=payload
    )
    assert is_new2 is False
    assert rec2.id == rec1.id

@pytest.mark.asyncio
async def test_inbound_whatsapp_inactive_by_default(db_session):
    status = await InboundWhatsAppService.get_adapter_status(db_session)
    assert status["status"] == "inactivo"
    assert status["is_active"] is False
    assert status["requires_user_approval"] is True
    assert status["webhook_public_exposure"] is False
