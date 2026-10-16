import json
import base64
import secrets
from datetime import datetime, timezone
import argon2.low_level
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import EmailAccount, PlatformAccount, PaymentMethod, UserSettings, ExchangeRate
from app.security.tokens import verify_vault_token
from app.services.audit import log_audit_event

router = APIRouter(prefix="/vault", tags=["vault"])

class ExportEncryptedRequest(BaseModel):
    export_password: str

class RestoreEncryptedRequest(BaseModel):
    export_password: str
    backup_data: dict

def require_vault_unlocked(x_vault_token: str | None = Header(None)):
    if not verify_vault_token(x_vault_token):
        raise HTTPException(
            status_code=401,
            detail="Bóveda cifrada bloqueada. Ingrese su contraseña maestra para realizar operaciones de respaldo."
        )
    return True

def derive_export_key(password: str, salt: bytes) -> bytes:
    return argon2.low_level.hash_secret_raw(
        secret=password.encode("utf-8"),
        salt=salt,
        time_cost=2,
        memory_cost=65536,
        parallelism=1,
        hash_len=32,
        type=argon2.low_level.Type.ID
    )

@router.post("/export-encrypted")
async def export_encrypted_vault(
    payload: ExportEncryptedRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_vault_unlocked)
):
    if len(payload.export_password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña de cifrado del respaldo debe tener al menos 8 caracteres.")

    # 1. Fetch all records
    emails_res = await db.execute(select(EmailAccount))
    emails = emails_res.scalars().all()

    platforms_res = await db.execute(select(PlatformAccount))
    platforms = platforms_res.scalars().all()

    payments_res = await db.execute(select(PaymentMethod))
    payments = payments_res.scalars().all()

    settings_res = await db.execute(select(UserSettings).limit(1))
    settings = settings_res.scalar_one_or_none()

    rate_res = await db.execute(select(ExchangeRate).limit(1))
    rate = rate_res.scalar_one_or_none()

    vault_dump = {
        "metadata": {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "total_emails": len(emails),
            "total_platforms": len(platforms),
            "total_payments": len(payments)
        },
        "emails": [
            {
                "id": e.id,
                "address": e.address,
                "provider": e.provider,
                "inbox_url": e.inbox_url,
                "icon": e.icon,
                "notes": e.notes,
                "encrypted_password": e.encrypted_password,
                "password_entropy": e.password_entropy,
                "recovery_email_id": e.recovery_email_id,
                "recovery_phone": e.recovery_phone,
                "two_factor_method": e.two_factor_method,
                "encrypted_backup_codes": e.encrypted_backup_codes,
                "encrypted_security_questions": e.encrypted_security_questions,
                "aliases": e.aliases,
                "is_deleted": e.is_deleted
            }
            for e in emails
        ],
        "platforms": [
            {
                "id": p.id,
                "email_id": p.email_id,
                "specific_alias": p.specific_alias,
                "name": p.name,
                "login_url": p.login_url,
                "username": p.username,
                "notes": p.notes,
                "icon_url": p.icon_url,
                "icon_type": p.icon_type,
                "access_type": p.access_type,
                "encrypted_password": p.encrypted_password,
                "encrypted_pin": p.encrypted_pin,
                "encrypted_recovery_codes": p.encrypted_recovery_codes,
                "encrypted_totp_secret": p.encrypted_totp_secret,
                "has_totp": p.has_totp,
                "api_keys": p.api_keys,
                "env_variables": p.env_variables,
                "subscription_status": p.subscription_status,
                "subscription_cost": p.subscription_cost,
                "currency": p.currency,
                "billing_cycle": p.billing_cycle,
                "start_date": p.start_date,
                "next_billing_date": p.next_billing_date,
                "trial_end_date": p.trial_end_date,
                "payment_method_id": p.payment_method_id,
                "tags": p.tags,
                "is_deleted": p.is_deleted
            }
            for p in platforms
        ],
        "payments": [
            {
                "id": pay.id,
                "issuer": pay.issuer,
                "alias": pay.alias,
                "last_four": pay.last_four,
                "encrypted_card_number": pay.encrypted_card_number,
                "expiry_month": pay.expiry_month,
                "expiry_year": pay.expiry_year,
                "encrypted_cvv": pay.encrypted_cvv,
                "billing_notes": pay.billing_notes,
                "is_deleted": pay.is_deleted
            }
            for pay in payments
        ],
        "settings": {
            "vault_timeout_minutes": settings.vault_timeout_minutes if settings else 10,
            "clipboard_clear_seconds": settings.clipboard_clear_seconds if settings else 30,
            "allow_reveal_passwords": settings.allow_reveal_passwords if settings else False,
            "search_hotkey": settings.search_hotkey if settings else "ctrl+k",
            "accent_color": settings.accent_color if settings else "#6366f1",
            "canvas_style": settings.canvas_style if settings else "dot-grid"
        } if settings else None,
        "exchange_rate": {
            "rate": rate.rate if rate else 18.50,
            "is_manual": rate.is_manual if rate else False
        } if rate else None
    }

    # 2. Derive key and encrypt with AES-256-GCM
    salt = secrets.token_bytes(16)
    key = derive_export_key(payload.export_password, salt)
    nonce = secrets.token_bytes(12)
    aesgcm = AESGCM(key)
    
    plaintext = json.dumps(vault_dump).encode("utf-8")
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)

    await log_audit_event(
        db, action="export", entity_type="vault",
        details=f"Exportación cifrada completa: {len(emails)} correos, {len(platforms)} plataformas"
    )
    await db.commit()

    return {
        "app": "EmailSaver",
        "format": "emailsaver-encrypted-vault",
        "version": 1,
        "kdf": "Argon2id",
        "salt": base64.b64encode(salt).decode("utf-8"),
        "nonce": base64.b64encode(nonce).decode("utf-8"),
        "ciphertext": base64.b64encode(ciphertext).decode("utf-8"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }

@router.post("/restore-encrypted")
async def restore_encrypted_vault(
    payload: RestoreEncryptedRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_vault_unlocked)
):
    backup = payload.backup_data
    if backup.get("format") != "emailsaver-encrypted-vault" or not backup.get("ciphertext"):
        raise HTTPException(status_code=400, detail="Formato de archivo de respaldo no reconocido o inválido.")

    try:
        salt = base64.b64decode(backup["salt"])
        nonce = base64.b64decode(backup["nonce"])
        ciphertext = base64.b64decode(backup["ciphertext"])
        key = derive_export_key(payload.export_password, salt)
        aesgcm = AESGCM(key)
        decrypted = aesgcm.decrypt(nonce, ciphertext, None)
        vault_dump = json.loads(decrypted.decode("utf-8"))
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Contraseña de respaldo incorrecta o archivo de respaldo corrupto."
        )

    # Restore in ACID transaction
    # Upsert emails
    email_map = {}
    for e_data in vault_dump.get("emails", []):
        existing = await db.get(EmailAccount, e_data["id"])
        if not existing:
            # Check by address
            stmt = select(EmailAccount).where(EmailAccount.address == e_data["address"])
            res = await db.execute(stmt)
            existing = res.scalar_one_or_none()

        if existing:
            for k, v in e_data.items():
                if k != "id" and hasattr(existing, k):
                    setattr(existing, k, v)
            email_map[e_data["id"]] = existing.id
        else:
            new_e = EmailAccount(**e_data)
            db.add(new_e)
            email_map[e_data["id"]] = new_e.id

    # Upsert payment methods
    pay_map = {}
    for p_data in vault_dump.get("payments", []):
        existing = await db.get(PaymentMethod, p_data["id"])
        if existing:
            for k, v in p_data.items():
                if k != "id" and hasattr(existing, k):
                    setattr(existing, k, v)
            pay_map[p_data["id"]] = existing.id
        else:
            new_p = PaymentMethod(**p_data)
            db.add(new_p)
            pay_map[p_data["id"]] = new_p.id

    # Upsert platforms
    for plat_data in vault_dump.get("platforms", []):
        existing = await db.get(PlatformAccount, plat_data["id"])
        target_email_id = email_map.get(plat_data["email_id"], plat_data["email_id"])
        target_pay_id = pay_map.get(plat_data.get("payment_method_id"), plat_data.get("payment_method_id"))

        plat_data["email_id"] = target_email_id
        plat_data["payment_method_id"] = target_pay_id

        if existing:
            for k, v in plat_data.items():
                if k != "id" and hasattr(existing, k):
                    setattr(existing, k, v)
        else:
            new_plat = PlatformAccount(**plat_data)
            db.add(new_plat)

    await log_audit_event(
        db, action="restore", entity_type="vault",
        details="Restauración exitosa de respaldo cifrado"
    )
    await db.commit()

    return {
        "message": "Bóveda restaurada exitosamente desde archivo cifrado.",
        "restored_emails": len(vault_dump.get("emails", [])),
        "restored_platforms": len(vault_dump.get("platforms", []))
    }
