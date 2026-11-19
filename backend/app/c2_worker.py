"""Proceso C2 aislado; solo recibe peticiones autenticadas por socket privado."""
import os
import secrets

# El proceso no usa la base ni las credenciales del CRM. Ajustar antes de
# importar app.config, que también es utilizado por los módulos de C2.
_WORKER_SECRET = os.environ.get("C2_WORKER_SECRET", "")
if len(_WORKER_SECRET) < 32:
    raise RuntimeError("C2_WORKER_SECRET debe tener al menos 32 caracteres")
os.environ["SERVER_SECRET_KEY"] = secrets.token_hex(32)
os.environ["FALLBACK_USD_MXN_RATE"] = "20"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

import asyncio
import hmac
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from app.api.v1 import c2
from app.security.tokens import require_vault_unlocked
from app.database import get_db
from app.c2.core import demo, fw
from app.c2.core.bus import bus
from app.c2.core.cleanup import full_cleanup
from app.c2.core.state import load, state


@asynccontextmanager
async def lifespan(app):
    bus.bind_loop(asyncio.get_running_loop())
    task = None
    if demo.is_demo():
        task = asyncio.create_task(demo.timeline())
    else:
        previous = load()
        if previous:
            state.data.update(previous)
            state._taken = True
        else:
            state.snapshot_system()
        remaining = fw.peek()
        if remaining:
            bus.emit({"type": "error", "msg": f"Hay {remaining} reglas anteriores pendientes de limpieza."})
    try:
        yield
    finally:
        if task:
            task.cancel()
        if not demo.is_demo():
            full_cleanup("apagado del servicio C2")


app = FastAPI(lifespan=lifespan)

# El socket exige un secreto independiente; nunca se envía el token de bóveda.
class InternalAuth:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            headers = dict(scope.get("headers", []))
            supplied = headers.get(b"x-c2-internal-secret", b"").decode("utf-8", "replace")
            if not hmac.compare_digest(supplied.encode(), _WORKER_SECRET.encode()):
                if scope["type"] == "websocket":
                    await send({"type": "websocket.close", "code": 4403})
                else:
                    await JSONResponse({"detail": "No autorizado"}, status_code=403)(scope, receive, send)
                return
        await self.app(scope, receive, send)


app.add_middleware(InternalAuth)
app.dependency_overrides[require_vault_unlocked] = lambda: True
app.dependency_overrides[get_db] = lambda: None

async def verify_worker_vault_token(token, db=None):
    return bool(token) and hmac.compare_digest(token.encode(), _WORKER_SECRET.encode())


c2.verify_vault_token_and_release = verify_worker_vault_token
app.include_router(c2.router)
