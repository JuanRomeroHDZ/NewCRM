import pytest
import json
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from app.models.core import User, DbSession, ConfigParameter, JobQueue, ActivityEvent
from app.security.crypto import hash_master_password, verify_master_password
from app.security.totp import generate_random_totp_secret, generate_totp_code, verify_totp_code
from app.services.core_auth import (
    authenticate_user, create_user_session, generate_temporary_password,
    get_or_create_initial_owner, hash_token
)
from app.services.config_service import (
    initialize_default_catalogs, get_config_parameter, set_config_parameter,
    export_sanitized_config, DEFAULT_CATALOGS
)
from app.services.job_queue import (
    enqueue_job, fetch_next_job, mark_job_completed, mark_job_failed, mark_job_uncertain
)
from app.services.activity_service import record_event, get_activity_feed, get_audit_trail

@pytest.mark.asyncio
async def test_owner_initialization_and_argon2id(db_session):
    owner = await get_or_create_initial_owner(db_session)
    assert owner is not None
    assert owner.role == "owner"
    assert verify_master_password(owner.hashed_password, "AdminLESSSO2026!")

@pytest.mark.asyncio
async def test_user_authentication_and_lockout(db_session):
    user = User(
        username="vendedor_test",
        email="vendedor@lessso.local",
        full_name="Vendedor Prueba",
        role="seller",
        hashed_password=hash_master_password("ClaveSegura123!"),
        is_active=True
    )
    db_session.add(user)
    await db_session.commit()

    # Successful login
    auth_user, err = await authenticate_user(db_session, "vendedor_test", "ClaveSegura123!")
    assert auth_user is not None
    assert err is None
    assert auth_user.failed_login_attempts == 0

    # Failed login attempts
    for _ in range(5):
        bad_user, err = await authenticate_user(db_session, "vendedor_test", "ClaveErronea!")
        assert bad_user is None
        assert err == "Credenciales incorrectas o cuenta bloqueada"

    # Should now be locked out
    await db_session.refresh(user)
    assert user.locked_until is not None
    assert user.failed_login_attempts >= 5

    # Attempt with correct password during lockout still rejected with generic message
    locked_user, err = await authenticate_user(db_session, "vendedor_test", "ClaveSegura123!")
    assert locked_user is None
    assert err == "Credenciales incorrectas o cuenta bloqueada"

@pytest.mark.asyncio
async def test_two_factor_totp_and_recovery_codes(db_session):
    secret = generate_random_totp_secret()
    recovery_code = "ABCD-1234"
    hashed_code = hash_token(recovery_code)

    user = User(
        username="admin_2fa",
        email="admin2fa@lessso.local",
        full_name="Admin 2FA",
        role="business_admin",
        hashed_password=hash_master_password("AdminPass123!"),
        is_active=True,
        is_totp_enabled=True,
        totp_secret=secret,
        recovery_codes=json.dumps([hashed_code])
    )
    db_session.add(user)
    await db_session.commit()

    # Generate valid TOTP code
    token, _ = generate_totp_code(secret)
    assert verify_totp_code(secret, token)

    # Validate recovery code usage
    rec_list = json.loads(user.recovery_codes)
    assert hash_token("ABCD-1234") in rec_list

@pytest.mark.asyncio
async def test_db_session_lifecycle_and_revocation(db_session):
    owner = await get_or_create_initial_owner(db_session)
    token_str, db_sess = await create_user_session(db_session, owner, ip_address="127.0.0.1", timeout_minutes=60)
    assert token_str.startswith("sess_")
    assert db_sess.is_revoked is False
    assert db_sess.expires_at > datetime.now(timezone.utc).replace(tzinfo=None)

    # Revoke session
    db_sess.is_revoked = True
    await db_session.commit()

    # Check revoked
    thash = hash_token(token_str)
    res = await db_session.execute(select(DbSession).where(DbSession.token_hash == thash))
    found = res.scalar_one_or_none()
    assert found.is_revoked is True

@pytest.mark.asyncio
async def test_modular_configuration_catalogs_and_export(db_session):
    await initialize_default_catalogs(db_session)

    # Verify preloaded catalogs
    service_types = await get_config_parameter(db_session, "service_types")
    assert service_types is not None
    assert any(s["id"] == "pentesting" for s in service_types)

    holidays = await get_config_parameter(db_session, "mexico_holidays")
    assert holidays is not None
    assert any(h["name"] == "Navidad" for h in holidays)

    # Update a catalog
    updated_holidays = holidays + [{"date": "2026-10-01", "name": "Transición del Poder Ejecutivo"}]
    await set_config_parameter(db_session, "mexico_holidays", updated_holidays)
    retrieved = await get_config_parameter(db_session, "mexico_holidays")
    assert len(retrieved) == len(holidays) + 1

    # Sanitized export
    export_data = await export_sanitized_config(db_session)
    assert "service_types" in export_data["parameters"]
    assert "mexico_holidays" in export_data["parameters"]

@pytest.mark.asyncio
async def test_job_queue_row_locking_and_uncertain_state(db_session):
    # Enqueue job
    job = await enqueue_job(
        db_session,
        job_type="send_whatsapp_message",
        payload={"recipient": "+526641234567", "template": "hola"},
        queue_name="comms"
    )
    assert job.status == "pending"
    assert job.attempts == 0

    # Fetch next job
    fetched = await fetch_next_job(db_session, queue_name="comms")
    assert fetched is not None
    assert fetched.id == job.id
    assert fetched.status == "processing"
    assert fetched.attempts == 1

    # Mark as uncertain (e.g. timeout on ambiguous third party)
    await mark_job_uncertain(db_session, fetched.id, "Meta API Gateway Timeout HTTP 504")
    await db_session.refresh(fetched)
    assert fetched.status == "uncertain"
    assert "Estado incierto" in fetched.last_error

    # Retry job
    fetched.status = "pending"
    await db_session.commit()
    re_fetched = await fetch_next_job(db_session, queue_name="comms")
    assert re_fetched is not None
    await mark_job_completed(db_session, re_fetched.id)
    await db_session.refresh(re_fetched)
    assert re_fetched.status == "completed"

@pytest.mark.asyncio
async def test_activity_and_audit_event_stream(db_session):
    event = await record_event(
        db_session,
        module="finances",
        action="update",
        entity_type="budget",
        entity_id="budget_2026",
        summary="Se actualizó el tope presupuestal mensual",
        details_before={"cap": 50000},
        details_after={"cap": 60000},
        user_name="Propietario",
        ip_address="127.0.0.1"
    )
    assert event.id is not None

    feed = await get_activity_feed(db_session, module="finances")
    assert len(feed) >= 1
    assert feed[0]["summary"] == "Se actualizó el tope presupuestal mensual"
    # Feed should not expose raw diffs
    assert "details_before" not in feed[0]

    audit = await get_audit_trail(db_session, module="finances")
    assert len(audit) >= 1
    assert audit[0]["details_before"]["cap"] == 50000
    assert audit[0]["details_after"]["cap"] == 60000
