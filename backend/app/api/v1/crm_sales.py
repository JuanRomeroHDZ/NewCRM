import logging
from hashlib import sha256
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.services.core_auth import ADMIN_ROLES, SALES_ROLES, require_role
from app.security.tokens import require_vault_unlocked
from app.models.core import ActivityEvent, User
from app.models import Prospect
from app.models.crm_sales import Client, Proposal, Sale, Invoice
from app.services.crm_sales import CrmSalesService, SaleAlreadyClosedError, proposal_status, utc_now
from app.services.proposal_pdf import proposal_pdf

from app.schemas.validators import (
    validate_calendar_date,
    validate_rfc_input,
    validate_single_phone,
)
from app.schemas import SupportedCurrency, validate_email_input, validate_nonblank_input

router = APIRouter(prefix="/crm", tags=["CRM Sales & Operations"], dependencies=[Depends(require_vault_unlocked)])
logger = logging.getLogger(__name__)
ProposalChannel = Literal["whatsapp", "email", "call", "in_person", "other"]


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

    @field_validator("amount")
    @classmethod
    def amount_in_cents(cls, amount: float) -> float:
        if amount != round(amount, 2):
            raise ValueError("Usa hasta dos decimales en el importe.")
        return amount


class ProposalDelivery(BaseModel):
    recipient: str = Field(min_length=2, max_length=255)
    channel: ProposalChannel
    _valid_recipient = field_validator("recipient")(validate_nonblank_input)


class ProposalDecision(BaseModel):
    decision: Literal["aceptada", "rechazada"]
    respondent: str = Field(min_length=2, max_length=255)
    channel: ProposalChannel
    evidence: str = Field(min_length=5, max_length=4000)
    _valid_evidence = field_validator("respondent", "evidence")(validate_nonblank_input)


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
    current_user: User = Depends(require_role(list(SALES_ROLES)))
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
    current_user: User = Depends(require_role(list(SALES_ROLES)))
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

@router.get("/prospects/{prospect_id}/commercial")
async def prospect_commercial_summary(
    prospect_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(list(SALES_ROLES))),
):
    prospect = await db.get(Prospect, prospect_id)
    if not prospect or prospect.is_deleted:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado.")
    proposals = (await db.scalars(
        select(Proposal).where(Proposal.prospect_id == prospect_id).order_by(desc(Proposal.created_at))
    )).all()
    sale = await db.scalar(
        select(Sale).where(Sale.prospect_id == prospect_id).order_by(desc(Sale.created_at)).limit(1)
    )
    invoices = []
    can_manage_invoices = user.role in ADMIN_ROLES
    if sale and can_manage_invoices:
        invoices = (await db.scalars(
            select(Invoice).where(Invoice.sale_id == sale.id).order_by(desc(Invoice.created_at))
        )).all()
    return {
        "proposals": [proposal_summary(proposal) for proposal in proposals],
        "sale": sale,
        "invoices": invoices,
        "can_manage_invoices": can_manage_invoices,
    }


# Proposals
def proposal_summary(proposal: Proposal) -> dict:
    data = {field: getattr(proposal, field) for field in (
        "id", "folio", "version", "prospect_id", "title", "amount", "currency",
        "service_type", "content_text", "is_viewed_by_user", "created_at", "updated_at",
        "issued_at", "sent_at", "sent_by", "send_channel", "sent_to", "responded_at",
        "responded_by", "respondent", "response_channel", "response_evidence", "expires_at",
    )}
    # All proposal timestamps are stored as UTC; make that explicit to clients.
    for field in ("created_at", "updated_at", "issued_at", "sent_at", "responded_at", "expires_at"):
        if data[field] is not None:
            data[field] = data[field].isoformat() + "Z"
    return {**data, "status": proposal_status(proposal)}


async def get_proposal(db: AsyncSession, proposal_id: str, *, lock: bool = False) -> Proposal:
    query = select(Proposal).where(Proposal.id == proposal_id)
    if lock:
        query = query.with_for_update()
    proposal = await db.scalar(query)
    if not proposal:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada.")
    return proposal


def proposal_event(db: AsyncSession, proposal: Proposal, user: User, summary: str) -> None:
    db.add(ActivityEvent(
        module="crm", action="update", entity_type="proposal", entity_id=proposal.id,
        user_id=user.id, user_name=user.username, summary=f"{proposal.folio}: {summary}",
    ))


def proposal_download(pdf: bytes, filename: str) -> Response:
    return Response(pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "private, no-store",
        "X-Export-SHA256": sha256(pdf).hexdigest(),
    })


async def compile_proposal(proposal: Proposal, **options) -> bytes:
    try:
        return await run_in_threadpool(proposal_pdf, proposal, **options)
    except (OSError, RuntimeError) as exc:
        logger.warning("Error al compilar el PDF comercial %s con Typst", proposal.id)
        raise HTTPException(status_code=503, detail="No se pudo generar el PDF de la propuesta.") from exc


@router.get("/proposals")
async def list_proposals(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(list(SALES_ROLES)))
):
    stmt = select(Proposal).order_by(desc(Proposal.created_at))
    res = await db.execute(stmt)
    return [proposal_summary(proposal) for proposal in res.scalars().all()]

@router.post("/proposals")
async def create_proposal(
    req: ProposalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(list(SALES_ROLES)))
):
    if req.prospect_id:
        prospect = await db.get(Prospect, req.prospect_id)
        if not prospect or prospect.is_deleted:
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
    return proposal_summary(prop)


@router.post("/proposals/{proposal_id}/pdf")
async def prepare_proposal_pdf(
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(list(SALES_ROLES))),
):
    proposal = await get_proposal(db, proposal_id, lock=True)
    await db.refresh(proposal, ["issued_pdf"])
    pdf = proposal.issued_pdf
    if pdf is None:
        if proposal_status(proposal) != "borrador":
            raise HTTPException(status_code=409, detail="Solo puedes preparar el PDF de un borrador vigente.")
        prospect = await db.get(Prospect, proposal.prospect_id) if proposal.prospect_id else None
        if prospect and prospect.is_deleted:
            raise HTTPException(status_code=409, detail="El prospecto vinculado está en la papelera.")
        proposal.issued_at = utc_now()
        pdf = await compile_proposal(proposal, recipient=prospect.company_name if prospect else "Sin destinatario asignado")
        proposal.issued_pdf = pdf
        proposal_event(db, proposal, user, "PDF de la propuesta preparado.")
        await db.commit()
    return proposal_download(pdf, f"{proposal.folio}.pdf")


@router.post("/proposals/{proposal_id}/send")
async def record_proposal_delivery(
    proposal_id: str,
    req: ProposalDelivery,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(list(SALES_ROLES))),
):
    proposal = await get_proposal(db, proposal_id, lock=True)
    if proposal_status(proposal) != "borrador" or not proposal.issued_at:
        raise HTTPException(status_code=409, detail="Prepara el PDF de un borrador vigente antes de registrar el envío.")
    proposal.status = "enviada"
    proposal.sent_at = utc_now()
    proposal.sent_by = user.username
    proposal.send_channel = req.channel
    proposal.sent_to = req.recipient
    proposal_event(db, proposal, user, "Envío externo registrado.")
    await db.commit()
    await db.refresh(proposal)
    return proposal_summary(proposal)


@router.post("/proposals/{proposal_id}/decision")
async def record_proposal_decision(
    proposal_id: str,
    req: ProposalDecision,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(list(SALES_ROLES))),
):
    proposal = await get_proposal(db, proposal_id, lock=True)
    if proposal_status(proposal) not in {"enviada", "en_revision"} or not proposal.sent_at:
        raise HTTPException(status_code=409, detail="La propuesta debe estar enviada y vigente para registrar una respuesta.")
    proposal.status = req.decision
    proposal.responded_at = utc_now()
    proposal.responded_by = user.username
    proposal.respondent = req.respondent
    proposal.response_channel = req.channel
    proposal.response_evidence = req.evidence
    summary = "Aceptación externa registrada." if req.decision == "aceptada" else "Rechazo externo registrado."
    proposal_event(db, proposal, user, summary)
    await db.commit()
    await db.refresh(proposal)
    return proposal_summary(proposal)


@router.get("/proposals/{proposal_id}/approval")
async def download_proposal_approval(
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(list(SALES_ROLES))),
):
    proposal = await get_proposal(db, proposal_id)
    await db.refresh(proposal, ["issued_pdf"])
    if proposal.status != "aceptada" or not (
        proposal.issued_pdf and proposal.sent_at and proposal.responded_at and proposal.response_evidence
    ):
        raise HTTPException(status_code=409, detail="La propuesta no tiene una aceptación documentada.")
    pdf = await compile_proposal(proposal, approval=True)
    return proposal_download(pdf, f"{proposal.folio}-aprobacion.pdf")

@router.post("/proposals/{proposal_id}/viewed")
async def mark_proposal_viewed(
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(list(SALES_ROLES)))
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
    current_user: User = Depends(require_role(list(SALES_ROLES)))
):
    stmt = select(Client).order_by(desc(Client.created_at))
    res = await db.execute(stmt)
    return res.scalars().all()

# Sales
@router.get("/sales")
async def list_sales(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(list(SALES_ROLES)))
):
    stmt = select(Sale).order_by(desc(Sale.created_at))
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/sales/close")
async def close_sale(
    req: SaleCloseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(list(SALES_ROLES)))
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


# Payments
@router.post("/payments/{payment_id}/reverse")
async def reverse_payment(
    payment_id: str,
    req: PaymentReverseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(list(ADMIN_ROLES)))
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
    current_user: User = Depends(require_role(list(ADMIN_ROLES)))
):
    stmt = select(Invoice).order_by(desc(Invoice.created_at))
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/invoices")
async def record_invoice(
    req: InvoiceRecordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(list(ADMIN_ROLES)))
):
    if not await db.get(Client, req.client_id):
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    if req.sale_id:
        sale = await db.get(Sale, req.sale_id)
        if not sale:
            raise HTTPException(status_code=404, detail="Venta no encontrada.")
        if sale.client_id != req.client_id:
            raise HTTPException(status_code=422, detail="La venta no corresponde al cliente seleccionado.")
    normalized_uuid = req.uuid.strip().upper()
    existing_inv = (await db.execute(select(Invoice).where(Invoice.uuid == normalized_uuid))).scalar_one_or_none()
    if existing_inv:
        raise HTTPException(status_code=409, detail="Ya existe una factura registrada con este UUID fiscal.")
    try:
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
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="No se pudo registrar el folio fiscal. Comprueba si ya existe.")
    return inv

@router.post("/invoices/{invoice_id}/cancel")
async def cancel_invoice(
    invoice_id: str,
    req: InvoiceCancelRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(list(ADMIN_ROLES)))
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
