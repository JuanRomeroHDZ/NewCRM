import random
import secrets
import string
import json
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import EmailAccount, PlatformAccount, PasswordHistory
from app.security.crypto import decrypt_secret, calculate_entropy
from app.security.tokens import require_vault_unlocked

router = APIRouter(prefix="/passwords", tags=["passwords"], dependencies=[Depends(require_vault_unlocked)])

# Curated word list for memorable passphrase generation
MEMORABLE_WORDS = [
    "matrix", "vector", "quantum", "nebula", "cipher", "orbit", "solaris", "horizon",
    "vertex", "cortex", "pulsar", "shadow", "aurora", "beacon", "crypto", "vortex",
    "falcon", "glacier", "prism", "zenith", "arcadia", "titan", "comet", "strata",
    "cobalt", "fusion", "obsidian", "graphite", "ember", "bastion", "phantom", "echo"
]

@router.get("/generate")
def generate_password(
    length: int = Query(20, ge=8, le=64),
    include_uppercase: bool = Query(True),
    include_lowercase: bool = Query(True),
    include_digits: bool = Query(True),
    include_symbols: bool = Query(True),
    avoid_ambiguous: bool = Query(True),
    mode: str = Query("random", enum=["random", "passphrase"])
):
    """Generates a secure password or passphrase with live entropy calculation."""
    if mode == "passphrase":
        words_count = max(3, min(8, length // 4))
        chosen_words = [secrets.choice(MEMORABLE_WORDS) for _ in range(words_count)]
        if include_uppercase:
            chosen_words = [w.capitalize() if secrets.randbelow(2) == 0 else w for w in chosen_words]
        separator = "-" if not include_symbols else secrets.choice(["-", ".", "_", "#"])
        pw = separator.join(chosen_words)
        if include_digits:
            pw += f"{separator}{secrets.randbelow(100)}"
    else:
        chars = ""
        if include_lowercase:
            chars += string.ascii_lowercase
        if include_uppercase:
            chars += string.ascii_uppercase
        if include_digits:
            chars += string.digits
        if include_symbols:
            chars += "!@#$%^&*()_+-=[]{}|;:,.<>?"
        
        if avoid_ambiguous:
            # Remove 0, O, I, l, 1
            chars = chars.translate(str.maketrans("", "", "0OIl1|`'\""))

        if not chars:
            chars = string.ascii_letters + string.digits

        pw = "".join(secrets.choice(chars) for _ in range(length))

    entropy = calculate_entropy(pw)
    return {
        "password": pw,
        "entropy": entropy
    }

@router.get("/vault", dependencies=[Depends(require_vault_unlocked)])
async def get_all_vault_credentials(db: AsyncSession = Depends(get_db)):
    """Centralized vault listing of all accounts, passwords, PINs, and API keys."""
    # Active emails
    e_stmt = select(EmailAccount).where(EmailAccount.is_deleted == False)
    emails = (await db.execute(e_stmt)).scalars().all()

    # Active platforms
    p_stmt = select(PlatformAccount).where(PlatformAccount.is_deleted == False)
    platforms = (await db.execute(p_stmt)).scalars().all()

    email_map = {e.id: e.address for e in emails}

    items = []
    # 1. Emails
    for e in emails:
        dec_pw = decrypt_secret(e.encrypted_password) if e.encrypted_password else None
        items.append({
            "id": f"email_{e.id}",
            "entity_id": e.id,
            "category": "Correo Principal",
            "name": e.address,
            "provider": e.provider,
            "parent_email": None,
            "scope": getattr(e, "scope", "business") or "business",
            "type": "email_password",
            "has_credential": bool(dec_pw),
            "credential_masked": "••••••••" if dec_pw else "Sin clave",
            "credential_plain": dec_pw,
            "entropy": calculate_entropy(dec_pw) if dec_pw else None,
            "last_updated": getattr(e, "password_updated_at", None) or e.updated_at
        })

    # 2. Platforms
    for p in platforms:
        dec_pw = decrypt_secret(p.encrypted_password) if p.encrypted_password else None
        dec_pin = decrypt_secret(p.encrypted_pin) if p.encrypted_pin else None
        p_scope = getattr(p, "scope", "business") or "business"
        parent_addr = email_map.get(p.email_id, "Sin correo vinculado") if p.email_id else "Sin correo vinculado"

        # Password item
        items.append({
            "id": f"platform_pw_{p.id}",
            "entity_id": p.id,
            "category": "Plataforma",
            "name": p.name,
            "username": p.username,
            "parent_email": parent_addr,
            "scope": p_scope,
            "type": "platform_password",
            "access_type": p.access_type,
            "has_credential": bool(dec_pw),
            "credential_masked": "••••••••" if dec_pw else ("Inicio con correo" if p.access_type == "sso" else "Sin clave"),
            "credential_plain": dec_pw,
            "entropy": calculate_entropy(dec_pw) if dec_pw else None,
            "last_updated": getattr(p, "password_updated_at", None) or p.updated_at
        })

        # PIN if present
        if dec_pin:
            items.append({
                "id": f"platform_pin_{p.id}",
                "entity_id": p.id,
                "category": "PIN de Plataforma",
                "name": f"{p.name} (PIN)",
                "username": p.username,
                "parent_email": parent_addr,
                "scope": p_scope,
                "type": "pin",
                "has_credential": True,
                "credential_masked": "••••",
                "credential_plain": dec_pin,
                "entropy": calculate_entropy(dec_pin),
                "last_updated": p.updated_at
            })

        # API Keys
        if p.api_keys:
            try:
                keys = json.loads(p.api_keys)
                for ak in keys:
                    dec_k = decrypt_secret(ak.get("encrypted_key"))
                    items.append({
                        "id": f"api_key_{ak.get('id')}",
                        "entity_id": p.id,
                        "category": "Llave API",
                        "name": f"{p.name} — {ak.get('label')}",
                        "parent_email": parent_addr,
                        "scope": p_scope,
                        "type": "api_key",
                        "has_credential": bool(dec_k),
                        "credential_masked": "••••••••••••••••",
                        "credential_plain": dec_k,
                        "entropy": None,
                        "expires_at": ak.get("expires_at"),
                        "last_updated": ak.get("created_at") or p.updated_at
                    })
            except Exception:
                pass

    return items

@router.get("/history/{target_id}", dependencies=[Depends(require_vault_unlocked)])
async def get_password_history(target_id: str, db: AsyncSession = Depends(get_db)):
    """Fetches immutable password history for a target email or platform."""
    stmt = select(PasswordHistory).where(PasswordHistory.target_id == target_id).order_by(PasswordHistory.created_at.desc())
    res = await db.execute(stmt)
    records = res.scalars().all()

    output = []
    for r in records:
        dec_pw = decrypt_secret(r.encrypted_password)
        output.append({
            "id": r.id,
            "target_type": r.target_type,
            "target_name": r.target_name,
            "password_plain": dec_pw,
            "password_masked": "••••••••",
            "reason": r.reason,
            "created_at": r.created_at
        })
    return output
