"""Multi-user collaborative editing for Typst reports and Excalidraw canvases.

Yjs updates are opaque to the server and encrypted before persistence. PostgreSQL
is the durable event log and cross-replica relay; no in-process room state is
required, so API replicas can serve the same document.
"""

import asyncio
import base64
import difflib
import hashlib
import json
import re
import secrets
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, get_db
from app.security.browser_session import request_session_token
from app.models import utc_now
from app.models.core import DbSession, User, VaultSession
from app.models.reports import ReportCanvas, ReportDocument
from app.models.report_collaboration import (
    ReportCollaborator,
    ReportCollaborationPresence,
    ReportCollaborationState,
    ReportCollaborationTicket,
    ReportCollaborationUpdate,
    ReportComment,
    ReportReview,
    ReportRevision,
)
from app.schemas.report_collaboration import (
    CollaborationBootstrap,
    CollaborationCheckpoint,
    CollaboratorUpdate,
    CommentCreate,
    ReviewRequest,
    ReviewResponse,
)
from app.security.crypto import active_vault_key, decrypt_note, encrypt_note
from app.security.tokens import (
    _decode_token,
    _open_vault_key,
    _seal_vault_key,
    require_vault_unlocked,
    vault_key_from_token,
)
from app.services.core_auth import ADMIN_ROLES, WORKSPACE_ROLES, get_current_user_from_token, hash_token, require_role
from app.services.report_collaboration import (
    RESOURCE_MODELS,
    get_permission,
    get_resource,
    require_resource_permission,
)


router = APIRouter(prefix="/reports/collaboration", tags=["report-collaboration"])
require_workspace_user = require_role(WORKSPACE_ROLES)
_MAX_STATE_BYTES = 32 * 1024 * 1024
_MAX_UPDATE_BYTES = 32 * 1024 * 1024
_MAX_SCENE_BYTES = 20 * 1024 * 1024
_TICKET_TTL_SECONDS = 30
_PRESENCE_TTL_SECONDS = 35
_UPDATE_ACK_RETENTION = timedelta(days=30)
_ALLOWED_STATUSES = {"borrador", "en_revision", "finalizado", "entregado"}


def _decode_b64(value: str, *, maximum: int, label: str) -> bytes:
    try:
        decoded = base64.b64decode(value.encode("ascii"), validate=True)
    except (ValueError, UnicodeEncodeError) as exc:
        raise HTTPException(status_code=422, detail=f"El estado colaborativo de {label} no es válido.") from exc
    if not decoded or len(decoded) > maximum:
        raise HTTPException(status_code=413, detail=f"El estado colaborativo excede el límite de {maximum} bytes.")
    return decoded


def _resource_content(resource_type: str, resource) -> dict:
    if resource_type == "document":
        return {
            "title": resource.title,
            "status": resource.status,
            "source": decrypt_note(resource.encrypted_source) if resource.encrypted_source else "",
            "prospect_id": resource.prospect_id,
            "project_id": resource.project_id,
            "engagement_id": resource.engagement_id,
        }
    return {
        "title": resource.title,
        "scene_json": decrypt_note(resource.encrypted_scene_json) if resource.encrypted_scene_json else "{}",
        "element_count": resource.element_count,
        "linked_document_id": resource.linked_document_id,
    }


def _canonical_content(content: dict, resource_type: str) -> tuple[str, str]:
    if resource_type == "document":
        title = str(content.get("title", "")).strip()
        source = content.get("source")
        doc_status = content.get("status", "borrador")
        if not title or len(title) > 200 or not isinstance(source, str) or len(source) > 15_000_000:
            raise HTTPException(status_code=422, detail="El título o el contenido del documento no es válido.")
        if doc_status not in _ALLOWED_STATUSES:
            raise HTTPException(status_code=422, detail="El estado del documento no es válido.")
        normalized = {
            "title": title,
            "status": doc_status,
            "source": source,
            "prospect_id": content.get("prospect_id"),
            "project_id": content.get("project_id"),
            "engagement_id": content.get("engagement_id"),
        }
    else:
        title = str(content.get("title", "")).strip()
        scene_json = content.get("scene_json")
        if not title or len(title) > 200 or not isinstance(scene_json, str) or len(scene_json.encode("utf-8")) > _MAX_SCENE_BYTES:
            raise HTTPException(status_code=422, detail="El título o el contenido del lienzo no es válido.")
        try:
            scene = json.loads(scene_json)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=422, detail="La escena del lienzo no es JSON válido.") from exc
        if not isinstance(scene, dict):
            raise HTTPException(status_code=422, detail="La escena del lienzo debe ser un objeto JSON.")
        count = content.get("element_count", 0)
        if not isinstance(count, int) or count < 0:
            raise HTTPException(status_code=422, detail="El número de elementos del lienzo no es válido.")
        linked_document_id = content.get("linked_document_id")
        if linked_document_id is not None and not isinstance(linked_document_id, str):
            raise HTTPException(status_code=422, detail="El documento vinculado no es válido.")
        normalized = {
            "title": title,
            "scene_json": scene_json,
            "element_count": count,
            "linked_document_id": linked_document_id,
        }
    serialized = json.dumps(normalized, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return serialized, hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _apply_content(resource_type: str, resource, content: dict) -> None:
    if resource_type == "document":
        resource.title = content["title"]
        resource.status = content["status"]
        resource.encrypted_source = encrypt_note(content["source"])
        resource.prospect_id = content.get("prospect_id")
        resource.project_id = content.get("project_id")
        resource.engagement_id = content.get("engagement_id")
    else:
        resource.title = content["title"]
        resource.encrypted_scene_json = encrypt_note(content["scene_json"])
        resource.element_count = content["element_count"]
        resource.linked_document_id = content.get("linked_document_id")
    resource.updated_at = utc_now()


async def _latest_sequence(db: AsyncSession, resource_type: str, resource_id: str) -> int:
    return int(await db.scalar(
        select(func.max(ReportCollaborationUpdate.id)).where(
            ReportCollaborationUpdate.resource_type == resource_type,
            ReportCollaborationUpdate.resource_id == resource_id,
        )
    ) or 0)


def _revision_out(revision: ReportRevision, username: str) -> dict:
    return {
        "id": revision.id,
        "revision_number": revision.revision_number,
        "title": revision.title,
        "status": revision.status,
        "sha256": revision.sha256,
        "reason": revision.reason,
        "created_by_id": revision.created_by_id,
        "created_by": username,
        "created_at": revision.created_at,
    }


async def _create_revision(
    db: AsyncSession,
    *,
    resource_type: str,
    resource_id: str,
    user: User,
    resource,
    state_plain: str,
    serialized_content: str,
    content_hash: str,
    reason: str,
) -> ReportRevision:
    next_number = int(await db.scalar(
        select(func.max(ReportRevision.revision_number)).where(
            ReportRevision.resource_type == resource_type,
            ReportRevision.resource_id == resource_id,
        )
    ) or 0) + 1
    content = json.loads(serialized_content)
    revision = ReportRevision(
        resource_type=resource_type,
        resource_id=resource_id,
        revision_number=next_number,
        title=content["title"],
        status=content.get("status"),
        encrypted_content=encrypt_note(serialized_content),
        encrypted_state=encrypt_note(state_plain),
        sha256=content_hash,
        reason=reason,
        created_by_id=user.id,
    )
    db.add(revision)
    await db.flush()
    return revision


async def _events_after(db: AsyncSession, resource_type: str, resource_id: str, sequence: int) -> list[dict]:
    rows = (await db.execute(
        select(ReportCollaborationUpdate)
        .where(
            ReportCollaborationUpdate.resource_type == resource_type,
            ReportCollaborationUpdate.resource_id == resource_id,
            ReportCollaborationUpdate.id > sequence,
        )
        .order_by(ReportCollaborationUpdate.id.asc())
        .limit(2000)
    )).scalars().all()
    return [
        {"seq": row.id, "update_id": row.update_id, "update": decrypt_note(row.encrypted_update)}
        for row in rows
    ]


@router.get("/{resource_type}/{resource_id}/users")
async def collaboration_users(
    resource_type: str,
    resource_id: str,
    _vault: bool = Depends(require_vault_unlocked),
    user: User = Depends(require_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    await require_resource_permission(db, resource_type, resource_id, user, "manage")
    users = (await db.execute(
        select(User).where(User.is_active.is_(True), User.role.in_(WORKSPACE_ROLES)).order_by(User.full_name.asc())
    )).scalars().all()
    return [{"id": user.id, "username": user.username, "full_name": user.full_name, "role": user.role} for user in users]


@router.get("/{resource_type}/{resource_id}/collaborators")
async def list_collaborators(
    resource_type: str,
    resource_id: str,
    _vault: bool = Depends(require_vault_unlocked),
    user: User = Depends(require_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    resource, _ = await require_resource_permission(db, resource_type, resource_id, user, "manage")
    rows = (await db.execute(
        select(ReportCollaborator, User).join(User, User.id == ReportCollaborator.user_id).where(
            ReportCollaborator.resource_type == resource_type,
            ReportCollaborator.resource_id == resource_id,
        ).order_by(User.full_name.asc())
    )).all()
    items = [{
        "user_id": resource.created_by_id,
        "username": None,
        "full_name": "Propietario",
        "permission": "owner",
    }]
    for row, collaborator in rows:
        items.append({"user_id": collaborator.id, "username": collaborator.username,
                      "full_name": collaborator.full_name, "permission": row.permission})
    return items


@router.get("/{resource_type}/{resource_id}/reviewers")
async def list_reviewers(
    resource_type: str,
    resource_id: str,
    _vault: bool = Depends(require_vault_unlocked),
    user: User = Depends(require_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    resource, _ = await require_resource_permission(db, resource_type, resource_id, user, "view")
    owner = await db.scalar(select(User).where(User.id == resource.created_by_id, User.is_active.is_(True)))
    items = []
    if owner:
        items.append({"user_id": owner.id, "username": owner.username, "full_name": owner.full_name, "permission": "owner"})
    rows = (await db.execute(
        select(ReportCollaborator, User)
        .join(User, User.id == ReportCollaborator.user_id)
        .where(
            ReportCollaborator.resource_type == resource_type,
            ReportCollaborator.resource_id == resource_id,
            or_(
                ReportCollaborator.permission.in_(["editor", "reviewer"]),
                User.role.in_(ADMIN_ROLES),
            ),
            User.is_active.is_(True),
        )
        .order_by(User.full_name.asc())
    )).all()
    items.extend({"user_id": collaborator.id, "username": collaborator.username,
                  "full_name": collaborator.full_name, "permission": row.permission}
                 for row, collaborator in rows)
    return items


@router.put("/{resource_type}/{resource_id}/collaborators/{target_user_id}")
async def set_collaborator(
    resource_type: str,
    resource_id: str,
    target_user_id: str,
    payload: CollaboratorUpdate,
    _vault: bool = Depends(require_vault_unlocked),
    user: User = Depends(require_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    await require_resource_permission(db, resource_type, resource_id, user, "manage")
    target = await db.scalar(select(User).where(User.id == target_user_id, User.is_active.is_(True)))
    if target is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    row = await db.scalar(select(ReportCollaborator).where(
        ReportCollaborator.resource_type == resource_type,
        ReportCollaborator.resource_id == resource_id,
        ReportCollaborator.user_id == target_user_id,
    ))
    if row is None:
        row = ReportCollaborator(resource_type=resource_type, resource_id=resource_id,
                                 user_id=target_user_id, granted_by_id=user.id)
        db.add(row)
    row.permission = payload.permission
    row.granted_by_id = user.id
    row.updated_at = utc_now()
    await db.commit()
    return {"user_id": target.id, "username": target.username,
            "full_name": target.full_name, "permission": row.permission}


@router.delete("/{resource_type}/{resource_id}/collaborators/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_collaborator(
    resource_type: str,
    resource_id: str,
    target_user_id: str,
    _vault: bool = Depends(require_vault_unlocked),
    user: User = Depends(require_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    await require_resource_permission(db, resource_type, resource_id, user, "manage")
    await db.execute(delete(ReportCollaborator).where(
        ReportCollaborator.resource_type == resource_type,
        ReportCollaborator.resource_id == resource_id,
        ReportCollaborator.user_id == target_user_id,
    ))
    await db.commit()


@router.post("/{resource_type}/{resource_id}/bootstrap")
async def bootstrap_collaboration(
    resource_type: str,
    resource_id: str,
    payload: CollaborationBootstrap,
    _vault: bool = Depends(require_vault_unlocked),
    user: User = Depends(require_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    resource, permission = await require_resource_permission(db, resource_type, resource_id, user, "view")
    _decode_b64(payload.initial_state, maximum=_MAX_STATE_BYTES, label="inicial")
    state = await db.scalar(select(ReportCollaborationState).where(
        ReportCollaborationState.resource_type == resource_type,
        ReportCollaborationState.resource_id == resource_id,
    ).with_for_update())
    initialized = False
    if state is None:
        # A viewer must not be able to seed the first durable Yjs state and
        # block later editors with arbitrary client data.
        if permission not in {"owner", "editor"}:
            raise HTTPException(status_code=403, detail="Una persona editora debe inicializar primero este reporte.")
        state = ReportCollaborationState(
            resource_type=resource_type,
            resource_id=resource_id,
            encrypted_state=encrypt_note(payload.initial_state),
            checkpoint_seq=0,
            generation=1,
        )
        db.add(state)
        try:
            await db.flush()
            initialized = True
        except IntegrityError:
            await db.rollback()
            state = await db.scalar(select(ReportCollaborationState).where(
                ReportCollaborationState.resource_type == resource_type,
                ReportCollaborationState.resource_id == resource_id,
            ).with_for_update())
    if state is None:
        raise HTTPException(status_code=503, detail="No se pudo inicializar el estado compartido.")
    if initialized:
        serialized, content_hash = _canonical_content(_resource_content(resource_type, resource), resource_type)
        await _create_revision(
            db, resource_type=resource_type, resource_id=resource_id, user=user,
            resource=resource, state_plain=payload.initial_state,
            serialized_content=serialized, content_hash=content_hash, reason="initial",
        )
    await db.commit()
    events = await _events_after(db, resource_type, resource_id, state.checkpoint_seq)
    latest_seq = max([state.checkpoint_seq, *(event["seq"] for event in events)])
    return {
        "initialized": initialized,
        "state": decrypt_note(state.encrypted_state),
        "checkpoint_seq": state.checkpoint_seq,
        "latest_seq": latest_seq,
        "generation": state.generation,
        "permission": permission,
        "updates": events,
    }


@router.post("/{resource_type}/{resource_id}/ticket")
async def issue_collaboration_ticket(
    resource_type: str,
    resource_id: str,
    request: Request,
    _vault: bool = Depends(require_vault_unlocked),
    user: User = Depends(require_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    await require_resource_permission(db, resource_type, resource_id, user, "view")
    state = await db.scalar(select(ReportCollaborationState).where(
        ReportCollaborationState.resource_type == resource_type,
        ReportCollaborationState.resource_id == resource_id,
    ))
    if state is None:
        raise HTTPException(status_code=409, detail="Sincroniza el documento antes de abrir el canal colaborativo.")
    auth_token = request_session_token(request)
    auth_hash = hash_token(auth_token) if auth_token else ""
    auth_session = await db.scalar(select(DbSession).where(
        DbSession.user_id == user.id,
        DbSession.token_hash == auth_hash,
        DbSession.is_revoked.is_(False),
        DbSession.expires_at > utc_now(),
    ))
    vault_token = request.headers.get("x-vault-token")
    vault_payload = _decode_token(vault_token)
    key = active_vault_key.get()
    if auth_session is None or vault_payload is None or not key or len(key) != 32:
        raise HTTPException(status_code=401, detail="La sesión de colaboración venció; vuelve a autenticarte.")
    ticket = secrets.token_urlsafe(32)
    ticket_hash = hashlib.sha256(ticket.encode("ascii")).hexdigest()
    db.add(ReportCollaborationTicket(
        token_hash=ticket_hash,
        resource_type=resource_type,
        resource_id=resource_id,
        user_id=user.id,
        auth_session_id=auth_session.id,
        vault_session_id=vault_payload["jti"],
        sealed_vault_key=_seal_vault_key(ticket_hash, key),
        expires_at=utc_now() + timedelta(seconds=_TICKET_TTL_SECONDS),
    ))
    await db.execute(delete(ReportCollaborationTicket).where(
        ReportCollaborationTicket.expires_at < utc_now() - timedelta(hours=1)
    ))
    await db.execute(delete(ReportCollaborationPresence).where(
        ReportCollaborationPresence.expires_at < utc_now()
    ))
    await db.commit()
    return {"ticket": ticket, "expires_in": _TICKET_TTL_SECONDS}


@router.post("/{resource_type}/{resource_id}/checkpoint")
async def checkpoint_collaboration(
    resource_type: str,
    resource_id: str,
    payload: CollaborationCheckpoint,
    _vault: bool = Depends(require_vault_unlocked),
    user: User = Depends(require_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    resource, _ = await require_resource_permission(db, resource_type, resource_id, user, "edit")
    state = await db.scalar(select(ReportCollaborationState).where(
        ReportCollaborationState.resource_type == resource_type,
        ReportCollaborationState.resource_id == resource_id,
    ).with_for_update())
    if state is None:
        raise HTTPException(status_code=409, detail="El estado colaborativo aún no se ha inicializado.")
    if state.generation != payload.generation:
        raise HTTPException(status_code=409, detail="El documento fue restaurado. Vuelve a sincronizarlo.")
    _decode_b64(payload.state, maximum=_MAX_STATE_BYTES, label="del documento")
    state_plain = payload.state
    latest_seq = await _latest_sequence(db, resource_type, resource_id)
    current_sequence = max(state.checkpoint_seq, latest_seq)
    if payload.through_seq != current_sequence:
        raise HTTPException(status_code=409, detail="Hay ediciones nuevas; sincroniza antes de guardar la versión.")
    serialized, content_hash = _canonical_content(payload.content, resource_type)
    content = json.loads(serialized)
    _apply_content(resource_type, resource, content)
    state.encrypted_state = encrypt_note(state_plain)
    state.checkpoint_seq = payload.through_seq
    state.content_hash = content_hash
    state.updated_at = utc_now()

    latest_revision = await db.scalar(select(ReportRevision).where(
        ReportRevision.resource_type == resource_type,
        ReportRevision.resource_id == resource_id,
    ).order_by(ReportRevision.revision_number.desc()).limit(1))
    should_create_revision = payload.create_revision or latest_revision is None
    if not should_create_revision and latest_revision.sha256 != content_hash:
        should_create_revision = (utc_now() - latest_revision.created_at).total_seconds() >= 300
    revision = None
    if should_create_revision:
        revision = await _create_revision(
            db, resource_type=resource_type, resource_id=resource_id, user=user,
            resource=resource, state_plain=state_plain, serialized_content=serialized,
            content_hash=content_hash, reason=payload.revision_reason,
        )
    await db.execute(update(ReportCollaborationUpdate).where(
        ReportCollaborationUpdate.resource_type == resource_type,
        ReportCollaborationUpdate.resource_id == resource_id,
        ReportCollaborationUpdate.id <= payload.through_seq,
        ReportCollaborationUpdate.encrypted_update.is_not(None),
    ).values(encrypted_update=None))
    await db.execute(delete(ReportCollaborationUpdate).where(
        ReportCollaborationUpdate.resource_type == resource_type,
        ReportCollaborationUpdate.resource_id == resource_id,
        ReportCollaborationUpdate.encrypted_update.is_(None),
        ReportCollaborationUpdate.created_at < utc_now() - _UPDATE_ACK_RETENTION,
    ))
    await db.commit()
    return {
        "saved_at": state.updated_at,
        "generation": state.generation,
        "through_seq": payload.through_seq,
        "revision": revision.revision_number if revision else None,
        "sha256": content_hash,
    }


@router.get("/{resource_type}/{resource_id}/revisions")
async def list_revisions(
    resource_type: str,
    resource_id: str,
    _vault: bool = Depends(require_vault_unlocked),
    user: User = Depends(require_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    await require_resource_permission(db, resource_type, resource_id, user, "view")
    rows = (await db.execute(
        select(ReportRevision, User).join(User, User.id == ReportRevision.created_by_id).where(
            ReportRevision.resource_type == resource_type,
            ReportRevision.resource_id == resource_id,
        ).order_by(ReportRevision.revision_number.desc())
    )).all()
    return [_revision_out(revision, author.full_name) for revision, author in rows]


@router.get("/{resource_type}/{resource_id}/revisions/{revision_id}/diff")
async def revision_diff(
    resource_type: str,
    resource_id: str,
    revision_id: str,
    _vault: bool = Depends(require_vault_unlocked),
    user: User = Depends(require_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    resource, _ = await require_resource_permission(db, resource_type, resource_id, user, "view")
    revision = await db.scalar(select(ReportRevision).where(
        ReportRevision.id == revision_id,
        ReportRevision.resource_type == resource_type,
        ReportRevision.resource_id == resource_id,
    ))
    if revision is None:
        raise HTTPException(status_code=404, detail="Versión no encontrada.")
    current, _ = _canonical_content(_resource_content(resource_type, resource), resource_type)
    previous = decrypt_note(revision.encrypted_content) or "{}"
    diff = "\n".join(difflib.unified_diff(
        json.dumps(json.loads(previous), ensure_ascii=False, indent=2).splitlines(),
        json.dumps(json.loads(current), ensure_ascii=False, indent=2).splitlines(),
        fromfile=f"versión {revision.revision_number}", tofile="actual", lineterm="",
    ))
    return {"revision_id": revision.id, "revision_number": revision.revision_number, "diff": diff}


@router.post("/{resource_type}/{resource_id}/revisions/{revision_id}/restore")
async def restore_revision(
    resource_type: str,
    resource_id: str,
    revision_id: str,
    _vault: bool = Depends(require_vault_unlocked),
    user: User = Depends(require_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    resource, _ = await require_resource_permission(db, resource_type, resource_id, user, "manage")
    revision = await db.scalar(select(ReportRevision).where(
        ReportRevision.id == revision_id,
        ReportRevision.resource_type == resource_type,
        ReportRevision.resource_id == resource_id,
    ))
    if revision is None:
        raise HTTPException(status_code=404, detail="Versión no encontrada.")
    state = await db.scalar(select(ReportCollaborationState).where(
        ReportCollaborationState.resource_type == resource_type,
        ReportCollaborationState.resource_id == resource_id,
    ).with_for_update())
    if state is None:
        raise HTTPException(status_code=409, detail="No hay estado colaborativo que restaurar.")
    serialized = decrypt_note(revision.encrypted_content) or "{}"
    content = json.loads(serialized)
    _apply_content(resource_type, resource, content)
    state.encrypted_state = revision.encrypted_state
    latest_seq = await _latest_sequence(db, resource_type, resource_id)
    state.checkpoint_seq = latest_seq
    state.generation += 1
    state.content_hash = revision.sha256
    state.updated_at = utc_now()
    await db.execute(update(ReportCollaborationUpdate).where(
        ReportCollaborationUpdate.resource_type == resource_type,
        ReportCollaborationUpdate.resource_id == resource_id,
        ReportCollaborationUpdate.encrypted_update.is_not(None),
    ).values(encrypted_update=None))
    restored = await _create_revision(
        db, resource_type=resource_type, resource_id=resource_id, user=user,
        resource=resource, state_plain=decrypt_note(revision.encrypted_state) or "",
        serialized_content=serialized, content_hash=revision.sha256, reason="restore",
    )
    await db.commit()
    return {"restored_revision": revision.revision_number, "new_revision": restored.revision_number,
            "generation": state.generation}


@router.get("/{resource_type}/{resource_id}/comments")
async def list_comments(
    resource_type: str,
    resource_id: str,
    _vault: bool = Depends(require_vault_unlocked),
    user: User = Depends(require_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    await require_resource_permission(db, resource_type, resource_id, user, "view")
    rows = (await db.execute(
        select(ReportComment, User).join(User, User.id == ReportComment.created_by_id).where(
            ReportComment.resource_type == resource_type,
            ReportComment.resource_id == resource_id,
        ).order_by(ReportComment.created_at.asc())
    )).all()
    return [{
        "id": comment.id,
        "anchor": comment.anchor,
        "body": decrypt_note(comment.encrypted_body) or "",
        "created_by_id": author.id,
        "created_by": author.full_name,
        "resolved": comment.resolved_at is not None,
        "resolved_by_id": comment.resolved_by_id,
        "created_at": comment.created_at,
        "resolved_at": comment.resolved_at,
    } for comment, author in rows]


@router.post("/{resource_type}/{resource_id}/comments", status_code=status.HTTP_201_CREATED)
async def create_comment(
    resource_type: str,
    resource_id: str,
    payload: CommentCreate,
    _vault: bool = Depends(require_vault_unlocked),
    user: User = Depends(require_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    await require_resource_permission(db, resource_type, resource_id, user, "comment")
    comment = ReportComment(
        resource_type=resource_type,
        resource_id=resource_id,
        anchor=payload.anchor,
        encrypted_body=encrypt_note(payload.body.strip()),
        created_by_id=user.id,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return {"id": comment.id, "body": payload.body.strip(), "anchor": comment.anchor,
            "created_by_id": user.id, "created_by": user.full_name, "resolved": False,
            "created_at": comment.created_at, "resolved_at": None}


@router.patch("/{resource_type}/{resource_id}/comments/{comment_id}/resolution")
async def resolve_comment(
    resource_type: str,
    resource_id: str,
    comment_id: str,
    resolved: bool,
    _vault: bool = Depends(require_vault_unlocked),
    user: User = Depends(require_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    await require_resource_permission(db, resource_type, resource_id, user, "comment")
    comment = await db.scalar(select(ReportComment).where(
        ReportComment.id == comment_id,
        ReportComment.resource_type == resource_type,
        ReportComment.resource_id == resource_id,
    ))
    if comment is None:
        raise HTTPException(status_code=404, detail="Comentario no encontrado.")
    if comment.created_by_id != user.id and user.role not in {"owner", "business_admin"}:
        permission = await get_permission(db, resource_type, resource_id, user)
        if permission not in {"editor", "reviewer"}:
            raise HTTPException(status_code=403, detail="No puedes resolver comentarios de este reporte.")
    comment.resolved_at = utc_now() if resolved else None
    comment.resolved_by_id = user.id if resolved else None
    comment.updated_at = utc_now()
    await db.commit()
    return {"id": comment.id, "resolved": resolved, "resolved_at": comment.resolved_at}


@router.get("/{resource_type}/{resource_id}/reviews")
async def list_reviews(
    resource_type: str,
    resource_id: str,
    _vault: bool = Depends(require_vault_unlocked),
    user: User = Depends(require_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    await require_resource_permission(db, resource_type, resource_id, user, "view")
    rows = (await db.execute(
        select(ReportReview, ReportRevision, User)
        .join(ReportRevision, ReportRevision.id == ReportReview.revision_id)
        .join(User, User.id == ReportReview.reviewer_id)
        .where(ReportRevision.resource_type == resource_type, ReportRevision.resource_id == resource_id)
        .order_by(ReportReview.created_at.desc())
    )).all()
    return [{"id": review.id, "revision_id": revision.id,
             "revision_number": revision.revision_number, "revision_sha256": revision.sha256,
             "reviewer_id": reviewer.id, "reviewer": reviewer.full_name,
             "status": review.status, "note": decrypt_note(review.encrypted_note),
             "requested_by_id": review.requested_by_id, "created_at": review.created_at,
             "responded_at": review.responded_at}
            for review, revision, reviewer in rows]


@router.post("/{resource_type}/{resource_id}/reviews", status_code=status.HTTP_201_CREATED)
async def request_review(
    resource_type: str,
    resource_id: str,
    payload: ReviewRequest,
    _vault: bool = Depends(require_vault_unlocked),
    user: User = Depends(require_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    await require_resource_permission(db, resource_type, resource_id, user, "edit")
    revision = await db.scalar(select(ReportRevision).where(
        ReportRevision.id == payload.revision_id,
        ReportRevision.resource_type == resource_type,
        ReportRevision.resource_id == resource_id,
    ))
    if revision is None:
        raise HTTPException(status_code=404, detail="Guarda una versión antes de solicitar revisión.")
    reviewer_ids = list(dict.fromkeys(payload.reviewer_ids))
    for reviewer_id in reviewer_ids:
        reviewer = await db.scalar(select(User).where(User.id == reviewer_id, User.is_active.is_(True)))
        if reviewer is None:
            raise HTTPException(status_code=404, detail="Uno de los revisores no existe o está inactivo.")
        permission = await get_permission(db, resource_type, resource_id, reviewer)
        if permission not in {"owner", "editor", "reviewer"}:
            raise HTTPException(status_code=403, detail="Comparte el reporte con cada revisor antes de asignarlo.")
        exists = await db.scalar(select(ReportReview.id).where(
            ReportReview.revision_id == revision.id,
            ReportReview.reviewer_id == reviewer_id,
        ))
        if exists:
            continue
        db.add(ReportReview(revision_id=revision.id, reviewer_id=reviewer_id,
                            requested_by_id=user.id, status="pending"))
    await db.commit()
    return {"revision_id": revision.id, "revision_number": revision.revision_number,
            "sha256": revision.sha256, "reviewers": reviewer_ids, "status": "pending"}


@router.patch("/{resource_type}/{resource_id}/reviews/{review_id}")
async def respond_to_review(
    resource_type: str,
    resource_id: str,
    review_id: str,
    payload: ReviewResponse,
    _vault: bool = Depends(require_vault_unlocked),
    user: User = Depends(require_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    await require_resource_permission(db, resource_type, resource_id, user, "view")
    review = await db.scalar(
        select(ReportReview)
        .join(ReportRevision, ReportRevision.id == ReportReview.revision_id)
        .where(ReportReview.id == review_id,
               ReportRevision.resource_type == resource_type,
               ReportRevision.resource_id == resource_id)
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Solicitud de revisión no encontrada.")
    if review.reviewer_id != user.id:
        raise HTTPException(status_code=403, detail="Solo la persona asignada puede aprobar esta revisión.")
    if review.status != "pending":
        raise HTTPException(status_code=409, detail="Esta revisión ya tiene una respuesta registrada.")
    review.status = payload.status
    review.encrypted_note = encrypt_note(payload.note.strip()) if payload.note and payload.note.strip() else None
    review.responded_at = utc_now()
    await db.commit()
    return {"id": review.id, "status": review.status, "responded_at": review.responded_at}


async def _consume_ticket(ticket: str, websocket: WebSocket):
    ticket_hash = hashlib.sha256(ticket.encode("ascii")).hexdigest()
    async with AsyncSessionLocal() as db:
        row = await db.scalar(select(ReportCollaborationTicket).where(
            ReportCollaborationTicket.token_hash == ticket_hash,
            ReportCollaborationTicket.consumed_at.is_(None),
            ReportCollaborationTicket.expires_at > utc_now(),
        ).with_for_update())
        if row is None:
            return None
        row.consumed_at = utc_now()
        user = await db.scalar(select(User).where(User.id == row.user_id, User.is_active.is_(True)))
        auth_session = await db.scalar(select(DbSession).where(
            DbSession.id == row.auth_session_id,
            DbSession.user_id == row.user_id,
            DbSession.is_revoked.is_(False),
            DbSession.expires_at > utc_now(),
        ))
        vault_session = await db.scalar(select(VaultSession).where(
            VaultSession.id == row.vault_session_id,
            VaultSession.revoked_at.is_(None),
            VaultSession.expires_at > utc_now(),
        ))
        try:
            permission = await get_permission(db, row.resource_type, row.resource_id, user) if user and auth_session and vault_session else None
        except HTTPException:
            await db.commit()
            return None
        key = _open_vault_key(ticket_hash, row.sealed_vault_key)
        if not user or not auth_session or not vault_session or not key or permission not in {"owner", "editor", "reviewer", "viewer"}:
            await db.commit()
            return None
        identity = {
            "resource_type": row.resource_type,
            "resource_id": row.resource_id,
            "user_id": user.id,
            "display_name": user.full_name,
            "role": user.role,
            "permission": permission,
            "auth_session_id": row.auth_session_id,
            "vault_session_id": row.vault_session_id,
            "key": key,
        }
        await db.commit()
        return identity


async def _socket_session_active(identity: dict) -> bool:
    async with AsyncSessionLocal() as db:
        user = await db.scalar(select(User).where(User.id == identity["user_id"], User.is_active.is_(True)))
        auth = await db.scalar(select(DbSession).where(
            DbSession.id == identity["auth_session_id"], DbSession.is_revoked.is_(False), DbSession.expires_at > utc_now()
        ))
        vault = await db.scalar(select(VaultSession).where(
            VaultSession.id == identity["vault_session_id"],
            VaultSession.revoked_at.is_(None),
            VaultSession.expires_at > utc_now(),
        ))
        try:
            permission = await get_permission(db, identity["resource_type"], identity["resource_id"], user) if user else None
        except HTTPException:
            return False
        return bool(
            user
            and auth
            and vault
            and permission == identity["permission"]
            and permission in {"owner", "editor", "reviewer", "viewer"}
        )


def _offered_ticket(websocket: WebSocket) -> str | None:
    for protocol in websocket.scope.get("subprotocols", []):
        if protocol.startswith("lessso-collab."):
            return protocol.removeprefix("lessso-collab.")
    return None


def _origin_allowed(websocket: WebSocket) -> bool:
    origin = websocket.headers.get("origin")
    if not origin:
        return False
    from urllib.parse import urlsplit

    origin_parts = urlsplit(origin)
    forwarded_host = websocket.headers.get("x-forwarded-host")
    host = forwarded_host or websocket.headers.get("host", "")
    if origin_parts.scheme not in {"https", "http"} or not host:
        return False
    if origin_parts.scheme == "http" and origin_parts.hostname not in {"localhost", "127.0.0.1", "test"}:
        return False
    return origin_parts.netloc.lower() == host.lower()


async def _socket_init(db: AsyncSession, identity: dict) -> dict | None:
    resource_type = identity["resource_type"]
    resource_id = identity["resource_id"]
    state = await db.scalar(select(ReportCollaborationState).where(
        ReportCollaborationState.resource_type == resource_type,
        ReportCollaborationState.resource_id == resource_id,
    ))
    if state is None:
        return None
    updates = await _events_after(db, resource_type, resource_id, state.checkpoint_seq)
    user = await db.scalar(select(User).where(User.id == identity["user_id"], User.is_active.is_(True)))
    try:
        permission = await get_permission(db, resource_type, resource_id, user) if user else None
    except HTTPException:
        return None
    if permission not in {"owner", "editor", "reviewer", "viewer"}:
        return {"type": "permission_revoked"}
    return {
        "type": "sync",
        "state": decrypt_note(state.encrypted_state),
        "checkpoint_seq": state.checkpoint_seq,
        "latest_seq": max([state.checkpoint_seq, *(event["seq"] for event in updates)]),
        "generation": state.generation,
        "permission": permission,
        "updates": updates,
    }


@router.websocket("/ws")
async def collaboration_socket(websocket: WebSocket):
    if not _origin_allowed(websocket):
        await websocket.close(code=4403, reason="Origen de colaboración no permitido.")
        return
    ticket = _offered_ticket(websocket)
    if not ticket or not re.fullmatch(r"[A-Za-z0-9_-]{32,64}", ticket):
        await websocket.close(code=4401, reason="Se requiere un ticket de colaboración válido.")
        return
    identity = await _consume_ticket(ticket, websocket)
    if identity is None:
        await websocket.close(code=4401, reason="El ticket de colaboración venció o ya fue usado.")
        return
    token = active_vault_key.set(identity["key"])
    client_id: str | None = None
    last_seq = 0
    generation = 0
    last_presence_payload = ""
    last_presence_refresh = 0.0
    last_session_check = 0.0
    resource_type = identity["resource_type"]
    resource_id = identity["resource_id"]
    try:
        await websocket.accept(subprotocol="lessso-collab")
        async with AsyncSessionLocal() as db:
            initial = await _socket_init(db, identity)
        if initial is None:
            await websocket.send_json({"type": "error", "detail": "El estado compartido no está inicializado."})
            await websocket.close(code=4409)
            return
        if initial.get("type") == "permission_revoked":
            await websocket.close(code=4403, reason="No tienes acceso a este reporte.")
            return
        generation = initial["generation"]
        last_seq = initial["latest_seq"]
        await websocket.send_json(initial)
        next_poll = asyncio.get_running_loop().time()

        while True:
            now_monotonic = asyncio.get_running_loop().time()
            if now_monotonic - last_session_check >= 5:
                if not await _socket_session_active(identity):
                    await websocket.send_json({"type": "auth_expired"})
                    await websocket.close(code=4401, reason="La sesión o el permiso del reporte venció.")
                    return
                last_session_check = now_monotonic

            timeout = max(0.05, min(0.5, next_poll - now_monotonic))
            try:
                message = await asyncio.wait_for(websocket.receive_json(), timeout=timeout)
            except asyncio.TimeoutError:
                message = None
            except WebSocketDisconnect:
                return

            if message is not None:
                if not isinstance(message, dict):
                    continue
                message_type = message.get("type")
                if message_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif message_type == "update":
                    if identity["permission"] not in {"owner", "editor"}:
                        await websocket.send_json({"type": "error", "detail": "Tienes permiso de solo lectura."})
                        continue
                    update_id = message.get("update_id")
                    encoded = message.get("update")
                    if (message.get("generation") != generation or not isinstance(update_id, str)
                            or not re.fullmatch(r"[0-9a-fA-F-]{36}", update_id)
                            or not isinstance(encoded, str)):
                        await websocket.send_json({"type": "reset", "generation": generation})
                        continue
                    try:
                        _decode_b64(encoded, maximum=_MAX_UPDATE_BYTES, label="en vivo")
                    except HTTPException as exc:
                        await websocket.send_json({"type": "error", "detail": str(exc.detail)})
                        continue
                    async with AsyncSessionLocal() as db:
                        state = await db.scalar(select(ReportCollaborationState).where(
                            ReportCollaborationState.resource_type == resource_type,
                            ReportCollaborationState.resource_id == resource_id,
                        ).with_for_update())
                        socket_user = await db.scalar(select(User).where(
                            User.id == identity["user_id"], User.is_active.is_(True)
                        ))
                        permission = (await get_permission(db, resource_type, resource_id, socket_user)
                                      if socket_user else None)
                        if state is None or state.generation != generation:
                            await websocket.send_json({"type": "reset", "generation": state.generation if state else generation + 1})
                            await websocket.close(code=4409, reason="La generación del documento cambió.")
                            return
                        if permission not in {"owner", "editor"}:
                            await websocket.send_json({"type": "error", "detail": "Se retiró tu permiso de edición."})
                            await websocket.close(code=4403)
                            return
                        existing = await db.scalar(select(ReportCollaborationUpdate.id).where(
                            ReportCollaborationUpdate.resource_type == resource_type,
                            ReportCollaborationUpdate.resource_id == resource_id,
                            ReportCollaborationUpdate.update_id == update_id,
                        ))
                        if existing is not None:
                            sequence = existing
                        else:
                            event_insert = pg_insert(ReportCollaborationUpdate).values(
                                resource_type=resource_type,
                                resource_id=resource_id,
                                update_id=update_id,
                                user_id=identity["user_id"],
                                encrypted_update=encrypt_note(encoded),
                                created_at=utc_now(),
                            ).on_conflict_do_nothing(constraint="uq_report_collaboration_update_id").returning(
                                ReportCollaborationUpdate.id
                            )
                            sequence = await db.scalar(event_insert)
                            if sequence is None:
                                sequence = await db.scalar(select(ReportCollaborationUpdate.id).where(
                                    ReportCollaborationUpdate.resource_type == resource_type,
                                    ReportCollaborationUpdate.resource_id == resource_id,
                                    ReportCollaborationUpdate.update_id == update_id,
                                ))
                            if sequence is None:
                                await websocket.send_json({"type": "error", "detail": "No se pudo guardar el cambio colaborativo."})
                                await db.rollback()
                                continue
                            await db.commit()
                    await websocket.send_json({"type": "ack", "update_id": update_id, "seq": sequence})
                elif message_type == "awareness":
                    incoming_client = message.get("client_id")
                    awareness = message.get("update")
                    if (isinstance(incoming_client, str) and 1 <= len(incoming_client) <= 64
                            and isinstance(awareness, str) and len(awareness) <= 32_000):
                        try:
                            _decode_b64(awareness, maximum=24_000, label="de presencia")
                        except HTTPException:
                            continue
                        client_id = incoming_client
                        async with AsyncSessionLocal() as db:
                            row = await db.scalar(select(ReportCollaborationPresence).where(
                                ReportCollaborationPresence.resource_type == resource_type,
                                ReportCollaborationPresence.resource_id == resource_id,
                                ReportCollaborationPresence.client_id == client_id,
                            ))
                            if row is not None and row.user_id != identity["user_id"]:
                                await websocket.send_json({
                                    "type": "error",
                                    "detail": "El identificador de presencia pertenece a otra sesión.",
                                })
                                continue
                            if row is None:
                                row = ReportCollaborationPresence(
                                    resource_type=resource_type,
                                    resource_id=resource_id,
                                    client_id=client_id,
                                    user_id=identity["user_id"],
                                    display_name=identity["display_name"],
                                    state_json=encrypt_note(awareness),
                                    expires_at=utc_now() + timedelta(seconds=_PRESENCE_TTL_SECONDS),
                                )
                                db.add(row)
                            else:
                                row.user_id = identity["user_id"]
                                row.display_name = identity["display_name"]
                                row.state_json = encrypt_note(awareness)
                                row.expires_at = utc_now() + timedelta(seconds=_PRESENCE_TTL_SECONDS)
                            await db.commit()

            now_monotonic = asyncio.get_running_loop().time()
            if now_monotonic >= next_poll:
                async with AsyncSessionLocal() as db:
                    state = await db.scalar(select(ReportCollaborationState).where(
                        ReportCollaborationState.resource_type == resource_type,
                        ReportCollaborationState.resource_id == resource_id,
                    ))
                    if state is None or state.generation != generation:
                        await websocket.send_json({"type": "reset", "generation": state.generation if state else generation + 1})
                        await websocket.close(code=4409, reason="El documento fue restaurado.")
                        return
                    rows = (await db.execute(
                        select(ReportCollaborationUpdate).where(
                            ReportCollaborationUpdate.resource_type == resource_type,
                            ReportCollaborationUpdate.resource_id == resource_id,
                            ReportCollaborationUpdate.id > last_seq,
                        ).order_by(ReportCollaborationUpdate.id.asc()).limit(500)
                    )).scalars().all()
                    for row in rows:
                        await websocket.send_json({"type": "update", "seq": row.id,
                                                   "update_id": row.update_id,
                                                   "user_id": row.user_id,
                                                   "update": decrypt_note(row.encrypted_update)})
                        last_seq = row.id
                    if now_monotonic - last_presence_refresh >= 1:
                        presence_rows = (await db.execute(select(ReportCollaborationPresence).where(
                            ReportCollaborationPresence.resource_type == resource_type,
                            ReportCollaborationPresence.resource_id == resource_id,
                            ReportCollaborationPresence.expires_at > utc_now(),
                        ))).scalars().all()
                        presence = [{
                            "client_id": row.client_id,
                            "user_id": row.user_id,
                            "display_name": row.display_name,
                            "update": decrypt_note(row.state_json),
                        } for row in presence_rows]
                        signature = json.dumps(presence, sort_keys=True, separators=(",", ":"))
                        if signature != last_presence_payload:
                            await websocket.send_json({"type": "presence", "clients": presence})
                            last_presence_payload = signature
                        last_presence_refresh = now_monotonic
                next_poll = now_monotonic + 0.25
    except WebSocketDisconnect:
        return
    finally:
        if client_id:
            async with AsyncSessionLocal() as db:
                await db.execute(delete(ReportCollaborationPresence).where(
                    ReportCollaborationPresence.resource_type == resource_type,
                    ReportCollaborationPresence.resource_id == resource_id,
                    ReportCollaborationPresence.client_id == client_id,
                    ReportCollaborationPresence.user_id == identity["user_id"],
                ))
                await db.commit()
        active_vault_key.reset(token)
