from collections import defaultdict
from datetime import date, datetime, timezone
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import EmailAccount, PlatformAccount, UserSettings, PasswordHistory
from app.schemas import SecurityAuditResponse, PasswordReuseGroup, EmergencyKitResponse, PwnedCheckRequest, PwnedCheckResponse
from app.security.crypto import decrypt_secret, calculate_entropy
from app.security.tokens import require_vault_unlocked
from app.security.pwned import check_pwned_password

router = APIRouter(prefix="/security", tags=["security"], dependencies=[Depends(require_vault_unlocked)])

def _parse_json_list(val: str | None) -> list:
    if not val:
        return []
    try:
        parsed = json.loads(val)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []

def _parse_date_str(val: str | None) -> date | None:
    if not val or not isinstance(val, str):
        return None
    try:
        return date.fromisoformat(val.strip()[:10])
    except Exception:
        return None

@router.get("/health", response_model=SecurityAuditResponse)
async def get_security_health_audit(db: AsyncSession = Depends(get_db)):
    """Audits password reuse, weak entropy, missing 2FA, stale passwords, and expiring/expired API keys."""
    settings_row = (await db.execute(select(UserSettings).limit(1))).scalar_one_or_none()
    root_threshold = int(getattr(settings_row, "password_rotation_days_root", 90) or 90) if settings_row else 90
    secondary_threshold = int(getattr(settings_row, "password_rotation_days_secondary", 180) or 180) if settings_row else 180

    # Latest password history dates per target_id
    hist_stmt = select(PasswordHistory.target_id, func.max(PasswordHistory.created_at)).group_by(PasswordHistory.target_id)
    hist_map = dict((await db.execute(hist_stmt)).all())

    # Fetch active emails
    emails = (await db.execute(
        select(EmailAccount).where(EmailAccount.is_deleted == False)
    )).scalars().all()

    # Fetch active platforms
    platforms = (await db.execute(
        select(PlatformAccount).where(PlatformAccount.is_deleted == False)
    )).scalars().all()

    email_map = {e.id: e.address for e in emails}
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    today = now_naive.date()

    pw_clusters = defaultdict(list)
    weak_accounts = []
    unprotected_emails = []
    stale_accounts = []
    api_key_alerts = []
    expired_api_keys_count = 0
    expiring_api_keys_count = 0

    # 1. Inspect emails
    for e in emails:
        if e.two_factor_method == "none":
            unprotected_emails.append({
                "id": e.id,
                "address": e.address,
                "provider": e.provider,
                "platform_count": len([p for p in platforms if p.email_id == e.id])
            })

        if e.encrypted_password:
            plain_pw = decrypt_secret(e.encrypted_password)
            if plain_pw:
                pw_clusters[plain_pw].append({
                    "id": e.id,
                    "name": e.address,
                    "type": "email",
                    "provider": e.provider
                })
                entropy = calculate_entropy(plain_pw)
                if entropy["score"] < 50:
                    weak_accounts.append({
                        "id": e.id,
                        "name": e.address,
                        "type": "email",
                        "entropy": entropy
                    })

            pw_dt = getattr(e, "password_updated_at", None) or hist_map.get(e.id) or e.created_at or now_naive
            if pw_dt.tzinfo is not None:
                pw_dt = pw_dt.astimezone(timezone.utc).replace(tzinfo=None)
            age_days = max(0, (now_naive - pw_dt).days)
            if age_days >= root_threshold:
                stale_accounts.append({
                    "id": e.id,
                    "name": e.address,
                    "type": "email",
                    "provider": e.provider,
                    "age_days": age_days,
                    "threshold_days": root_threshold,
                    "last_updated": pw_dt.isoformat()
                })

    # 2. Inspect platforms (passwords + API keys)
    for p in platforms:
        parent_email_addr = email_map.get(p.email_id, "Desconocido")
        if p.encrypted_password and p.access_type == "own_password":
            plain_pw = decrypt_secret(p.encrypted_password)
            if plain_pw:
                pw_clusters[plain_pw].append({
                    "id": p.id,
                    "name": p.name,
                    "type": "platform",
                    "parent_email": parent_email_addr
                })
                entropy = calculate_entropy(plain_pw)
                if entropy["score"] < 50:
                    weak_accounts.append({
                        "id": p.id,
                        "name": p.name,
                        "type": "platform",
                        "entropy": entropy
                    })

            pw_dt = getattr(p, "password_updated_at", None) or hist_map.get(p.id) or p.created_at or now_naive
            if pw_dt.tzinfo is not None:
                pw_dt = pw_dt.astimezone(timezone.utc).replace(tzinfo=None)
            age_days = max(0, (now_naive - pw_dt).days)
            if age_days >= secondary_threshold:
                stale_accounts.append({
                    "id": p.id,
                    "name": p.name,
                    "type": "platform",
                    "parent_email": parent_email_addr,
                    "age_days": age_days,
                    "threshold_days": secondary_threshold,
                    "last_updated": pw_dt.isoformat()
                })

        # Inspect API keys expiration
        for ak in _parse_json_list(p.api_keys):
            if not isinstance(ak, dict):
                continue
            exp_date = _parse_date_str(ak.get("expires_at"))
            if not exp_date:
                continue
            days_rem = (exp_date - today).days
            if days_rem < 0:
                expired_api_keys_count += 1
                api_key_alerts.append({
                    "id": ak.get("id", ""),
                    "label": ak.get("label", "API Key"),
                    "platform_id": p.id,
                    "platform_name": p.name,
                    "parent_email": parent_email_addr,
                    "expires_at": exp_date.isoformat(),
                    "days_remaining": days_rem,
                    "status": "expired"
                })
            elif days_rem <= 15:
                expiring_api_keys_count += 1
                api_key_alerts.append({
                    "id": ak.get("id", ""),
                    "label": ak.get("label", "API Key"),
                    "platform_id": p.id,
                    "platform_name": p.name,
                    "parent_email": parent_email_addr,
                    "expires_at": exp_date.isoformat(),
                    "days_remaining": days_rem,
                    "status": "expiring_soon"
                })

    api_key_alerts.sort(key=lambda x: x["days_remaining"])
    stale_accounts.sort(key=lambda x: x["age_days"], reverse=True)

    # Find reuse groups with 2 or more accounts sharing the exact same password
    reuse_groups: list[PasswordReuseGroup] = []
    reused_count = 0
    for pw, items in pw_clusters.items():
        if len(items) >= 2:
            reused_count += len(items)
            reuse_groups.append(PasswordReuseGroup(
                password_masked="••••••••",
                count=len(items),
                entities=items
            ))

    total_accounts = len(emails) + len(platforms)
    passwords_checked_count = sum(len(accounts) for accounts in pw_clusters.values())

    # Calculate Global Health Score (0 - 100)
    penalty = 0
    penalty += min(35, len(reuse_groups) * 15)
    penalty += min(25, len(weak_accounts) * 5)
    penalty += min(25, len(unprotected_emails) * 10)
    penalty += min(30, expired_api_keys_count * 12)
    penalty += min(15, expiring_api_keys_count * 5)
    penalty += min(20, len(stale_accounts) * 4)

    health_score = max(5, 100 - penalty) if total_accounts else None
    vulnerable_accounts = len(set(
        [item["id"] for rg in reuse_groups for item in rg.entities] +
        [w["id"] for w in weak_accounts] +
        [u["id"] for u in unprotected_emails] +
        [s["id"] for s in stale_accounts] +
        [a["platform_id"] for a in api_key_alerts]
    ))

    return SecurityAuditResponse(
        health_score=health_score,
        total_accounts=total_accounts,
        email_accounts_count=len(emails),
        passwords_checked_count=passwords_checked_count,
        vulnerable_accounts_count=vulnerable_accounts,
        reused_passwords_count=reused_count,
        weak_passwords_count=len(weak_accounts),
        no_2fa_emails_count=len(unprotected_emails),
        stale_passwords_count=len(stale_accounts),
        expiring_api_keys_count=expiring_api_keys_count,
        expired_api_keys_count=expired_api_keys_count,
        password_rotation_days_root=root_threshold,
        password_rotation_days_secondary=secondary_threshold,
        reuse_groups=reuse_groups,
        weak_accounts=weak_accounts,
        unprotected_emails=unprotected_emails,
        stale_accounts=stale_accounts,
        api_key_alerts=api_key_alerts
    )

@router.get("/emergency-kit", response_model=EmergencyKitResponse)
async def generate_emergency_kit(db: AsyncSession = Depends(get_db)):
    """Generates structured emergency recovery kit sheet (like 1Password / Bitwarden)."""
    emails = (await db.execute(
        select(EmailAccount).where(EmailAccount.is_deleted == False)
    )).scalars().all()

    platforms = (await db.execute(
        select(PlatformAccount).where(PlatformAccount.is_deleted == False)
    )).scalars().all()

    email_map = {e.id: e.address for e in emails}
    recovery_chains = []
    for e in emails:
        if e.recovery_email_id and e.recovery_email_id in email_map:
            recovery_chains.append({
                "from_email": e.address,
                "recovers_to": email_map[e.recovery_email_id]
            })

    return EmergencyKitResponse(
        generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        total_emails=len(emails),
        total_platforms=len(platforms),
        root_emails=[
            {
                "address": e.address,
                "provider": e.provider,
                "two_factor": e.two_factor_method,
                "phone": e.recovery_phone or "N/A"
            }
            for e in emails
        ],
        recovery_chains=recovery_chains,
        instructions=[
            "Guarda este documento impreso en una caja fuerte o bóveda física de seguridad.",
            "Para restaurar tu bóveda en una nueva instalación Docker, utiliza tu Contraseña Maestra junto con el respaldo .json.",
            "Si pierdes acceso a un correo raíz, consulta la cadena de recuperación para verificar cuál correo secundario puede restablecer el acceso."
        ]
    )

@router.post("/check-pwned", response_model=PwnedCheckResponse)
async def check_password_pwned(
    payload: PwnedCheckRequest,
    db: AsyncSession = Depends(get_db)
):
    target_pw = payload.password
    if not target_pw and payload.platform_id:
        stmt = select(PlatformAccount).where(PlatformAccount.id == payload.platform_id)
        p = (await db.execute(stmt)).scalar_one_or_none()
        if p and p.encrypted_password:
            target_pw = decrypt_secret(p.encrypted_password)

    if not target_pw:
        raise HTTPException(status_code=400, detail="No se proporcionó contraseña para verificar.")

    is_pwned, count, pwned_status = await check_pwned_password(target_pw)
    if pwned_status == "compromised":
        return PwnedCheckResponse(
            is_pwned=True,
            pwned_count=count,
            severity="critical" if count > 1000 else "high",
            message=f"Esta contraseña ha sido expuesta {count:,} veces en filtraciones de datos públicas. Cámbiela inmediatamente."
        )
    elif pwned_status == "unknown":
        return PwnedCheckResponse(
            is_pwned=False,
            pwned_count=0,
            severity="unknown",
            message="No se pudo contactar el servicio de HaveIBeenPwned (entorno local sin conexión o tiempo de espera agotado)."
        )
    return PwnedCheckResponse(
        is_pwned=False,
        pwned_count=0,
        severity="safe",
        message="Excelente: esta contraseña no figura en ninguna brecha pública conocida de HaveIBeenPwned."
    )

from pydantic import BaseModel
from fastapi import Request
from app.models import SecureResource
from app.security.crypto import verify_master_password
from app.services.activity_service import record_event

class SecretRevealRequest(BaseModel):
    target_type: str  # email, platform, resource
    target_id: str
    field_name: str = "password"  # password, pin, totp_secret, api_key, content
    master_password: str

class SecretRevealResponse(BaseModel):
    decrypted_value: str
    revealed_at: str

@router.post("/reveal", response_model=SecretRevealResponse)
async def reveal_secret_with_reauth(
    payload: SecretRevealRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Exige reautenticación con contraseña maestra y registra auditoría inmutable
    antes de descifrar y entregar un secreto individual.
    """
    settings_row = (await db.execute(select(UserSettings).limit(1))).scalar_one_or_none()
    if not settings_row or not verify_master_password(settings_row.master_password_hash, payload.master_password):
        raise HTTPException(status_code=401, detail="La contraseña de acceso no es correcta.")

    encrypted_val = None
    target_name = payload.target_id

    if payload.target_type == "email":
        row = (await db.execute(select(EmailAccount).where(EmailAccount.id == payload.target_id))).scalar_one_or_none()
        if row:
            target_name = row.address
            encrypted_val = row.encrypted_password
    elif payload.target_type == "platform":
        row = (await db.execute(select(PlatformAccount).where(PlatformAccount.id == payload.target_id))).scalar_one_or_none()
        if row:
            target_name = row.name
            if payload.field_name == "pin":
                encrypted_val = row.encrypted_pin
            elif payload.field_name == "totp_secret":
                encrypted_val = row.encrypted_totp_secret
            else:
                encrypted_val = row.encrypted_password
    elif payload.target_type == "resource":
        row = (await db.execute(select(SecureResource).where(SecureResource.id == payload.target_id))).scalar_one_or_none()
        if row:
            target_name = row.title
            encrypted_val = row.encrypted_content

    if not encrypted_val:
        raise HTTPException(status_code=404, detail="Recurso o secreto no encontrado.")

    plain = decrypt_secret(encrypted_val)
    if not plain:
        raise HTTPException(status_code=500, detail="No se pudo descifrar el secreto.")

    ip_addr = request.client.host if request.client else None
    now_iso = datetime.now(timezone.utc).isoformat()

    await record_event(
        db,
        module="vault",
        action="unlock",
        entity_type=payload.target_type,
        entity_id=payload.target_id,
        summary=f"Revelado auditado de {payload.field_name} para {target_name}",
        ip_address=ip_addr
    )
    await db.commit()

    return SecretRevealResponse(
        decrypted_value=plain,
        revealed_at=now_iso
    )

