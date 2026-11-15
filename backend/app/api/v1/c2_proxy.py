"""Pasarela autenticada al proceso C2 independiente mediante socket Unix."""
import asyncio
import os

import httpx
import websockets
from fastapi import APIRouter, Depends, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from app.database import AsyncSessionLocal, get_db
from app.models.core import User, DbSession
from app.security.tokens import require_vault_unlocked, verify_vault_token
from app.services.core_auth import get_current_user_from_token, hash_token, utc_now

router = APIRouter(prefix="/c2", tags=["c2"])
async def owner(request: Request, db=Depends(get_db)):
    try:
        user = await get_current_user_from_token(request, db)
    except HTTPException:
        raise HTTPException(403, "Inicia sesión como propietario para utilizar C2.")
    if user.must_change_password or user.role != "owner":
        raise HTTPException(403, "Se requiere una cuenta de propietario activa para utilizar C2.")
    return user


def _connection():
    socket = os.environ.get("C2_WORKER_SOCKET", "")
    secret = os.environ.get("C2_WORKER_SECRET", "")
    if not socket or len(secret) < 32:
        return None
    return socket, secret


@router.get('/service', dependencies=[Depends(require_vault_unlocked), Depends(owner)])
async def service_status():
    connection = _connection()
    if connection:
        socket, secret = connection
        try:
            async with httpx.AsyncClient(transport=httpx.AsyncHTTPTransport(uds=socket), timeout=2) as client:
                result = await client.get('http://localhost/c2/meta', headers={'x-c2-internal-secret': secret})
                if result.status_code == 200:
                    return {'state': 'running', 'detail': 'Servicio C2 disponible.'}
        except (httpx.HTTPError, OSError):
            pass
    return {'state': 'unavailable', 'detail': 'El servicio C2 no está activo o no se puede conectar. Inícialo en el equipo de auditoría y vuelve a intentar.'}


@router.api_route('/{path:path}', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], dependencies=[Depends(require_vault_unlocked), Depends(owner)], include_in_schema=False)
async def forward(path: str, request: Request):
    connection = _connection()
    if not connection:
        raise HTTPException(503, 'El servicio C2 no está configurado.')
    socket, secret = connection
    headers = {'x-c2-internal-secret': secret}
    if request.headers.get('content-type'):
        headers['content-type'] = request.headers['content-type']
    try:
        async with httpx.AsyncClient(transport=httpx.AsyncHTTPTransport(uds=socket), timeout=120) as client:
            response = await client.request(request.method, 'http://localhost/c2/' + path,
                params=request.query_params.multi_items(), content=await request.body(), headers=headers)
    except (httpx.HTTPError, OSError):
        raise HTTPException(503, 'El servicio C2 no está disponible.')
    if response.status_code in (401, 403):
        # The caller already passed the vault and owner checks above. An auth
        # failure from the private worker concerns the inter-process secret,
        # not the user's role or the vault session.
        raise HTTPException(503, 'No se pudo autenticar la conexión interna con el servicio C2. Revisa su configuración y vuelve a intentarlo.')
    allowed = ('content-type', 'content-disposition', 'cache-control')
    return Response(response.content, status_code=response.status_code,
                    headers={k: v for k, v in response.headers.items() if k.lower() in allowed})


async def _owner_active(token: str) -> bool:
    if not token:
        return False
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).join(DbSession, User.id == DbSession.user_id).where(
            DbSession.token_hash == hash_token(token), DbSession.is_revoked == False,
            DbSession.expires_at > utc_now(), User.is_active == True, User.role == 'owner',
            User.must_change_password == False))
        return result.scalar_one_or_none() is not None


@router.websocket('/ws')
async def events(websocket: WebSocket):
    protocols = websocket.scope.get("subprotocols", [])
    vault = next((p[6:] for p in protocols if p.startswith("vault.")), "")
    user = next((p[5:] for p in protocols if p.startswith("user.")), "")
    if "lessso-v1" not in protocols:
        await websocket.close(code=4401)
        return
    if not verify_vault_token(vault) or not await _owner_active(user):
        await websocket.close(code=4401)
        return
    connection = _connection()
    if not connection:
        await websocket.close(code=1013)
        return
    socket, secret = connection
    try:
        async with websockets.unix_connect(socket, uri='ws://localhost/c2/ws',
                additional_headers={'x-c2-internal-secret': secret, 'x-vault-token': secret},
                open_timeout=3) as upstream:
            await websocket.accept(subprotocol="lessso-v1")
            while True:
                if not verify_vault_token(vault) or not await _owner_active(user):
                    await websocket.close(code=4401)
                    return
                try:
                    message = await asyncio.wait_for(upstream.recv(), timeout=5)
                    if isinstance(message, str):
                        await websocket.send_text(message)
                    else:
                        await websocket.send_bytes(message)
                except asyncio.TimeoutError:
                    # Detect disconnected clients while retaining periodic revocation checks.
                    await websocket.send_json({'type': 'ping'})
    except (OSError, websockets.WebSocketException, WebSocketDisconnect):
        try:
            await websocket.close(code=1013)
        except RuntimeError:
            pass
