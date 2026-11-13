from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.database import get_db
from app.services.core_auth import get_current_user_from_token, require_role
from app.models.core import User
from app.models import Prospect
from app.models.crm_sales import Client, Proposal, Sale, PaymentInstallment, PaymentRecord, Invoice
from app.services.crm_sales import CrmSalesService, SaleAlreadyClosedError

router = APIRouter(prefix="/crm", tags=["CRM Sales & Operations"])

from pydantic import field_validator, model_validator
from app.schemas.validators import (
    validate_calendar_date,
    validate_rfc_input,
    validate_single_phone,
)
from app.schemas import SupportedCurrency, validate_email_input, validate_nonblank_input


class CadenceRequest(BaseModel):
    channel: str = Field(..., pattern="^(whatsapp|email|call|linkedin|in_person|other)$")

class ResponseRequest(BaseModel):
    channel: str = Field(..., pattern="^(whatsapp|email|call|linkedin|in_person|other)$")
    summary: str = Field(..., min_length=2, max_length=500)
    next_action: str | None = Field(default=None, max_length=500)

    _valid_summary = field_validator("summary")(validate_nonblank_input)

class ProposalCreate(BaseModel):
    prospect_id: str | None = Field(default=None, max_length=36)
    title: str = Field(..., min_length=2, max_length=180)
    service_type: str = Field("proyecto_unico", pattern="^(proyecto_unico|mensualidad|mantenimiento|pentesting)$")
    amount: float = Field(..., ge=0, le=100000000, allow_inf_nan=False)
    currency: SupportedCurrency = "MXN"
    content_text: str | None = Field(default=None, max_length=20000)
    expires_days: int = Field(15, ge=1, le=90)

    _valid_title = field_validator("title")(validate_nonblank_input)

class SaleCloseRequest(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=180)
    title: str = Field(..., min_length=2, max_length=180)
    total_amount: float = Field(..., gt=0, le=100000000, allow_inf_nan=False)
    prospect_id: str | None = Field(default=None, max_length=36)
    proposal_id: str | None = Field(default=None, max_length=36)
    contact_name: str | None = Field(default=None, max_length=128)
    contact_email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    tax_rfc: str | None = Field(default=None, max_length=32)
    fiscal_name: str | None = Field(default=None, max_length=180)
    cfdi_usage: str | None = Field(default="G03", max_length=32)
    service_type: str = Field("proyecto_unico", pattern="^(proyecto_unico|mensualidad|mantenimiento|pentesting)$")
    tax_amount: float = Field(0.0, ge=0, le=100000000, allow_inf_nan=False)
    discount_amount: float = Field(0.0, ge=0, le=100000000, allow_inf_nan=False)
    advance_payment: float = Field(0.0, ge=0, le=100000000, allow_inf_nan=False)
    currency: SupportedCurrency = "MXN"

    _valid_names = field_validator("company_name", "title")(validate_nonblank_input)
    _valid_email = field_validator("contact_email")(validate_email_input)
    _valid_phone = field_validator("phone")(validate_single_phone)
    _valid_rfc = field_validator("tax_rfc")(validate_rfc_input)

    @model_validator(mode="after")
    def check_sale_amounts(self):
        if self.discount_amount > self.total_amount:
            raise ValueError("El descuento no puede exceder el monto total.")
        net_total = self.total_amount - self.discount_amount + self.tax_amount
        if self.advance_payment > net_total + 1e-6:
            raise ValueError("El anticipo no puede exceder el total neto de la venta.")
        return self

class PaymentReverseRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=255)

    _valid_reason = field_validator("reason")(validate_nonblank_input)

class InvoiceRecordRequest(BaseModel):
    client_id: str = Field(..., min_length=1, max_length=36)
    folio: str = Field(..., min_length=1, max_length=64)
    uuid: str = Field(..., pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    rfc: str = Field(..., min_length=12, max_length=13)
    amount: float = Field(..., gt=0, le=100000000, allow_inf_nan=False)
    issue_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    sale_id: str | None = Field(default=None, max_length=36)
    cfdi_usage: str = Field("G03", min_length=2, max_length=32)
    currency: SupportedCurrency = "MXN"
    service_ref: str | None = Field(default=None, max_length=180)

    _valid_folio = field_validator("folio")(validate_nonblank_input)
    _valid_rfc = field_validator("rfc")(validate_rfc_input)
    _valid_date = field_validator("issue_date")(validate_calendar_date)

class InvoiceCancelRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=255)

    _valid_reason = field_validator("reason")(validate_nonblank_input)

# Prospect Cadence & Response
@router.post("/prospects/{prospect_id}/cadence")
async def advance_cadence(
    prospect_id: str,
    req: CadenceRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin", "seller", "operator"]))
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
    current_user: User = Depends(require_role(["owner", "business_admin", "seller", "operator"]))
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
    current_user: User = Depends(require_role(["owner", "business_admin", "seller", "operator"]))
):
    if req.prospect_id:
        prospect = await db.get(Prospect, req.prospect_id)
        if not prospect:
            raise HTTPException(status_code=404, detail="Prospecto no encontrado.")
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
    current_user: User = Depends(require_role(["owner", "business_admin", "seller", "operator"]))
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
    current_user: User = Depends(require_role(["owner", "business_admin", "seller", "operator"]))
):
    if req.prospect_id and not await db.get(Prospect, req.prospect_id):
        raise HTTPException(status_code=404, detail="Prospecto no encontrado.")
    if req.proposal_id and not await db.get(Proposal, req.proposal_id):
        raise HTTPException(status_code=404, detail="Propuesta no encontrada.")
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
    except SaleAlreadyClosedError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Payments
@router.post("/payments/{payment_id}/reverse")
async def reverse_payment(
    payment_id: str,
    req: PaymentReverseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin"]))
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
    current_user: User = Depends(require_role(["owner", "business_admin"]))
):
    if not await db.get(Client, req.client_id):
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    if req.sale_id and not await db.get(Sale, req.sale_id):
        raise HTTPException(status_code=404, detail="Venta no encontrada.")
    normalized_uuid = req.uuid.strip().upper()
    existing_inv = (await db.execute(select(Invoice).where(Invoice.uuid == normalized_uuid))).scalar_one_or_none()
    if existing_inv:
        raise HTTPException(status_code=409, detail="Ya existe una factura registrada con este UUID fiscal.")
    inv = await CrmSalesService.record_invoice(
        session=db,
        sale_id=req.sale_id,
        client_id=req.client_id,
        folio=req.folio,
        uuid=normalized_uuid,
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
    current_user: User = Depends(require_role(["owner", "business_admin"]))
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
