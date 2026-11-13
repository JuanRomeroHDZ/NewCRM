from datetime import datetime, timezone, timedelta
from sqlalchemy import select, and_, or_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.models.crm_sales import FolioSequence, Client, Proposal, Sale, PaymentInstallment, PaymentRecord, Invoice
from app.models import Prospect
from app.models.core import ActivityEvent

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class SaleAlreadyClosedError(ValueError):
    """Indicates that a proposal or prospect already has a sale."""


class CrmSalesService:
    @staticmethod
    async def get_next_folio(session: AsyncSession, sequence_type: str, prefix: str) -> str:
        """Atomically allocates the next folio using the existing unique key."""
        dialect = session.get_bind().dialect.name
        insert_for_dialect = {
            "postgresql": postgresql_insert,
            "sqlite": sqlite_insert,
        }.get(dialect)
        if insert_for_dialect is None:
            raise RuntimeError(f"Motor de base de datos no compatible con folios: {dialect}")

        insert_stmt = insert_for_dialect(FolioSequence).values(
            sequence_type=sequence_type,
            prefix=prefix,
            current_number=1,
            updated_at=utc_now(),
        )
        stmt = insert_stmt.on_conflict_do_update(
            index_elements=[FolioSequence.sequence_type],
            set_={
                "prefix": prefix,
                "current_number": FolioSequence.current_number + 1,
                "updated_at": utc_now(),
            },
        ).returning(FolioSequence.current_number)
        num = (await session.execute(stmt)).scalar_one()
        return f"{prefix}{num:04d}"

    @staticmethod
    async def advance_prospect_cadence(
        session: AsyncSession,
        prospect_id: str,
        channel: str,
        user_id: str
    ) -> Prospect:
        """
        Advances contact cadence. If attempts exceed limit, transitions prospect
        to 'sin_respuesta' (archived, leaves daily view, preserves history).
        """
        prospect = await session.get(Prospect, prospect_id)
        if not prospect or prospect.is_deleted:
            raise ValueError("Prospecto no encontrado o eliminado.")

        if prospect.status == "no_contactar":
            raise ValueError("El prospecto se encuentra en la lista de no contactar.")

        prospect.followup_count += 1
        prospect.last_contacted_at = utc_now()
        prospect.last_contact_channel = channel

        if prospect.followup_count >= prospect.max_followup_attempts:
            prospect.status = "sin_respuesta"
            summary = f"Cadencia completada sin respuesta ({prospect.followup_count}/{prospect.max_followup_attempts} intentos). Archivado reactivable."
        else:
            prospect.status = "primer_contacto" if prospect.followup_count == 1 else "en_cotizacion"
            summary = f"Contacto registrado por {channel} (Intento {prospect.followup_count}/{prospect.max_followup_attempts})"

        event = ActivityEvent(
            module="crm",
            action="update",
            entity_type="prospect",
            entity_id=prospect.id,
            user_id=user_id,
            summary=summary
        )
        session.add(event)
        await session.commit()
        await session.refresh(prospect)
        return prospect

    @staticmethod
    async def record_prospect_response(
        session: AsyncSession,
        prospect_id: str,
        channel: str,
        summary: str,
        next_action: str | None,
        user_id: str
    ) -> Prospect:
        prospect = await session.get(Prospect, prospect_id)
        if not prospect or prospect.is_deleted:
            raise ValueError("Prospecto no encontrado.")

        now = utc_now()
        prospect.status = "respondio"
        prospect.responded_at = now
        if prospect.started_at:
            delta = (now - prospect.started_at).total_seconds()
            prospect.response_time_seconds = int(delta)
            prospect.met_sla = (delta / 3600.0) <= prospect.sla_hours

        existing_notes = prospect.notes or ""
        prospect.notes = (existing_notes + f"\n[Respuesta vía {channel} - {now.strftime('%Y-%m-%d')}]: {summary}. Prox: {next_action or 'N/A'}").strip()

        event = ActivityEvent(
            module="crm",
            action="update",
            entity_type="prospect",
            entity_id=prospect.id,
            user_id=user_id,
            summary=f"Respuesta registrada por {channel}: {summary[:100]}"
        )
        session.add(event)
        await session.commit()
        await session.refresh(prospect)
        return prospect

    @staticmethod
    async def create_proposal(
        session: AsyncSession,
        prospect_id: str | None,
        title: str,
        service_type: str,
        amount: float,
        currency: str = "MXN",
        content_text: str | None = None,
        expires_days: int = 15
    ) -> Proposal:
        folio = await CrmSalesService.get_next_folio(session, "proposal", "PROP-")
        proposal = Proposal(
            folio=folio,
            version=1,
            prospect_id=prospect_id,
            title=title,
            service_type=service_type,
            amount=amount,
            currency=currency,
            content_text=content_text,
            status="borrador",
            is_viewed_by_user=False,
            expires_at=utc_now() + timedelta(days=expires_days)
        )
        session.add(proposal)
        await session.commit()
        await session.refresh(proposal)
        return proposal

    @staticmethod
    async def mark_proposal_viewed(session: AsyncSession, proposal_id: str, user_id: str) -> Proposal:
        proposal = await session.get(Proposal, proposal_id)
        if not proposal:
            raise ValueError("Propuesta no encontrada.")
        proposal.is_viewed_by_user = True
        event = ActivityEvent(
            module="crm",
            action="update",
            entity_type="proposal",
            entity_id=proposal.id,
            user_id=user_id,
            summary=f"Propuesta {proposal.folio} marcada como vista manualmente por el usuario"
        )
        session.add(event)
        await session.commit()
        await session.refresh(proposal)
        return proposal

    @staticmethod
    async def close_sale_atomic(
        session: AsyncSession,
        user_id: str,
        company_name: str,
        title: str,
        total_amount: float,
        prospect_id: str | None = None,
        proposal_id: str | None = None,
        contact_name: str | None = None,
        contact_email: str | None = None,
        phone: str | None = None,
        tax_rfc: str | None = None,
        fiscal_name: str | None = None,
        cfdi_usage: str | None = "G03",
        service_type: str = "proyecto_unico",
        tax_amount: float = 0.0,
        discount_amount: float = 0.0,
        advance_payment: float = 0.0,
        currency: str = "MXN"
    ) -> tuple[Sale, Client, list[PaymentInstallment]]:
        """
        Atomic sale closing transaction:
        Creates Client, Sale, Payment Plan, initial payment if advance given,
        updates Proposal, Prospect, and records audit trail in a single commit.
        """
        prospect = None
        proposal = None
        if proposal_id:
            proposal = (
                await session.execute(
                    select(Proposal).where(Proposal.id == proposal_id).with_for_update()
                )
            ).scalar_one_or_none()
            if not proposal:
                raise ValueError("Propuesta no encontrada.")
            if prospect_id and proposal.prospect_id and proposal.prospect_id != prospect_id:
                raise ValueError("La propuesta no corresponde al prospecto seleccionado.")
            if not prospect_id:
                prospect_id = proposal.prospect_id

        if prospect_id:
            prospect = (
                await session.execute(
                    select(Prospect)
                    .where(Prospect.id == prospect_id, Prospect.is_deleted == False)
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if not prospect:
                raise ValueError("Prospecto no encontrado o eliminado.")

        # Claim existing references atomically, so parallel closes cannot duplicate a sale.
        if prospect_id:
            existing_prospect_sale = select(Sale.id).where(Sale.prospect_id == prospect_id).exists()
            claim_prospect = (
                update(Prospect)
                .where(
                    Prospect.id == prospect_id,
                    Prospect.is_deleted == False,
                    ~existing_prospect_sale,
                )
                .values(status="cliente")
                .returning(Prospect.id)
                .execution_options(synchronize_session=False)
            )
            claimed_id = (await session.execute(claim_prospect)).scalar_one_or_none()
            if claimed_id is None:
                await session.rollback()
                raise SaleAlreadyClosedError("Ya existe una venta para este prospecto.")
            prospect.status = "cliente"

        if proposal_id:
            existing_proposal_sale = select(Sale.id).where(Sale.proposal_id == proposal_id).exists()
            claim_proposal = (
                update(Proposal)
                .where(Proposal.id == proposal_id, ~existing_proposal_sale)
                .values(status="aceptada")
                .returning(Proposal.id)
                .execution_options(synchronize_session=False)
            )
            claimed_id = (await session.execute(claim_proposal)).scalar_one_or_none()
            if claimed_id is None:
                await session.rollback()
                raise SaleAlreadyClosedError("Ya existe una venta para esta propuesta.")
            proposal.status = "aceptada"

        # 1. Find or create Client
        client = None
        if prospect_id:
            stmt = select(Client).where(Client.prospect_id == prospect_id)
            res = await session.execute(stmt)
            client = res.scalar_one_or_none()

        if not client:
            client = Client(
                prospect_id=prospect_id,
                company_name=company_name,
                contact_name=contact_name,
                contact_email=contact_email,
                phone=phone,
                tax_rfc=tax_rfc,
                fiscal_name=fiscal_name,
                cfdi_usage=cfdi_usage or "G03",
                status="activo"
            )
            session.add(client)
            await session.flush()

        # 2. Assign locked folio
        sale_folio = await CrmSalesService.get_next_folio(session, "sale", "VENTA-")

        # 3. Create Sale
        balance = total_amount - discount_amount + tax_amount - advance_payment
        sale = Sale(
            client_id=client.id,
            prospect_id=prospect_id,
            proposal_id=proposal_id,
            folio=sale_folio,
            title=title,
            service_type=service_type,
            total_amount=total_amount,
            tax_amount=tax_amount,
            discount_amount=discount_amount,
            advance_payment=advance_payment,
            balance_amount=max(0.0, balance),
            currency=currency,
            status="activa"
        )
        session.add(sale)
        await session.flush()

        # 4. Generate installments
        installments = []
        due_str = utc_now().strftime("%Y-%m-%d")

        if advance_payment > 0:
            inst_adv = PaymentInstallment(
                sale_id=sale.id,
                installment_number=1,
                concept="Anticipo inicial",
                amount=advance_payment,
                paid_amount=advance_payment,
                currency=currency,
                due_date=due_str,
                status="pagado"
            )
            session.add(inst_adv)
            await session.flush()
            installments.append(inst_adv)

            rec = PaymentRecord(
                installment_id=inst_adv.id,
                sale_id=sale.id,
                amount=advance_payment,
                currency=currency,
                payment_method="transferencia",
                payment_date=due_str,
                notes="Anticipo registrado al cierre de venta"
            )
            session.add(rec)

        if balance > 0:
            inst_bal = PaymentInstallment(
                sale_id=sale.id,
                installment_number=len(installments) + 1,
                concept="Liquidación contra entrega",
                amount=balance,
                paid_amount=0.0,
                currency=currency,
                due_date=(utc_now() + timedelta(days=30)).strftime("%Y-%m-%d"),
                status="pendiente"
            )
            session.add(inst_bal)
            await session.flush()
            installments.append(inst_bal)

        # 5. Link and update Proposal / Prospect
        # 6. Audit event
        event = ActivityEvent(
            module="crm",
            action="create",
            entity_type="sale",
            entity_id=sale.id,
            user_id=user_id,
            summary=f"Venta cerrada {sale.folio}: {title} (${total_amount:.2f} {currency}) para {company_name}"
        )
        session.add(event)

        await session.commit()
        await session.refresh(sale)
        await session.refresh(client)
        return sale, client, installments

    @staticmethod
    async def reverse_payment(session: AsyncSession, payment_id: str, reason: str, user_id: str) -> PaymentRecord:
        """
        Payments are NEVER deleted; reversed with audit log.
        """
        payment = await session.get(PaymentRecord, payment_id)
        if not payment:
            raise ValueError("Pago no encontrado.")
        if payment.is_reversed:
            raise ValueError("El pago ya fue revertido con anterioridad.")

        payment.is_reversed = True
        payment.reversal_reason = reason
        payment.reversed_at = utc_now()

        installment = await session.get(PaymentInstallment, payment.installment_id)
        if installment:
            installment.paid_amount = max(0.0, installment.paid_amount - payment.amount)
            installment.status = "pendiente" if installment.paid_amount == 0 else "parcial"

        event = ActivityEvent(
            module="crm",
            action="reverse",
            entity_type="payment",
            entity_id=payment.id,
            user_id=user_id,
            summary=f"Pago revertido de ${payment.amount:.2f} {payment.currency}. Motivo: {reason}"
        )
        session.add(event)

        await session.commit()
        await session.refresh(payment)
        return payment

    @staticmethod
    async def record_invoice(
        session: AsyncSession,
        sale_id: str | None,
        client_id: str,
        folio: str,
        uuid: str,
        rfc: str,
        amount: float,
        issue_date: str,
        cfdi_usage: str = "G03",
        currency: str = "MXN",
        xml_path: str | None = None,
        pdf_path: str | None = None,
        service_ref: str | None = None
    ) -> Invoice:
        invoice = Invoice(
            sale_id=sale_id,
            client_id=client_id,
            folio=folio,
            uuid=uuid.strip().upper(),
            rfc=rfc.strip().upper(),
            cfdi_usage=cfdi_usage,
            amount=amount,
            currency=currency,
            issue_date=issue_date,
            xml_file_path=xml_path,
            pdf_file_path=pdf_path,
            service_reference=service_ref,
            status="emitida"
        )
        session.add(invoice)
        await session.commit()
        await session.refresh(invoice)
        return invoice

    @staticmethod
    async def cancel_invoice(session: AsyncSession, invoice_id: str, reason: str, user_id: str) -> Invoice:
        """
        Invoices are NEVER deleted; cancelled with reason.
        """
        invoice = await session.get(Invoice, invoice_id)
        if not invoice:
            raise ValueError("Factura no encontrada.")
        if invoice.status == "cancelada":
            raise ValueError("La factura ya está cancelada.")

        invoice.status = "cancelada"
        invoice.cancellation_reason = reason
        invoice.cancelled_at = utc_now()

        event = ActivityEvent(
            module="crm",
            action="update",
            entity_type="invoice",
            entity_id=invoice.id,
            user_id=user_id,
            summary=f"Factura {invoice.folio} (UUID: {invoice.uuid}) cancelada. Motivo: {reason}"
        )
        session.add(event)

        await session.commit()
        await session.refresh(invoice)
        return invoice
