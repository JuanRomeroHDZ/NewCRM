import pytest
from datetime import datetime, timedelta, timezone
from app.models.agenda import AgendaEvent, PentestEngagement, PentestFinding
from app.services.agenda_service import AgendaService

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

@pytest.mark.asyncio
async def test_maintenance_completion_automatically_creates_next_event(db_session):
    start = utc_now()
    end = start + timedelta(hours=2)

    event, overlaps = await AgendaService.create_event(
        session=db_session,
        user_id="test-user",
        event_type="mantenimiento",
        title="Mantenimiento Preventivo Servidores",
        start_time=start,
        end_time=end,
        recurrence_interval_days=30
    )
    assert event.status == "programado"
    assert event.recurrence_interval_days == 30
    assert event.next_event_id is None

    # Complete the event -> triggers next recurrence
    completed, next_ev = await AgendaService.complete_event(
        session=db_session,
        event_id=event.id,
        user_id="test-user"
    )
    assert completed.status == "completado"
    assert next_ev is not None
    assert completed.next_event_id == next_ev.id
    assert next_ev.status == "programado"
    assert next_ev.title == "Mantenimiento Preventivo Servidores (Recurrente)"
    assert (next_ev.start_time - event.start_time).days == 30

@pytest.mark.asyncio
async def test_overlap_detection(db_session):
    base_time = utc_now() + timedelta(days=2)
    ev1, _ = await AgendaService.create_event(
        session=db_session,
        user_id="test-user",
        event_type="reunion",
        title="Reunión con Cliente Alpha",
        start_time=base_time,
        end_time=base_time + timedelta(hours=1)
    )

    # Test conflicting event overlapping by 30 minutes
    conflicts = await AgendaService.detect_overlaps(
        session=db_session,
        start_time=base_time + timedelta(minutes=30),
        end_time=base_time + timedelta(hours=1, minutes=30)
    )
    assert len(conflicts) >= 1
    assert any(c.id == ev1.id for c in conflicts)

@pytest.mark.asyncio
async def test_availability_calculator_generates_copiable_text(db_session):
    target = (utc_now() + timedelta(days=3)).strftime("%Y-%m-%d")
    avail = await AgendaService.calculate_availability(
        session=db_session,
        target_date=target,
        duration_minutes=60,
        buffer_minutes=15
    )
    assert "available_slots" in avail
    assert "copiable_proposal_text" in avail
    assert "Hola, con gusto nos reunimos" in avail["copiable_proposal_text"]
    assert len(avail["available_slots"]) > 0

@pytest.mark.asyncio
async def test_pentest_finding_blocked_outside_authorized_window(db_session):
    # Engagement window strictly in the past
    past_start = utc_now() - timedelta(days=5)
    past_end = utc_now() - timedelta(days=4)

    eng = PentestEngagement(
        client_id="dummy-client",
        title="Prueba de Penetración Web y API",
        scope_written_summary="Prueba autorizada de caja negra sobre subdominios públicos",
        authorized_targets="api.cliente.com, portal.cliente.com",
        window_start=past_start,
        window_end=past_end,
        status="finalizado"
    )
    db_session.add(eng)
    await db_session.commit()
    await db_session.refresh(eng)

    # Attempt to record finding now (outside past window) -> MUST raise ValueError
    with pytest.raises(ValueError, match="No se permiten registros o pruebas fuera de la ventana autorizada"):
        await AgendaService.record_pentest_finding(
            session=db_session,
            engagement_id=eng.id,
            title="Inyección SQL en endpoint de login",
            severity="critica",
            description="Parámetro vulnerable id",
            remediation="Usar consultas preparadas",
            user_id="test-user"
        )

@pytest.mark.asyncio
async def test_ics_export_excludes_financial_events_by_default(db_session):
    now = utc_now()
    # Regular event
    await AgendaService.create_event(
        session=db_session,
        user_id="test-user",
        event_type="visita",
        title="Visita Técnica Instalación",
        start_time=now + timedelta(hours=1),
        end_time=now + timedelta(hours=2)
    )
    # Financial event
    await AgendaService.create_event(
        session=db_session,
        user_id="test-user",
        event_type="finanzas",
        title="Corte Tarjeta Corporativa Nu",
        start_time=now + timedelta(hours=3),
        end_time=now + timedelta(hours=4)
    )

    ics_content = await AgendaService.export_events_to_ics(session=db_session, include_financial=False)
    assert "BEGIN:VCALENDAR" in ics_content
    assert "Visita Técnica Instalación" in ics_content
    assert "Corte Tarjeta Corporativa Nu" not in ics_content  # Protected / excluded
