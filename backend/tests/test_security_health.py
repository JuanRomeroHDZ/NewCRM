import pytest


@pytest.mark.asyncio
async def test_security_health_is_unrated_without_accounts(client, auth_token):
    response = await client.get(
        "/api/v1/security/health",
        headers={"X-Vault-Token": auth_token},
    )

    assert response.status_code == 200
    assert response.json()["total_accounts"] == 0
    assert response.json()["health_score"] is None
