from contextlib import asynccontextmanager
import logging
from pathlib import Path
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.config import settings
from app.database import engine
from app.api.v1 import (
    auth, emails, platforms, payments, passwords,
    graph, trash, exchange, settings as settings_api, health,
    security, importer, prospects, audit, vault_backup, finances,
    users, system_config, jobs, activity, personal_finances, workshop, crm_capture,
    crm_sales, agenda, communications, integrations, metrics_and_inbound, writeups, reports,
    report_collaboration, c2_proxy
)
from app.middleware.request_limits import UploadRequestLimitMiddleware
from app.security.tokens import VaultKeyContextMiddleware

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        # Schema and one-time data migrations run in the dedicated Compose
        # `migrate` job before API replicas start. Keeping DDL out of API
        # startup avoids concurrent schema changes during scale-out.
        config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        expected_revision = ScriptDirectory.from_config(config).get_current_head()
        async with engine.connect() as connection:
            version = await connection.execute(text("SELECT version_num FROM alembic_version"))
            current_revision = version.scalar_one_or_none()
        if current_revision != expected_revision:
            raise RuntimeError(
                "La base no está en la revisión Alembic actual; ejecuta el servicio migrate antes de la API."
            )
        logger.info("Base de datos verificada en revisión Alembic %s.", current_revision)
        yield
    except Exception as exc:
        logger.error("El servicio no pudo completar su inicialización. error_type=%s", type(exc).__name__)
        raise
    finally:
        await engine.dispose()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Gestor Relacional de Identidades, Contraseñas, Llaves API, Suscripciones y CRM de Prospectos/Demos inspirado en Notion y Obsidian",
    lifespan=lifespan
)

@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError):
    public_errors = [
        {"loc": [part for part in error["loc"][:1 if error["type"] == "extra_forbidden" else 2]
                 if isinstance(part, int) or
                 (isinstance(part, str) and part.isidentifier() and len(part) <= 64)],
         "type": error["type"],
         "msg": "Revisa el valor o el formato del campo."}
        for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": public_errors})


@app.exception_handler(StarletteHTTPException)
async def sanitize_http_error(request: Request, exc: StarletteHTTPException):
    if exc.status_code >= 500:
        return JSONResponse(status_code=exc.status_code, headers=exc.headers,
                            content={"detail": "El servicio no pudo completar la solicitud."})
    return await http_exception_handler(request, exc)


app.add_middleware(
    UploadRequestLimitMiddleware,
    api_prefix=settings.API_V1_PREFIX,
    eml_max_bytes=communications.MAX_EML_FILE_BYTES,
    asset_max_bytes=max(settings.WRITEUP_MAX_IMAGE_BYTES, settings.WRITEUP_MAX_VIDEO_BYTES),
)

app.add_middleware(VaultKeyContextMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count", "X-Has-More", "X-Auth-Scope"],
)

# Include API Routers
app.include_router(health.router)
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(emails.router, prefix=settings.API_V1_PREFIX)
app.include_router(platforms.router, prefix=settings.API_V1_PREFIX)
app.include_router(prospects.router, prefix=settings.API_V1_PREFIX)
app.include_router(payments.router, prefix=settings.API_V1_PREFIX)
app.include_router(passwords.router, prefix=settings.API_V1_PREFIX)
app.include_router(graph.router, prefix=settings.API_V1_PREFIX)
app.include_router(trash.router, prefix=settings.API_V1_PREFIX)
app.include_router(exchange.router, prefix=settings.API_V1_PREFIX)
app.include_router(settings_api.router, prefix=settings.API_V1_PREFIX)
app.include_router(security.router, prefix=settings.API_V1_PREFIX)
app.include_router(importer.router, prefix=settings.API_V1_PREFIX)
app.include_router(audit.router, prefix=settings.API_V1_PREFIX)
app.include_router(vault_backup.router, prefix=settings.API_V1_PREFIX)
app.include_router(finances.router, prefix=settings.API_V1_PREFIX)
app.include_router(users.router, prefix=settings.API_V1_PREFIX)
app.include_router(system_config.router, prefix=settings.API_V1_PREFIX)
app.include_router(jobs.router, prefix=settings.API_V1_PREFIX)
app.include_router(activity.router, prefix=settings.API_V1_PREFIX)
app.include_router(personal_finances.router, prefix=settings.API_V1_PREFIX)
app.include_router(workshop.router, prefix=settings.API_V1_PREFIX)
app.include_router(crm_capture.router, prefix=settings.API_V1_PREFIX)
app.include_router(crm_sales.router, prefix=settings.API_V1_PREFIX)
app.include_router(agenda.router, prefix=settings.API_V1_PREFIX)
app.include_router(communications.router, prefix=settings.API_V1_PREFIX)
app.include_router(integrations.router, prefix=settings.API_V1_PREFIX)
app.include_router(metrics_and_inbound.router, prefix=settings.API_V1_PREFIX)
app.include_router(writeups.router, prefix=settings.API_V1_PREFIX)
app.include_router(reports.router, prefix=settings.API_V1_PREFIX)
app.include_router(report_collaboration.router, prefix=settings.API_V1_PREFIX)
app.include_router(c2_proxy.router, prefix=settings.API_V1_PREFIX)

@app.get("/")
def root():
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "api_v1": settings.API_V1_PREFIX
    }
