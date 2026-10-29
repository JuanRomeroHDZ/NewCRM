import pytest
from app.services.cloud_lease import CloudLeaseService

@pytest.mark.asyncio
async def test_server_lease_lock_mutual_exclusion(db_session):
    resource = "cloud_backup_google_drive"
    server_primary = "lessso-srv"
    server_secondary = "lessso-laptop-backup"

    # Server primary acquires lease
    lease1 = await CloudLeaseService.acquire_lease(
        session=db_session,
        resource_name=resource,
        server_name=server_primary,
        duration_seconds=300
    )
    assert lease1.server_name == server_primary
    assert lease1.is_active is True

    # Server secondary attempts to acquire while primary is active -> MUST raise ValueError
    with pytest.raises(ValueError, match="bloqueado por servidor 'lessso-srv'"):
        await CloudLeaseService.acquire_lease(
            session=db_session,
            resource_name=resource,
            server_name=server_secondary,
            duration_seconds=300
        )

    # Server primary releases lease
    released = await CloudLeaseService.release_lease(
        session=db_session,
        resource_name=resource,
        server_name=server_primary
    )
    assert released is True

    # Now server secondary can acquire cleanly
    lease2 = await CloudLeaseService.acquire_lease(
        session=db_session,
        resource_name=resource,
        server_name=server_secondary,
        duration_seconds=300
    )
    assert lease2.server_name == server_secondary
    assert lease2.is_active is True

@pytest.mark.asyncio
async def test_all_integrations_health_check_isolation(db_session):
    report = await CloudLeaseService.test_all_integrations(db_session, "lessso-srv")
    assert report["all_non_blocking"] is True
    adapters = report["adapters"]
    
    # Verify all expected adapters are tested individually
    assert "openstreetmap" in adapters
    assert "google_places" in adapters
    assert "whatsapp_meta" in adapters
    assert "telegram" in adapters
    assert "google_calendar" in adapters
    assert "google_drive_backup" in adapters

    # Verify each adapter contains health status without crashing overall report
    for name, data in adapters.items():
        assert "healthy" in data
        assert "status" in data

def test_baja_california_tiles_fallback():
    result = CloudLeaseService.check_baja_california_tiles()
    assert "fallback_to_list_view" in result
    assert "recommended_view" in result
    if not result["has_local_tiles"]:
        assert result["fallback_to_list_view"] is True
        assert result["recommended_view"] == "list"
