import json
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import EmailAccount, PlatformAccount, PasswordHistory, Prospect, utc_now
from app.schemas import EmailCreate, EmailUpdate, EmailResponse, BackupCodeItem, SecurityQuestionItem
from app.security.crypto import encrypt_secret, decrypt_secret, encrypt_note, decrypt_note, calculate_entropy
from app.security.tokens import require_vault_unlocked
from app.services.audit import log_audit_event

# All email routes strictly require an unlocked Level 2 vault session
router = APIRouter(prefix="/emails", tags=["emails"], dependencies=[Depends(require_vault_unlocked)])

def parse_json_safely(val: str | None, default_val=None):
    if not val:
        return default_val if default_val is not None else []
    try:
        return json.loads(val)
    except Exception:
        return default_val if default_val is not None else []

async def _build_email_response(e: EmailAccount, db: AsyncSession, is_unlocked: bool = True) -> EmailResponse:
    # Count linked platforms
    p_count_stmt = select(func.count(PlatformAccount.id)).where(
        PlatformAccount.email_id == e.id, PlatformAccount.is_deleted == False
    )
    p_count = (await db.execute(p_count_stmt)).scalar() or 0

    # Count linked prospects
    pr_count_stmt = select(func.count(Prospect.id)).where(
        Prospect.email_id == e.id, Prospect.is_deleted == False
    )
    pr_count = (await db.execute(pr_count_stmt)).scalar() or 0

    backup_codes_raw = parse_json_safely(e.encrypted_backup_codes, [])
    sec_questions_raw = parse_json_safely(e.encrypted_security_questions, [])
    aliases_raw = parse_json_safely(e.aliases, [])

    backup_codes = []
    for bc in backup_codes_raw:
        code_text = bc.get("code", "")
        if is_unlocked and bc.get("is_encrypted"):
            code_text = decrypt_secret(code_text) or code_text
        elif not is_unlocked and bc.get("is_encrypted"):
            code_text = "••••••••"
        backup_codes.append(BackupCodeItem(code=code_text, is_used=bc.get("is_used", False)))

    sec_questions = []
    for sq in sec_questions_raw:
        ans = sq.get("answer", "")
        if is_unlocked and sq.get("is_encrypted"):
            ans = decrypt_secret(ans) or ans
        elif not is_unlocked and sq.get("is_encrypted"):
            ans = "••••••••"
        sec_questions.append(SecurityQuestionItem(question=sq.get("question", ""), answer=ans))

    plain_pw = decrypt_secret(e.encrypted_password) if (is_unlocked and e.encrypted_password) else None

    recovery_email_address = None
    if e.recovery_email_id:
        r_stmt = select(EmailAccount.address).where(EmailAccount.id == e.recovery_email_id)
        recovery_email_address = (await db.execute(r_stmt)).scalar_one_or_none()

    return EmailResponse(
        id=e.id,
        address=e.address,
        provider=e.provider,
        inbox_url=e.inbox_url,
        icon=e.icon,
        notes=decrypt_note(e.notes) if is_unlocked else None,
        recovery_email_id=e.recovery_email_id,
        recovery_phone=e.recovery_phone,
        two_factor_method=e.two_factor_method,
        aliases=aliases_raw,
        scope=getattr(e, "scope", "business") or "business",
        has_password=bool(e.encrypted_password),
        password_masked="••••••••" if e.encrypted_password else "Sin contraseña",
        password_plain=plain_pw,
        password_entropy=e.password_entropy,
        entropy_details=calculate_entropy(plain_pw) if plain_pw else None,
        backup_codes=backup_codes,
        security_questions=sec_questions,
        platform_count=p_count,
        prospect_count=pr_count,
        recovery_email_address=recovery_email_address,
        is_deleted=e.is_deleted,
        created_at=e.created_at,
        updated_at=e.updated_at
    )

@router.get("", response_model=list[EmailResponse])
async def list_emails(
    search: str | None = None,
    provider: str | None = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(EmailAccount).where(EmailAccount.is_deleted == False)
    if search:
        stmt = stmt.where(EmailAccount.address.ilike(f"%{search.strip()}%"))
    if provider:
        stmt = stmt.where(EmailAccount.provider.ilike(provider.strip()))

    stmt = stmt.order_by(EmailAccount.address.asc())
    res = await db.execute(stmt)
    emails = res.scalars().all()

    output = []
    for e in emails:
        output.append(await _build_email_response(e, db=db, is_unlocked=True))

    return output

@router.get("/{email_id}", response_model=EmailResponse)
async def get_email_detail(
    email_id: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(EmailAccount).where(EmailAccount.id == email_id, EmailAccount.is_deleted == False)
    res = await db.execute(stmt)
    e = res.scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Cuenta de correo no encontrada.")

    return await _build_email_response(e, db=db, is_unlocked=True)

@router.post("", response_model=EmailResponse)
async def create_email(
    payload: EmailCreate,
    db: AsyncSession = Depends(get_db)
):
    # Check duplicate address
    check_stmt = select(EmailAccount).where(EmailAccount.address == payload.address.strip(), EmailAccount.is_deleted == False)
    if (await db.execute(check_stmt)).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Esta dirección de correo ya está registrada.")

    enc_pw = None
    entropy_score = 0
    if payload.password:
        enc_pw = encrypt_secret(payload.password)
        entropy_score = calculate_entropy(payload.password)["score"]

    # Encrypt backup codes and security questions
    stored_backup_codes = []
    for bc in payload.backup_codes:
        if bc.code and bc.code.strip():
            stored_backup_codes.append({
                "code": encrypt_secret(bc.code.strip()),
                "is_used": bc.is_used,
                "is_encrypted": True
            })

    stored_sec_questions = []
    for sq in payload.security_questions:
        if sq.question and sq.question.strip():
            stored_sec_questions.append({
                "question": sq.question.strip(),
                "answer": encrypt_secret(sq.answer.strip()) if sq.answer else None,
                "is_encrypted": True
            })

    email = EmailAccount(
        address=payload.address.strip(),
        provider=payload.provider,
        inbox_url=payload.inbox_url.strip() if payload.inbox_url else None,
        icon=payload.icon,
        notes=encrypt_note(payload.notes),
        encrypted_password=enc_pw,
        password_entropy=entropy_score,
        password_updated_at=utc_now() if enc_pw else None,
        recovery_email_id=payload.recovery_email_id if payload.recovery_email_id != "" else None,
        recovery_phone=payload.recovery_phone.strip() if payload.recovery_phone else None,
        two_factor_method=payload.two_factor_method,
        scope=payload.scope or "business",
        encrypted_backup_codes=json.dumps(stored_backup_codes),
        encrypted_security_questions=json.dumps(stored_sec_questions),
        aliases=json.dumps(payload.aliases)
    )
    db.add(email)
    await db.flush()

    if enc_pw:
        db.add(PasswordHistory(
            target_type="email",
            target_id=email.id,
            target_name=email.address,
            encrypted_password=enc_pw,
            reason="creation"
        ))

    await log_audit_event(
        db, action="create", entity_type="email", entity_id=email.id, entity_name=email.address,
        details="Cuenta de correo creada atómicamente con credenciales cifradas"
    )
    await db.commit()
    await db.refresh(email)

    return await _build_email_response(email, db=db, is_unlocked=True)

@router.put("/{email_id}", response_model=EmailResponse)
async def update_email(
    email_id: str,
    payload: EmailUpdate,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(EmailAccount).where(EmailAccount.id == email_id, EmailAccount.is_deleted == False)
    res = await db.execute(stmt)
    email = res.scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=404, detail="Cuenta de correo no encontrada.")

    # Prevent recovery cycle loop (pointing to self)
    if payload.recovery_email_id and payload.recovery_email_id == email.id:
        raise HTTPException(status_code=400, detail="Una cuenta de correo no puede ser su propio correo de recuperación.")

    if payload.address is not None and payload.address.strip() != email.address:
        email.address = payload.address.strip()
    if payload.provider is not None:
        email.provider = payload.provider
    if payload.inbox_url is not None:
        email.inbox_url = payload.inbox_url.strip() if payload.inbox_url else None
    if payload.icon is not None:
        email.icon = payload.icon
    if payload.notes is not None:
        email.notes = encrypt_note(payload.notes)
    if payload.recovery_email_id is not None:
        email.recovery_email_id = payload.recovery_email_id if payload.recovery_email_id != "" else None
    if payload.recovery_phone is not None:
        email.recovery_phone = payload.recovery_phone.strip() if payload.recovery_phone else None
    if payload.two_factor_method is not None:
        email.two_factor_method = payload.two_factor_method
    if payload.aliases is not None:
        email.aliases = json.dumps(payload.aliases)
    if payload.scope is not None:
        email.scope = payload.scope

    # Unit of work for password change: record in history
    if payload.password is not None and payload.password != "":
        new_enc = encrypt_secret(payload.password)
        email.encrypted_password = new_enc
        email.password_entropy = calculate_entropy(payload.password)["score"]
        email.password_updated_at = utc_now()
        db.add(PasswordHistory(
            target_type="email",
            target_id=email.id,
            target_name=email.address,
            encrypted_password=new_enc,
            reason="update"
        ))

    if payload.backup_codes is not None:
        stored_bc = []
        for bc in payload.backup_codes:
            if bc.code and bc.code.strip():
                stored_bc.append({
                    "code": encrypt_secret(bc.code.strip()),
                    "is_used": bc.is_used,
                    "is_encrypted": True
                })
        email.encrypted_backup_codes = json.dumps(stored_bc)

    if payload.security_questions is not None:
        stored_sq = []
        for sq in payload.security_questions:
            if sq.question and sq.question.strip():
                stored_sq.append({
                    "question": sq.question.strip(),
                    "answer": encrypt_secret(sq.answer.strip()) if sq.answer else None,
                    "is_encrypted": True
                })
        email.encrypted_security_questions = json.dumps(stored_sq)

    await log_audit_event(
        db, action="update", entity_type="email", entity_id=email.id, entity_name=email.address,
        details="Actualización atómica de cuenta de correo"
    )
    await db.commit()
    await db.refresh(email)

    return await _build_email_response(email, db=db, is_unlocked=True)

@router.delete("/{email_id}")
async def delete_email_soft(
    email_id: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(EmailAccount).where(EmailAccount.id == email_id, EmailAccount.is_deleted == False)
    email = (await db.execute(stmt)).scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=404, detail="Cuenta de correo no encontrada.")

    # Soft delete
    email.is_deleted = True
    email.deleted_at = utc_now()
    await log_audit_event(
        db, action="delete", entity_type="email", entity_id=email.id, entity_name=email.address,
        details="Cuenta enviada a la papelera (Soft delete)"
    )
    await db.commit()
    return {"message": f"Cuenta {email.address} enviada a la papelera con éxito."}
