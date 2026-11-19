from dataclasses import dataclass

import pytest

from app.models.core import User
from app.services.core_auth import create_user_session


@dataclass(frozen=True)
class Operation:
    method: str
    path: str
    allowed: tuple[str, ...]
    status: int = 200
    payload: dict | None = None


# These tuples describe the expected public policy independently of the implementation.
ADMINS = ("owner", "business_admin")
OPERATIONS = (*ADMINS, "operator")
SALES = (*OPERATIONS, "seller")
ROLES = (*SALES, "readonly")

MATRIX = (
    Operation("GET", "/prospects", ROLES),
    Operation("POST", "/prospects", SALES, payload={"company_name": "Comercio de ejemplo"}),
    Operation("GET", "/crm/capture/zones", SALES),
    Operation("GET", "/crm/capture/duplicates", SALES),
    Operation("GET", "/crm/capture/discards", SALES),
    Operation("GET", "/crm/proposals", SALES),
    Operation("GET", "/crm/invoices", ADMINS),
    # All workspace roles may list reports they own or were explicitly shared.
    Operation("GET", "/reports/documents", ROLES),
    Operation("POST", "/reports/documents", OPERATIONS, 201, {"title": "Informe de ejemplo"}),
    Operation("GET", "/reports/canvases", ROLES),
    Operation("GET", "/writeups/overview", OPERATIONS),
    Operation("GET", "/emails", OPERATIONS),
    Operation("GET", "/platforms", OPERATIONS),
    Operation("GET", "/platforms/billing-history", ADMINS),
    Operation("POST", "/platforms/process-subscriptions", ADMINS),
    Operation("GET", "/graph", OPERATIONS),
    Operation("GET", "/comms/threads", SALES),
    Operation("GET", "/agenda/events", SALES),
    Operation("GET", "/agenda/events?include_financial=true", ADMINS),
    Operation("GET", "/agenda/export/ics", SALES),
    Operation("GET", "/agenda/export/ics?include_financial=true", ADMINS),
    Operation("GET", "/agenda/availability?target_date=2026-11-18", SALES),
    Operation("GET", "/finances/incomes", ADMINS),
    Operation("POST", "/finances/incomes", ADMINS, payload={
        "client_name": "Comercio de ejemplo", "concept": "Anticipo",
        "received_date": "2026-11-18", "amount": 500,
    }),
    Operation("GET", "/finances/renewals", ADMINS),
    Operation("GET", "/finances/expenses", ADMINS),
    Operation("GET", "/payments", ADMINS),
    Operation("GET", "/metrics/executive", ADMINS),
    Operation("GET", "/metrics/export-monthly?month=2026-11", ADMINS),
    Operation("GET", "/finances/resources", OPERATIONS),
    Operation("GET", "/passwords/vault", OPERATIONS),
    Operation("GET", "/security/health", OPERATIONS),
    Operation("GET", "/activity/feed", ADMINS),
    Operation("GET", "/activity/audit", ADMINS),
    Operation("GET", "/audit/logs", ADMINS),
    Operation("GET", "/trash", ADMINS),
    Operation("GET", "/settings", ADMINS),
    Operation("GET", "/settings/runtime-config", ROLES),
    Operation("GET", "/exchange", ROLES),
    Operation("POST", "/exchange/manual", ADMINS, payload={"rate": 20.5, "is_manual": True}),
)


async def make_session(db, role, *, must_change_password=False):
    user = User(
        username=f"matrix_{role}",
        email=f"matrix_{role}@example.test",
        full_name="Operador de la prueba",
        hashed_password="unusable",
        role=role,
        is_active=True,
        must_change_password=must_change_password,
    )
    db.add(user)
    await db.commit()
    token, session = await create_user_session(db, user)
    return token, session


async def request_operation(client, operation, headers):
    response = await client.request(
        operation.method, f"/api/v1{operation.path}", headers=headers, json=operation.payload,
    )
    return response


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ROLES)
async def test_operator_access_matrix(client, db_session, vault_only_token, role):
    token, _ = await make_session(db_session, role)
    headers = {"X-Vault-Token": vault_only_token, "Authorization": f"Bearer {token}"}
    for operation in MATRIX:
        response = await request_operation(client, operation, headers)
        expected = operation.status if role in operation.allowed else 403
        assert response.status_code == expected, (role, operation.method, operation.path, response.text)

    team = await client.get("/api/v1/users", headers=headers)
    assert team.status_code == (200 if role in ADMINS else 403), (role, team.text)
    user = await client.post("/api/v1/users", headers=headers, json={
        "username": "nuevo_operador", "email": "nuevo@example.test",
        "full_name": "Operador nuevo", "role": "operator",
    })
    assert user.status_code == (201 if role == "owner" else 403), (role, user.text)
    budget = await client.get("/api/v1/personal-finances/budgets", headers=headers)
    assert budget.status_code == (200 if role == "owner" else 403), (role, budget.text)


@pytest.mark.asyncio
async def test_operational_routes_require_both_sessions(client, db_session, vault_only_token):
    token, _ = await make_session(db_session, "owner")
    for headers, scope in (
        ({"X-Vault-Token": vault_only_token}, "user"),
        ({"Authorization": f"Bearer {token}"}, "vault"),
    ):
        for operation in MATRIX:
            response = await request_operation(client, operation, headers)
            assert response.status_code == 401, (operation.method, operation.path, response.text)
            assert response.headers["X-Auth-Scope"] == scope


@pytest.mark.asyncio
@pytest.mark.parametrize("state", ["temporary_password", "revoked"])
async def test_unusable_operator_session_cannot_read_or_mutate(client, db_session, vault_only_token, state):
    token, session = await make_session(db_session, "owner", must_change_password=state == "temporary_password")
    if state == "revoked":
        session.is_revoked = True
        await db_session.commit()
    headers = {"X-Vault-Token": vault_only_token, "Authorization": f"Bearer {token}"}
    for operation in MATRIX:
        response = await request_operation(client, operation, headers)
        assert response.status_code == (403 if state == "temporary_password" else 401), (
            state, operation.method, operation.path, response.text,
        )


@pytest.mark.asyncio
async def test_financial_agenda_events_are_private_to_administrators(client, db_session, vault_only_token):
    admin_token, _ = await make_session(db_session, "business_admin")
    seller_token, _ = await make_session(db_session, "seller")
    admin = {"X-Vault-Token": vault_only_token, "Authorization": f"Bearer {admin_token}"}
    seller = {"X-Vault-Token": vault_only_token, "Authorization": f"Bearer {seller_token}"}
    url = "/api/v1/agenda/events"
    availability_url = "/api/v1/agenda/availability?target_date=2026-11-18"
    before = await client.get(availability_url, headers=seller)
    assert before.status_code == 200, before.text
    payload = {
        "event_type": "finanzas", "title": "Revisión financiera privada",
        "start_time": "2026-11-18T10:00:00", "end_time": "2026-11-18T11:00:00",
    }

    assert (await client.post(url, headers=seller, json=payload)).status_code == 403
    created = await client.post(url, headers=admin, json=payload)
    assert created.status_code == 200, created.text
    financial_id = created.json()["event"]["id"]

    seller_events = await client.get(url, headers=seller)
    assert seller_events.json() == []
    seller_ics = await client.get("/api/v1/agenda/export/ics", headers=seller)
    assert payload["title"] not in seller_ics.text
    admin_ics = await client.get("/api/v1/agenda/export/ics?include_financial=true", headers=admin)
    assert payload["title"] in admin_ics.text
    assert (await client.get(availability_url, headers=seller)).json() == before.json()

    ordinary = await client.post(url, headers=seller, json={
        **payload, "event_type": "reunion", "title": "Llamada comercial",
    })
    assert ordinary.status_code == 200, ordinary.text
    assert ordinary.json()["has_overlaps"] is False
    assert ordinary.json()["overlapping_event_ids"] == []

    protected = await client.post(f"{url}/{financial_id}/complete", headers=seller)
    missing = await client.post(f"{url}/missing/complete", headers=seller)
    assert (protected.status_code, protected.json()) == (400, missing.json())
    completed = await client.post(f"{url}/{financial_id}/complete", headers=admin)
    assert completed.status_code == 200, completed.text
    assert completed.json()["status"] == "completado"
