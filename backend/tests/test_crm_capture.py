import json
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.models.crm_capture import LeadCacheCell
from app.models import Prospect
from app.services.crm_capture import (
    CrmCaptureService,
    TIJUANA_ZONES,
    build_overpass_query,
    compute_query_hash,
    utc_now,
    validate_url_against_ssrf,
)

def test_ssrf_protection_blocks_private_and_loopback_ips():
    # Loopback
    with pytest.raises(ValueError, match="bloqueada por politica SSRF|Acceso denegado"):
        validate_url_against_ssrf("http://127.0.0.1:8080/admin")
    
    with pytest.raises(ValueError, match="bloqueada por politica SSRF|Acceso denegado"):
        validate_url_against_ssrf("http://localhost:8000")
        
    # Cloud metadata
    with pytest.raises(ValueError, match="bloqueada por politica SSRF|Acceso denegado"):
        validate_url_against_ssrf("http://169.254.169.254/latest/meta-data")

    # Private RFC 1918
    with pytest.raises(ValueError, match="bloqueada por politica SSRF|Acceso denegado"):
        validate_url_against_ssrf("http://192.168.1.1/router")

    with pytest.raises(ValueError, match="bloqueada por politica SSRF|Acceso denegado"):
        validate_url_against_ssrf("http://10.0.0.5/api")

@pytest.mark.asyncio
async def test_osm_leads_search_caches_queries(db_session, monkeypatch):
    async def fake_osm_fetch(query):
        assert 'name"~"ortodoncia"' in query
        return [{
            "type": "node",
            "id": 123456,
            "lat": 32.526,
            "lon": -117.018,
            "tags": {
                "name": "Clínica Dental de Prueba",
                "amenity": "dentist",
                "phone": "+526641234999",
            },
        }]

    monkeypatch.setattr(CrmCaptureService, "fetch_osm_elements", staticmethod(fake_osm_fetch))
    # First search creates cache cell
    res1 = await CrmCaptureService.search_osm_leads(
        session=db_session,
        sector="dentistas",
        zone="Zona Río",
        subsector="ortodoncia"
    )
    assert res1["attribution"] == "© Colaboradores de OpenStreetMap (ODbL)"
    assert res1["source"] == "openstreetmap"
    assert len(res1["results"]) > 0

    # Second search must come from cache
    res2 = await CrmCaptureService.search_osm_leads(
        session=db_session,
        sector="dentistas",
        zone="Zona Río",
        subsector="ortodoncia"
    )
    assert res2["source"] == "cache"
    assert res2["cell_id"] == res1["cell_id"]
    assert res2["results"] == res1["results"]

@pytest.mark.asyncio
async def test_merge_and_undo_merge(db_session):
    # Create two prospect records
    p1 = Prospect(
        company_name="Clinica Dental Norte",
        contact_name="Dra. Lopez",
        whatsapp="+526641112233",
        notes="Nota original primaria"
    )
    p2 = Prospect(
        company_name="Clinica Dental Norte Sucursal",
        contact_email="contacto@dentalnorte.com",
        whatsapp="+526641112233",
        notes="Nota secundaria a fusionar"
    )
    db_session.add_all([p1, p2])
    await db_session.commit()
    await db_session.refresh(p1)
    await db_session.refresh(p2)

    # Detect duplicates
    duplicates = await CrmCaptureService.detect_duplicates(db_session, p1)
    assert len(duplicates) >= 1

    # Merge p2 into p1
    merge_cand = await CrmCaptureService.merge_prospects(
        session=db_session,
        primary_id=p1.id,
        secondary_id=p2.id,
        user_id="test-user"
    )
    assert merge_cand.status == "merged"
    await db_session.refresh(p1)
    await db_session.refresh(p2)
    assert p2.is_deleted is True
    assert p1.contact_email == "contacto@dentalnorte.com"
    assert "Nota secundaria a fusionar" in p1.notes

    # Undo merge
    undo_result = await CrmCaptureService.undo_merge(
        session=db_session,
        candidate_id=merge_cand.id,
        user_id="test-user"
    )
    assert undo_result is True
    await db_session.refresh(p1)
    await db_session.refresh(p2)
    assert p2.is_deleted is False
    assert p1.contact_email is None
    assert p1.notes == "Nota original primaria"

def test_google_places_inactive_and_caps_zero():
    status = CrmCaptureService.get_google_places_status()
    assert status["enabled"] is False
    assert status["daily_budget_cap_mxn"] == 0.0
    assert status["monthly_budget_cap_mxn"] == 0.0
    assert status["emergency_paused"] is True

    estimate = CrmCaptureService.estimate_google_places_cost(query_count=10, field_mask=["places.id", "places.displayName"])
    assert estimate["allowed_execution"] is False
    assert estimate["estimated_cost_usd"] > 0


def test_overpass_query_ignores_malformed_imported_tags():
    query = build_overpass_query(
        "clínicas",
        None,
        {"min_lat": 32.5, "min_lon": -117.1, "max_lat": 32.6, "max_lon": -117.0},
        sector_catalog=[{
            "id": "clinicas",
            "label": "Clínicas",
            "stems": ["clinica"],
            "osm_tags": [["amenity", 'clinic"](node(0);out;"']],
        }],
    )
    assert '"amenity"="clinic"](node(0);out;"' not in query
    assert query.count('"amenity"="clinic"') == 0


@pytest.mark.asyncio
async def test_search_replaces_legacy_sample_without_deleting_other_cache_rows(db_session, monkeypatch):
    zone = next(item for item in TIJUANA_ZONES if item["slug"] == "zona-rio")
    bounds = zone["bbox"]
    now = utc_now()
    q_hash = compute_query_hash("dentistas", None, zone["slug"], bounds)
    legacy = LeadCacheCell(
        sector="dentistas",
        zone=zone["slug"],
        query_hash=q_hash,
        results_json=json.dumps([{"phone": "+526641234567"}]),
        result_count=1,
        source="openstreetmap",
        status="complete",
        attribution="© Colaboradores de OpenStreetMap (ODbL)",
        fetched_at=now,
        expires_at=now + timedelta(days=10),
    )
    unrelated = LeadCacheCell(
        sector="otro",
        zone=zone["slug"],
        query_hash="f" * 64,
        results_json=json.dumps([{"phone": "+526641234567"}]),
        result_count=1,
        source="openstreetmap",
        status="complete",
        attribution="© Colaboradores de OpenStreetMap (ODbL)",
        fetched_at=now,
        expires_at=now + timedelta(days=10),
    )
    db_session.add_all([legacy, unrelated])
    await db_session.commit()
    await db_session.refresh(legacy)
    legacy_id = legacy.id
    unrelated_id = unrelated.id

    async def fetch_real_data(query):
        return [{
            "type": "node", "id": 123456, "lat": 32.526, "lon": -117.018,
            "tags": {"name": "Clínica Real", "amenity": "dentist", "phone": "+526641234999"},
        }]

    monkeypatch.setattr(CrmCaptureService, "fetch_osm_elements", staticmethod(fetch_real_data))
    result = await CrmCaptureService.search_osm_leads(db_session, "dentistas", zone["slug"])

    assert result["source"] == "openstreetmap"
    assert result["results"][0]["name"] == "Clínica Real"
    cached_rows = (await db_session.execute(select(LeadCacheCell))).scalars().all()
    assert {row.id for row in cached_rows} == {legacy_id, unrelated_id}
    updated = next(row for row in cached_rows if row.id == legacy_id)
    untouched = next(row for row in cached_rows if row.id == unrelated_id)
    assert "+526641234999" in updated.results_json
    assert "+526641234567" in untouched.results_json
