import pytest
from app.models.core import User
from app.models.finances import Budget, Debt, DebtPayment
from app.models import OneTimeExpense, ExchangeRate
from app.security.crypto import hash_master_password
from app.services.core_auth import create_user_session

@pytest.mark.asyncio
async def test_summary_and_budget_convert_mixed_currencies(client, db_session):
    owner = User(username="owner_fx_test", email="owner_fx@lessso.local", full_name="Owner FX", role="owner", hashed_password=hash_master_password("TestOwner123!"), is_active=True)
    db_session.add(owner)
    db_session.add(ExchangeRate(base_currency="USD", target_currency="MXN", rate=20, is_manual=True))
    db_session.add_all([
        OneTimeExpense(concept="MXN", category="Servidores", amount=200, currency="MXN", expense_date="2026-10-10"),
        OneTimeExpense(concept="USD", category="Servidores", amount=10, currency="USD", expense_date="2026-10-11"),
        OneTimeExpense(concept="Mes anterior", category="Servidores", amount=2000, currency="MXN", expense_date="2026-09-10"),
        Budget(month="2026-10", category="Servidores", cap_amount=100, currency="USD"),
        Debt(creditor="Préstamo", original_amount=100, current_balance=100, minimum_payment=10, currency="USD", status="active"),
    ])
    await db_session.commit()
    token, _ = await create_user_session(db_session, owner)
    headers = {"Authorization": f"Bearer {token}"}
    mxn = (await client.get("/api/v1/personal-finances/summary?month=2026-10&currency=MXN", headers=headers)).json()
    usd = (await client.get("/api/v1/personal-finances/summary?month=2026-10&currency=USD", headers=headers)).json()
    assert (mxn["total_expenses"], mxn["total_active_debt"]) == (400, 2000)
    assert (usd["total_expenses"], usd["total_active_debt"]) == (20, 100)
    assert mxn["upcoming_payments"][0]["minimum_payment"] == 200
    assert usd["upcoming_payments"][0]["currency"] == "USD"
    budgets = (await client.get("/api/v1/personal-finances/budgets", headers=headers)).json()
    assert next(b for b in budgets if b["category"] == "Servidores")["spent_amount"] == 20

@pytest.mark.asyncio
async def test_budget_creation_and_spending_comparison(client, db_session):
    owner = User(
        username="owner_fin_test",
        email="owner_fin@lessso.local",
        full_name="Owner Finanzas",
        role="owner",
        hashed_password=hash_master_password("TestOwner123!"),
        is_active=True
    )
    db_session.add(owner)
    await db_session.commit()
    token, _ = await create_user_session(db_session, owner)

    # 1. Create an expense in category "Servidores"
    exp = OneTimeExpense(
        concept="Hosting Hetzner",
        category="Servidores",
        amount=1500.0,
        currency="MXN",
        expense_date="2026-10-15"
    )
    db_session.add(exp)
    await db_session.commit()

    # 2. Set monthly budget for "Servidores" in "2026-10"
    res = await client.post(
        "/api/v1/personal-finances/budgets",
        json={
            "month": "2026-10",
            "category": "Servidores",
            "cap_amount": 3000.0,
            "currency": "MXN"
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 201

    # 3. List budgets and verify spent_amount calculation
    list_res = await client.get(
        "/api/v1/personal-finances/budgets?month=2026-10",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) >= 1
    serv_budget = next(b for b in items if b["category"] == "Servidores")
    assert serv_budget["cap_amount"] == 3000.0
    assert serv_budget["spent_amount"] == 1500.0

@pytest.mark.asyncio
async def test_debt_tracking_and_balance_reduction(client, db_session):
    owner = User(
        username="owner_debt_test",
        email="owner_debt@lessso.local",
        full_name="Owner Deudas",
        role="owner",
        hashed_password=hash_master_password("TestOwner123!"),
        is_active=True
    )
    db_session.add(owner)
    await db_session.commit()
    token, _ = await create_user_session(db_session, owner)

    # 1. Create a debt
    debt_res = await client.post(
        "/api/v1/personal-finances/debts",
        json={
            "creditor": "Crédito Automotriz BBVA",
            "original_amount": 80000.0,
            "current_balance": 80000.0,
            "currency": "MXN",
            "interest_rate": 12.5,
            "payment_day_of_month": 15,
            "minimum_payment": 3500.0
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert debt_res.status_code == 201
    debt_id = debt_res.json()["id"]

    # 2. Record a partial payment
    pay_res = await client.post(
        f"/api/v1/personal-finances/debts/{debt_id}/payments",
        json={
            "amount": 30000.0,
            "currency": "MXN",
            "payment_date": "2026-10-20",
            "notes": "Abono a capital"
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert pay_res.status_code == 201
    assert pay_res.json()["remaining_balance"] == 50000.0
    assert pay_res.json()["status"] == "active"

    # 3. Pay off remaining balance
    pay_res2 = await client.post(
        f"/api/v1/personal-finances/debts/{debt_id}/payments",
        json={
            "amount": 50000.0,
            "currency": "MXN",
            "payment_date": "2026-10-25"
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert pay_res2.status_code == 201
    assert pay_res2.json()["remaining_balance"] == 0.0
    assert pay_res2.json()["status"] == "paid_off"

@pytest.mark.asyncio
async def test_personal_finances_restricted_to_owner(client, db_session):
    seller = User(
        username="seller_blocked",
        email="seller_blocked@lessso.local",
        full_name="Vendedor Sin Acceso Finanzas",
        role="seller",
        hashed_password=hash_master_password("SellerPass123!"),
        is_active=True
    )
    db_session.add(seller)
    await db_session.commit()
    token, _ = await create_user_session(db_session, seller)

    # Seller must receive 403 Forbidden
    res = await client.get(
        "/api/v1/personal-finances/summary",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403
