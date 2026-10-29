import json
import base64
import secrets
import hashlib
from datetime import datetime, timezone
import argon2.low_level
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import (
    EmailAccount, PlatformAccount, PaymentMethod, UserSettings, ExchangeRate,
    ClientIncome, DomainRenewal, OneTimeExpense, InternalProject, SecureResource
)
from app.security.tokens import require_vault_unlocked
from app.services.audit import log_audit_event

router = APIRouter(prefix="/vault", tags=["vault"], dependencies=[Depends(require_vault_unlocked)])

class ExportEncryptedRequest(BaseModel):
    export_password: str

class RestoreEncryptedRequest(BaseModel):
    export_password: str
    backup_data: dict

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
    db: AsyncSession = Depends(get_db)
):
    if len(payload.export_password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña de cifrado del respaldo debe tener al menos 8 caracteres.")

    # Fetch all records across the system
    emails = (await db.execute(select(EmailAccount))).scalars().all()
    platforms = (await db.execute(select(PlatformAccount))).scalars().all()
    payments = (await db.execute(select(PaymentMethod))).scalars().all()
    incomes = (await db.execute(select(ClientIncome))).scalars().all()
    renewals = (await db.execute(select(DomainRenewal))).scalars().all()
    expenses = (await db.execute(select(OneTimeExpense))).scalars().all()
    projects = (await db.execute(select(InternalProject))).scalars().all()
    resources = (await db.execute(select(SecureResource))).scalars().all()
    settings = (await db.execute(select(UserSettings).limit(1))).scalar_one_or_none()
    rate = (await db.execute(select(ExchangeRate).limit(1))).scalar_one_or_none()

    vault_dump = {
        "metadata": {
            "version": "2.0",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "total_emails": len(emails),
            "total_platforms": len(platforms),
            "total_payments": len(payments),
            "total_incomes": len(incomes),
            "total_renewals": len(renewals),
            "total_expenses": len(expenses),
            "total_projects": len(projects),
            "total_resources": len(resources),
        },
        "emails": [
            {
                "id": e.id, "address": e.address, "provider": e.provider, "inbox_url": e.inbox_url,
                "icon": e.icon, "notes": e.notes, "encrypted_password": e.encrypted_password,
                "password_entropy": e.password_entropy, "recovery_email_id": e.recovery_email_id,
                "recovery_phone": e.recovery_phone, "two_factor_method": e.two_factor_method,
                "encrypted_backup_codes": e.encrypted_backup_codes,
                "encrypted_security_questions": e.encrypted_security_questions,
                "aliases": e.aliases, "scope": e.scope, "is_deleted": e.is_deleted
            }
            for e in emails
        ],
        "platforms": [
            {
                "id": p.id, "email_id": p.email_id, "specific_alias": p.specific_alias,
                "name": p.name, "login_url": p.login_url, "username": p.username,
                "notes": p.notes, "icon_url": p.icon_url, "icon_type": p.icon_type,
                "access_type": p.access_type, "encrypted_password": p.encrypted_password,
                "encrypted_pin": p.encrypted_pin, "encrypted_recovery_codes": p.encrypted_recovery_codes,
                "encrypted_totp_secret": p.encrypted_totp_secret, "has_totp": p.has_totp,
                "api_keys": p.api_keys, "env_variables": p.env_variables,
                "subscription_status": p.subscription_status, "subscription_cost": float(p.subscription_cost or 0.0),
                "currency": p.currency, "billing_cycle": p.billing_cycle,
                "start_date": p.start_date, "next_billing_date": p.next_billing_date,
                "trial_end_date": p.trial_end_date, "payment_method_id": p.payment_method_id,
                "tags": p.tags, "scope": p.scope, "ownership_type": p.ownership_type,
                "business_share_percent": float(getattr(p, "business_share_percent", 100.0) or 100.0),
                "is_deleted": p.is_deleted
            }
            for p in platforms
        ],
        "payments": [
            {
                "id": m.id, "issuer": m.issuer, "alias": m.alias, "last_four": m.last_four,
                "scope": m.scope, "encrypted_card_number": m.encrypted_card_number,
                "expiry_month": m.expiry_month, "expiry_year": m.expiry_year,
                "billing_notes": m.billing_notes, "is_deleted": m.is_deleted
            }
            for m in payments
        ],
        "incomes": [
            {
                "id": inc.id, "client_name": inc.client_name, "concept": inc.concept,
                "category": inc.category, "amount": float(inc.amount or 0.0),
                "currency": inc.currency, "status": inc.status,
                "received_date": inc.received_date, "payment_method_label": inc.payment_method_label,
                "is_recurring": inc.is_recurring, "notes": inc.notes, "scope": inc.scope,
                "is_deleted": inc.is_deleted
            }
            for inc in incomes
        ],
        "renewals": [
            {
                "id": r.id, "domain_or_service": r.domain_or_service, "service_type": r.service_type,
                "client_name": r.client_name, "provider": r.provider, "renewal_date": r.renewal_date,
                "renewal_cost": float(r.renewal_cost or 0.0),
                "client_charge_amount": float(r.client_charge_amount or 0.0),
                "currency": r.currency, "billing_cycle": r.billing_cycle, "paid_by": r.paid_by,
                "status": r.status, "auto_renew": r.auto_renew, "notes": r.notes, "scope": r.scope,
                "is_deleted": r.is_deleted
            }
            for r in renewals
        ],
        "expenses": [
            {
                "id": exp.id, "concept": exp.concept, "category": exp.category,
                "amount": float(exp.amount or 0.0), "currency": exp.currency,
                "expense_date": exp.expense_date, "vendor": exp.vendor,
                "payment_method_label": exp.payment_method_label, "notes": exp.notes,
                "scope": exp.scope, "is_deleted": exp.is_deleted
            }
            for exp in expenses
        ],
        "projects": [
            {
                "id": pr.id, "name": pr.name, "category": pr.category, "status": pr.status,
                "scope": pr.scope, "production_url": pr.production_url, "repo_url": pr.repo_url,
                "tech_stack": pr.tech_stack, "monthly_maintenance_cost": float(pr.monthly_maintenance_cost or 0.0),
                "currency": pr.currency, "tags": pr.tags, "notes": pr.notes, "is_deleted": pr.is_deleted
            }
            for pr in projects
        ],
        "resources": [
            {
                "id": res.id, "title": res.title, "resource_type": res.resource_type,
                "scope": res.scope, "ownership_type": res.ownership_type,
                "encrypted_content": res.encrypted_content, "tags": res.tags,
                "notes": res.notes, "is_deleted": res.is_deleted
            }
            for res in resources
        ],
        "settings": {
            "vault_timeout_minutes": settings.vault_timeout_minutes if settings else 10,
            "clipboard_clear_seconds": settings.clipboard_clear_seconds if settings else 30,
            "allow_reveal_passwords": settings.allow_reveal_passwords if settings else False,
            "accent_color": settings.accent_color if settings else "#6366f1",
            "canvas_style": settings.canvas_style if settings else "dot-grid",
            "budget_cap_amount": float(getattr(settings, "budget_cap_amount", 0.0) or 0.0) if settings else 0.0,
            "budget_cap_currency": getattr(settings, "budget_cap_currency", "MXN") if settings else "MXN",
        },
        "exchange_rate": {
            "rate": float(rate.rate) if rate else 18.50,
            "is_manual": rate.is_manual if rate else False
        }
    }

    dump_json = json.dumps(vault_dump, ensure_ascii=False)
    checksum = hashlib.sha256(dump_json.encode("utf-8")).hexdigest()

    salt = secrets.token_bytes(16)
    key = derive_export_key(payload.export_password, salt)
    aesgcm = AESGCM(key)
    nonce = secrets.token_bytes(12)
    ciphertext = aesgcm.encrypt(nonce, dump_json.encode("utf-8"), None)

    await log_audit_event(
        db, action="export", entity_type="vault",
        details="Generación de exportación parcial cifrada con AES-256-GCM"
    )
    await db.commit()

    return {
        "format": "emailsaver-encrypted-vault",
        "version": "2.0",
        "checksum": checksum,
        "salt": base64.b64encode(salt).decode("utf-8"),
        "nonce": base64.b64encode(nonce).decode("utf-8"),
        "ciphertext": base64.b64encode(ciphertext).decode("utf-8"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }

@router.post("/restore-encrypted")
async def restore_encrypted_vault(
    payload: RestoreEncryptedRequest,
    db: AsyncSession = Depends(get_db)
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

    # Allowlist schemas for secure deserialization (prevent mass assignment vulnerabilities)
    EMAIL_FIELDS = {
        "address", "provider", "inbox_url", "icon", "notes", "encrypted_password",
        "password_entropy", "recovery_email_id", "recovery_phone", "two_factor_method",
        "encrypted_backup_codes", "encrypted_security_questions", "aliases", "scope", "is_deleted"
    }
    PLATFORM_FIELDS = {
        "email_id", "specific_alias", "name", "login_url", "username", "notes",
        "icon_url", "icon_type", "access_type", "encrypted_password", "encrypted_pin",
        "encrypted_recovery_codes", "encrypted_totp_secret", "has_totp", "api_keys",
        "env_variables", "subscription_status", "subscription_cost", "currency",
        "billing_cycle", "start_date", "next_billing_date", "trial_end_date",
        "payment_method_id", "tags", "scope", "ownership_type", "business_share_percent", "is_deleted"
    }
    PAYMENT_FIELDS = {
        "issuer", "alias", "last_four", "scope", "encrypted_card_number",
        "expiry_month", "expiry_year", "billing_notes", "is_deleted"
    }

    # 1. Restore Emails
    email_map = {}
    for e_data in vault_dump.get("emails", []):
        target_id = e_data.get("id")
        existing = await db.get(EmailAccount, target_id) if target_id else None
        if not existing and e_data.get("address"):
            res = await db.execute(select(EmailAccount).where(EmailAccount.address == e_data["address"]))
            existing = res.scalar_one_or_none()

        filtered = {k: v for k, v in e_data.items() if k in EMAIL_FIELDS}
        if existing:
            for k, v in filtered.items():
                setattr(existing, k, v)
            email_map[target_id] = existing.id
        else:
            new_e = EmailAccount(id=target_id or None, **filtered)
            db.add(new_e)
            email_map[target_id] = new_e.id

    # 2. Restore Payments
    pay_map = {}
    for p_data in vault_dump.get("payments", []):
        target_id = p_data.get("id")
        existing = await db.get(PaymentMethod, target_id) if target_id else None
        filtered = {k: v for k, v in p_data.items() if k in PAYMENT_FIELDS}
        if existing:
            for k, v in filtered.items():
                setattr(existing, k, v)
            pay_map[target_id] = existing.id
        else:
            new_p = PaymentMethod(id=target_id or None, **filtered)
            db.add(new_p)
            pay_map[target_id] = new_p.id

    # 3. Restore Platforms
    for plat_data in vault_dump.get("platforms", []):
        target_id = plat_data.get("id")
        existing = await db.get(PlatformAccount, target_id) if target_id else None
        filtered = {k: v for k, v in plat_data.items() if k in PLATFORM_FIELDS}

        # Remap foreign keys
        if "email_id" in filtered and filtered["email_id"] in email_map:
            filtered["email_id"] = email_map[filtered["email_id"]]
        if "payment_method_id" in filtered and filtered["payment_method_id"] in pay_map:
            filtered["payment_method_id"] = pay_map[filtered["payment_method_id"]]

        if existing:
            for k, v in filtered.items():
                setattr(existing, k, v)
        else:
            new_plat = PlatformAccount(id=target_id or None, **filtered)
            db.add(new_plat)

    # 4. Restore Incomes
    for inc_data in vault_dump.get("incomes", []):
        target_id = inc_data.get("id")
        existing = await db.get(ClientIncome, target_id) if target_id else None
        if not existing and inc_data.get("client_name") and inc_data.get("concept"):
            clean_inc = {
                "client_name": inc_data.get("client_name"),
                "concept": inc_data.get("concept"),
                "category": inc_data.get("category", "anticipo"),
                "amount": float(inc_data.get("amount", 0.0)),
                "currency": inc_data.get("currency", "MXN"),
                "status": inc_data.get("status", "cobrado"),
                "received_date": inc_data.get("received_date", "2026-01-01"),
                "payment_method_label": inc_data.get("payment_method_label"),
                "is_recurring": bool(inc_data.get("is_recurring", False)),
                "notes": inc_data.get("notes"),
                "scope": inc_data.get("scope", "business"),
                "is_deleted": bool(inc_data.get("is_deleted", False))
            }
            db.add(ClientIncome(id=target_id or None, **clean_inc))

    # 5. Restore Renewals
    for r_data in vault_dump.get("renewals", []):
        target_id = r_data.get("id")
        existing = await db.get(DomainRenewal, target_id) if target_id else None
        if not existing and r_data.get("domain_or_service"):
            clean_r = {
                "domain_or_service": r_data.get("domain_or_service"),
                "service_type": r_data.get("service_type", "dominio"),
                "client_name": r_data.get("client_name", "Cliente"),
                "provider": r_data.get("provider"),
                "renewal_date": r_data.get("renewal_date", "2026-01-01"),
                "renewal_cost": float(r_data.get("renewal_cost", 0.0)),
                "client_charge_amount": float(r_data.get("client_charge_amount", 0.0)),
                "currency": r_data.get("currency", "MXN"),
                "billing_cycle": r_data.get("billing_cycle", "yearly"),
                "paid_by": r_data.get("paid_by", "client"),
                "status": r_data.get("status", "activo"),
                "auto_renew": bool(r_data.get("auto_renew", False)),
                "notes": r_data.get("notes"),
                "scope": r_data.get("scope", "business"),
                "is_deleted": bool(r_data.get("is_deleted", False))
            }
            db.add(DomainRenewal(id=target_id or None, **clean_r))

    await log_audit_event(
        db, action="restore", entity_type="vault",
        details="Restauración parcial de una exportación cifrada"
    )
    await db.commit()

    return {
        "message": "Restauración parcial completada. No se restauran todos los datos de la aplicación.",
        "restored_emails": len(vault_dump.get("emails", [])),
        "restored_platforms": len(vault_dump.get("platforms", [])),
        "restored_payments": len(vault_dump.get("payments", [])),
        "restored_incomes": len(vault_dump.get("incomes", [])),
        "restored_renewals": len(vault_dump.get("renewals", []))
    }
