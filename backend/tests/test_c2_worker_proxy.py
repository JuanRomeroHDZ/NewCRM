"""Pruebas de separación y autenticación del servicio C2 sobre socket Unix."""
import asyncio
import os
from pathlib import Path
import subprocess
import sys

import httpx
import pytest

from app.api.v1 import c2_proxy
from app.main import app
from app.database import get_db
from app.security.tokens import require_vault_unlocked


def _socket_unavailable_error(process) -> str:
    if process.stderr is None:
        return ""
    return process.stderr.read().decode(errors="replace")


def _skip_when_unix_sockets_are_blocked(process, error: str) -> None:
    permission_denied = (
        "PermissionError: [Errno 1] Operation not permitted" in error
        or "PermissionError: [Errno 13] Permission denied" in error
    )
    if permission_denied:
        process.kill()
        pytest.skip("El entorno de pruebas bloquea sockets Unix locales")


@pytest.fixture
async def worker(tmp_path, monkeypatch):
    sock = tmp_path / 'worker.sock'
    secret = 'a' * 48
    env = {**os.environ, 'C2_WORKER_SECRET': secret, 'LESSSO_DEMO': 'true',
           'PYTHONPATH': str(Path(__file__).resolve().parents[1])}
    proc = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.c2_worker:app',
                             '--uds', str(sock), '--log-level', 'warning'],
                            cwd=tmp_path, env=env, stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            if proc.poll() is not None:
                error = _socket_unavailable_error(proc)
                _skip_when_unix_sockets_are_blocked(proc, error)
                raise RuntimeError(error)
            if sock.exists():
                try:
                    async with httpx.AsyncClient(transport=httpx.AsyncHTTPTransport(uds=str(sock))) as direct:
                        await direct.get('http://localhost/c2/meta', timeout=1)
                    break
                except httpx.HTTPError:
                    pass
            await asyncio.sleep(.1)
        else:
            raise RuntimeError('El worker no abrió su socket')
        monkeypatch.setenv('C2_WORKER_SOCKET', str(sock))
        monkeypatch.setenv('C2_WORKER_SECRET', secret)
        yield sock, secret, proc
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        proc.stderr.close()


@pytest.mark.asyncio
async def test_worker_rejects_missing_and_wrong_secret(worker):
    socket, secret, _ = worker
    async with httpx.AsyncClient(transport=httpx.AsyncHTTPTransport(uds=str(socket))) as direct:
        for headers in ({}, {'x-c2-internal-secret': 'wrong'}):
            response = await direct.get('http://localhost/c2/meta', headers=headers)
            assert response.status_code == 403
        response = await direct.get('http://localhost/c2/meta', headers={'x-c2-internal-secret': secret})
        assert response.status_code == 200
        assert response.json()['demo_mode'] is True


@pytest.mark.asyncio
async def test_proxy_auth_status_and_forwarding(client, worker):
    assert (await client.get('/api/v1/c2/service')).status_code == 401
    app.dependency_overrides[require_vault_unlocked] = lambda: True
    try:
        assert (await client.get('/api/v1/c2/service')).status_code == 403
        app.dependency_overrides[c2_proxy.owner] = lambda: True
        status = await client.get('/api/v1/c2/service')
        assert status.json()['state'] == 'running'
        meta = await client.get('/api/v1/c2/meta')
        assert meta.status_code == 200 and meta.json()['demo_mode'] is True
        worker[2].terminate()
        worker[2].wait(timeout=10)
        status = await client.get('/api/v1/c2/service')
        assert status.json()['state'] == 'unavailable'
        assert (await client.get('/api/v1/c2/meta')).status_code == 503
    finally:
        app.dependency_overrides.pop(require_vault_unlocked, None)
        app.dependency_overrides.pop(c2_proxy.owner, None)


@pytest.mark.asyncio
async def test_worker_secret_mismatch_is_not_reported_as_user_or_vault_failure(client, worker, monkeypatch):
    app.dependency_overrides[require_vault_unlocked] = lambda: True
    app.dependency_overrides[c2_proxy.owner] = lambda: True
    try:
        monkeypatch.setenv('C2_WORKER_SECRET', 'b' * 48)
        response = await client.get('/api/v1/c2/meta')
        assert response.status_code == 503
        assert 'conexión interna' in response.json()['detail']
        assert 'b' * 48 not in response.text
    finally:
        app.dependency_overrides.pop(require_vault_unlocked, None)
        app.dependency_overrides.pop(c2_proxy.owner, None)


@pytest.mark.asyncio
async def test_websocket_requires_sessions_and_relays_worker_events(worker, monkeypatch):
    from fastapi.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect

    async def owner_active(token):
        return token == 'owner-session'

    async def vault_active(token, db=None):
        return token == 'vault-session'

    monkeypatch.setattr(c2_proxy, '_owner_active', owner_active)
    monkeypatch.setattr(c2_proxy, 'verify_vault_token_and_release', vault_active)
    assert c2_proxy._connection() == (str(worker[0]), worker[1])
    app.dependency_overrides[get_db] = lambda: None
    try:
        test_client = TestClient(app)
        with pytest.raises(WebSocketDisconnect) as error:
            with test_client.websocket_connect('/api/v1/c2/ws', subprotocols=['lessso-v1', 'vault.vault-session', 'user.other']):
                pass
        assert error.value.code == 4401
        try:
            with test_client.websocket_connect('/api/v1/c2/ws', subprotocols=['lessso-v1', 'vault.vault-session', 'user.owner-session']) as ws:
                assert isinstance(ws.receive_json(), dict)
        except WebSocketDisconnect as error:
            pytest.fail(f"El relay cerró inesperadamente el WebSocket con código {error.code}.")
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_proxy_preserves_binary_request_and_download(client, tmp_path, monkeypatch):
    """La pasarela conserva bytes y cabeceras al transferir archivos por el socket."""
    sock = tmp_path / 'transfer.sock'
    source = tmp_path / 'stub.py'
    source.write_text('''async def app(scope, receive, send):
    body = b""
    while True:
        msg = await receive()
        body += msg.get("body", b"")
        if not msg.get("more_body", False): break
    if scope["path"] == "/c2/meta":
        payload = b'{"demo_mode": true}'
        await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"application/json")]})
        await send({"type": "http.response.body", "body": payload})
        return
    if scope["method"] == "POST":
        data = body
    else:
        data = b"\\x00\\xffcapture"
    await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"application/octet-stream"), (b"content-disposition", b"attachment; filename=capture.bin")]})
    await send({"type": "http.response.body", "body": data})
''')
    proc = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'stub:app', '--uds', str(sock), '--log-level', 'warning'],
                            cwd=tmp_path, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            if proc.poll() is not None:
                error = _socket_unavailable_error(proc)
                _skip_when_unix_sockets_are_blocked(proc, error)
                raise RuntimeError(error)
            if sock.exists():
                break
            await asyncio.sleep(.05)
        else:
            raise RuntimeError('El servidor de prueba no abrió su socket')
        monkeypatch.setenv('C2_WORKER_SOCKET', str(sock))
        monkeypatch.setenv('C2_WORKER_SECRET', 'a' * 48)
        app.dependency_overrides[require_vault_unlocked] = lambda: True
        app.dependency_overrides[c2_proxy.owner] = lambda: True
        payload = b'\x00\xffrequest-body'
        uploaded = await client.post('/api/v1/c2/test-upload', content=payload,
                                     headers={'content-type': 'application/octet-stream'})
        assert uploaded.status_code == 200 and uploaded.content == payload
        downloaded = await client.get('/api/v1/c2/test-download')
        assert downloaded.content == b'\x00\xffcapture'
        assert downloaded.headers['content-disposition'] == 'attachment; filename=capture.bin'
    finally:
        app.dependency_overrides.pop(require_vault_unlocked, None)
        app.dependency_overrides.pop(c2_proxy.owner, None)
        proc.terminate()
        proc.wait(timeout=10)
        if proc.stderr:
            proc.stderr.close()


@pytest.mark.asyncio
async def test_service_requires_active_owner_role(client, db_session):
    from datetime import timedelta
    from app.models.core import DbSession, User
    from app.services.core_auth import hash_token, utc_now

    for role in ('owner', 'seller'):
        user = User(id=role, username=role, email=f'{role}@example.test', full_name=role,
                    role=role, hashed_password='unused', is_active=True, must_change_password=False)
        db_session.add(user)
        db_session.add(DbSession(user_id=role, token_hash=hash_token(role + '-token'),
                                 expires_at=utc_now() + timedelta(minutes=5), is_revoked=False))
    await db_session.commit()
    app.dependency_overrides[require_vault_unlocked] = lambda: True
    try:
        seller = await client.get('/api/v1/c2/service', headers={'Authorization': 'Bearer seller-token'})
        assert seller.status_code == 403
        owner_response = await client.get('/api/v1/c2/service', headers={'Authorization': 'Bearer owner-token'})
        assert owner_response.status_code == 200
    finally:
        app.dependency_overrides.pop(require_vault_unlocked, None)
