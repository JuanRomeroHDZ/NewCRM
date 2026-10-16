from collections import defaultdict
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import EmailAccount, PlatformAccount, UserSettings
from app.schemas import SecurityAuditResponse, PasswordReuseGroup, EmergencyKitResponse, PwnedCheckRequest, PwnedCheckResponse
from app.security.crypto import decrypt_secret, calculate_entropy
from app.security.tokens import require_vault_unlocked
from app.security.pwned import check_pwned_password

router = APIRouter(prefix="/security", tags=["security"], dependencies=[Depends(require_vault_unlocked)])

@router.get("/health", response_model=SecurityAuditResponse)
async def get_security_health_audit(db: AsyncSession = Depends(get_db)):
    """Audits password reuse, weak entropy, missing 2FA, and blast radius across the vault."""
    # Fetch active emails
    emails = (await db.execute(
        select(EmailAccount).where(EmailAccount.is_deleted == False)
    )).scalars().all()

    # Fetch active platforms
    platforms = (await db.execute(
        select(PlatformAccount).where(PlatformAccount.is_deleted == False)
    )).scalars().all()

    email_map = {e.id: e.address for e in emails}

    # Group passwords to detect reuse
    pw_clusters = defaultdict(list)
    weak_accounts = []
    unprotected_emails = []

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

    # 2. Inspect platforms
    for p in platforms:
        if p.encrypted_password and p.access_type == "own_password":
            plain_pw = decrypt_secret(p.encrypted_password)
            if plain_pw:
                pw_clusters[plain_pw].append({
                    "id": p.id,
                    "name": p.name,
                    "type": "platform",
                    "parent_email": email_map.get(p.email_id, "Desconocido")
                })
                entropy = calculate_entropy(plain_pw)
                if entropy["score"] < 50:
                    weak_accounts.append({
                        "id": p.id,
                        "name": p.name,
                        "type": "platform",
                        "entropy": entropy
                    })

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

    # Calculate Global Health Score (0 - 100)
    # Deductions:
    # - 15 points per reuse group (max 40)
    # - 5 points per weak password (max 30)
    # - 10 points per email without 2FA (max 30)
    penalty = 0
    penalty += min(40, len(reuse_groups) * 15)
    penalty += min(30, len(weak_accounts) * 5)
    penalty += min(30, len(unprotected_emails) * 10)

    health_score = max(10, 100 - penalty)
    vulnerable_accounts = len(set(
        [item["id"] for rg in reuse_groups for item in rg.entities] +
        [w["id"] for w in weak_accounts] +
        [u["id"] for u in unprotected_emails]
    ))

    return SecurityAuditResponse(
        health_score=health_score,
        total_accounts=total_accounts,
        vulnerable_accounts_count=vulnerable_accounts,
        reused_passwords_count=reused_count,
        weak_passwords_count=len(weak_accounts),
        no_2fa_emails_count=len(unprotected_emails),
        stale_passwords_count=0,
        reuse_groups=reuse_groups,
        weak_accounts=weak_accounts,
        unprotected_emails=unprotected_emails
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
        vault_id="ES-VAULT-PROD-01",
        master_salt="argon2id_v1_emailsaver_salt_64mb",
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

    is_pwned, count = check_pwned_password(target_pw)
    if is_pwned:
        return PwnedCheckResponse(
            is_pwned=True,
            pwned_count=count,
            severity="critical" if count > 1000 else "high",
            message=f"Esta contraseña ha sido expuesta {count:,} veces en filtraciones de datos públicas. Cámbiela inmediatamente."
        )
    return PwnedCheckResponse(
        is_pwned=False,
        pwned_count=0,
        severity="safe",
        message="Excelente: esta contraseña no figura en ninguna brecha pública conocida de HaveIBeenPwned."
    )

