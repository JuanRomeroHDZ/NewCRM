import pytest
from sqlalchemy import func, select

from app.models import AuditLog
from app.models.core import ActivityEvent, User
from app.security.crypto import hash_master_password
from app.services.core_auth import create_user_session


@pytest.mark.asyncio
async def test_user_create_and_update_roll_back_when_audit_recording_fails(
    client, db_session, monkeypatch
):
    import app.api.v1.users as users_api

    owner = User(
        username="atomic_owner",
        email="atomic_owner@example.test",
        full_name="Atomic Owner",
        role="owner",
        hashed_password=hash_master_password("OwnerPassForAtomicity123!"),
        is_active=True,
    )
    target = User(
        username="atomic_target",
        email="atomic_target@example.test",
        full_name="Original Name",
        role="seller",
        hashed_password=hash_master_password("TargetPassForAtomicity123!"),
        is_active=True,
    )
    db_session.add_all([owner, target])
    await db_session.commit()
    target_id = target.id
    token, _ = await create_user_session(db_session, owner)
    headers = {"Authorization": f"Bearer {token}"}

    async def audit_then_fail(*args, **kwargs):
        await original_record_event(*args, **kwargs)
        raise RuntimeError("simulated audit storage failure")

    original_record_event = users_api.record_event
    monkeypatch.setattr(users_api, "record_event", audit_then_fail)

    with pytest.raises(RuntimeError, match="simulated audit storage failure"):
        await client.post(
            "/api/v1/users",
            headers=headers,
            json={
                "username": "atomic_new_user",
                "email": "atomic_new_user@example.test",
                "full_name": "New User",
                "role": "seller",
            },
        )

    with pytest.raises(RuntimeError, match="simulated audit storage failure"):
        await client.patch(
            f"/api/v1/users/{target_id}",
            headers=headers,
            json={"full_name": "Changed Name"},
        )

    db_session.expire_all()
    created = await db_session.execute(
        select(User).where(User.username == "atomic_new_user")
    )
    updated = await db_session.execute(select(User).where(User.id == target_id))
    event_count = await db_session.scalar(select(func.count()).select_from(ActivityEvent))
    legacy_count = await db_session.scalar(select(func.count()).select_from(AuditLog))

    assert created.scalar_one_or_none() is None
    assert updated.scalar_one().full_name == "Original Name"
    assert event_count == 0
    assert legacy_count == 0
