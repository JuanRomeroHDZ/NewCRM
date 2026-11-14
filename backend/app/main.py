from contextlib import asynccontextmanager
import asyncio
import logging
import re
import threading
from weakref import ReferenceType, WeakKeyDictionary, ref
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, select, inspect, func
from app.config import settings
from app.database import engine, Base, AsyncSessionLocal
from app.models import (
    EmailAccount, PlatformAccount, PaymentMethod, Prospect,
    ClientIncome, DomainRenewal, OneTimeExpense, InternalProject, SecureResource,
    Debt, DebtPayment,
)
from app.security.crypto import encrypt_note, NOTE_ENC_PREFIX
from app.seed_data import seed_initial_demo_data
from app.api.v1 import (
    auth, emails, platforms, payments, passwords,
    graph, trash, exchange, settings as settings_api, health,
    security, importer, prospects, audit, vault_backup, finances,
    users, system_config, jobs, activity, personal_finances, workshop, crm_capture,
    crm_sales, agenda, communications, integrations, metrics_and_inbound, writeups
)
from app.services.config_service import initialize_default_catalogs
from app.services.core_auth import get_or_create_initial_owner
from app.middleware.request_limits import UploadRequestLimitMiddleware

logger = logging.getLogger(__name__)
SQLITE_ADD_COLUMN_RE = re.compile(
    r"^ALTER TABLE ([A-Za-z_][A-Za-z0-9_]*) ADD COLUMN IF NOT EXISTS "
    r"([A-Za-z_][A-Za-z0-9_]*) (.+)$",
    re.IGNORECASE,
)


def _migration_name(statement: str) -> str:
    match = re.match(
        r"ALTER TABLE ([A-Za-z_][A-Za-z0-9_]*) (?:ADD COLUMN IF NOT EXISTS |ALTER COLUMN )"
        r"([A-Za-z_][A-Za-z0-9_]*)",
        statement,
        re.IGNORECASE,
    )
    return f"{match.group(1)}.{match.group(2)}" if match else "schema-change"


async def _apply_schema_statement(connection, statement: str, dialect_name: str) -> bool:
    if dialect_name != "sqlite":
        await connection.execute(text(statement))
        return True

    add_column = SQLITE_ADD_COLUMN_RE.fullmatch(statement)
    if add_column:
        table_name, column_name, definition = add_column.groups()
        columns = await connection.run_sync(
            lambda sync_connection: inspect(sync_connection).get_columns(table_name)
        )
        if any(column["name"].lower() == column_name.lower() for column in columns):
            return False
        await connection.execute(
            text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")
        )
        return True

    if " ALTER COLUMN " in statement.upper():
        if " DROP NOT NULL" in statement.upper():
            match = re.search(r"ALTER TABLE ([A-Za-z_][A-Za-z0-9_]*) ALTER COLUMN ([A-Za-z_][A-Za-z0-9_]*)", statement, re.IGNORECASE)
            if match:
                table_name, column_name = match.groups()
                columns = await connection.run_sync(
                    lambda sync_connection: inspect(sync_connection).get_columns(table_name)
                )
                column = next((item for item in columns if item["name"].lower() == column_name.lower()), None)
                if column and not column.get("nullable", True):
                    logger.warning(
                        "SQLite conserva la restricción NOT NULL de %s.%s; se requiere una migración con respaldo.",
                        table_name,
                        column_name,
                    )
            return False
        logger.info("SQLite omite el cambio de tipo; la afinidad existente admite estos valores.")
        return False

    raise RuntimeError("La migración no está soportada por SQLite.")

async def run_additive_schema_migrations(database_engine=None):
    """Applies strictly additive, non-destructive schema alterations for existing databases."""
    migration_engine = database_engine or engine
    statements = [
        "ALTER TABLE platform_accounts ALTER COLUMN icon_url TYPE TEXT",
        "ALTER TABLE email_accounts ALTER COLUMN icon TYPE TEXT",
        "ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE",
        "ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMP WITHOUT TIME ZONE",
        "ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS scope VARCHAR(32) DEFAULT 'business'",
        "ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE",
        "ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMP WITHOUT TIME ZONE",
        "ALTER TABLE platform_accounts ALTER COLUMN email_id DROP NOT NULL",
        "ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS prospect_id VARCHAR(36)",
        "ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS project_id VARCHAR(36)",
        "ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS ownership_type VARCHAR(32) DEFAULT 'own'",
        "ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS scope VARCHAR(32) DEFAULT 'business'",
        "ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS business_share_percent FLOAT DEFAULT 100.0",
        "ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS start_date VARCHAR(32)",
        "ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE",
        "ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS scope VARCHAR(32) DEFAULT 'business'",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMP WITHOUT TIME ZONE",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_contact_channel VARCHAR(32)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS followup_sla_hours FLOAT DEFAULT 48.0",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS max_followup_attempts INTEGER DEFAULT 3",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS estimated_value FLOAT DEFAULT 0.0",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT 'MXN'",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS billing_type VARCHAR(32) DEFAULT 'one_time'",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS scope VARCHAR(32) DEFAULT 'business'",
        "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS budget_cap_amount FLOAT DEFAULT 0.0",
        "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS budget_cap_currency VARCHAR(8) DEFAULT 'MXN'",
        "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS password_rotation_days_root INTEGER DEFAULT 90",
        "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS password_rotation_days_secondary INTEGER DEFAULT 180",
        "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS trash_retention_days INTEGER DEFAULT 0",
        "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS max_followup_attempts INTEGER DEFAULT 3",
        "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS vault_salt VARCHAR(64)",
        "ALTER TABLE client_incomes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE",
        "ALTER TABLE client_incomes ADD COLUMN IF NOT EXISTS project_id VARCHAR(36)",
        "ALTER TABLE client_incomes ADD COLUMN IF NOT EXISTS ownership_type VARCHAR(32) DEFAULT 'client'",
        "ALTER TABLE client_incomes ADD COLUMN IF NOT EXISTS scope VARCHAR(32) DEFAULT 'business'",
        "ALTER TABLE client_incomes ADD COLUMN IF NOT EXISTS business_share_percent FLOAT DEFAULT 100.0",
        "ALTER TABLE client_incomes ALTER COLUMN category TYPE VARCHAR(64)",
        "ALTER TABLE domain_renewals ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE",
        "ALTER TABLE domain_renewals ADD COLUMN IF NOT EXISTS project_id VARCHAR(36)",
        "ALTER TABLE domain_renewals ADD COLUMN IF NOT EXISTS ownership_type VARCHAR(32) DEFAULT 'client'",
        "ALTER TABLE domain_renewals ADD COLUMN IF NOT EXISTS scope VARCHAR(32) DEFAULT 'business'",
        "ALTER TABLE domain_renewals ADD COLUMN IF NOT EXISTS business_share_percent FLOAT DEFAULT 100.0",
        "ALTER TABLE domain_renewals ADD COLUMN IF NOT EXISTS client_charge_amount FLOAT DEFAULT 0.0",
        "ALTER TABLE domain_renewals ALTER COLUMN service_type TYPE VARCHAR(64)",
    ]
    current_migration = "schema-change"
    try:
        async with migration_engine.begin() as conn:
            dialect_name = conn.dialect.name
            for stmt in statements:
                current_migration = _migration_name(stmt)
                await _apply_schema_statement(conn, stmt, dialect_name)
    except Exception as exc:
        logger.exception("No se pudo aplicar la migración de esquema %s.", current_migration)
        raise RuntimeError("No se pudo completar una migración del esquema; revisa los logs del servidor.") from exc

async def migrate_plaintext_notes_to_encrypted():
    """Encrypts any existing plaintext private notes in place with AES-256-GCM (zero data loss)."""
    batch_size = 200
    async with AsyncSessionLocal() as session:
        for model, attr in [
            (EmailAccount, "notes"),
            (PlatformAccount, "notes"),
            (PaymentMethod, "billing_notes"),
            (Prospect, "notes"),
            (ClientIncome, "notes"),
            (DomainRenewal, "notes"),
            (OneTimeExpense, "notes"),
            (InternalProject, "notes"),
            (SecureResource, "notes"),
            (SecureResource, "encrypted_content"),
            (Debt, "notes"),
            (DebtPayment, "notes"),
        ]:
            column = getattr(model, attr)
            encrypted_count = 0
            try:
                while True:
                    rows = (
                        await session.execute(
                            select(model)
                            .where(
                                column.is_not(None),
                                func.trim(column) != "",
                                ~column.startswith(NOTE_ENC_PREFIX),
                            )
                            .order_by(model.id.asc())
                            .limit(batch_size)
                        )
                    ).scalars().all()
                    if not rows:
                        break
                    for row in rows:
                        value = getattr(row, attr, None)
                        if isinstance(value, str) and value.strip() and not value.startswith(NOTE_ENC_PREFIX):
                            setattr(row, attr, encrypt_note(value))
                            encrypted_count += 1
                    await session.commit()
                if encrypted_count:
                    logger.info("Notas cifradas migradas: tabla=%s campo=%s cantidad=%s", model.__tablename__, attr, encrypted_count)
            except Exception as exc:
                await session.rollback()
                logger.error(
                    "Falló la migración de notas en %s.%s. error_type=%s",
                    model.__tablename__,
                    attr,
                    type(exc).__name__,
                )
                raise RuntimeError("No se pudo completar la migración de notas cifradas; revisa los logs del servidor.") from exc

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("Esquema base de datos inicializado.")
        except Exception as exc:
            logger.exception("No se pudo inicializar el esquema base.")
            raise RuntimeError("No se pudo inicializar el esquema; revisa los logs del servidor.") from exc
        await run_additive_schema_migrations()

        async with AsyncSessionLocal() as session:
            try:
                await seed_initial_demo_data(session)
            except Exception as exc:
                await session.rollback()
                logger.error(
                    "No se pudo cargar el contenido inicial; el servicio continúa sin datos de ejemplo. error_type=%s",
                    type(exc).__name__,
                )

        async with AsyncSessionLocal() as session:
            try:
                await get_or_create_initial_owner(session)
                await initialize_default_catalogs(session)
            except Exception as exc:
                await session.rollback()
                logger.error(
                    "No se pudo preparar la cuenta inicial o los catálogos del sistema. error_type=%s",
                    type(exc).__name__,
                )
                raise RuntimeError("Falló la inicialización de la cuenta o catálogos; revisa los logs del servidor.") from exc

        logger.info("Inicialización del servicio completada.")
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

app.add_middleware(
    UploadRequestLimitMiddleware,
    api_prefix=settings.API_V1_PREFIX,
    eml_max_bytes=communications.MAX_EML_FILE_BYTES,
    asset_max_bytes=max(settings.WRITEUP_MAX_IMAGE_BYTES, settings.WRITEUP_MAX_VIDEO_BYTES),
)

# Medida transitoria para que ninguna petición autorizada use una clave antigua
# mientras se cambia la contraseña. Se sustituirá por sesiones compartidas.
_vault_request_locks: WeakKeyDictionary[
    asyncio.AbstractEventLoop,
    ReferenceType[asyncio.Lock],
] = WeakKeyDictionary()
_vault_request_locks_guard = threading.Lock()


def _get_vault_request_lock() -> asyncio.Lock:
    loop = asyncio.get_running_loop()
    with _vault_request_locks_guard:
        lock_ref = _vault_request_locks.get(loop)
        lock = lock_ref() if lock_ref else None
        if lock is None:
            lock = asyncio.Lock()
            _vault_request_locks[loop] = ref(lock)
        return lock

@app.middleware("http")
async def serialize_vault_requests(request, call_next):
    if request.url.path.startswith("/api/v1/"):
        async with _get_vault_request_lock():
            return await call_next(request)
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count", "X-Has-More"],
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

@app.get("/")
def root():
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "api_v1": settings.API_V1_PREFIX
    }
