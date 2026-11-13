from contextlib import asynccontextmanager
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, select
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

async def run_additive_schema_migrations():
    """Applies strictly additive, non-destructive schema alterations for existing databases."""
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
    for stmt in statements:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(stmt))
        except Exception:
            pass

async def migrate_plaintext_notes_to_encrypted():
    """Encrypts any existing plaintext private notes in place with AES-256-GCM (zero data loss)."""
    async with AsyncSessionLocal() as session:
        try:
            changed = False
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
                rows = (await session.execute(select(model))).scalars().all()
                for row in rows:
                    val = getattr(row, attr, None)
                    if val and isinstance(val, str) and val.strip() and not val.startswith(NOTE_ENC_PREFIX):
                        setattr(row, attr, encrypt_note(val))
                        changed = True
            if changed:
                await session.commit()
        except Exception:
            await session.rollback()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schema
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception:
        pass

    # Apply additive migrations safely without losing data
    await run_additive_schema_migrations()

    # Run seed data if first time (safe against multi-worker race conditions)
    async with AsyncSessionLocal() as session:
        try:
            await seed_initial_demo_data(session)
        except Exception:
            await session.rollback()

    # Ensure default modular catalogs and initial owner account exist
    async with AsyncSessionLocal() as session:
        try:
            await get_or_create_initial_owner(session)
            await initialize_default_catalogs(session)
        except Exception:
            await session.rollback()

    yield
    await engine.dispose()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Gestor Relacional de Identidades, Contraseñas, Llaves API, Suscripciones y CRM de Prospectos/Demos inspirado en Notion y Obsidian",
    lifespan=lifespan
)

# Medida transitoria para que ninguna petición autorizada use una clave antigua
# mientras se cambia la contraseña. Se sustituirá por sesiones compartidas.
vault_request_lock = asyncio.Lock()

@app.middleware("http")
async def serialize_vault_requests(request, call_next):
    if request.url.path.startswith("/api/v1/"):
        async with vault_request_lock:
            return await call_next(request)
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
