from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.database import get_db
from app.services.core_auth import get_current_user_from_token
from app.models.core import User
from app.models.communications import (
    UnifiedThread, CommunicationMessage, DoNotContactList,
    MessageTemplate, WhatsAppConfig, TelegramConfig
)
from app.services.communications_service import CommunicationsService

router = APIRouter(prefix="/comms", tags=["Communications"])

class ManualMessageRequest(BaseModel):
    thread_id: str
    channel: str = Field(..., pattern="^(correo|whatsapp|telegram|llamada|nota_interna)$")
    direction: str = Field("saliente", pattern="^(saliente|entrante)$")
    sender: str = Field(..., min_length=2, max_length=128)
    recipient: str = Field(..., min_length=2, max_length=128)
    body: str = Field(..., min_length=1)
    subject: str | None = None

class ManualLinksRequest(BaseModel):
    recipient: str = Field(..., min_length=2, max_length=128)
    body: str = Field(..., min_length=1)
    subject: str | None = None

class TemplateRenderRequest(BaseModel):
    template_str: str
    variables: dict = Field(default_factory=dict)

class DoNotContactRequest(BaseModel):
    identifier: str = Field(..., min_length=2, max_length=180)
    reason: str = Field(..., min_length=2, max_length=255)
    channel: str = Field("todos", pattern="^(todos|correo|whatsapp|telegram)$")

@router.get("/threads")
async def list_threads(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    stmt = select(UnifiedThread).order_by(desc(UnifiedThread.updated_at))
    res = await db.execute(stmt)
    return res.scalars().all()

@router.get("/threads/{thread_id}/messages")
async def list_thread_messages(
    thread_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    stmt = select(CommunicationMessage).where(CommunicationMessage.thread_id == thread_id).order_by(CommunicationMessage.created_at.asc())
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/messages/manual")
async def record_manual_message(
    req: ManualMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    try:
        msg = await CommunicationsService.record_manual_message(
            session=db,
            thread_id=req.thread_id,
            channel=req.channel,
            direction=req.direction,
            sender=req.sender,
            recipient=req.recipient,
            body=req.body,
            subject=req.subject,
            user_id=current_user.id
        )
        return msg
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/links/generate")
async def generate_links(
    req: ManualLinksRequest,
    current_user: User = Depends(get_current_user_from_token)
):
    return CommunicationsService.generate_manual_links(
        recipient=req.recipient,
        body=req.body,
        subject=req.subject
    )

@router.post("/templates/render")
async def render_template(
    req: TemplateRenderRequest,
    current_user: User = Depends(get_current_user_from_token)
):
    rendered = CommunicationsService.render_template(req.template_str, req.variables)
    return {"rendered": rendered}

@router.post("/eml/sanitize")
async def sanitize_eml_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user_from_token)
):
    raw_content = await file.read()
    if len(raw_content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El archivo excede el tamaño máximo permitido (10MB).")
    return CommunicationsService.sanitize_eml(raw_content)

@router.get("/do-not-contact")
async def list_do_not_contact(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    stmt = select(DoNotContactList).order_by(desc(DoNotContactList.created_at))
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/do-not-contact")
async def add_do_not_contact(
    req: DoNotContactRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    entry = await CommunicationsService.add_to_do_not_contact(
        session=db,
        identifier=req.identifier,
        reason=req.reason,
        channel=req.channel,
        user_id=current_user.id
    )
    return entry

@router.post("/queue/{message_id}/retry")
async def retry_queued_message(
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_from_token)
):
    try:
        msg = await CommunicationsService.process_outbox_queue(session=db, message_id=message_id)
        return msg
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/whatsapp/rates")
async def get_whatsapp_rates(current_user: User = Depends(get_current_user_from_token)):
    return CommunicationsService.get_whatsapp_rates()
