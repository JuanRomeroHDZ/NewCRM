from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.database import get_db
from app.services.core_auth import get_current_user_from_token
from app.models.core import User
from app.models.crm_sales import Client, Proposal, Sale, PaymentInstallment, PaymentRecord, Invoice
from app.services.crm_sales import CrmSalesService

router = APIRouter(prefix="/crm", tags=["CRM Sales & Operations"])

class CadenceRequest(BaseModel):
    channel: str = Field(..., min_length=2, max_length=32)

class ResponseRequest(BaseModel):
    channel: str = Field(..., min_length=2, max_length=32)
    summary: str = Field(..., min_length=2, max_length=500)
    next_action: str | None = None

class ProposalCreate(BaseModel):
    prospect_id: str | None = None
    title: str = Field(..., min_length=2, max_length=180)
    service_type: str = Field("proyecto_unico", max_length=64)
    amount: float = Field(..., ge=0)
    currency: str = Field("MXN", pattern="^(MXN|USD)$")
    content_text: str | None = None
    expires_days: int = Field(15, ge=1, le=90)

class SaleCloseRequest(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=180)
    title: str = Field(..., min_length=2, max_length=180)
    total_amount: float = Field(..., gt=0)
    prospect_id: str | None = None
    proposal_id: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    phone: str | None = None
    tax_rfc: str | None = None
    fiscal_name: str | None = None
    cfdi_usage: str | None = "G03"
    service_type: str = "proyecto_unico"
    tax_amount: float = 0.0
    discount_amount: float = 0.0
    advance_payment: float = 0.0
    currency: str = "MXN"

class PaymentReverseRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=255)

class InvoiceRecordRequest(BaseModel):
    client_id: str
    folio: str = Field(..., min_length=1, max_length=64)
    uuid: str = Field(..., min_length=10, max_length=64)
    rfc: str = Field(..., min_length=10, max_length=32)
    amount: float = Field(..., gt=0)
    issue_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    sale_id: str | None = None
    cfdi_usage: str = "G03"
    currency: str = "MXN"
    service_ref: str | None = None

class InvoiceCancelRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=255)

# Prospect Cadence & Response
@router.post("/prospects/{prospect_id}/cadence")
async def advance_cadence(
    prospect_id: str,
    req: CadenceRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    try:
        p = await CrmSalesService.advance_prospect_cadence(
            session=db,
            prospect_id=prospect_id,
            channel=req.channel,
            user_id=current_user.id
        )
        return {
            "id": p.id,
            "status": p.status,
            "followup_count": p.followup_count,
            "last_contacted_at": p.last_contacted_at.isoformat() if p.last_contacted_at else None
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/prospects/{prospect_id}/response")
async def record_response(
    prospect_id: str,
    req: ResponseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    try:
        p = await CrmSalesService.record_prospect_response(
            session=db,
            prospect_id=prospect_id,
            channel=req.channel,
            summary=req.summary,
            next_action=req.next_action,
            user_id=current_user.id
        )
        return {
            "id": p.id,
            "status": p.status,
            "responded_at": p.responded_at.isoformat() if p.responded_at else None,
            "notes": p.notes
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# Proposals
@router.get("/proposals")
async def list_proposals(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    stmt = select(Proposal).order_by(desc(Proposal.created_at))
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/proposals")
async def create_proposal(
    req: ProposalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    prop = await CrmSalesService.create_proposal(
        session=db,
        prospect_id=req.prospect_id,
        title=req.title,
        service_type=req.service_type,
        amount=req.amount,
        currency=req.currency,
        content_text=req.content_text,
        expires_days=req.expires_days
    )
    return prop

@router.post("/proposals/{proposal_id}/viewed")
async def mark_proposal_viewed(
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    try:
        prop = await CrmSalesService.mark_proposal_viewed(
            session=db,
            proposal_id=proposal_id,
            user_id=current_user.id
        )
        return {"id": prop.id, "folio": prop.folio, "is_viewed_by_user": prop.is_viewed_by_user}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# Clients
@router.get("/clients")
async def list_clients(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    stmt = select(Client).order_by(desc(Client.created_at))
    res = await db.execute(stmt)
    return res.scalars().all()

# Sales
@router.get("/sales")
async def list_sales(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    stmt = select(Sale).order_by(desc(Sale.created_at))
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/sales/close")
async def close_sale(
    req: SaleCloseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    try:
        sale, client, installments = await CrmSalesService.close_sale_atomic(
            session=db,
            user_id=current_user.id,
            company_name=req.company_name,
            title=req.title,
            total_amount=req.total_amount,
            prospect_id=req.prospect_id,
            proposal_id=req.proposal_id,
            contact_name=req.contact_name,
            contact_email=req.contact_email,
            phone=req.phone,
            tax_rfc=req.tax_rfc,
            fiscal_name=req.fiscal_name,
            cfdi_usage=req.cfdi_usage,
            service_type=req.service_type,
            tax_amount=req.tax_amount,
            discount_amount=req.discount_amount,
            advance_payment=req.advance_payment,
            currency=req.currency
        )
        return {
            "sale_id": sale.id,
            "folio": sale.folio,
            "client_id": client.id,
            "total_amount": sale.total_amount,
            "balance_amount": sale.balance_amount,
            "installments_count": len(installments)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Payments
@router.post("/payments/{payment_id}/reverse")
async def reverse_payment(
    payment_id: str,
    req: PaymentReverseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    try:
        pay = await CrmSalesService.reverse_payment(
            session=db,
            payment_id=payment_id,
            reason=req.reason,
            user_id=current_user.id
        )
        return {
            "id": pay.id,
            "is_reversed": pay.is_reversed,
            "reversal_reason": pay.reversal_reason,
            "reversed_at": pay.reversed_at.isoformat() if pay.reversed_at else None
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# Invoices
@router.get("/invoices")
async def list_invoices(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    stmt = select(Invoice).order_by(desc(Invoice.created_at))
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/invoices")
async def record_invoice(
    req: InvoiceRecordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    inv = await CrmSalesService.record_invoice(
        session=db,
        sale_id=req.sale_id,
        client_id=req.client_id,
        folio=req.folio,
        uuid=req.uuid,
        rfc=req.rfc,
        amount=req.amount,
        issue_date=req.issue_date,
        cfdi_usage=req.cfdi_usage,
        currency=req.currency,
        service_ref=req.service_ref
    )
    return inv

@router.post("/invoices/{invoice_id}/cancel")
async def cancel_invoice(
    invoice_id: str,
    req: InvoiceCancelRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    try:
        inv = await CrmSalesService.cancel_invoice(
            session=db,
            invoice_id=invoice_id,
            reason=req.reason,
            user_id=current_user.id
        )
        return {
            "id": inv.id,
            "folio": inv.folio,
            "status": inv.status,
            "cancellation_reason": inv.cancellation_reason,
            "cancelled_at": inv.cancelled_at.isoformat() if inv.cancelled_at else None
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
