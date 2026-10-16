from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import EmailAccount, PlatformAccount, PaymentMethod, AuditLog, PasswordHistory, Prospect
from app.security.tokens import require_vault_unlocked
from app.services.audit import log_audit_event

router = APIRouter(prefix="/trash", tags=["trash"], dependencies=[Depends(require_vault_unlocked)])

@router.get("")
async def list_trash(db: AsyncSession = Depends(get_db)):
    """Lists all soft-deleted items across emails, platforms, prospects, and payment methods."""
    # Emails
    e_stmt = select(EmailAccount).where(EmailAccount.is_deleted == True).order_by(EmailAccount.updated_at.desc())
    emails = (await db.execute(e_stmt)).scalars().all()

    # Platforms
    p_stmt = select(PlatformAccount).where(PlatformAccount.is_deleted == True).order_by(PlatformAccount.updated_at.desc())
    platforms = (await db.execute(p_stmt)).scalars().all()

    # Prospects
    pr_stmt = select(Prospect).where(Prospect.is_deleted == True).order_by(Prospect.updated_at.desc())
    prospects = (await db.execute(pr_stmt)).scalars().all()

    # Payments
    pay_stmt = select(PaymentMethod).where(PaymentMethod.is_deleted == True).order_by(PaymentMethod.updated_at.desc())
    payments = (await db.execute(pay_stmt)).scalars().all()

    items = []
    for e in emails:
        items.append({
            "id": e.id,
            "type": "email",
            "title": e.address,
            "subtitle": f"Proveedor: {e.provider}",
            "deleted_at": e.updated_at
        })
    for p in platforms:
        items.append({
            "id": p.id,
            "type": "platform",
            "title": p.name,
            "subtitle": f"Usuario: {p.username or 'N/A'}",
            "deleted_at": p.updated_at
        })
    for pr in prospects:
        items.append({
            "id": pr.id,
            "type": "prospect",
            "title": pr.company_name,
            "subtitle": f"Prospecto / Demo • Estado: {pr.status}",
            "deleted_at": pr.updated_at
        })
    for pay in payments:
        items.append({
            "id": pay.id,
            "type": "payment",
            "title": pay.alias,
            "subtitle": f"{pay.issuer} (*{pay.last_four})",
            "deleted_at": pay.updated_at
        })

    return items

@router.post("/restore/{item_type}/{item_id}")
async def restore_item(item_type: str, item_id: str, db: AsyncSession = Depends(get_db)):
    """Atomics restore of a soft-deleted item."""
    name = ""
    if item_type == "email":
        stmt = select(EmailAccount).where(EmailAccount.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item or not item.is_deleted:
            raise HTTPException(status_code=404, detail="Elemento no encontrado en papelera.")
        item.is_deleted = False
        name = item.address

    elif item_type == "platform":
        stmt = select(PlatformAccount).where(PlatformAccount.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item or not item.is_deleted:
            raise HTTPException(status_code=404, detail="Elemento no encontrado en papelera.")
        item.is_deleted = False
        name = item.name

    elif item_type == "prospect":
        stmt = select(Prospect).where(Prospect.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item or not item.is_deleted:
            raise HTTPException(status_code=404, detail="Elemento no encontrado en papelera.")
        item.is_deleted = False
        name = item.company_name

    elif item_type == "payment":
        stmt = select(PaymentMethod).where(PaymentMethod.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item or not item.is_deleted:
            raise HTTPException(status_code=404, detail="Elemento no encontrado en papelera.")
        item.is_deleted = False
        name = item.alias
    else:
        raise HTTPException(status_code=400, detail="Tipo de elemento inválido.")

    await log_audit_event(
        db, action="restore", entity_type=item_type, entity_id=item_id, entity_name=name,
        details=f"Restauración atómica desde la papelera de {name}"
    )
    await db.commit()
    return {"message": f"{name} restaurado con éxito."}

@router.delete("/purge/{item_type}/{item_id}")
async def purge_item_permanent(item_type: str, item_id: str, db: AsyncSession = Depends(get_db)):
    """Permanently purges an item from the database."""
    name = ""
    if item_type == "email":
        stmt = select(EmailAccount).where(EmailAccount.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Elemento no encontrado.")
        name = item.address
        await db.execute(delete(PasswordHistory).where(PasswordHistory.target_id == item_id))
        await db.delete(item)

    elif item_type == "platform":
        stmt = select(PlatformAccount).where(PlatformAccount.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Elemento no encontrado.")
        name = item.name
        await db.execute(delete(PasswordHistory).where(PasswordHistory.target_id == item_id))
        await db.delete(item)

    elif item_type == "prospect":
        stmt = select(Prospect).where(Prospect.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Elemento no encontrado.")
        name = item.company_name
        await db.delete(item)

    elif item_type == "payment":
        stmt = select(PaymentMethod).where(PaymentMethod.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Elemento no encontrado.")
        name = item.alias
        await db.delete(item)
    else:
        raise HTTPException(status_code=400, detail="Tipo de elemento inválido.")

    await log_audit_event(
        db, action="purge", entity_type=item_type, entity_id=item_id, entity_name=name,
        details=f"Purga permanente e irreversible de {name}"
    )
    await db.commit()
    return {"message": f"{name} purgado permanentemente."}

@router.get("/audit")
async def list_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves immutable audit logs."""
    stmt = select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit)
    res = await db.execute(stmt)
    logs = res.scalars().all()
    return [
        {
            "id": l.id,
            "timestamp": l.timestamp,
            "action": l.action,
            "entity_type": l.entity_type,
            "entity_id": l.entity_id,
            "entity_name": l.entity_name,
            "details": l.details,
            "ip_address": l.ip_address
        }
        for l in logs
    ]
