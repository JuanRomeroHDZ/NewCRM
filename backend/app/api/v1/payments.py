from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import PaymentMethod, PlatformAccount, utc_now
from app.schemas import PaymentMethodCreate, PaymentMethodUpdate, PaymentMethodResponse
from app.security.crypto import encrypt_secret, decrypt_secret, encrypt_note, decrypt_note
from app.security.tokens import require_vault_unlocked
from app.services.audit import log_audit_event

# All payment method routes strictly require an unlocked Level 2 vault session
router = APIRouter(prefix="/payments", tags=["payments"], dependencies=[Depends(require_vault_unlocked)])

@router.get("", response_model=list[PaymentMethodResponse])
async def list_payment_methods(
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PaymentMethod).where(PaymentMethod.is_deleted == False).order_by(PaymentMethod.alias.asc())
    res = await db.execute(stmt)
    methods = res.scalars().all()

    # Count subscriptions per payment method
    count_stmt = select(PlatformAccount.payment_method_id, func.count(PlatformAccount.id)).where(
        PlatformAccount.is_deleted == False,
        PlatformAccount.payment_method_id.is_not(None)
    ).group_by(PlatformAccount.payment_method_id)
    count_res = await db.execute(count_stmt)
    counts = dict(count_res.all())

    output = []
    for m in methods:
        plain_card = decrypt_secret(m.encrypted_card_number) if m.encrypted_card_number else None

        output.append(PaymentMethodResponse(
            id=m.id,
            issuer=m.issuer,
            alias=m.alias,
            last_four=m.last_four,
            scope=getattr(m, "scope", "business") or "business",
            expiry_month=m.expiry_month,
            expiry_year=m.expiry_year,
            billing_notes=decrypt_note(m.billing_notes),
            card_number_masked=f"•••• •••• •••• {m.last_four}",
            card_number_plain=plain_card,
            linked_subscriptions_count=counts.get(m.id, 0),
            is_deleted=m.is_deleted,
            created_at=m.created_at,
            updated_at=m.updated_at
        ))

    return output

@router.post("", response_model=PaymentMethodResponse)
async def create_payment_method(
    payload: PaymentMethodCreate,
    db: AsyncSession = Depends(get_db)
):
    enc_card = encrypt_secret(payload.card_number) if payload.card_number else None

    method = PaymentMethod(
        issuer=payload.issuer,
        alias=payload.alias.strip(),
        last_four=payload.last_four.strip(),
        scope=payload.scope or "business",
        encrypted_card_number=enc_card,
        expiry_month=payload.expiry_month,
        expiry_year=payload.expiry_year,
        billing_notes=encrypt_note(payload.billing_notes)
    )
    db.add(method)
    await db.flush()

    await log_audit_event(
        db, action="create", entity_type="payment_method", entity_id=method.id, entity_name=method.alias,
        details=f"Método de pago {method.issuer} (*{method.last_four}) añadido"
    )
    await db.commit()
    await db.refresh(method)

    return PaymentMethodResponse(
        id=method.id,
        issuer=method.issuer,
        alias=method.alias,
        last_four=method.last_four,
        scope=getattr(method, "scope", "business") or "business",
        expiry_month=method.expiry_month,
        expiry_year=method.expiry_year,
        billing_notes=decrypt_note(method.billing_notes),
        card_number_masked=f"•••• •••• •••• {method.last_four}",
        card_number_plain=payload.card_number,
        linked_subscriptions_count=0,
        is_deleted=False,
        created_at=method.created_at,
        updated_at=method.updated_at
    )

@router.put("/{payment_id}", response_model=PaymentMethodResponse)
async def update_payment_method(
    payment_id: str,
    payload: PaymentMethodUpdate,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PaymentMethod).where(PaymentMethod.id == payment_id, PaymentMethod.is_deleted == False)
    method = (await db.execute(stmt)).scalar_one_or_none()
    if not method:
        raise HTTPException(status_code=404, detail="Método de pago no encontrado.")

    if payload.issuer is not None:
        method.issuer = payload.issuer
    if payload.alias is not None:
        method.alias = payload.alias.strip()
    if payload.last_four is not None:
        method.last_four = payload.last_four.strip()
    if payload.scope is not None:
        method.scope = payload.scope
    if payload.expiry_month is not None:
        method.expiry_month = payload.expiry_month
    if payload.expiry_year is not None:
        method.expiry_year = payload.expiry_year
    if payload.billing_notes is not None:
        method.billing_notes = encrypt_note(payload.billing_notes)
    if payload.card_number is not None and payload.card_number != "":
        method.encrypted_card_number = encrypt_secret(payload.card_number)

    await log_audit_event(
        db, action="update", entity_type="payment_method", entity_id=method.id, entity_name=method.alias,
        details=f"Método de pago {method.issuer} (*{method.last_four}) actualizado"
    )
    await db.commit()
    await db.refresh(method)

    count_stmt = select(func.count(PlatformAccount.id)).where(
        PlatformAccount.is_deleted == False,
        PlatformAccount.payment_method_id == method.id
    )
    linked_count = (await db.execute(count_stmt)).scalar() or 0

    plain_card = decrypt_secret(method.encrypted_card_number) if method.encrypted_card_number else None

    return PaymentMethodResponse(
        id=method.id,
        issuer=method.issuer,
        alias=method.alias,
        last_four=method.last_four,
        scope=getattr(method, "scope", "business") or "business",
        expiry_month=method.expiry_month,
        expiry_year=method.expiry_year,
        billing_notes=decrypt_note(method.billing_notes),
        card_number_masked=f"•••• •••• •••• {method.last_four}",
        card_number_plain=plain_card,
        linked_subscriptions_count=linked_count,
        is_deleted=method.is_deleted,
        created_at=method.created_at,
        updated_at=method.updated_at
    )

@router.delete("/{payment_id}")
async def delete_payment_method(
    payment_id: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PaymentMethod).where(PaymentMethod.id == payment_id, PaymentMethod.is_deleted == False)
    method = (await db.execute(stmt)).scalar_one_or_none()
    if not method:
        raise HTTPException(status_code=404, detail="Método de pago no encontrado.")

    method.is_deleted = True
    method.deleted_at = utc_now()
    await log_audit_event(
        db, action="delete", entity_type="payment_method", entity_id=method.id, entity_name=method.alias,
        details="Método de pago enviado a la papelera (Soft delete)"
    )
    await db.commit()
    return {"message": "Método de pago eliminado con éxito."}
