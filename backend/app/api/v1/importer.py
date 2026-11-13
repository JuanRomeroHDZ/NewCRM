import json
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database import get_db
from app.models import EmailAccount, PlatformAccount, PasswordHistory
from app.schemas import validate_email_input, validate_nonblank_input, validate_web_url_input
from app.security.crypto import encrypt_secret, encrypt_note, calculate_entropy
from app.security.tokens import require_vault_unlocked
from app.services.audit import log_audit_event
from app.services.favicon import extract_favicon_url

router = APIRouter(prefix="/importer", tags=["importer"], dependencies=[Depends(require_vault_unlocked)])

class ImportItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    username: str | None = Field(default=None, max_length=128)
    password: str | None = Field(default=None, max_length=512)
    url: str | None = Field(default=None, max_length=512)
    notes: str | None = Field(default=None, max_length=10000)
    parent_email: str | None = Field(default=None, max_length=255)

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        return validate_nonblank_input(v)

    @field_validator("url")
    @classmethod
    def check_url(cls, v: str | None) -> str | None:
        return validate_web_url_input(v)

    @field_validator("parent_email")
    @classmethod
    def check_parent_email(cls, v: str | None) -> str | None:
        return validate_email_input(v)

class BatchImportRequest(BaseModel):
    source: Literal["generic", "bitwarden", "1password", "chrome"] = "generic"
    items: list[ImportItem] = Field(..., min_length=1, max_length=1000)

@router.post("/batch")
async def batch_import_vault(payload: BatchImportRequest, db: AsyncSession = Depends(get_db)):
    """Imports external password exports into the hierarchical relational model."""
    if not payload.items:
        raise HTTPException(status_code=400, detail="La lista de elementos a importar está vacía.")

    # Fetch existing emails
    existing_emails = (await db.execute(
        select(EmailAccount).where(EmailAccount.is_deleted == False)
    )).scalars().all()
    email_map = {e.address.lower(): e for e in existing_emails}

    # If no email exists, create a default fallback root email
    default_email = existing_emails[0] if existing_emails else None
    if not default_email:
        from app.config import settings
        fallback_address = settings.DEFAULT_IMPORT_EMAIL.strip() or settings.INITIAL_OWNER_EMAIL
        default_email = EmailAccount(
            address=fallback_address,
            provider="Custom",
            notes=encrypt_note("Correo creado automáticamente como contenedor de importación")
        )
        db.add(default_email)
        await db.flush()
        email_map[default_email.address.lower()] = default_email

    created_platforms = 0
    created_emails = 0

    for item in payload.items:
        # Determine parent email
        target_email = default_email
        if item.parent_email and "@" in item.parent_email:
            clean_email = item.parent_email.strip().lower()
            if clean_email in email_map:
                target_email = email_map[clean_email]
            else:
                # Auto-create new parent email
                new_em = EmailAccount(
                    address=clean_email,
                    provider="Google" if "gmail" in clean_email else "Custom",
                    notes=encrypt_note("Creado automáticamente desde importación")
                )
                db.add(new_em)
                await db.flush()
                email_map[clean_email] = new_em
                target_email = new_em
                created_emails += 1
        elif item.username and "@" in item.username:
            clean_user_email = item.username.strip().lower()
            if clean_user_email in email_map:
                target_email = email_map[clean_user_email]

        # Encrypt password
        enc_pw = encrypt_secret(item.password) if item.password else None

        icon_url = await extract_favicon_url(item.url or "")

        platform = PlatformAccount(
            name=item.name,
            email_id=target_email.id,
            username=item.username,
            login_url=item.url,
            notes=encrypt_note(item.notes),
            icon_url=icon_url,
            icon_type="initials" if icon_url.startswith("data:image/svg+xml") else "extracted",
            access_type="own_password",
            encrypted_password=enc_pw,
            subscription_status="active",
            subscription_cost=0.0,
            currency=settings.DEFAULT_CURRENCY,
            billing_cycle="monthly",
            tags=json.dumps([{"name": f"Importado ({payload.source})", "color": settings.DEFAULT_TAG_COLOR}])
        )
        db.add(platform)
        await db.flush()

        if enc_pw:
            db.add(PasswordHistory(
                target_type="platform",
                target_id=platform.id,
                target_name=platform.name,
                encrypted_password=enc_pw,
                reason="import"
            ))

        created_platforms += 1

    await log_audit_event(
        db, action="import", entity_type="vault",
        details=f"Importación masiva ({payload.source}): {created_platforms} plataformas y {created_emails} nuevos correos"
    )
    await db.commit()

    return {
        "message": "Importación completada con éxito.",
        "imported_platforms": created_platforms,
        "created_emails": created_emails
    }
