import asyncio
import time

import httpx
import pytest
from sqlalchemy import select

from app.config import settings
from app.models.crm_capture import LeadCacheCell
from app.services.crm_capture import CrmCaptureService, OSMProviderError


def mock_overpass(monkeypatch, handler):
    client_class = httpx.AsyncClient
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(settings, 'OSM_OVERPASS_URL', 'https://primary.example/interpreter')
    monkeypatch.setattr(settings, 'OSM_OVERPASS_FALLBACK_URLS', 'https://backup.example/interpreter')
    monkeypatch.setattr(
        httpx, 'AsyncClient', lambda **kwargs: client_class(transport=transport, **kwargs)
    )


@pytest.mark.asyncio
async def test_overpass_uses_backup_after_primary_failure(monkeypatch):
    calls = []

    def handler(request):
        calls.append(request.url.host)
        if request.url.host == 'primary.example':
            return httpx.Response(503)
        return httpx.Response(200, json={'elements': [{'id': 42}]})

    mock_overpass(monkeypatch, handler)
    assert await CrmCaptureService.fetch_osm_elements('query') == [{'id': 42}]
    assert calls == ['primary.example', 'backup.example']


@pytest.mark.asyncio
async def test_overpass_does_not_follow_redirects(monkeypatch):
    calls = []

    def handler(request):
        calls.append(str(request.url))
        if request.url.host == 'primary.example':
            return httpx.Response(302, headers={'Location': 'http://169.254.169.254/latest/meta-data'})
        return httpx.Response(200, json={'elements': []})

    mock_overpass(monkeypatch, handler)
    assert await CrmCaptureService.fetch_osm_elements('query') == []
    assert calls == [
        'https://primary.example/interpreter',
        'https://backup.example/interpreter',
    ]


@pytest.mark.asyncio
async def test_overpass_does_not_return_partial_results(monkeypatch):
    def handler(request):
        return httpx.Response(200, json={'elements': [{'id': 42}], 'remark': 'runtime error: timeout'})

    mock_overpass(monkeypatch, handler)
    with pytest.raises(OSMProviderError, match='incompleta'):
        await CrmCaptureService.fetch_osm_elements('query')


@pytest.mark.asyncio
async def test_overpass_rejects_missing_elements(monkeypatch):
    mock_overpass(monkeypatch, lambda request: httpx.Response(200, json={}))
    with pytest.raises(OSMProviderError, match='inválida'):
        await CrmCaptureService.fetch_osm_elements('query')


@pytest.mark.asyncio
async def test_overpass_reports_timeout_when_all_providers_timeout(monkeypatch):
    def handler(request):
        raise httpx.ReadTimeout('timeout', request=request)

    mock_overpass(monkeypatch, handler)
    with pytest.raises(OSMProviderError) as exc:
        await CrmCaptureService.fetch_osm_elements('query')
    assert exc.value.status_code == 504


@pytest.mark.asyncio
async def test_overpass_has_one_overall_time_budget(monkeypatch):
    async def handler(request):
        await asyncio.sleep(0.2)
        return httpx.Response(200, json={'elements': []})

    mock_overpass(monkeypatch, handler)
    monkeypatch.setattr(settings, 'OSM_REQUEST_TIMEOUT_SECONDS', 0.05)
    start = time.monotonic()
    with pytest.raises(OSMProviderError) as exc:
        await CrmCaptureService.fetch_osm_elements('query')
    assert exc.value.status_code == 504
    assert time.monotonic() - start < 1


@pytest.mark.asyncio
async def test_incomplete_results_are_not_cached(monkeypatch, db_session):
    mock_overpass(monkeypatch, lambda request: httpx.Response(200, json={'elements': [], 'remark': 'runtime error'}))
    with pytest.raises(OSMProviderError):
        await CrmCaptureService.search_osm_leads(db_session, 'dentistas', 'zona-rio')
    assert (await db_session.execute(select(LeadCacheCell))).scalars().all() == []
