from app.api.v1.auth import reset_vault_lockout
from app.config import settings
from app.models.core import User
from app.models.finances import Debt
from app.security.crypto import hash_master_password
from app.services.core_auth import create_user_session


async def _make_user(db_session, *, username: str, role: str, password: str = "ValidPass123!") -> tuple[User, str]:
    user = User(
        username=username,
        email=f"{username}@lessso.local",
        full_name=f"User {username}",
        role=role,
        hashed_password=hash_master_password(password),
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    token, _ = await create_user_session(db_session, user)
    return user, token


async def test_platform_service_date_order_validation(client, auth_token):
    headers = {"X-Vault-Token": auth_token}

    # Invalid calendar date rejected
    bad_cal = await client.post(
        "/api/v1/platforms",
        json={"name": "BadCal", "start_date": "2026-02-30"},
        headers=headers,
    )
    assert bad_cal.status_code == 422

    # next_billing_date before start_date rejected on Create
    bad_order = await client.post(
        "/api/v1/platforms",
        json={
            "name": "BadOrder",
            "start_date": "2026-05-10",
            "next_billing_date": "2026-05-01",
        },
        headers=headers,
    )
    assert bad_order.status_code == 422

    # Valid platform creation
    created = await client.post(
        "/api/v1/platforms",
        json={
            "name": "GoodService",
            "start_date": "2026-05-01",
            "trial_end_date": "2026-05-15",
            "next_billing_date": "2026-06-01",
        },
        headers=headers,
    )
    assert created.status_code == 200
    platform_id = created.json()["id"]

    # Merged update where next_billing_date becomes earlier than existing start_date rejected
    bad_merged = await client.put(
        f"/api/v1/platforms/{platform_id}",
        json={"next_billing_date": "2026-04-01"},
        headers=headers,
    )
    assert bad_merged.status_code == 422


async def test_payment_method_card_and_expiry_consistency(client, auth_token):
    headers = {"X-Vault-Token": auth_token}

    # Partial expiry on create rejected
    partial_exp = await client.post(
        "/api/v1/payments",
        json={"issuer": "Visa", "alias": "Test", "last_four": "1111", "expiry_month": "09"},
        headers=headers,
    )
    assert partial_exp.status_code == 422

    # Mismatched card_number last 4 vs last_four rejected
    mismatch = await client.post(
        "/api/v1/payments",
        json={
            "issuer": "Visa",
            "alias": "Mismatch",
            "last_four": "0000",
            "card_number": "4111 1111 1111 9921",
        },
        headers=headers,
    )
    assert mismatch.status_code == 422

    # Valid card with spaced digits normalized
    ok = await client.post(
        "/api/v1/payments",
        json={
            "issuer": "Mastercard",
            "alias": "Principal",
            "last_four": "9921",
            "card_number": "5111-1111-1111-9921",
            "expiry_month": "11",
            "expiry_year": "29",
        },
        headers=headers,
    )
    assert ok.status_code == 200
    pm_id = ok.json()["id"]

    # Updating last_four alone without updating stored card_number must fail consistency check
    bad_upd = await client.put(
        f"/api/v1/payments/{pm_id}",
        json={"last_four": "1234"},
        headers=headers,
    )
    assert bad_upd.status_code == 422


async def test_prospect_phone_and_multi_phone_list_validation(client, auth_token):
    headers = {"X-Vault-Token": auth_token}

    bad_wa = await client.post(
        "/api/v1/prospects",
        json={"company_name": "Bad Phone Co", "whatsapp": "abc"},
        headers=headers,
    )
    assert bad_wa.status_code == 422

    bad_list = await client.post(
        "/api/v1/prospects",
        json={"company_name": "Bad List Co", "phones": "+526641234567, 123"},
        headers=headers,
    )
    assert bad_list.status_code == 422

    good = await client.post(
        "/api/v1/prospects",
        json={
            "company_name": "Clinica Valida",
            "whatsapp": "+52 664 123 4567",
            "phones": "+52 664 123 4567; 664-987-6543\n+52 664 123 4567",
        },
        headers=headers,
    )
    assert good.status_code == 200
    assert good.json()["phones"] == "+52 664 123 4567, 664-987-6543"


async def test_vault_unlock_lockout_and_core_user_security(client, db_session):
    reset_vault_lockout()
    setup_res = await client.post("/api/v1/auth/setup", json={"master_password": "MasterPassword123!"})
    assert setup_res.status_code == 200

    for _ in range(settings.MAX_FAILED_LOGIN_ATTEMPTS):
        bad = await client.post("/api/v1/auth/unlock", json={"master_password": "WrongPassword!"})
        assert bad.status_code == 401

    locked = await client.post("/api/v1/auth/unlock", json={"master_password": "MasterPassword123!"})
    assert locked.status_code == 429
    reset_vault_lockout()

    owner, owner_token = await _make_user(db_session, username="sec_owner", role="owner", password="OwnerSecretPassword1!")
    other_token, _ = await create_user_session(db_session, owner)
    readonly_user, readonly_token = await _make_user(db_session, username="sec_reader", role="readonly", password="ReaderSecretPassword1!")

    # Owner cannot deactivate or demote themselves
    self_demote = await client.patch(
        f"/api/v1/users/{owner.id}",
        json={"role": "seller"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert self_demote.status_code == 400

    self_disable = await client.patch(
        f"/api/v1/users/{owner.id}",
        json={"is_active": False},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert self_disable.status_code == 400

    # Password change clears must_change_password and revokes sibling sessions
    owner.must_change_password = True
    await db_session.commit()

    changed = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "OwnerSecretPassword1!", "new_password": "NewOwnerPassword99!"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert changed.status_code == 200

    old_session = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {other_token}"})
    assert old_session.status_code == 401

    # Setup 2FA when already enabled requires current_password
    first_2fa = await client.post("/api/v1/auth/setup-2fa", json={}, headers={"Authorization": f"Bearer {owner_token}"})
    assert first_2fa.status_code == 200

    await db_session.refresh(owner)
    assert owner.must_change_password is False
    owner.is_totp_enabled = True
    await db_session.commit()

    blocked_2fa = await client.post("/api/v1/auth/setup-2fa", json={}, headers={"Authorization": f"Bearer {owner_token}"})
    assert blocked_2fa.status_code == 401

    allowed_2fa = await client.post(
        "/api/v1/auth/setup-2fa",
        json={"current_password": "NewOwnerPassword99!"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert allowed_2fa.status_code == 200

    # Readonly user is blocked from CRM sales / agenda / capture / comms mutations
    ro_headers = {"Authorization": f"Bearer {readonly_token}"}
    assert (await client.post("/api/v1/crm/proposals", json={"title": "Prop", "amount": 100}, headers=ro_headers)).status_code == 403
    assert (await client.post("/api/v1/agenda/events", json={
        "title": "Reunion",
        "start_time": "2026-06-01T10:00:00",
        "end_time": "2026-06-01T11:00:00",
    }, headers=ro_headers)).status_code == 403
    assert (await client.post("/api/v1/crm/capture/discard", json={"company_name": "Acme", "reason": "No"}, headers=ro_headers)).status_code == 403


async def test_crm_sales_personal_finances_agenda_and_comms_validation(client, db_session):
    _, owner_token = await _make_user(db_session, username="ops_owner", role="owner")
    headers = {"Authorization": f"Bearer {owner_token}"}

    # CRM Sales arithmetic & UUID & RFC checks
    bad_sale = await client.post(
        "/api/v1/crm/sales/close",
        json={
            "company_name": "Cliente SA",
            "title": "Web",
            "total_amount": 1000,
            "discount_amount": 200,
            "advance_payment": 950,
        },
        headers=headers,
    )
    assert bad_sale.status_code == 422

    bad_rfc = await client.post(
        "/api/v1/crm/sales/close",
        json={
            "company_name": "Cliente SA",
            "title": "Web",
            "total_amount": 1000,
            "tax_rfc": "INVALID",
        },
        headers=headers,
    )
    assert bad_rfc.status_code == 422

    # Valid sale -> invoice duplicate UUID returns 409
    closed = await client.post(
        "/api/v1/crm/sales/close",
        json={
            "company_name": "Cliente Formal SA",
            "title": "Sitio Web Corporativo",
            "total_amount": 10000,
            "tax_rfc": "XAXX010101000",
            "advance_payment": 5000,
        },
        headers=headers,
    )
    assert closed.status_code == 200
    sale_data = closed.json()

    inv_payload = {
        "client_id": sale_data["client_id"],
        "sale_id": sale_data["sale_id"],
        "folio": "F-100",
        "uuid": "123e4567-e89b-12d3-a456-426614174000",
        "rfc": "XAXX010101000",
        "amount": 5000,
        "issue_date": "2026-06-01",
    }
    inv_ok = await client.post("/api/v1/crm/invoices", json=inv_payload, headers=headers)
    assert inv_ok.status_code == 200

    inv_dup = await client.post("/api/v1/crm/invoices", json=inv_payload, headers=headers)
    assert inv_dup.status_code == 409

    # Personal finances: invalid month, balance > original, encrypted Debt.notes, currency mismatch
    bad_budget = await client.post(
        "/api/v1/personal-finances/budgets",
        json={"month": "2026-13", "category": "Software", "cap_amount": 1000},
        headers=headers,
    )
    assert bad_budget.status_code == 422

    bad_debt = await client.post(
        "/api/v1/personal-finances/debts",
        json={"creditor": "Banco", "original_amount": 1000, "current_balance": 1500},
        headers=headers,
    )
    assert bad_debt.status_code == 422

    debt_res = await client.post(
        "/api/v1/personal-finances/debts",
        json={
            "creditor": "Tarjeta Oro",
            "original_amount": 2000,
            "current_balance": 2000,
            "currency": "MXN",
            "notes": "Nota confidencial de deuda",
        },
        headers=headers,
    )
    assert debt_res.status_code == 201
    debt_id = debt_res.json()["id"]
    assert debt_res.json()["notes"] == "Nota confidencial de deuda"

    raw_debt = await db_session.get(Debt, debt_id)
    assert raw_debt is not None and raw_debt.notes != "Nota confidencial de deuda"

    bad_curr_pay = await client.post(
        f"/api/v1/personal-finances/debts/{debt_id}/payments",
        json={"amount": 100, "currency": "USD", "payment_date": "2026-06-01"},
        headers=headers,
    )
    assert bad_curr_pay.status_code == 400

    # Agenda end_time <= start_time & bad availability date
    bad_evt = await client.post(
        "/api/v1/agenda/events",
        json={
            "title": "Evento invalido",
            "start_time": "2026-06-01T14:00:00",
            "end_time": "2026-06-01T13:00:00",
        },
        headers=headers,
    )
    assert bad_evt.status_code == 422

    bad_avail = await client.get("/api/v1/agenda/availability?target_date=2026-02-30", headers=headers)
    assert bad_avail.status_code in (400, 422)

    # Communications: recording manual message on missing thread returns 404
    missing_thread = await client.post(
        "/api/v1/comms/messages/manual",
        json={
            "thread_id": "nonexistent-thread-id",
            "channel": "whatsapp",
            "direction": "saliente",
            "sender": "Operador",
            "recipient": "Cliente",
            "body": "Hola",
        },
        headers=headers,
    )
    assert missing_thread.status_code == 404

    # Configurable non-hardcoded settings verified
    assert settings.MAP_DEFAULT_CITY
    assert settings.MAP_DEFAULT_ZONE_SLUG
    assert settings.WHATSAPP_SHARE_BASE_URL.startswith("https://")
