"""Pasarela autenticada al proceso C2 independiente mediante socket Unix."""
import hmac
import asyncio
import json
import os
import time

import httpx
import websockets
from fastapi import APIRouter, Depends, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal, get_db
from app.api.v1.agenda import PentestEngagementCreate
from app.models.agenda import PentestEngagement
from app.models.core import User, DbSession
from app.models.crm_sales import Client
from app.security.tokens import require_vault_unlocked, verify_vault_token_and_release
from app.security.browser_session import SESSION_COOKIE, csrf_for_session
from app.services.core_auth import get_current_user_from_token, hash_token, utc_now
from app.services.c2_scope import (
    interface_scope_required,
    interface_validation_required,
    parse_authorized_ipv6_targets,
    parse_authorized_targets,
    validate_interface_cidr,
    validate_interface_ipv6_cidrs,
    validate_scope_targets,
)

router = APIRouter(prefix="/c2", tags=["c2"])

# Stops and restoration remain available without an engagement so an operator
# can always leave the machine in a safe state. New non-read operations are
# gated by default; only these explicit, non-operational helpers bypass scope.
_SCOPE_EXEMPT_POSTS = {
    "arp/stop",
    "sniff/stop",
    "dns/stop",
    "creds/stop",
    "httpinject/stop",
    "wifi/monitor/stop",
    "wifi/kill",
    "wifi/scan/stop",
    "wifi/deauth/stop",
    "wifi/handshake/stop",
    "wifi/pmkid/stop",
    "poison/stop",
    "wpad/stop",
    "mitm6/stop",
    "cleanup",
    "panic",
    "opsec/restore",
    "wifi/restore-services",
    "creds/clear",
    "opsec/preview",
    "opsec/generate",
}
_READ_ONLY_GETS = {
    "meta",
    "interfaces",
    "status",
    "wifi/ifaces",
    "wifi/clients",
    "creds/export",
    "wifi/captures",
    "wifi/download",
    "opsec",
    "cleanup",
    "envcheck",
    "service",
    "engagements",
    "clients",
}
_INTERFACE_CIDR_CACHE_TTL_SECONDS = 15 * 60
_interface_cidr_cache: dict[str, tuple[str, float]] = {}


def _requires_scope(method: str, path: str) -> bool:
    normalized = path.strip("/")
    if method.upper() in {"GET", "HEAD"} and normalized in _READ_ONLY_GETS:
        return False
    if method.upper() == "OPTIONS":
        return False
    if normalized in _SCOPE_EXEMPT_POSTS:
        return False
    return True


async def _load_active_engagement(db, engagement_id: str | None) -> PentestEngagement:
    if not engagement_id or not engagement_id.strip():
        raise HTTPException(
            status_code=403,
            detail="Selecciona un ámbito de pentest vigente antes de iniciar una operación C2.",
        )
    engagement = await db.get(PentestEngagement, engagement_id.strip())
    if engagement is None:
        raise HTTPException(status_code=403, detail="El ámbito C2 seleccionado no existe o ya no está disponible.")
    if engagement.status not in {"autorizado", "en_ejecucion"}:
        raise HTTPException(status_code=403, detail="El ámbito seleccionado no está autorizado para operar.")
    now = utc_now()
    if now < engagement.window_start or now > engagement.window_end:
        raise HTTPException(status_code=403, detail="La operación está fuera de la ventana autorizada del ámbito seleccionado.")
    try:
        has_ipv4_or_mac_or_domain_scope = bool(parse_authorized_targets(engagement.authorized_targets))
        has_ipv6_scope = bool(parse_authorized_ipv6_targets(engagement.authorized_ipv6_targets))
    except ValueError as exc:
        raise HTTPException(403, detail="El ámbito IPv6 guardado no contiene CIDR válidos.") from exc
    if not has_ipv4_or_mac_or_domain_scope and not has_ipv6_scope:
        raise HTTPException(
            status_code=403,
            detail="El ámbito seleccionado no contiene objetivos IP, rangos, dominios o MAC que se puedan validar.",
        )
    return engagement


async def _worker_demo_mode(client: httpx.AsyncClient, secret: str) -> bool:
    try:
        response = await client.get(
            "http://localhost/c2/meta",
            headers={"x-c2-internal-secret": secret},
        )
    except (httpx.HTTPError, OSError):
        raise HTTPException(503, "El servicio C2 no está disponible.")
    if response.status_code != 200:
        raise HTTPException(503, "No se pudo comprobar el modo del servicio C2.")
    try:
        return response.json().get("demo_mode") is True
    except (ValueError, AttributeError):
        raise HTTPException(503, "El servicio C2 respondió con un estado no válido.")


async def _validate_interface_scope(client: httpx.AsyncClient, secret: str, path: str,
                                   payload: object, authorized_targets: str | None,
                                   authorized_ipv6_targets: str | None = None) -> None:
    if not interface_validation_required(path):
        return
    if not isinstance(payload, dict) or not isinstance(payload.get("interface"), str):
        raise HTTPException(400, "Selecciona una interfaz para validar su red autorizada.")
    interface_name = payload["interface"].strip()
    if not interface_name:
        raise HTTPException(400, "Selecciona una interfaz para validar su red autorizada.")
    try:
        response = await client.get(
            "http://localhost/c2/interfaces",
            headers={"x-c2-internal-secret": secret},
        )
    except (httpx.HTTPError, OSError):
        raise HTTPException(503, "No se pudieron comprobar las interfaces del servicio C2.")
    if response.status_code != 200:
        raise HTTPException(503, "No se pudieron comprobar las interfaces del servicio C2.")
    try:
        rows = response.json().get("interfaces", [])
    except (ValueError, AttributeError):
        raise HTTPException(503, "El servicio C2 respondió con interfaces no válidas.")
    if not isinstance(rows, list):
        raise HTTPException(503, "El servicio C2 respondió con interfaces no válidas.")

    now = time.monotonic()
    for row in rows:
        if not isinstance(row, dict):
            continue
        name, cidr = row.get("name"), row.get("cidr")
        if isinstance(name, str) and isinstance(cidr, str) and cidr.strip():
            _interface_cidr_cache[name] = (cidr.strip(), now)
    current = next((row for row in rows if isinstance(row, dict) and row.get("name") == interface_name), None)
    if current is None:
        raise HTTPException(status_code=400, detail="La interfaz seleccionada no está disponible en el servicio C2.")
    if not interface_scope_required(path):
        return
    if path.strip("/") == "mitm6/start":
        validate_interface_ipv6_cidrs(
            current.get("ipv6_cidrs") if isinstance(current, dict) else None,
            authorized_ipv6_targets,
        )
        return
    cidr = current.get("cidr") if isinstance(current, dict) else None
    cached = _interface_cidr_cache.get(interface_name)
    if not cidr and cached and now - cached[1] <= _INTERFACE_CIDR_CACHE_TTL_SECONDS:
        cidr = cached[0]
    elif cached and now - cached[1] > _INTERFACE_CIDR_CACHE_TTL_SECONDS:
        _interface_cidr_cache.pop(interface_name, None)
    validate_interface_cidr(cidr if isinstance(cidr, str) else None, authorized_targets)


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


@router.get('/engagements', dependencies=[Depends(require_vault_unlocked), Depends(owner)])
async def list_c2_engagements(db=Depends(get_db)):
    """List scopes the owner can select in the C2 workspace."""
    result = await db.execute(
        select(PentestEngagement)
        .where(PentestEngagement.status.in_(("autorizado", "en_ejecucion")))
        .order_by(PentestEngagement.window_start.desc(), PentestEngagement.created_at.desc())
    )
    now = utc_now()
    return [
        {
            "id": engagement.id,
            "title": engagement.title,
            "authorized_targets": engagement.authorized_targets,
            "authorized_ipv6_targets": engagement.authorized_ipv6_targets,
            "status": engagement.status,
            "window_start": engagement.window_start,
            "window_end": engagement.window_end,
            "active_now": engagement.window_start <= now <= engagement.window_end,
        }
        for engagement in result.scalars().all()
    ]


@router.get('/clients', dependencies=[Depends(require_vault_unlocked), Depends(owner)])
async def list_c2_clients(db=Depends(get_db)):
    """Minimal CRM client list used only to bind a written C2 authorization."""
    result = await db.execute(select(Client).order_by(Client.company_name.asc()))
    return [{"id": client.id, "company_name": client.company_name} for client in result.scalars().all()]


@router.post('/engagements', dependencies=[Depends(require_vault_unlocked), Depends(owner)])
async def create_c2_engagement(req: PentestEngagementCreate, db=Depends(get_db)):
    """Create an engagement from the C2 workspace after validating target syntax."""
    from app.services.c2_scope import parse_authorized_ipv6_targets, parse_authorized_targets

    if await db.get(Client, req.client_id) is None:
        raise HTTPException(status_code=404, detail="El cliente asociado no existe.")
    if not parse_authorized_targets(req.authorized_targets):
        raise HTTPException(
            status_code=422,
            detail="Incluye al menos una IP, rango CIDR, dominio o MAC en los objetivos autorizados.",
        )
    # The Pydantic schema already validates these as IPv6 CIDRs; re-parse at
    # this trust boundary so alternate callers cannot bypass the constraint.
    parse_authorized_ipv6_targets(req.authorized_ipv6_targets)
    engagement = PentestEngagement(
        client_id=req.client_id,
        title=req.title,
        scope_written_summary=req.scope_written_summary,
        authorized_targets=req.authorized_targets,
        authorized_ipv6_targets=req.authorized_ipv6_targets,
        window_start=req.window_start,
        window_end=req.window_end,
        status="autorizado",
    )
    db.add(engagement)
    await db.commit()
    await db.refresh(engagement)
    return {
        "id": engagement.id,
        "title": engagement.title,
        "authorized_targets": engagement.authorized_targets,
        "authorized_ipv6_targets": engagement.authorized_ipv6_targets,
        "status": engagement.status,
        "window_start": engagement.window_start,
        "window_end": engagement.window_end,
        "active_now": engagement.window_start <= utc_now() <= engagement.window_end,
    }


@router.api_route('/{path:path}', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], dependencies=[Depends(require_vault_unlocked), Depends(owner)], include_in_schema=False)
async def forward(path: str, request: Request, db=Depends(get_db)):
    connection = _connection()
    if not connection:
        raise HTTPException(503, 'El servicio C2 no está configurado.')
    socket, secret = connection
    headers = {'x-c2-internal-secret': secret}
    engagement_id = request.headers.get('x-c2-engagement-id')
    if engagement_id:
        # Pass context for worker-side diagnostics without forwarding user
        # credentials or relying on client-provided authorization claims.
        headers['x-c2-engagement-id'] = engagement_id.strip()
    if request.headers.get('content-type'):
        headers['content-type'] = request.headers['content-type']
    payload: object = None
    try:
        async with httpx.AsyncClient(transport=httpx.AsyncHTTPTransport(uds=socket), timeout=120) as client:
            if _requires_scope(request.method, path) and not await _worker_demo_mode(client, secret):
                engagement = await _load_active_engagement(db, engagement_id)
                body = await request.body()
                payload = None
                if body:
                    try:
                        payload = json.loads(body)
                    except (ValueError, UnicodeDecodeError):
                        raise HTTPException(400, "El cuerpo de la operación C2 no contiene JSON válido.")
                validate_scope_targets(
                    path,
                    payload,
                    engagement.authorized_targets,
                    engagement.authorized_ipv6_targets,
                )
                await _validate_interface_scope(
                    client,
                    secret,
                    path,
                    payload,
                    engagement.authorized_targets,
                    engagement.authorized_ipv6_targets,
                )
            response = await client.request(request.method, 'http://localhost/c2/' + path,
                params=request.query_params.multi_items(), content=await request.body(), headers=headers)
    except (httpx.HTTPError, OSError):
        raise HTTPException(503, 'El servicio C2 no está disponible.')
    if response.status_code in (401, 403):
        # The caller already passed the vault and owner checks above. An auth
        # failure from the private worker concerns the inter-process secret,
        # not the user's role or the vault session.
        raise HTTPException(503, 'No se pudo autenticar la conexión interna con el servicio C2. Revisa su configuración y vuelve a intentarlo.')
    if request.method == "POST" and path.strip("/") == "wifi/monitor/start":
        try:
            original_iface = payload.get("interface") if isinstance(payload, dict) else None
            returned_iface = response.json().get("interface")
            original_scope = _interface_cidr_cache.get(original_iface) if isinstance(original_iface, str) else None
            if original_scope and isinstance(returned_iface, str):
                _interface_cidr_cache[returned_iface] = original_scope
        except (ValueError, AttributeError):
            pass
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
async def events(websocket: WebSocket, db: AsyncSession = Depends(get_db)):
    protocols = websocket.scope.get("subprotocols", [])
    vault = next((p[6:] for p in protocols if p.startswith("vault.")), "")
    user = next((p[5:] for p in protocols if p.startswith("user.")), "")
    if not user:
        token = websocket.cookies.get(SESSION_COOKIE)
        csrf = next((p[5:] for p in protocols if p.startswith("csrf.")), "")
        if token and hmac.compare_digest(csrf.encode(), csrf_for_session(token).encode()):
            user = token
    engagement_id = next((p[len("engagement."):] for p in protocols if p.startswith("engagement.")), "")
    if "lessso-v1" not in protocols:
        await websocket.close(code=4401)
        return
    if not await verify_vault_token_and_release(vault, db) or not await _owner_active(user):
        await websocket.close(code=4401)
        return
    connection = _connection()
    if not connection:
        await websocket.close(code=1013)
        return
    socket, secret = connection
    upstream_headers = {'x-c2-internal-secret': secret, 'x-vault-token': secret}
    if engagement_id:
        upstream_headers['x-c2-engagement-id'] = engagement_id
    try:
        async with websockets.unix_connect(socket, uri='ws://localhost/c2/ws',
                additional_headers=upstream_headers,
                open_timeout=3) as upstream:
            await websocket.accept(subprotocol="lessso-v1")
            while True:
                if not await verify_vault_token_and_release(vault, db) or not await _owner_active(user):
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
