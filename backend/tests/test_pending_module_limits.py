from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1.agenda import EventCreateRequest, PentestEngagementCreate
from app.api.v1.communications import TemplateRenderRequest
from app.api.v1.integrations import LeaseAcquireRequest, LeaseReleaseRequest
from app.api.v1.workshop import DiagramSaveRequest
from app.config import Settings
from app.models.core import User
from app.security.crypto import hash_master_password
from app.schemas import UserCreateRequest, UserUpdateRequest
from app.services.core_auth import create_user_session
from app.services.communications_service import CommunicationsService


async def _owner_headers(db_session, username: str = "limits_owner") -> dict[str, str]:
    owner = User(
        username=username,
        email=f"{username}@example.test",
        full_name="Limits Owner",
        role="owner",
        hashed_password=hash_master_password("OwnerPasswordForLimits123!"),
        is_active=True,
    )
    db_session.add(owner)
    await db_session.commit()
    token, _ = await create_user_session(db_session, owner)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize(
    "model,payload",
    [
        (
            EventCreateRequest,
            {
                "event_type": "reunion",
                "title": "Evento largo",
                "start_time": "2027-01-01T09:00:00",
                "end_time": "2027-02-02T09:00:00",
            },
        ),
        (
            EventCreateRequest,
            {
                "event_type": "reunion",
                "title": "Zonas horarias mezcladas",
                "start_time": "2027-01-01T09:00:00-08:00",
                "end_time": "2027-01-01T10:00:00",
            },
        ),
        (
            PentestEngagementCreate,
            {
                "client_id": "client-1",
                "title": "Evaluación autorizada",
                "scope_written_summary": "Prueba de alcance acotado para validar controles.",
                "authorized_targets": "portal.example.test",
                "window_start": "2027-01-01T09:00:00",
                "window_end": "2028-01-02T09:00:00",
            },
        ),
    ],
)
def test_agenda_limits_reject_excessive_or_mixed_time_windows(model, payload):
    with pytest.raises(ValidationError):
        model.model_validate(payload)


def test_agenda_accepts_valid_window_boundaries():
    start = datetime(2027, 1, 1, 9)
    event = EventCreateRequest(
        event_type="reunion",
        title="Planeación",
        start_time=start,
        end_time=start + timedelta(days=31),
    )
    engagement = PentestEngagementCreate(
        client_id="client-1",
        title="Evaluación autorizada",
        scope_written_summary="Prueba de alcance acotado para validar controles.",
        authorized_targets="portal.example.test",
        window_start=start,
        window_end=start + timedelta(days=365),
    )
    assert event.end_time - event.start_time == timedelta(days=31)
    assert engagement.window_end - engagement.window_start == timedelta(days=365)


@pytest.mark.asyncio
async def test_agenda_rejects_nonexistent_linked_records_with_safe_404(client, db_session):
    headers = await _owner_headers(db_session, "agenda_limits_owner")
    start = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=2)
    response = await client.post(
        "/api/v1/agenda/events",
        headers=headers,
        json={
            "event_type": "reunion",
            "title": "Reunión con cliente",
            "start_time": start.isoformat(),
            "end_time": (start + timedelta(hours=1)).isoformat(),
            "client_id": "missing-client-id",
        },
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "El cliente asociado no existe."

    pentest = await client.post(
        "/api/v1/agenda/pentest/engagements",
        headers=headers,
        json={
            "client_id": "missing-client-id",
            "title": "Evaluación autorizada",
            "scope_written_summary": "Prueba de alcance acotado para validar controles.",
            "authorized_targets": "portal.example.test",
            "window_start": start.isoformat(),
            "window_end": (start + timedelta(days=1)).isoformat(),
        },
    )
    assert pentest.status_code == 404
    assert pentest.json()["detail"] == "El cliente asociado no existe."


@pytest.mark.asyncio
async def test_agenda_event_id_path_has_a_safe_maximum_length(client, db_session):
    headers = await _owner_headers(db_session, "agenda_event_path_limits_owner")
    response = await client.post(
        f"/api/v1/agenda/events/{'a' * 37}/complete",
        headers=headers,
    )
    assert response.status_code == 422


def test_template_inputs_allow_only_bounded_scalars():
    with pytest.raises(ValidationError):
        TemplateRenderRequest.model_validate({
            "template_str": "Hola {{nombre}}",
            "variables": {"nombre": {"nested": "x"}},
        })
    with pytest.raises(ValidationError):
        TemplateRenderRequest.model_validate({
            "template_str": "Hola {{nombre}}",
            "variables": {"nombre": "x" * 5001},
        })


def test_template_render_is_literal_and_caps_expansion():
    rendered = CommunicationsService.render_template(
        r"Valor: {{clave}}", {"CLAVE": r"\g<0>"}
    )
    assert rendered == r"Valor: \g<0>"

    with pytest.raises(ValueError, match="200,000 caracteres"):
        CommunicationsService.render_template("{{x}}" * 9000, {"x": "x" * 5000})


@pytest.mark.asyncio
async def test_template_route_returns_bounded_validation_error(client, db_session):
    headers = await _owner_headers(db_session, "comms_limits_owner")
    response = await client.post(
        "/api/v1/comms/templates/render",
        headers=headers,
        json={"template_str": "{{x}}" * 9000, "variables": {"x": "x" * 5000}},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "El resultado de la plantilla supera el límite de 200,000 caracteres."


@pytest.mark.asyncio
async def test_eml_upload_reads_only_one_byte_past_the_limit(monkeypatch):
    from app.api.v1 import communications

    observed_sizes = []
    monkeypatch.setattr(communications, "MAX_EML_FILE_BYTES", 8)

    class OversizedUpload:
        async def read(self, size=-1):
            observed_sizes.append(size)
            return b"123456789"

    with pytest.raises(HTTPException) as exc:
        await communications.sanitize_eml_file(file=OversizedUpload(), current_user=None)

    assert exc.value.status_code == 413
    assert observed_sizes == [9]


def test_diagram_size_limit_counts_utf8_bytes(monkeypatch):
    from app.api.v1 import workshop

    monkeypatch.setattr(workshop, "MAX_DIAGRAM_SVG_BYTES", 4)
    with pytest.raises(ValidationError):
        DiagramSaveRequest(title="Diagrama", svg_content="😀a")


def test_integration_inputs_use_only_configured_resource_and_server_identity():
    assert LeaseAcquireRequest().resource_name == "cloud_backup_google_drive"
    assert LeaseReleaseRequest().resource_name == "cloud_backup_google_drive"
    with pytest.raises(ValidationError):
        LeaseAcquireRequest(resource_name="another-resource")
    with pytest.raises(ValidationError):
        LeaseReleaseRequest(server_name="attacker-controlled")
    with pytest.raises(ValidationError):
        LeaseAcquireRequest(duration_seconds=86401)


def test_configured_server_name_is_bounded_and_cannot_contain_path_characters():
    base_settings = {
        "_env_file": None,
        "SERVER_SECRET_KEY": "x" * 32,
        "INITIAL_OWNER_PASSWORD": "x" * 16,
        "FALLBACK_USD_MXN_RATE": 18.5,
    }
    assert Settings(**base_settings, SERVER_NAME="server-01.local").SERVER_NAME == "server-01.local"
    with pytest.raises(ValidationError):
        Settings(**base_settings, SERVER_NAME="../other-server")
    with pytest.raises(ValidationError):
        Settings(**base_settings, SERVER_NAME="s" * 65)


@pytest.mark.asyncio
async def test_lease_route_uses_configured_server_name(client, db_session, monkeypatch):
    from app.api.v1 import integrations
    from app.config import settings

    headers = await _owner_headers(db_session, "lease_limits_owner")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    observed = {}

    async def fake_acquire_lease(*, session, resource_name, server_name, duration_seconds):
        observed.update(resource_name=resource_name, server_name=server_name, duration_seconds=duration_seconds)
        return SimpleNamespace(
            resource_name=resource_name,
            server_name=server_name,
            acquired_at=now,
            expires_at=now + timedelta(seconds=duration_seconds),
            is_active=True,
        )

    monkeypatch.setattr(integrations.CloudLeaseService, "acquire_lease", fake_acquire_lease)
    response = await client.post(
        "/api/v1/integrations/cloud-lease/acquire",
        headers=headers,
        json={"resource_name": "cloud_backup_google_drive", "duration_seconds": 60},
    )
    assert response.status_code == 200
    assert response.json()["server_name"] == settings.SERVER_NAME
    assert observed["server_name"] == settings.SERVER_NAME

    spoofed = await client.post(
        "/api/v1/integrations/cloud-lease/acquire",
        headers=headers,
        json={
            "resource_name": "cloud_backup_google_drive",
            "server_name": "attacker-controlled",
        },
    )
    assert spoofed.status_code == 422

    async def fake_release_lease(*, session, resource_name, server_name):
        observed.update(released_resource=resource_name, released_server=server_name)
        return True

    monkeypatch.setattr(integrations.CloudLeaseService, "release_lease", fake_release_lease)
    released = await client.post(
        "/api/v1/integrations/cloud-lease/release",
        headers=headers,
        json={"resource_name": "cloud_backup_google_drive"},
    )
    assert released.status_code == 200
    assert released.json() == {
        "released": True,
        "resource_name": "cloud_backup_google_drive",
        "server_name": settings.SERVER_NAME,
    }
    assert observed["released_server"] == settings.SERVER_NAME


def test_user_account_fields_keep_the_existing_limits():
    with pytest.raises(ValidationError):
        UserCreateRequest(
            username="u" * 65,
            email="valid@example.test",
            full_name="Usuario normal",
            role="seller",
        )
    with pytest.raises(ValidationError):
        UserCreateRequest(
            username="valid_user",
            email="valid@example.test",
            full_name="Usuario normal",
            role="owner; DROP TABLE users",
        )
    with pytest.raises(ValidationError):
        UserUpdateRequest(full_name="Nombre" * 30)


@pytest.mark.asyncio
async def test_user_id_path_has_a_safe_maximum_length(client, db_session):
    headers = await _owner_headers(db_session, "user_path_limits_owner")
    response = await client.get(f"/api/v1/users/{'a' * 37}", headers=headers)
    assert response.status_code == 422
