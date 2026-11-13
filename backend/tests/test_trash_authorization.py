from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import EmailAccount
from app.models.core import User
from app.services.core_auth import create_user_session


async def _create_user_session(db_session, role: str, username: str, *, must_change_password: bool = False):
    user = User(
        username=username,
        email=f"{username}@example.test",
        full_name=username,
        role=role,
        hashed_password="not-used-by-this-test",
        is_active=True,
        must_change_password=must_change_password,
    )
    db_session.add(user)
    await db_session.commit()
    token, _ = await create_user_session(db_session, user)
    return user, token


def _headers(vault_token: str, user_token: str | None = None) -> dict[str, str]:
    headers = {"X-Vault-Token": vault_token}
    if user_token:
        headers["Authorization"] = f"Bearer {user_token}"
    return headers


@pytest.mark.asyncio
async def test_trash_requires_vault_and_user_session(client, auth_token):
    vault_headers = _headers(auth_token)

    no_vault = await client.get("/api/v1/trash")
    no_user = await client.get("/api/v1/trash", headers=vault_headers)
    no_user_audit = await client.get("/api/v1/trash/audit", headers=vault_headers)

    assert no_vault.status_code == 401
    assert no_user.status_code == 401
    assert no_user_audit.status_code == 401


@pytest.mark.asyncio
async def test_trash_role_matrix(client, db_session, auth_token):
    _, owner_token = await _create_user_session(db_session, "owner", "trash_owner")
    _, admin_token = await _create_user_session(db_session, "business_admin", "trash_admin")
    _, seller_token = await _create_user_session(db_session, "seller", "trash_seller")
    _, readonly_token = await _create_user_session(db_session, "readonly", "trash_reader")
    _, temporary_owner_token = await _create_user_session(
        db_session, "owner", "trash_temporary_owner", must_change_password=True
    )

    restore_target = EmailAccount(
        address="restore@example.test",
        provider="Example",
        is_deleted=True,
    )
    admin_purge_target = EmailAccount(
        address="admin-purge@example.test",
        provider="Example",
        is_deleted=True,
    )
    owner_purge_target = EmailAccount(
        address="owner-purge@example.test",
        provider="Example",
        is_deleted=True,
    )
    db_session.add_all([restore_target, admin_purge_target, owner_purge_target])
    await db_session.commit()

    for role_token in [owner_token, admin_token, seller_token, readonly_token]:
        headers = _headers(auth_token, role_token)
        assert (await client.get("/api/v1/trash", headers=headers)).status_code == 200
        assert (await client.get("/api/v1/trash/audit", headers=headers)).status_code == 200

    temporary_headers = _headers(auth_token, temporary_owner_token)
    assert (await client.get("/api/v1/trash", headers=temporary_headers)).status_code == 403
    assert (await client.get("/api/v1/trash/audit", headers=temporary_headers)).status_code == 403

    readonly_headers = _headers(auth_token, readonly_token)
    assert (
        await client.post(
            f"/api/v1/trash/restore/email/{restore_target.id}",
            headers=readonly_headers,
        )
    ).status_code == 403
    assert (
        await client.delete(
            f"/api/v1/trash/purge/email/{admin_purge_target.id}",
            headers=readonly_headers,
        )
    ).status_code == 403

    seller_headers = _headers(auth_token, seller_token)
    restored = await client.post(
        f"/api/v1/trash/restore/email/{restore_target.id}",
        headers=seller_headers,
    )
    seller_purge = await client.delete(
        f"/api/v1/trash/purge/email/{admin_purge_target.id}",
        headers=seller_headers,
    )
    assert restored.status_code == 200
    assert seller_purge.status_code == 403

    admin_headers = _headers(auth_token, admin_token)
    admin_purge = await client.delete(
        f"/api/v1/trash/purge/email/{admin_purge_target.id}",
        headers=admin_headers,
    )
    owner_purge = await client.delete(
        f"/api/v1/trash/purge/email/{owner_purge_target.id}",
        headers=_headers(auth_token, owner_token),
    )
    assert admin_purge.status_code == 200
    assert owner_purge.status_code == 200

    temporary_restore = await client.post(
        f"/api/v1/trash/restore/email/{restore_target.id}",
        headers=temporary_headers,
    )
    assert temporary_restore.status_code == 403

    db_session.expire_all()
    restored_item = await db_session.execute(
        select(EmailAccount).where(EmailAccount.id == restore_target.id)
    )
    assert restored_item.scalar_one().is_deleted is False


@pytest.mark.asyncio
async def test_trash_visibility_policy_is_admin_only(client, db_session, auth_token):
    _, owner_token = await _create_user_session(db_session, "owner", "retention_owner")
    _, seller_token = await _create_user_session(db_session, "seller", "retention_seller")

    forbidden_change = await client.put(
        "/api/v1/settings/trash-retention",
        json={"trash_retention_days": 30},
        headers=_headers(auth_token, seller_token),
    )
    allowed_change = await client.put(
        "/api/v1/settings/trash-retention",
        json={"trash_retention_days": 30},
        headers=_headers(auth_token, owner_token),
    )
    bypass_attempt = await client.put(
        "/api/v1/settings",
        json={"trash_retention_days": 60},
        headers=_headers(auth_token),
    )

    assert forbidden_change.status_code == 403
    assert allowed_change.status_code == 200
    assert allowed_change.json()["trash_retention_days"] == 30
    assert bypass_attempt.status_code == 403

    old_item = EmailAccount(
        address="old@example.test",
        provider="Example",
        is_deleted=True,
        deleted_at=datetime.now(timezone.utc) - timedelta(days=45),
    )
    recent_item = EmailAccount(
        address="recent@example.test",
        provider="Example",
        is_deleted=True,
        deleted_at=datetime.now(timezone.utc) - timedelta(days=5),
    )
    db_session.add_all([old_item, recent_item])
    await db_session.commit()

    visible = await client.get(
        "/api/v1/trash",
        headers=_headers(auth_token, owner_token),
    )
    visible_ids = {item["id"] for item in visible.json()}
    assert old_item.id not in visible_ids
    assert recent_item.id in visible_ids
    assert old_item.is_deleted is True
