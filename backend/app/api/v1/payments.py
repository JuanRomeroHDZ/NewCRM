from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import PaymentMethod, PlatformAccount
from app.schemas import PaymentMethodCreate, PaymentMethodUpdate, PaymentMethodResponse
from app.security.crypto import encrypt_secret, decrypt_secret
from app.security.tokens import verify_vault_token, require_vault_unlocked
from app.services.audit import log_audit_event

router = APIRouter(prefix="/payments", tags=["payments"])

@router.get("", response_model=list[PaymentMethodResponse])
async def list_payment_methods(
    x_vault_token: str | None = Header(None),
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

    is_unlocked = verify_vault_token(x_vault_token)

    output = []
    for m in methods:
        plain_card = decrypt_secret(m.encrypted_card_number) if (is_unlocked and m.encrypted_card_number) else None
        plain_cvv = decrypt_secret(m.encrypted_cvv) if (is_unlocked and m.encrypted_cvv) else None

        output.append(PaymentMethodResponse(
            id=m.id,
            issuer=m.issuer,
            alias=m.alias,
            last_four=m.last_four,
            expiry_month=m.expiry_month,
            expiry_year=m.expiry_year,
            billing_notes=m.billing_notes,
            card_number_masked=f"•••• •••• •••• {m.last_four}",
            card_number_plain=plain_card,
            cvv_plain=plain_cvv,
            linked_subscriptions_count=counts.get(m.id, 0),
            is_deleted=m.is_deleted,
            created_at=m.created_at,
            updated_at=m.updated_at
        ))

    return output

@router.post("", response_model=PaymentMethodResponse)
async def create_payment_method(
    payload: PaymentMethodCreate,
    _auth: bool = Depends(require_vault_unlocked),
    db: AsyncSession = Depends(get_db)
):
    enc_card = encrypt_secret(payload.card_number) if payload.card_number else None
    enc_cvv = encrypt_secret(payload.cvv) if payload.cvv else None

    method = PaymentMethod(
        issuer=payload.issuer,
        alias=payload.alias,
        last_four=payload.last_four,
        encrypted_card_number=enc_card,
        expiry_month=payload.expiry_month,
        expiry_year=payload.expiry_year,
        encrypted_cvv=enc_cvv,
        billing_notes=payload.billing_notes
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
        expiry_month=method.expiry_month,
        expiry_year=method.expiry_year,
        billing_notes=method.billing_notes,
        card_number_masked=f"•••• •••• •••• {method.last_four}",
        card_number_plain=payload.card_number,
        cvv_plain=payload.cvv,
        linked_subscriptions_count=0,
        is_deleted=False,
        created_at=method.created_at,
        updated_at=method.updated_at
    )

@router.delete("/{payment_id}")
async def delete_payment_method(
    payment_id: str,
    _auth: bool = Depends(require_vault_unlocked),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PaymentMethod).where(PaymentMethod.id == payment_id, PaymentMethod.is_deleted == False)
    method = (await db.execute(stmt)).scalar_one_or_none()
    if not method:
        raise HTTPException(status_code=404, detail="Método de pago no encontrado.")

    method.is_deleted = True
    await log_audit_event(
        db, action="delete", entity_type="payment_method", entity_id=method.id, entity_name=method.alias,
        details="Método de pago enviado a la papelera (Soft delete)"
    )
    await db.commit()
    return {"message": "Método de pago eliminado con éxito."}
