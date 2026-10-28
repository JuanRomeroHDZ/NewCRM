import pytest

@pytest.mark.asyncio
async def test_pci_dss_compliance(client, auth_token):
    """
    Verifies that CVV is not accepted, stored, or returned anywhere in payment methods.
    """
    headers = {"X-Vault-Token": auth_token}

    # 1. Create payment method with dummy card details
    create_res = await client.post(
        "/api/v1/payments",
        json={
            "issuer": "Visa",
            "alias": "Corporate Debit Card",
            "last_four": "9921",
            "card_number": "4111111111119921",
            "cvv": "123",  # Intentionally send CVV to check it is ignored / not stored
            "expiry_month": "11",
            "expiry_year": "28"
        },
        headers=headers
    )
    assert create_res.status_code == 200
    data = create_res.json()
    assert "cvv" not in data
    assert "cvv_plain" not in data
    assert data["last_four"] == "9921"
    assert data["card_number_masked"] == "•••• •••• •••• 9921"

    # 2. Retrieve list and verify no CVV returned
    list_res = await client.get("/api/v1/payments", headers=headers)
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) >= 1
    for item in items:
        assert "cvv" not in item
        assert "cvv_plain" not in item

@pytest.mark.asyncio
async def test_finances_clone_idempotency(client, auth_token):
    """
    Verifies that repeating clone-next-month does not duplicate records (idempotent).
    """
    headers = {"X-Vault-Token": auth_token}

    # Create an initial recurring income
    income_res = await client.post(
        "/api/v1/finances/incomes",
        json={
            "client_name": "Acme Corp",
            "concept": "Iguala Mensual Web",
            "category": "iguala_mensual",
            "amount": 12500.0,
            "currency": "MXN",
            "status": "cobrado",
            "received_date": "2026-05-15",
            "is_recurring": True
        },
        headers=headers
    )
    assert income_res.status_code == 200
    income_id = income_res.json()["id"]

    # First clone
    clone1_res = await client.post(f"/api/v1/finances/incomes/{income_id}/clone-next-month", headers=headers)
    assert clone1_res.status_code == 200
    clone1_data = clone1_res.json()
    assert clone1_data["received_date"] == "2026-06-15"
    assert clone1_data["amount"] == 12500.0

    # Second clone (duplicate trigger / double click)
    clone2_res = await client.post(f"/api/v1/finances/incomes/{income_id}/clone-next-month", headers=headers)
    assert clone2_res.status_code == 200
    clone2_data = clone2_res.json()
    # Must return the SAME cloned ID without creating a duplicate record
    assert clone1_data["id"] == clone2_data["id"]

    # Verify incomes list only contains 2 records for Acme Corp (original + single clone)
    list_res = await client.get("/api/v1/finances/incomes", headers=headers)
    acme_incomes = [i for i in list_res.json() if i["client_name"] == "Acme Corp"]
    assert len(acme_incomes) == 2
