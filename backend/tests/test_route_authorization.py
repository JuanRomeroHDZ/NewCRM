import pytest

@pytest.mark.asyncio
async def test_protected_routes_reject_unauthenticated(client):
    """
    Verifies the authorization matrix: every sensitive endpoint MUST return 401
    when called without an active Level 2 vault token.
    """
    protected_get_routes = [
        "/api/v1/emails",
        "/api/v1/platforms",
        "/api/v1/platforms/billing-history",
        "/api/v1/payments",
        "/api/v1/finances/incomes",
        "/api/v1/finances/renewals",
        "/api/v1/finances/expenses",
        "/api/v1/finances/projects",
        "/api/v1/finances/resources",
        "/api/v1/exchange",
        "/api/v1/graph",
        "/api/v1/settings",
        "/api/v1/passwords/generate",
        "/api/v1/prospects",
        "/api/v1/trash",
        "/api/v1/audit/logs",
    ]

    for route in protected_get_routes:
        res = await client.get(route)
        assert res.status_code == 401, f"Route {route} expected 401 but got {res.status_code}: {res.text}"

    # Also test manual exchange rate POST without auth
    post_res = await client.post("/api/v1/exchange/manual", json={"rate": 20.5, "is_manual": True})
    assert post_res.status_code == 401

@pytest.mark.asyncio
async def test_unlocked_override_parameter_is_ineffective(client):
    """
    Verifies that passing `?_unlocked_override=true` does NOT bypass authorization.
    """
    res1 = await client.get("/api/v1/emails/fake-id?_unlocked_override=true")
    assert res1.status_code == 401

    res2 = await client.get("/api/v1/platforms/fake-id?_unlocked_override=true")
    assert res2.status_code == 401

@pytest.mark.asyncio
async def test_public_routes_accessible(client):
    """
    Verifies that explicitly public endpoints remain accessible without a token.
    """
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

    status_res = await client.get("/api/v1/auth/status")
    assert status_res.status_code == 200
