import csv
import io
import json
from datetime import datetime, timezone
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.crm_sales import Client, Sale, PaymentInstallment, Invoice
from app.models import Prospect, ClientIncome
from app.services.workshop_sanitizer import sanitize_formula_injection

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

class MetricsService:
    @staticmethod
    async def get_executive_metrics(session: AsyncSession) -> dict:
        """
        Calculates executive metrics:
        - Revenue by service type
        - Accounts receivable (pending balances)
        - Monthly Recurring Revenue (MRR)
        - Active vs Lost clients
        - Prospect-to-Client conversion rate
        """
        # 1. Total revenue and breakdown by service type
        sales_stmt = select(Sale).where(Sale.status != "cancelada")
        sales_res = await session.execute(sales_stmt)
        sales = sales_res.scalars().all()

        revenue_by_service: dict[str, float] = {}
        total_billed = 0.0
        mrr = 0.0

        for s in sales:
            stype = s.service_type or "otro"
            revenue_by_service[stype] = revenue_by_service.get(stype, 0.0) + s.total_amount
            total_billed += s.total_amount
            if stype in ("mensualidad", "mantenimiento"):
                mrr += s.total_amount

        # 2. Accounts receivable from installments
        inst_stmt = select(PaymentInstallment).where(
            PaymentInstallment.status.in_(["pendiente", "parcial"])
        )
        inst_res = await session.execute(inst_stmt)
        installments = inst_res.scalars().all()
        accounts_receivable = sum(max(0.0, i.amount - i.paid_amount) for i in installments)

        # 3. Clients summary
        clients_stmt = select(Client)
        clients_res = await session.execute(clients_stmt)
        clients = clients_res.scalars().all()
        active_clients = sum(1 for c in clients if c.status == "activo")
        lost_clients = sum(1 for c in clients if c.status == "perdido")

        # 4. Conversion rate
        prospects_stmt = select(Prospect).where(Prospect.is_deleted == False)
        prospects_res = await session.execute(prospects_stmt)
        all_prospects = prospects_res.scalars().all()
        total_prospects = len(all_prospects)
        closed_prospects = sum(1 for p in all_prospects if p.status == "cliente")
        conversion_rate = (closed_prospects / total_prospects * 100.0) if total_prospects > 0 else 0.0

        return {
            "total_billed_mxn": round(total_billed, 2),
            "accounts_receivable_mxn": round(accounts_receivable, 2),
            "monthly_recurring_revenue_mrr_mxn": round(mrr, 2),
            "revenue_by_service": revenue_by_service,
            "clients": {
                "total": len(clients),
                "active": active_clients,
                "lost": lost_clients
            },
            "conversion": {
                "total_prospects": total_prospects,
                "closed_clients": closed_prospects,
                "conversion_rate_percent": round(conversion_rate, 2)
            },
            "generated_at": utc_now().isoformat()
        }

    @staticmethod
    async def export_monthly_report_csv(session: AsyncSession, month_str: str) -> str:
        """
        Exports monthly sales and collections report as sanitized CSV.
        Neutralizes CSV formula injection on company names and concepts.
        """
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Folio", "Cliente", "Concepto", "Monto", "Moneda", "Estado", "Fecha"])

        sales_stmt = select(Sale).where(Sale.status != "cancelada")
        sales_res = await session.execute(sales_stmt)
        sales = sales_res.scalars().all()

        for s in sales:
            client_name = s.client.company_name if s.client else "N/A"
            writer.writerow([
                sanitize_formula_injection(s.folio),
                sanitize_formula_injection(client_name),
                sanitize_formula_injection(s.title),
                f"{s.total_amount:.2f}",
                s.currency,
                s.status,
                s.created_at.strftime("%Y-%m-%d")
            ])

        return output.getvalue()
