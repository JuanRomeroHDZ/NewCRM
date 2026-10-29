from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.core_auth import get_current_user_from_token
from app.models.core import User
from app.services.metrics_service import MetricsService
from app.services.inbound_whatsapp import InboundWhatsAppService

router = APIRouter(tags=["Metrics & WhatsApp Inbound"])

class InboundSimulateRequest(BaseModel):
    provider_message_id: str = Field(..., min_length=5, max_length=128)
    sender_phone: str = Field(..., min_length=7, max_length=64)
    payload_json: str = Field(..., min_length=2)

@router.get("/metrics/executive")
async def get_executive_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    return await MetricsService.get_executive_metrics(session=db)

@router.get("/metrics/export-monthly")
async def export_monthly_report(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    format: str = Query("json", pattern="^(json|csv)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    if format == "csv":
        csv_data = await MetricsService.export_monthly_report_csv(session=db, month_str=month)
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=reporte_{month}.csv"}
        )
    metrics = await MetricsService.get_executive_metrics(session=db)
    return {"month": month, "metrics": metrics}

@router.get("/comms/inbound/whatsapp/status")
async def get_whatsapp_inbound_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    return await InboundWhatsAppService.get_adapter_status(session=db)

@router.post("/comms/inbound/whatsapp/receive")
async def receive_inbound_message(
    req: InboundSimulateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    record, is_new = await InboundWhatsAppService.process_inbound_message(
        session=db,
        provider_message_id=req.provider_message_id,
        sender_phone=req.sender_phone,
        payload_json=req.payload_json
    )
    return {
        "id": record.id,
        "provider_message_id": record.provider_message_id,
        "is_new": is_new,
        "status": record.status,
        "received_at": record.received_at.isoformat()
    }
