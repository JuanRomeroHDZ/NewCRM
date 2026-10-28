from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import (
    EmailAccount, PlatformAccount, PaymentMethod, AuditLog,
    PasswordHistory, Prospect, UserSettings, ClientIncome, DomainRenewal,
    OneTimeExpense, InternalProject, SecureResource
)
from app.security.tokens import require_vault_unlocked
from app.services.audit import log_audit_event

router = APIRouter(prefix="/trash", tags=["trash"], dependencies=[Depends(require_vault_unlocked)])

def _get_deleted_dt(item, now_naive: datetime) -> datetime:
    dt = getattr(item, "deleted_at", None) or getattr(item, "updated_at", None) or now_naive
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt

@router.get("")
async def list_trash(db: AsyncSession = Depends(get_db)):
    """Lists all soft-deleted items across emails, platforms, prospects, payments, incomes, renewals, expenses, projects, and resources."""
    s_row = (await db.execute(select(UserSettings).limit(1))).scalar_one_or_none()
    retention_days = int(getattr(s_row, "trash_retention_days", 0) or 0) if s_row else 0
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)

    # Emails
    e_stmt = select(EmailAccount).where(EmailAccount.is_deleted == True).order_by(EmailAccount.updated_at.desc())
    emails = list((await db.execute(e_stmt)).scalars().all())

    # Platforms
    p_stmt = select(PlatformAccount).where(PlatformAccount.is_deleted == True).order_by(PlatformAccount.updated_at.desc())
    platforms = list((await db.execute(p_stmt)).scalars().all())

    # Prospects
    pr_stmt = select(Prospect).where(Prospect.is_deleted == True).order_by(Prospect.updated_at.desc())
    prospects = list((await db.execute(pr_stmt)).scalars().all())

    # Payments
    pay_stmt = select(PaymentMethod).where(PaymentMethod.is_deleted == True).order_by(PaymentMethod.updated_at.desc())
    payments = list((await db.execute(pay_stmt)).scalars().all())

    # Client Incomes
    inc_stmt = select(ClientIncome).where(ClientIncome.is_deleted == True).order_by(ClientIncome.updated_at.desc())
    incomes = list((await db.execute(inc_stmt)).scalars().all())

    # Domain Renewals
    ren_stmt = select(DomainRenewal).where(DomainRenewal.is_deleted == True).order_by(DomainRenewal.updated_at.desc())
    renewals = list((await db.execute(ren_stmt)).scalars().all())

    # One-Time Expenses
    exp_stmt = select(OneTimeExpense).where(OneTimeExpense.is_deleted == True).order_by(OneTimeExpense.updated_at.desc())
    expenses = list((await db.execute(exp_stmt)).scalars().all())

    # Internal Projects
    proj_stmt = select(InternalProject).where(InternalProject.is_deleted == True).order_by(InternalProject.updated_at.desc())
    projects = list((await db.execute(proj_stmt)).scalars().all())

    # Secure Resources
    res_stmt = select(SecureResource).where(SecureResource.is_deleted == True).order_by(SecureResource.updated_at.desc())
    resources = list((await db.execute(res_stmt)).scalars().all())

    # Optional Auto-Purge check when retention_days > 0 (filtered from view, actual purge triggered via explicit maintenance)
    if retention_days > 0:
        platforms = [p for p in platforms if (now_naive - _get_deleted_dt(p, now_naive)).days < retention_days]
        prospects = [pr for pr in prospects if (now_naive - _get_deleted_dt(pr, now_naive)).days < retention_days]

    def _build_item(item_id: str, item_type: str, title: str, subtitle: str, raw_obj):
        dt = _get_deleted_dt(raw_obj, now_naive)
        elapsed_days = max(0, (now_naive - dt).days)
        days_until_purge = max(0, retention_days - elapsed_days) if retention_days > 0 else None
        return {
            "id": item_id,
            "type": item_type,
            "title": title,
            "subtitle": subtitle,
            "deleted_at": dt.isoformat() + "Z",
            "elapsed_days": elapsed_days,
            "retention_policy_days": retention_days,
            "days_until_purge": days_until_purge
        }

    items = []
    for e in emails:
        items.append(_build_item(e.id, "email", e.address, f"Proveedor: {e.provider}", e))
    for p in platforms:
        items.append(_build_item(p.id, "platform", p.name, f"Usuario: {p.username or 'N/A'}", p))
    for pr in prospects:
        items.append(_build_item(pr.id, "prospect", pr.company_name, f"Prospecto / Demo • Estado: {pr.status}", pr))
    for pay in payments:
        items.append(_build_item(pay.id, "payment", pay.alias, f"{pay.issuer} (*{pay.last_four})", pay))
    for inc in incomes:
        items.append(_build_item(inc.id, "income", f"{inc.client_name} - {inc.concept}", f"Pago recibido: ${inc.amount:.2f} {inc.currency}", inc))
    for ren in renewals:
        items.append(_build_item(ren.id, "renewal", ren.domain_or_service, f"Cliente: {ren.client_name} • Vence: {ren.renewal_date}", ren))
    for exp in expenses:
        items.append(_build_item(exp.id, "expense", exp.concept, f"Gasto único: ${exp.amount:.2f} {exp.currency} ({exp.category})", exp))
    for proj in projects:
        items.append(_build_item(proj.id, "project", proj.name, f"Proyecto propio • {proj.status}", proj))
    for res in resources:
        items.append(_build_item(res.id, "resource", res.title, f"Recurso seguro • {res.resource_type}", res))

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
        item.deleted_at = None
        name = item.address

    elif item_type == "platform":
        stmt = select(PlatformAccount).where(PlatformAccount.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item or not item.is_deleted:
            raise HTTPException(status_code=404, detail="Elemento no encontrado en papelera.")
        item.is_deleted = False
        item.deleted_at = None
        name = item.name

    elif item_type == "prospect":
        stmt = select(Prospect).where(Prospect.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item or not item.is_deleted:
            raise HTTPException(status_code=404, detail="Elemento no encontrado en papelera.")
        item.is_deleted = False
        item.deleted_at = None
        name = item.company_name

    elif item_type == "payment":
        stmt = select(PaymentMethod).where(PaymentMethod.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item or not item.is_deleted:
            raise HTTPException(status_code=404, detail="Elemento no encontrado en papelera.")
        item.is_deleted = False
        item.deleted_at = None
        name = item.alias

    elif item_type == "income":
        stmt = select(ClientIncome).where(ClientIncome.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item or not item.is_deleted:
            raise HTTPException(status_code=404, detail="Elemento no encontrado en papelera.")
        item.is_deleted = False
        item.deleted_at = None
        name = f"{item.client_name} - {item.concept}"

    elif item_type == "renewal":
        stmt = select(DomainRenewal).where(DomainRenewal.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item or not item.is_deleted:
            raise HTTPException(status_code=404, detail="Elemento no encontrado en papelera.")
        item.is_deleted = False
        item.deleted_at = None
        name = item.domain_or_service

    elif item_type == "expense":
        stmt = select(OneTimeExpense).where(OneTimeExpense.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item or not item.is_deleted:
            raise HTTPException(status_code=404, detail="Elemento no encontrado en papelera.")
        item.is_deleted = False
        item.deleted_at = None
        name = item.concept

    elif item_type == "project":
        stmt = select(InternalProject).where(InternalProject.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item or not item.is_deleted:
            raise HTTPException(status_code=404, detail="Elemento no encontrado en papelera.")
        item.is_deleted = False
        item.deleted_at = None
        name = item.name

    elif item_type == "resource":
        stmt = select(SecureResource).where(SecureResource.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item or not item.is_deleted:
            raise HTTPException(status_code=404, detail="Elemento no encontrado en papelera.")
        item.is_deleted = False
        item.deleted_at = None
        name = item.title
    else:
        raise HTTPException(status_code=400, detail="Tipo de elemento inválido.")

    await log_audit_event(
        db, action="restore", entity_type=item_type, entity_id=item_id, entity_name=name,
        details=f"Restauración desde la papelera de {name}"
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

    elif item_type == "income":
        stmt = select(ClientIncome).where(ClientIncome.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Elemento no encontrado.")
        name = f"{item.client_name} - {item.concept}"
        await db.delete(item)

    elif item_type == "renewal":
        stmt = select(DomainRenewal).where(DomainRenewal.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Elemento no encontrado.")
        name = item.domain_or_service
        await db.delete(item)

    elif item_type == "expense":
        stmt = select(OneTimeExpense).where(OneTimeExpense.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Elemento no encontrado.")
        name = item.concept
        await db.delete(item)

    elif item_type == "project":
        stmt = select(InternalProject).where(InternalProject.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Elemento no encontrado.")
        name = item.name
        await db.delete(item)

    elif item_type == "resource":
        stmt = select(SecureResource).where(SecureResource.id == item_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Elemento no encontrado.")
        name = item.title
        await db.delete(item)
    else:
        raise HTTPException(status_code=400, detail="Tipo de elemento inválido.")

    await log_audit_event(
        db, action="purge", entity_type=item_type, entity_id=item_id, entity_name=name,
        details=f"Eliminación permanente de {name}"
    )
    await db.commit()
    return {"message": f"{name} eliminado permanentemente."}

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
