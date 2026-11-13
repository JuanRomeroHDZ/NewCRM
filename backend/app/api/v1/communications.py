from typing import Any
import math
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Path, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.database import get_db
from app.schemas import validate_nonblank_input
from app.services.core_auth import get_current_user_from_token, require_role
from app.models.core import User
from app.models.communications import (
    UnifiedThread, CommunicationMessage, DoNotContactList,
    MessageTemplate, WhatsAppConfig, TelegramConfig
)
from app.services.communications_service import CommunicationsService

router = APIRouter(prefix="/comms", tags=["Communications"])

COMMS_WRITE_ROLES = ["owner", "business_admin", "operator", "seller"]
MAX_EML_FILE_BYTES = 10 * 1024 * 1024


class ManualMessageRequest(BaseModel):
    thread_id: str = Field(..., min_length=1, max_length=36)
    channel: str = Field(..., pattern="^(correo|whatsapp|telegram|llamada|nota_interna)$")
    direction: str = Field("saliente", pattern="^(saliente|entrante)$")
    sender: str = Field(..., min_length=2, max_length=128)
    recipient: str = Field(..., min_length=2, max_length=128)
    body: str = Field(..., min_length=1, max_length=50000)
    subject: str | None = Field(default=None, max_length=255)

    @field_validator("sender", "recipient", "body")
    @classmethod
    def check_nonblank(cls, value: str) -> str:
        return validate_nonblank_input(value)


class ManualLinksRequest(BaseModel):
    recipient: str = Field(..., min_length=2, max_length=128)
    body: str = Field(..., min_length=1, max_length=20000)
    subject: str | None = Field(default=None, max_length=255)

    @field_validator("recipient", "body")
    @classmethod
    def check_nonblank(cls, value: str) -> str:
        return validate_nonblank_input(value)


class TemplateRenderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    template_str: str = Field(..., min_length=1, max_length=50000)
    variables: dict[str, Any] = Field(default_factory=dict, max_length=100)

    @field_validator("variables")
    @classmethod
    def check_variables_limit(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(value) > 100:
            raise ValueError("Máximo 100 variables por plantilla.")
        for key, item in value.items():
            if not key.strip() or len(key) > 64:
                raise ValueError("Cada nombre de variable debe tener entre 1 y 64 caracteres.")
            if isinstance(item, str):
                item_length = len(item)
            elif isinstance(item, bool) or item is None:
                item_length = 1
            elif isinstance(item, int):
                if item.bit_length() > 3322:
                    raise ValueError("El tamaño de una variable excede el límite permitido.")
                item_length = len(str(item))
            elif isinstance(item, float):
                if not math.isfinite(item):
                    raise ValueError("Las variables numéricas deben ser finitas.")
                item_length = len(str(item))
            else:
                raise ValueError("Las variables solo pueden ser texto, números o valores booleanos.")
            if item_length > 5000:
                raise ValueError("El tamaño de las variables de plantilla excede el límite.")
        return value


class DoNotContactRequest(BaseModel):
    identifier: str = Field(..., min_length=2, max_length=180)
    reason: str = Field(..., min_length=2, max_length=255)
    channel: str = Field("todos", pattern="^(todos|correo|whatsapp|telegram)$")

    @field_validator("identifier", "reason")
    @classmethod
    def check_nonblank(cls, value: str) -> str:
        return validate_nonblank_input(value)


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
    thread_id: str = Path(..., max_length=36),
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
    current_user: User = Depends(require_role(COMMS_WRITE_ROLES))
):
    thread = await db.get(UnifiedThread, req.thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Hilo de conversación no encontrado.")
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
    try:
        rendered = CommunicationsService.render_template(req.template_str, req.variables)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"rendered": rendered}


@router.post("/eml/sanitize")
async def sanitize_eml_file(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role(COMMS_WRITE_ROLES))
):
    raw_content = await file.read(MAX_EML_FILE_BYTES + 1)
    if len(raw_content) > MAX_EML_FILE_BYTES:
        raise HTTPException(status_code=413, detail="El archivo supera el límite permitido de 10 MB.")
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
    current_user: User = Depends(require_role(COMMS_WRITE_ROLES))
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
    message_id: str = Path(..., max_length=36),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(COMMS_WRITE_ROLES))
):
    try:
        msg = await CommunicationsService.process_outbox_queue(session=db, message_id=message_id)
        return msg
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/whatsapp/rates")
async def get_whatsapp_rates(current_user: User = Depends(get_current_user_from_token)):
    return CommunicationsService.get_whatsapp_rates()
