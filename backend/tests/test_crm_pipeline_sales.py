import asyncio
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession, create_async_engine
from app.database import Base
from app.models import Prospect
from app.models.core import User
from app.models.crm_sales import Client, FolioSequence, Proposal, Sale, PaymentInstallment, PaymentRecord, Invoice
from app.security.crypto import hash_master_password
from app.services.core_auth import create_user_session
from app.services.crm_sales import CrmSalesService, SaleAlreadyClosedError

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
async def test_folio_upsert_starts_at_one_and_keeps_count_across_commits(db_session):
    first = await CrmSalesService.get_next_folio(db_session, "invoice", "FAC-")
    await db_session.commit()
    second = await CrmSalesService.get_next_folio(db_session, "invoice", "FAC-")
    await db_session.commit()

    sequence = await db_session.scalar(
        select(FolioSequence).where(FolioSequence.sequence_type == "invoice")
    )
    assert first == "FAC-0001"
    assert second == "FAC-0002"
    assert sequence is not None
    assert sequence.current_number == 2


@pytest.mark.asyncio
async def test_folio_upsert_leaves_commit_control_to_caller(db_session):
    prospect = Prospect(company_name="Operación reversible")
    db_session.add(prospect)
    await db_session.flush()

    folio = await CrmSalesService.get_next_folio(db_session, "sale", "VENTA-")
    await db_session.rollback()

    assert folio == "VENTA-0001"
    assert await db_session.get(Prospect, prospect.id) is None
    assert await db_session.scalar(
        select(FolioSequence).where(FolioSequence.sequence_type == "sale")
    ) is None


@pytest.mark.asyncio
async def test_folio_upsert_allocates_unique_numbers_concurrently(tmp_path):
    db_path = tmp_path / "folio-concurrency.sqlite3"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def allocate_folio():
        async with session_factory() as session:
            folio = await CrmSalesService.get_next_folio(session, "sale", "VENTA-")
            await session.commit()
            return folio

    try:
        folios = await asyncio.gather(*(allocate_folio() for _ in range(6)))
        values = sorted(int(folio.removeprefix("VENTA-")) for folio in folios)
        assert values == list(range(1, 7))

        async with session_factory() as session:
            count = await session.scalar(select(func.count()).select_from(FolioSequence))
            sequence = await session.scalar(
                select(FolioSequence).where(FolioSequence.sequence_type == "sale")
            )
        assert count == 1
        assert sequence is not None
        assert sequence.current_number == 6
    finally:
        await engine.dispose()

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
async def test_close_sale_rejects_a_second_sale_for_the_same_prospect(db_session):
    prospect = Prospect(company_name="Clínica Central")
    db_session.add(prospect)
    await db_session.commit()

    first_sale, _, _ = await CrmSalesService.close_sale_atomic(
        session=db_session,
        user_id="test-user",
        company_name=prospect.company_name,
        title="Sitio web",
        total_amount=12000.0,
        prospect_id=prospect.id,
    )
    first_sale_prospect_id = first_sale.prospect_id

    with pytest.raises(SaleAlreadyClosedError, match="Ya existe una venta para este prospecto"):
        await CrmSalesService.close_sale_atomic(
            session=db_session,
            user_id="test-user",
            company_name=prospect.company_name,
            title="Sitio web",
            total_amount=12000.0,
            prospect_id=prospect.id,
        )

    sales_count = await db_session.scalar(
        select(func.count()).select_from(Sale).where(Sale.prospect_id == prospect.id)
    )
    clients_count = await db_session.scalar(
        select(func.count()).select_from(Client).where(Client.prospect_id == prospect.id)
    )
    assert sales_count == 1
    assert clients_count == 1
    assert first_sale_prospect_id == prospect.id


@pytest.mark.asyncio
async def test_close_sale_serializes_concurrent_requests_for_the_same_prospect(tmp_path):
    db_path = tmp_path / "sale-concurrency.sqlite3"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with session_factory() as session:
            prospect = Prospect(company_name="Clínica bajo concurrencia")
            session.add(prospect)
            await session.commit()
            prospect_id = prospect.id

        async def close_sale():
            async with session_factory() as session:
                return await CrmSalesService.close_sale_atomic(
                    session=session,
                    user_id="test-user",
                    company_name="Clínica bajo concurrencia",
                    title="Sitio web",
                    total_amount=12000.0,
                    prospect_id=prospect_id,
                )

        outcomes = await asyncio.gather(close_sale(), close_sale(), return_exceptions=True)
        successes = [outcome for outcome in outcomes if not isinstance(outcome, BaseException)]
        conflicts = [outcome for outcome in outcomes if isinstance(outcome, SaleAlreadyClosedError)]

        async with session_factory() as session:
            sales_count = await session.scalar(
                select(func.count()).select_from(Sale).where(Sale.prospect_id == prospect_id)
            )
        assert len(successes) == 1
        assert len(conflicts) == 1
        assert sales_count == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_close_sale_via_proposal_claims_its_prospect(db_session):
    prospect = Prospect(company_name="Consultorio del Valle")
    db_session.add(prospect)
    await db_session.flush()
    proposal = Proposal(
        folio="PROP-TEST-1",
        prospect_id=prospect.id,
        title="Sitio web",
        amount=12000.0,
    )
    db_session.add(proposal)
    await db_session.commit()

    sale, _, _ = await CrmSalesService.close_sale_atomic(
        session=db_session,
        user_id="test-user",
        company_name=prospect.company_name,
        title=proposal.title,
        total_amount=proposal.amount,
        proposal_id=proposal.id,
    )

    assert sale.prospect_id == prospect.id
    with pytest.raises(SaleAlreadyClosedError, match="Ya existe una venta para este prospecto"):
        await CrmSalesService.close_sale_atomic(
            session=db_session,
            user_id="test-user",
            company_name=prospect.company_name,
            title="Servicio adicional",
            total_amount=1000.0,
            prospect_id=prospect.id,
        )


@pytest.mark.asyncio
async def test_close_sale_route_maps_duplicate_reference_to_conflict(client, db_session):
    prospect = Prospect(company_name="Clínica del Río")
    owner = User(
        username="sales_test_owner",
        email="sales-test-owner@example.test",
        full_name="Sales Test Owner",
        role="owner",
        hashed_password=hash_master_password("SalesTestPassword123!"),
        is_active=True,
        must_change_password=False,
    )
    db_session.add_all([prospect, owner])
    await db_session.commit()
    token, _ = await create_user_session(db_session, owner)

    payload = {
        "company_name": prospect.company_name,
        "title": "Sitio web",
        "total_amount": 12000,
        "prospect_id": prospect.id,
    }
    headers = {"Authorization": f"Bearer {token}"}
    first_response = await client.post("/api/v1/crm/sales/close", headers=headers, json=payload)
    second_response = await client.post("/api/v1/crm/sales/close", headers=headers, json=payload)

    assert first_response.status_code == 200
    assert second_response.status_code == 409
    assert second_response.json()["detail"] == "Ya existe una venta para este prospecto."

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
