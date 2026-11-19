import json
import hashlib
import hmac
import math
import re
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from starlette.concurrency import run_in_threadpool
from sqlalchemy import case, delete, desc, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import set_committed_value
from app.database import get_db
from app.models import utc_now
from app.models.core import User
from app.models.writeups import (
    Writeup,
    WriteupAsset,
    WriteupBoard,
    WriteupCitation,
    WriteupEditLock,
    WriteupExportLog,
    WriteupRevision,
    WriteupSnippet,
)
from app.schemas.writeups import (
    WriteupAssetOut,
    WriteupBoardCreate,
    WriteupBoardOut,
    WriteupBoardUpdate,
    WriteupCitationCreate,
    WriteupCitationOut,
    WriteupCitationUpdate,
    WriteupCloneRequest,
    WriteupCreate,
    WriteupDetailOut,
    WriteupExportRequest,
    WriteupExportPreviewRequest,
    WriteupOverviewOut,
    WriteupEditLeaseAcquire,
    WriteupPreviewOut,
    WriteupRevisionOut,
    WriteupRevisionAuthorOut,
    WriteupSummaryOut,
    WriteupUpdate,
    WriteupSnippetCreate,
    WriteupSnippetOut,
    WriteupSnippetUpdate,
)
from app.security.crypto import decrypt_note, encrypt_note
from app.config import settings
from app.middleware.request_limits import read_upload_limited
from app.security.tokens import require_vault_unlocked
from app.services.activity_service import record_event
from app.services.core_auth import OPERATIONS_ROLES, require_role
from app.services.writeup_exporter import ExportBundleContext, build_standalone_html_document, compile_writeup_export, render_sanitized_html_fragment
from app.services.writeup_media import (
    convert_video_bytes_to_gif,
    decrypt_asset_bytes,
    is_video_mime,
    optimize_and_encrypt_media,
)
from app.services.writeup_service import (
    build_export_context,
    build_writeup_detail_dict,
    count_related_entities,
    create_revision_snapshot,
    decrypt_revision_text,
    get_writeup_or_404,
    infer_revision_type,
    normalize_quote_hash,
    sanitize_board_svg,
    serialize_asset,
    serialize_board,
    serialize_citation,
    slugify_title,
    validate_optional_links,
)


WRITEUP_EDIT_LEASE_SECONDS = 90


async def _lock_writeup_for_resource_mutation(
    db: AsyncSession,
    writeup_id: str,
    expected_updated_at: datetime | None,
) -> Writeup:
    """Serialize child-resource edits and atomically compare/bump the parent version."""
    writeup = (await db.execute(
        select(Writeup)
        .where(Writeup.id == writeup_id, Writeup.is_deleted == False)  # noqa: E712
        .with_for_update()
    )).scalar_one_or_none()
    if not writeup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Writeup no encontrado.")

    now = utc_now()
    if expected_updated_at is not None:
        expected = expected_updated_at
        if expected.tzinfo is not None:
            expected = expected.astimezone(timezone.utc).replace(tzinfo=None)
        if writeup.updated_at != expected:
            raise HTTPException(status_code=409, detail="El informe cambió en otra sesión. Actualiza antes de guardar.")
        # A compare-and-swap also protects databases that do not implement FOR UPDATE.
        result = await db.execute(
            update(Writeup)
            .where(
                Writeup.id == writeup_id,
                Writeup.is_deleted == False,  # noqa: E712
                Writeup.updated_at == expected,
            )
            .values(updated_at=now)
            .execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            raise HTTPException(status_code=409, detail="El informe cambió en otra sesión. Actualiza antes de guardar.")
        set_committed_value(writeup, "updated_at", now)
    else:
        # Optional during the compatibility period for older clients.
        writeup.updated_at = now
    return writeup


require_writeup_access = require_role(list(OPERATIONS_ROLES))


async def _validate_workbench_links(
    db: AsyncSession,
    writeup_id: str | None,
    workbench: dict,
    findings: list[dict],
) -> None:
    finding_ids = {str(item.get("id")) for item in findings if isinstance(item, dict) and item.get("id")}
    asset_ids = {
        str(asset_id)
        for evidence in workbench.get("evidence", [])
        if isinstance(evidence, dict)
        for asset_id in evidence.get("asset_ids", [])
    }
    evidence_finding_ids = {
        str(finding_id)
        for evidence in workbench.get("evidence", [])
        if isinstance(evidence, dict)
        for finding_id in evidence.get("finding_ids", [])
    }
    if evidence_finding_ids - finding_ids:
        raise HTTPException(status_code=422, detail="Una evidencia apunta a un hallazgo que ya no existe en este informe.")
    if not asset_ids:
        return
    if not writeup_id:
        raise HTTPException(status_code=422, detail="Las evidencias de un informe nuevo no pueden apuntar a archivos existentes.")
    existing_assets = set((await db.execute(
        select(WriteupAsset.id).where(
            WriteupAsset.writeup_id == writeup_id,
            WriteupAsset.is_deleted == False,  # noqa: E712
            WriteupAsset.id.in_(asset_ids),
        )
    )).scalars().all())
    if existing_assets != asset_ids:
        raise HTTPException(status_code=422, detail="Una evidencia apunta a un archivo ajeno o eliminado.")


def _vault_session_fingerprint(request: Request) -> str | None:
    token = request.headers.get("X-Vault-Token")
    return hashlib.sha256(token.encode("utf-8")).hexdigest() if token else None


def _lease_request_matches(lock: WriteupEditLock, request: Request, user: User | None) -> bool:
    token = request.headers.get("X-Writeup-Edit-Lease", "")
    client_id = request.headers.get("X-Writeup-Client-ID", "")
    if not token or not client_id or not lock.lease_token_hash:
        return False
    if not hmac.compare_digest(hashlib.sha256(token.encode("utf-8")).hexdigest(), lock.lease_token_hash):
        return False
    if client_id != lock.lease_client_id:
        return False
    if lock.lease_user_id:
        return bool(user and user.id == lock.lease_user_id)
    return bool(_vault_session_fingerprint(request) and _vault_session_fingerprint(request) == lock.lease_vault_hash)


async def enforce_writeup_edit_lock(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
) -> None:
    """Protect mutations server-side while leaving reads, previews and exports available."""
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    path = request.url.path.rstrip("/")
    if path.endswith(("/manual-lock", "/edit-lease", "/clone", "/export", "/preview")):
        return
    writeup_id = request.path_params.get("writeup_id")
    if not writeup_id:
        return

    # Require a server-issued lease for every mutation. Creating the row here
    # also closes the legacy-client loophole where an unreserved write could
    # race the first editor to acquire a lease.
    lock = await _get_writeup_lock_record(db, writeup_id, create=True)
    assert lock is not None
    if lock.manual_locked_at:
        raise HTTPException(status_code=423, detail=f"Este writeup está bloqueado para edición por {lock.manual_locked_by_name or 'otro usuario'}.")
    now = utc_now()
    lease_is_active = bool(lock.lease_expires_at and lock.lease_expires_at > now)
    lease_matches = lease_is_active and _lease_request_matches(lock, request, current_user)
    if not lease_matches:
        if not lease_is_active:
            detail = "La reserva de edición no está activa o venció. Vuelve a abrir el informe para reservarlo antes de guardar."
        else:
            holder = lock.lease_holder_name or "otra sesión"
            detail = f"Este writeup está reservado para edición por {holder}. Inténtalo cuando venza o se libere la reserva."
        raise HTTPException(status_code=423, detail=detail)


async def _get_writeup_lock_record(db: AsyncSession, writeup_id: str, *, create: bool = False) -> WriteupEditLock | None:
    if create:
        writeup = (await db.execute(
            select(Writeup).where(Writeup.id == writeup_id, Writeup.is_deleted == False).with_for_update()  # noqa: E712
        )).scalar_one_or_none()
        if not writeup:
            raise HTTPException(status_code=404, detail="Writeup no encontrado.")
        # Serialize creation of the lock row for databases without row-level locks.
        await db.execute(
            update(Writeup)
            .where(Writeup.id == writeup_id, Writeup.is_deleted == False)  # noqa: E712
            .values(updated_at=Writeup.updated_at)
            .execution_options(synchronize_session=False)
        )
    lock = (await db.execute(
        select(WriteupEditLock).where(WriteupEditLock.writeup_id == writeup_id).with_for_update()
    )).scalar_one_or_none()
    if lock or not create:
        return lock
    lock = WriteupEditLock(writeup_id=writeup_id)
    db.add(lock)
    await db.flush()
    return lock


def _is_manual_lock_owner(lock: WriteupEditLock, user: User | None) -> bool:
    if user and user.role == "owner":
        return True
    if lock.manual_locked_by_id:
        return bool(user and user.id == lock.manual_locked_by_id)
    # Vault-only sessions have no durable user identity and their token rotates
    # whenever the vault is reopened. The route already requires a valid,
    # unlocked vault session, so any such session can release this manual lock.
    return True


router = APIRouter(
    prefix="/writeups",
    tags=["Pentest Writeups & Whiteboards"],
    dependencies=[Depends(require_vault_unlocked), Depends(enforce_writeup_edit_lock)],
)


@router.get("", response_model=list[WriteupSummaryOut])
async def list_writeups(
    response: Response,
    status_filter: str | None = Query(default=None, alias="status", max_length=32),
    severity_filter: str | None = Query(default=None, alias="severity", max_length=32),
    prospect_id: str | None = Query(default=None, max_length=36),
    project_id: str | None = Query(default=None, max_length=36),
    q: str | None = Query(default=None, max_length=120),
    limit: int | None = Query(default=None, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    stmt = select(Writeup).where(Writeup.is_deleted == False)  # noqa: E712
    count_stmt = select(func.count(Writeup.id)).where(Writeup.is_deleted == False)  # noqa: E712
    if status_filter:
        stmt = stmt.where(Writeup.status == status_filter)
        count_stmt = count_stmt.where(Writeup.status == status_filter)
    if severity_filter:
        stmt = stmt.where(Writeup.severity == severity_filter)
        count_stmt = count_stmt.where(Writeup.severity == severity_filter)
    if prospect_id:
        stmt = stmt.where(Writeup.prospect_id == prospect_id)
        count_stmt = count_stmt.where(Writeup.prospect_id == prospect_id)
    if project_id:
        stmt = stmt.where(Writeup.project_id == project_id)
        count_stmt = count_stmt.where(Writeup.project_id == project_id)
    query_text = q.strip() if q else ""
    if query_text:
        escaped_query = query_text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query_filter = or_(
            Writeup.title.ilike(f"%{escaped_query}%", escape="\\"),
            Writeup.cwe_id.ilike(f"%{escaped_query}%", escape="\\"),
            Writeup.cve_id.ilike(f"%{escaped_query}%", escape="\\"),
            Writeup.target_scope.ilike(f"%{escaped_query}%", escape="\\"),
            Writeup.tags_json.ilike(f"%{escaped_query}%", escape="\\"),
        )
        stmt = stmt.where(query_filter)
        count_stmt = count_stmt.where(query_filter)

    total = (await db.execute(count_stmt)).scalar_one()
    response.headers["X-Total-Count"] = str(total)
    stmt = stmt.order_by(desc(Writeup.updated_at), Writeup.id.desc())
    if limit is None:
        if offset:
            stmt = stmt.offset(offset)
        response.headers["X-Has-More"] = "false"
    else:
        stmt = stmt.limit(limit + 1).offset(offset)
        response.headers["X-Has-More"] = str(total > offset + limit).lower()
    rows = (await db.execute(stmt)).scalars().all()
    if limit is not None:
        rows = rows[:limit]
    results: list[dict] = []
    for row in rows:
        tags = json.loads(row.tags_json) if row.tags_json else []
        boards_count, assets_count, citations_count = await count_related_entities(db, row.id)
        results.append({
            "id": row.id,
            "title": row.title,
            "slug": row.slug,
            "status": row.status,
            "severity": row.severity,
            "cvss_score": row.cvss_score,
            "cwe_id": row.cwe_id,
            "cve_id": row.cve_id,
            "target_scope": row.target_scope,
            "tags": tags,
            "prospect_id": row.prospect_id,
            "project_id": row.project_id,
            "engagement_id": row.engagement_id,
            "boards_count": boards_count,
            "assets_count": assets_count,
            "citations_count": citations_count,
            "updated_at": row.updated_at,
            "created_at": row.created_at,
        })
    return results


@router.get("/overview", response_model=WriteupOverviewOut)
async def get_writeup_overview(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    """Return aggregate document statistics without returning report content."""
    rows = (await db.execute(
        select(Writeup.id, Writeup.title, Writeup.encrypted_markdown)
        .where(Writeup.is_deleted == False)  # noqa: E712
        .order_by(desc(Writeup.updated_at), Writeup.id.desc())
    )).all()

    word_pattern = re.compile(r"\b[\w'-]+\b", re.UNICODE)
    language_pattern = re.compile(r"```[ \t]*([A-Za-z0-9_+#.-]+)?")
    language_counts: dict[str, int] = {}
    document_words: list[tuple[str, int]] = []
    unreadable_documents = 0
    total_words = 0

    for writeup_id, title, encrypted_markdown in rows:
        try:
            markdown_text = decrypt_note(encrypted_markdown or "") or ""
        except Exception:
            unreadable_documents += 1
            continue
        word_count = len(word_pattern.findall(markdown_text))
        document_words.append((title, word_count))
        total_words += word_count
        for language in language_pattern.findall(markdown_text):
            if language:
                normalized = language.strip().lower()
                language_counts[normalized] = language_counts.get(normalized, 0) + 1

    writeup_ids = [row[0] for row in rows]
    export_counts: dict[str, int] = {}
    revision_count = 0
    if writeup_ids:
        export_rows = (await db.execute(
            select(WriteupExportLog.export_format, func.count(WriteupExportLog.id))
            .where(WriteupExportLog.writeup_id.in_(writeup_ids))
            .group_by(WriteupExportLog.export_format)
        )).all()
        export_counts = {str(export_format): int(count) for export_format, count in export_rows}
        revision_count = int((await db.execute(
            select(func.count(WriteupRevision.id))
            .where(WriteupRevision.writeup_id.in_(writeup_ids))
        )).scalar_one())

    export_count = sum(export_counts.values())
    language_total = sum(language_counts.values())
    largest = max(document_words, key=lambda item: item[1], default=(None, 0))

    def buckets(counts: dict[str, int], total: int) -> list[dict]:
        return [
            {
                "label": label,
                "count": count,
                "percentage": round((count / total) * 100, 1) if total else 0,
            }
            for label, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        ]

    return {
        "report_count": len(rows),
        "total_words": total_words,
        "estimated_reading_minutes": math.ceil(total_words / 200) if total_words else 0,
        "largest_document_title": largest[0],
        "largest_document_words": largest[1],
        "language_distribution": buckets(language_counts, language_total),
        "export_count": export_count,
        "export_distribution": buckets(export_counts, export_count),
        "revision_count": revision_count,
        "unreadable_documents": unreadable_documents,
    }


@router.get("/snippets", response_model=list[WriteupSnippetOut])
async def list_writeup_snippets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    rows = (await db.execute(select(WriteupSnippet).order_by(WriteupSnippet.name.asc()).limit(500))).scalars().all()
    return [{
        "id": row.id,
        "name": row.name,
        "template": decrypt_note(row.encrypted_template) or "",
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    } for row in rows]


@router.post("/snippets", response_model=WriteupSnippetOut, status_code=status.HTTP_201_CREATED)
async def create_writeup_snippet(
    payload: WriteupSnippetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    name, template = payload.name.strip(), payload.template.strip()
    if not name or not template:
        raise HTTPException(status_code=422, detail="El nombre y la plantilla no pueden estar vacíos.")
    snippet_count = await db.scalar(select(func.count(WriteupSnippet.id)))
    if int(snippet_count or 0) >= 500:
        raise HTTPException(status_code=409, detail="La biblioteca admite hasta 500 fragmentos. Elimina alguno antes de añadir otro.")
    row = WriteupSnippet(name=name, encrypted_template=encrypt_note(template))
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id, "name": row.name, "template": template, "created_at": row.created_at, "updated_at": row.updated_at}


@router.patch("/snippets/{snippet_id}", response_model=WriteupSnippetOut)
async def update_writeup_snippet(
    snippet_id: str,
    payload: WriteupSnippetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    row = await db.get(WriteupSnippet, snippet_id)
    if not row:
        raise HTTPException(status_code=404, detail="Fragmento no encontrado.")
    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        if updates["name"] is None or not updates["name"].strip():
            raise HTTPException(status_code=422, detail="El nombre del fragmento no puede estar vacío.")
        row.name = updates["name"].strip()
    if "template" in updates:
        if updates["template"] is None or not updates["template"].strip():
            raise HTTPException(status_code=422, detail="La plantilla no puede estar vacía.")
        row.encrypted_template = encrypt_note(updates["template"].strip())
    await db.commit()
    await db.refresh(row)
    return {"id": row.id, "name": row.name, "template": decrypt_note(row.encrypted_template) or "", "created_at": row.created_at, "updated_at": row.updated_at}


@router.delete("/snippets/{snippet_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_writeup_snippet(
    snippet_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    row = await db.get(WriteupSnippet, snippet_id)
    if not row:
        raise HTTPException(status_code=404, detail="Fragmento no encontrado.")
    await db.delete(row)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("", response_model=WriteupDetailOut, status_code=status.HTTP_201_CREATED)
async def create_writeup(
    payload: WriteupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    await validate_optional_links(db, payload.prospect_id, payload.project_id, payload.engagement_id)
    await _validate_workbench_links(
        db,
        None,
        json.loads(payload.workbench.model_dump_json()),
        [finding.model_dump(mode="json") for finding in payload.findings],
    )
    writeup = Writeup(
        title=payload.title,
        slug=slugify_title(payload.title),
        status=payload.status,
        severity=payload.severity,
        cvss_score=payload.cvss_score,
        cvss_vector=payload.cvss_vector,
        cwe_id=payload.cwe_id,
        cve_id=payload.cve_id,
        target_scope=payload.target_scope,
        tags_json=json.dumps(payload.tags, ensure_ascii=False),
        encrypted_markdown=encrypt_note(payload.markdown_content),
        encrypted_executive_summary=encrypt_note(payload.executive_summary) if payload.executive_summary else None,
        encrypted_findings_json=encrypt_note(json.dumps([f.model_dump() for f in payload.findings], ensure_ascii=False))
        if payload.findings
        else None,
        encrypted_workbench_json=encrypt_note(payload.workbench.model_dump_json()),
        prospect_id=payload.prospect_id,
        project_id=payload.project_id,
        engagement_id=payload.engagement_id,
        created_by_id=current_user.id if current_user else None,
    )
    db.add(writeup)
    await db.flush()

    if payload.create_default_board:
        db.add(
            WriteupBoard(
                writeup_id=writeup.id,
                title="Pizarra de ataque",
                encrypted_scene_json=encrypt_note("{}"),
                element_count=0,
            )
        )
    await create_revision_snapshot(db, writeup, payload.markdown_content, current_user.id if current_user else None, "Versión inicial")

    await record_event(
        db,
        module="writeups",
        action="writeup_created",
        entity_type="writeup",
        entity_id=writeup.id,
        summary=f"Writeup creado: {writeup.title}",
        user_id=current_user.id if current_user else None,
        user_name=current_user.username if current_user else "Bóveda",
    )
    await db.commit()
    await db.refresh(writeup)
    return await build_writeup_detail_dict(db, writeup)


@router.get("/{writeup_id}", response_model=WriteupDetailOut)
async def get_writeup(
    writeup_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    writeup = await get_writeup_or_404(db, writeup_id)
    return await build_writeup_detail_dict(db, writeup)


@router.post("/{writeup_id}/manual-lock")
async def set_writeup_manual_lock(
    writeup_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    """Set a persistent read-only lock. Reading and exporting stay available."""
    await get_writeup_or_404(db, writeup_id)
    lock = await _get_writeup_lock_record(db, writeup_id, create=True)
    assert lock is not None
    if lock.manual_locked_at and not _is_manual_lock_owner(lock, current_user):
        raise HTTPException(status_code=423, detail=f"Este writeup ya está bloqueado por {lock.manual_locked_by_name or 'otro usuario'}.")
    if lock.lease_expires_at and lock.lease_expires_at > utc_now() and not _lease_request_matches(lock, request, current_user):
        raise HTTPException(status_code=423, detail=f"El writeup está en edición por {lock.lease_holder_name or 'otra sesión'}; no se puede bloquear hasta que libere la reserva.")
    lock.manual_locked_at = lock.manual_locked_at or utc_now()
    lock.manual_locked_by_id = current_user.id if current_user else None
    lock.manual_locked_by_vault_hash = _vault_session_fingerprint(request)
    lock.manual_locked_by_name = current_user.username if current_user else "Sesión de bóveda"
    lock.lease_client_id = None
    lock.lease_user_id = None
    lock.lease_vault_hash = None
    lock.lease_token_hash = None
    lock.lease_holder_name = None
    lock.lease_expires_at = None
    await db.commit()
    return {"manual_locked": True, "manual_locked_by": lock.manual_locked_by_name, "manual_locked_at": lock.manual_locked_at}


@router.delete("/{writeup_id}/manual-lock")
async def clear_writeup_manual_lock(
    writeup_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    lock = await _get_writeup_lock_record(db, writeup_id)
    if not lock or not lock.manual_locked_at:
        await get_writeup_or_404(db, writeup_id)
        return {"manual_locked": False, "manual_locked_by": None, "manual_locked_at": None}
    if not _is_manual_lock_owner(lock, current_user):
        raise HTTPException(status_code=403, detail="Solo quien bloqueó el writeup o una persona propietaria puede desbloquearlo.")
    lock.manual_locked_at = None
    lock.manual_locked_by_id = None
    lock.manual_locked_by_vault_hash = None
    lock.manual_locked_by_name = None
    await db.commit()
    return {"manual_locked": False, "manual_locked_by": None, "manual_locked_at": None}


@router.post("/{writeup_id}/edit-lease")
async def acquire_writeup_edit_lease(
    writeup_id: str,
    payload: WriteupEditLeaseAcquire,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    """Acquire or renew a per-tab editing reservation with a short expiry."""
    await get_writeup_or_404(db, writeup_id)
    lock = await _get_writeup_lock_record(db, writeup_id, create=True)
    assert lock is not None
    if lock.manual_locked_at:
        raise HTTPException(status_code=423, detail=f"Este writeup está bloqueado para edición por {lock.manual_locked_by_name or 'otro usuario'}.")

    now = utc_now()
    fingerprint = _vault_session_fingerprint(request)
    same_principal = (
        bool(current_user and current_user.id == lock.lease_user_id)
        if lock.lease_user_id
        else bool(fingerprint and fingerprint == lock.lease_vault_hash)
    )
    lease_is_active = bool(lock.lease_expires_at and lock.lease_expires_at > now)
    if lease_is_active:
        same_lease = lock.lease_client_id == payload.client_id and same_principal
        # A full page reload loses the in-memory lease token. Permit recovery
        # only for the same authenticated principal and per-tab client ID; the
        # newly issued token immediately invalidates the token from the old page.
        if not same_lease:
            raise HTTPException(
                status_code=423,
                detail=f"Este writeup está reservado para edición por {lock.lease_holder_name or 'otra sesión'} hasta {lock.lease_expires_at.isoformat()}.",
            )

    token = secrets.token_urlsafe(32)
    lock.lease_client_id = payload.client_id
    lock.lease_user_id = current_user.id if current_user else None
    lock.lease_vault_hash = fingerprint
    lock.lease_token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    lock.lease_holder_name = current_user.username if current_user else "Esta sesión"
    lock.lease_expires_at = now + timedelta(seconds=WRITEUP_EDIT_LEASE_SECONDS)
    await db.commit()
    return {
        "acquired": True,
        "token": token,
        "client_id": payload.client_id,
        "holder": lock.lease_holder_name,
        "expires_at": lock.lease_expires_at,
        "ttl_seconds": WRITEUP_EDIT_LEASE_SECONDS,
    }


@router.delete("/{writeup_id}/edit-lease")
async def release_writeup_edit_lease(
    writeup_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    lock = await _get_writeup_lock_record(db, writeup_id)
    if not lock:
        await get_writeup_or_404(db, writeup_id)
        return {"released": False}
    if not _lease_request_matches(lock, request, current_user):
        return {"released": False}
    lock.lease_client_id = None
    lock.lease_user_id = None
    lock.lease_vault_hash = None
    lock.lease_token_hash = None
    lock.lease_holder_name = None
    lock.lease_expires_at = None
    await db.commit()
    return {"released": True}


@router.patch("/{writeup_id}", response_model=WriteupDetailOut)
async def update_writeup(
    writeup_id: str,
    payload: WriteupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    # Lock + compare-and-swap before reading mutable data, including on SQLite where
    # SELECT FOR UPDATE is ignored.
    writeup = await _lock_writeup_for_resource_mutation(db, writeup_id, payload.expected_updated_at)
    updates = payload.model_dump(exclude_unset=True)
    updates.pop("expected_updated_at", None)
    if payload.workbench is not None:
        updates["workbench"] = json.loads(payload.workbench.model_dump_json())
    await validate_optional_links(
        db,
        updates.get("prospect_id"),
        updates.get("project_id"),
        updates.get("engagement_id"),
    )

    if "title" in updates:
        writeup.title = updates["title"]
        writeup.slug = slugify_title(updates["title"])
    for field in ("status", "severity", "cvss_score", "cvss_vector", "cwe_id", "cve_id", "target_scope", "prospect_id", "project_id", "engagement_id"):
        if field in updates:
            setattr(writeup, field, updates[field])
    if "tags" in updates:
        writeup.tags_json = json.dumps(updates["tags"] or [], ensure_ascii=False)
    if "executive_summary" in updates:
        writeup.encrypted_executive_summary = encrypt_note(updates["executive_summary"]) if updates["executive_summary"] else None
    if "findings" in updates:
        findings_payload = updates["findings"] or []
        writeup.encrypted_findings_json = encrypt_note(json.dumps(findings_payload, ensure_ascii=False))
    current_findings = updates.get("findings")
    if current_findings is None:
        try:
            current_findings = json.loads(decrypt_note(writeup.encrypted_findings_json) or "[]")
        except (TypeError, json.JSONDecodeError):
            current_findings = []
    workbench_payload = updates.get("workbench")
    if workbench_payload is None:
        try:
            workbench_payload = json.loads(decrypt_note(writeup.encrypted_workbench_json) or '{"machines":[],"evidence":[]}')
        except (TypeError, json.JSONDecodeError):
            workbench_payload = {"machines": [], "evidence": []}
    await _validate_workbench_links(db, writeup.id, workbench_payload, current_findings)
    if "workbench" in updates:
        writeup.encrypted_workbench_json = encrypt_note(
            json.dumps(workbench_payload, ensure_ascii=False, separators=(",", ":"))
        )
    if "markdown_content" in updates:
        writeup.encrypted_markdown = encrypt_note(updates["markdown_content"])
    if updates.get("save_revision"):
        revision_type = updates.get("revision_type") or infer_revision_type(updates.get("revision_note") or "")
        if revision_type == "edit":
            revision_type = "manual"
        await create_revision_snapshot(
            db,
            writeup,
            decrypt_note(writeup.encrypted_markdown) or "",
            current_user.id if current_user else None,
            updates.get("revision_note"),
            revision_type,
        )

    await db.commit()
    await db.refresh(writeup)
    return await build_writeup_detail_dict(db, writeup)


@router.delete("/{writeup_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_writeup(
    writeup_id: str,
    expected_updated_at: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    writeup = await _lock_writeup_for_resource_mutation(db, writeup_id, expected_updated_at)
    writeup.is_deleted = True
    writeup.deleted_at = utc_now()
    await record_event(
        db,
        module="writeups",
        action="writeup_deleted",
        entity_type="writeup",
        entity_id=writeup.id,
        summary=f"Writeup eliminado: {writeup.title}",
        user_id=current_user.id if current_user else None,
        user_name=current_user.username if current_user else "Bóveda",
    )
    await db.commit()
    return Response(
        status_code=status.HTTP_204_NO_CONTENT,
        headers={"X-Writeup-Updated-At": writeup.updated_at.isoformat()},
    )


@router.get("/{writeup_id}/revisions/authors", response_model=list[WriteupRevisionAuthorOut])
async def list_revision_authors(
    writeup_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    await get_writeup_or_404(db, writeup_id)
    rows = (
        await db.execute(
            select(User.id, User.username, User.full_name)
            .join(WriteupRevision, WriteupRevision.created_by_id == User.id)
            .where(WriteupRevision.writeup_id == writeup_id)
            .distinct()
            .order_by(User.full_name.asc(), User.username.asc())
        )
    ).all()
    authors = [{"id": row.id, "name": row.full_name or row.username} for row in rows]
    has_system_revisions = await db.scalar(
        select(WriteupRevision.id)
        .where(
            WriteupRevision.writeup_id == writeup_id,
            WriteupRevision.created_by_id.is_(None),
        )
        .limit(1)
    )
    if has_system_revisions:
        # Vault-only edits have no team-account actor. Expose them as a
        # selectable, stable author so history filters still work for the
        # common single-user writeup flow.
        authors.append({"id": "__system__", "name": "Sistema"})
    return sorted(authors, key=lambda author: author["name"].casefold())


@router.get("/{writeup_id}/revisions", response_model=list[WriteupRevisionOut])
async def list_revisions(
    writeup_id: str,
    offset: int = Query(0, ge=0, le=10000),
    limit: int = Query(40, ge=1, le=100),
    before_revision_number: int | None = Query(None, gt=0),
    search: str | None = Query(None, min_length=1, max_length=120),
    change_type: str | None = Query(None, pattern="^(initial|autosave|manual|milestone|restore|edit|evidence|board|citation)$"),
    author_id: str | None = Query(None, min_length=1, max_length=36),
    created_after: datetime | None = Query(None),
    created_before: datetime | None = Query(None),
    include_content: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    await get_writeup_or_404(db, writeup_id)
    if created_after and created_before:
        after = created_after.astimezone(timezone.utc).replace(tzinfo=None) if created_after.tzinfo else created_after
        before = created_before.astimezone(timezone.utc).replace(tzinfo=None) if created_before.tzinfo else created_before
        if after > before:
            raise HTTPException(status_code=422, detail="La fecha inicial debe ser anterior a la fecha final.")
    if before_revision_number is not None and offset:
        raise HTTPException(status_code=422, detail="Usa paginación por cursor o por desplazamiento, no ambas.")

    stmt = (
        select(WriteupRevision, User.username, User.full_name)
        .outerjoin(User, User.id == WriteupRevision.created_by_id)
        .where(WriteupRevision.writeup_id == writeup_id)
    )
    if search:
        # Treat SQL LIKE metacharacters in the user's search as literal text.
        escaped_search = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped_search}%"
        stmt = stmt.where(
            or_(
                WriteupRevision.change_note.ilike(pattern, escape="\\"),
                User.username.ilike(pattern, escape="\\"),
                User.full_name.ilike(pattern, escape="\\"),
            )
        )
    if change_type:
        note = WriteupRevision.change_note
        legacy_type = case(
            (note.ilike("%versión inicial%"), "initial"),
            (note.ilike("%guardado automático%"), "autosave"),
            (note.ilike("%instantánea manual%"), "manual"),
            (note.ilike("%restaur%"), "restore"),
            (note.ilike("%evidencia%"), "evidence"),
            (note.ilike("%pizarra%"), "board"),
            (note.ilike("%cita%"), "citation"),
            else_="edit",
        )
        stmt = stmt.where(func.coalesce(WriteupRevision.change_type, legacy_type) == change_type)
    if author_id:
        stmt = stmt.where(
            WriteupRevision.created_by_id.is_(None)
            if author_id == "__system__"
            else WriteupRevision.created_by_id == author_id
        )
    if before_revision_number is not None:
        stmt = stmt.where(WriteupRevision.revision_number < before_revision_number)
    if created_after:
        created_after = created_after.astimezone(timezone.utc).replace(tzinfo=None) if created_after.tzinfo else created_after
        stmt = stmt.where(WriteupRevision.created_at >= created_after)
    if created_before:
        created_before = created_before.astimezone(timezone.utc).replace(tzinfo=None) if created_before.tzinfo else created_before
        stmt = stmt.where(WriteupRevision.created_at <= created_before)
    rows = (
        await db.execute(
            stmt.order_by(desc(WriteupRevision.revision_number))
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return [
        {
            "id": r.id,
            "writeup_id": r.writeup_id,
            "revision_number": r.revision_number,
            "change_note": r.change_note,
            "change_type": r.change_type or infer_revision_type(r.change_note or ""),
            "content_hash": r.content_hash,
            "markdown_content": (decrypt_revision_text(r.encrypted_markdown) or "") if include_content else None,
            "snapshot": (json.loads(decrypt_revision_text(r.encrypted_snapshot)) if r.encrypted_snapshot else None) if include_content else None,
            "created_by_id": r.created_by_id,
            "created_by_name": full_name or username or "Sistema",
            "has_content": bool(r.encrypted_markdown or r.encrypted_snapshot),
            "created_at": r.created_at,
        }
        for r, username, full_name in rows
    ]


@router.get("/{writeup_id}/revisions/{revision_id}", response_model=WriteupRevisionOut)
async def get_revision(
    writeup_id: str,
    revision_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    await get_writeup_or_404(db, writeup_id)
    row = (
        await db.execute(
            select(WriteupRevision, User.username, User.full_name)
            .outerjoin(User, User.id == WriteupRevision.created_by_id)
            .where(WriteupRevision.writeup_id == writeup_id, WriteupRevision.id == revision_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="La revisión no existe en este informe.")
    revision, username, full_name = row
    return {
        "id": revision.id,
        "writeup_id": revision.writeup_id,
        "revision_number": revision.revision_number,
        "change_note": revision.change_note,
        "change_type": revision.change_type or infer_revision_type(revision.change_note or ""),
        "content_hash": revision.content_hash,
        "markdown_content": decrypt_revision_text(revision.encrypted_markdown) or "",
        "snapshot": json.loads(decrypt_revision_text(revision.encrypted_snapshot)) if revision.encrypted_snapshot else None,
        "created_by_id": revision.created_by_id,
        "created_by_name": full_name or username or "Sistema",
        "has_content": bool(revision.encrypted_markdown or revision.encrypted_snapshot),
        "created_at": revision.created_at,
    }


@router.post("/{writeup_id}/revisions/{revision_id}/restore", response_model=WriteupDetailOut)
async def restore_revision(
    writeup_id: str,
    revision_id: str,
    expected_updated_at: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    expected: datetime | None = None
    if expected_updated_at is not None:
        try:
            expected = datetime.fromisoformat(expected_updated_at.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=422, detail="Fecha de versión no válida.")
    writeup = await _lock_writeup_for_resource_mutation(db, writeup_id, expected)
    rev = (
        await db.execute(
            select(WriteupRevision).where(WriteupRevision.id == revision_id, WriteupRevision.writeup_id == writeup_id)
        )
    ).scalar_one_or_none()
    if not rev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Revisión no encontrada.")
    # Preserve the current state before any destructive restoration, including unsnapshotted changes.
    await create_revision_snapshot(db, writeup, decrypt_note(writeup.encrypted_markdown) or "", current_user.id if current_user else None, "Antes de restaurar")
    await db.flush()
    restored_md = decrypt_revision_text(rev.encrypted_markdown) or ""
    if rev.encrypted_snapshot:
        snapshot = json.loads(decrypt_revision_text(rev.encrypted_snapshot))
        fields = snapshot["fields"]
        await validate_optional_links(db, fields.get("prospect_id"), fields.get("project_id"), fields.get("engagement_id"))
        for field, value in fields.items():
            setattr(writeup, field, value)
        writeup.slug = slugify_title(writeup.title)
        writeup.encrypted_executive_summary = encrypt_note(snapshot.get("executive_summary")) if snapshot.get("executive_summary") else None
        writeup.encrypted_findings_json = encrypt_note(json.dumps(snapshot.get("findings", []), ensure_ascii=False))
        writeup.encrypted_workbench_json = encrypt_note(json.dumps(
            snapshot.get("workbench", {"machines": [], "evidence": []}),
            ensure_ascii=False,
            separators=(",", ":"),
        ))
        if "assets" in snapshot:
            asset_ids = [asset["id"] for asset in snapshot["assets"]]
            existing_ids = set((await db.execute(select(WriteupAsset.id).where(WriteupAsset.writeup_id == writeup_id, WriteupAsset.id.in_(asset_ids)))).scalars().all())
            if existing_ids != set(asset_ids):
                raise HTTPException(status_code=409, detail="No se puede restaurar: falta evidencia de esta versión.")
            await db.execute(update(WriteupAsset).where(WriteupAsset.writeup_id == writeup_id).values(is_deleted=True))
            if asset_ids:
                await db.execute(update(WriteupAsset).where(WriteupAsset.writeup_id == writeup_id, WriteupAsset.id.in_(asset_ids)).values(is_deleted=False))
        await db.execute(delete(WriteupCitation).where(WriteupCitation.writeup_id == writeup_id))
        await db.execute(delete(WriteupBoard).where(WriteupBoard.writeup_id == writeup_id))
        for board in snapshot.get("boards", []):
            db.add(WriteupBoard(id=board["id"], writeup_id=writeup_id, title=board["title"], encrypted_scene_json=encrypt_note(board["scene_json"]), encrypted_svg_snapshot=encrypt_note(board["svg_snapshot"]) if board.get("svg_snapshot") else None, element_count=board["element_count"]))
        await db.flush()
        for citation in snapshot.get("citations", []):
            db.add(WriteupCitation(**{**citation, "quoted_text": encrypt_note(citation["quoted_text"]), "note": encrypt_note(citation["note"]) if citation.get("note") else None}))
    writeup.encrypted_markdown = encrypt_note(restored_md)
    await create_revision_snapshot(db, writeup, restored_md, current_user.id if current_user else None, f"Restaurado desde revisión #{rev.revision_number}")
    await db.commit()
    await db.refresh(writeup)
    return await build_writeup_detail_dict(db, writeup)


@router.post("/{writeup_id}/assets", response_model=WriteupAssetOut, status_code=status.HTTP_201_CREATED)
async def upload_writeup_asset(
    writeup_id: str,
    file: UploadFile = File(...),
    caption: str | None = Form(default=None, max_length=255),
    convert_to_gif: bool = Form(default=False),
    expected_updated_at: datetime | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    writeup = await _lock_writeup_for_resource_mutation(db, writeup_id, expected_updated_at)
    upload_limit = max(settings.WRITEUP_MAX_IMAGE_BYTES, settings.WRITEUP_MAX_VIDEO_BYTES)
    raw_bytes = await read_upload_limited(file, upload_limit)
    optimized = optimize_and_encrypt_media(raw_bytes, file.filename, convert_to_gif=convert_to_gif)
    asset = WriteupAsset(
        writeup_id=writeup_id,
        filename=optimized.filename,
        mime_type=optimized.mime_type,
        original_size_bytes=optimized.original_size_bytes,
        optimized_size_bytes=optimized.optimized_size_bytes,
        width=optimized.width,
        height=optimized.height,
        sha256=optimized.sha256,
        exif_stripped=True,
        encrypted_blob=optimized.encrypted_blob,
        caption=caption.strip() if caption else None,
    )
    db.add(asset)
    await create_revision_snapshot(db, writeup, decrypt_note(writeup.encrypted_markdown) or "", current_user.id if current_user else None, "Evidencia añadida")
    await db.commit()
    await db.refresh(asset)
    return serialize_asset(asset, writeup.updated_at)


@router.post("/{writeup_id}/assets/{asset_id}/convert-to-gif", response_model=WriteupAssetOut, status_code=status.HTTP_201_CREATED)
async def convert_writeup_video_to_gif(
    writeup_id: str,
    asset_id: str,
    fps: int | None = Query(default=None, ge=1, le=30),
    max_width: int | None = Query(default=None, ge=160, le=1920),
    expected_updated_at: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    writeup = await _lock_writeup_for_resource_mutation(db, writeup_id, expected_updated_at)
    source = (
        await db.execute(select(WriteupAsset).where(WriteupAsset.id == asset_id, WriteupAsset.writeup_id == writeup_id))
    ).scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidencia visual no encontrada.")
    if not is_video_mime(source.mime_type):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Solo se pueden convertir a GIF activos de video.")
    raw_video = decrypt_asset_bytes(source.encrypted_blob)
    converted = convert_video_bytes_to_gif(raw_video, source.filename, fps=fps, max_width=max_width)
    gif_asset = WriteupAsset(
        writeup_id=writeup_id,
        filename=converted.filename,
        mime_type=converted.mime_type,
        original_size_bytes=converted.original_size_bytes,
        optimized_size_bytes=converted.optimized_size_bytes,
        width=converted.width,
        height=converted.height,
        sha256=converted.sha256,
        exif_stripped=True,
        encrypted_blob=converted.encrypted_blob,
        caption=source.caption or f"GIF generado desde {source.filename}",
    )
    db.add(gif_asset)
    await create_revision_snapshot(db, writeup, decrypt_note(writeup.encrypted_markdown) or "", current_user.id if current_user else None, "Evidencia convertida")
    await db.commit()
    await db.refresh(gif_asset)
    return serialize_asset(gif_asset, writeup.updated_at)


@router.get("/{writeup_id}/assets/{asset_id}")
async def get_writeup_asset_binary(
    writeup_id: str,
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    await get_writeup_or_404(db, writeup_id)
    asset = (
        await db.execute(select(WriteupAsset).where(WriteupAsset.id == asset_id, WriteupAsset.writeup_id == writeup_id))
    ).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidencia visual no encontrada.")
    raw = decrypt_asset_bytes(asset.encrypted_blob)
    return Response(
        content=raw,
        media_type=asset.mime_type,
        headers={
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": f'inline; filename="{asset.filename}"',
        },
    )


@router.delete("/{writeup_id}/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_writeup_asset(
    writeup_id: str,
    asset_id: str,
    expected_updated_at: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    writeup = await _lock_writeup_for_resource_mutation(db, writeup_id, expected_updated_at)
    asset = (
        await db.execute(select(WriteupAsset).where(WriteupAsset.id == asset_id, WriteupAsset.writeup_id == writeup_id))
    ).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidencia visual no encontrada.")
    asset.is_deleted = True
    try:
        findings = json.loads(decrypt_note(writeup.encrypted_findings_json) or "[]")
    except (TypeError, json.JSONDecodeError):
        findings = None
    if isinstance(findings, list):
        changed = False
        for finding in findings:
            if not isinstance(finding, dict) or not isinstance(finding.get("evidence_asset_ids"), list):
                continue
            retained = [item for item in finding["evidence_asset_ids"] if str(item) != asset_id]
            changed = changed or len(retained) != len(finding["evidence_asset_ids"])
            finding["evidence_asset_ids"] = retained
        if changed:
            writeup.encrypted_findings_json = encrypt_note(json.dumps(findings, ensure_ascii=False))
    try:
        workbench = json.loads(decrypt_note(writeup.encrypted_workbench_json) or '{"machines":[],"evidence":[]}')
    except (TypeError, json.JSONDecodeError):
        workbench = None
    if isinstance(workbench, dict) and isinstance(workbench.get("evidence"), list):
        changed = False
        for evidence in workbench["evidence"]:
            if not isinstance(evidence, dict) or not isinstance(evidence.get("asset_ids"), list):
                continue
            retained = [item for item in evidence["asset_ids"] if str(item) != asset_id]
            changed = changed or len(retained) != len(evidence["asset_ids"])
            evidence["asset_ids"] = retained
        if changed:
            writeup.encrypted_workbench_json = encrypt_note(json.dumps(workbench, ensure_ascii=False, separators=(",", ":")))
    await create_revision_snapshot(db, writeup, decrypt_note(writeup.encrypted_markdown) or "", current_user.id if current_user else None, "Evidencia retirada")
    await db.commit()
    return Response(
        status_code=status.HTTP_204_NO_CONTENT,
        headers={"X-Writeup-Updated-At": writeup.updated_at.isoformat()},
    )


@router.post("/{writeup_id}/boards", response_model=WriteupBoardOut, status_code=status.HTTP_201_CREATED)
async def create_writeup_board(
    writeup_id: str,
    payload: WriteupBoardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    writeup = await _lock_writeup_for_resource_mutation(db, writeup_id, payload.expected_updated_at)
    clean_svg = sanitize_board_svg(payload.svg_snapshot)
    board = WriteupBoard(
        writeup_id=writeup_id,
        title=payload.title,
        encrypted_scene_json=encrypt_note(payload.scene_json),
        encrypted_svg_snapshot=encrypt_note(clean_svg) if clean_svg else None,
        element_count=payload.element_count,
    )
    db.add(board)
    await create_revision_snapshot(db, writeup, decrypt_note(writeup.encrypted_markdown) or "", current_user.id if current_user else None, "Pizarra creada")
    await db.commit()
    await db.refresh(board)
    return serialize_board(board, writeup.updated_at)


@router.patch("/{writeup_id}/boards/{board_id}", response_model=WriteupBoardOut)
async def update_writeup_board(
    writeup_id: str,
    board_id: str,
    payload: WriteupBoardUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    writeup = await _lock_writeup_for_resource_mutation(db, writeup_id, payload.expected_updated_at)
    board = (
        await db.execute(select(WriteupBoard).where(WriteupBoard.id == board_id, WriteupBoard.writeup_id == writeup_id))
    ).scalar_one_or_none()
    if not board:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pizarra no encontrada.")
    updates = payload.model_dump(exclude_unset=True)
    updates.pop("expected_updated_at", None)
    if "title" in updates:
        board.title = updates["title"]
    if "scene_json" in updates:
        board.encrypted_scene_json = encrypt_note(updates["scene_json"])
    if "svg_snapshot" in updates:
        clean_svg = sanitize_board_svg(updates["svg_snapshot"])
        board.encrypted_svg_snapshot = encrypt_note(clean_svg) if clean_svg else None
    if "element_count" in updates:
        board.element_count = updates["element_count"]
    board.updated_at = utc_now()
    await create_revision_snapshot(db, writeup, decrypt_note(writeup.encrypted_markdown) or "", current_user.id if current_user else None, "Pizarra actualizada")
    await db.commit()
    await db.refresh(board)
    return serialize_board(board, writeup.updated_at)


@router.delete("/{writeup_id}/boards/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_writeup_board(
    writeup_id: str,
    board_id: str,
    expected_updated_at: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    writeup = await _lock_writeup_for_resource_mutation(db, writeup_id, expected_updated_at)
    board = (
        await db.execute(select(WriteupBoard).where(WriteupBoard.id == board_id, WriteupBoard.writeup_id == writeup_id))
    ).scalar_one_or_none()
    if not board:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pizarra no encontrada.")
    await db.delete(board)
    await create_revision_snapshot(db, writeup, decrypt_note(writeup.encrypted_markdown) or "", current_user.id if current_user else None, "Pizarra eliminada")
    await db.commit()
    return Response(
        status_code=status.HTTP_204_NO_CONTENT,
        headers={"X-Writeup-Updated-At": writeup.updated_at.isoformat()},
    )


@router.post("/{writeup_id}/citations", response_model=WriteupCitationOut, status_code=status.HTTP_201_CREATED)
async def create_writeup_citation(
    writeup_id: str,
    payload: WriteupCitationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    writeup = await _lock_writeup_for_resource_mutation(db, writeup_id, payload.expected_updated_at)
    board = (
        await db.execute(select(WriteupBoard).where(WriteupBoard.id == payload.board_id, WriteupBoard.writeup_id == writeup_id))
    ).scalar_one_or_none()
    if not board:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pizarra de destino no encontrada.")
    citation = WriteupCitation(
        writeup_id=writeup_id,
        board_id=payload.board_id,
        anchor_id=payload.anchor_id,
        board_element_id=payload.board_element_id,
        heading_path=payload.heading_path,
        line_start=payload.line_start,
        line_end=max(payload.line_start, payload.line_end),
        quoted_text=encrypt_note(payload.quoted_text) or payload.quoted_text,
        quote_hash=normalize_quote_hash(payload.quoted_text),
        color=payload.color,
        note=encrypt_note(payload.note) if payload.note else None,
    )
    db.add(citation)
    await create_revision_snapshot(db, writeup, decrypt_note(writeup.encrypted_markdown) or "", current_user.id if current_user else None, "Cita creada")
    await db.commit()
    await db.refresh(citation)
    return serialize_citation(citation, decrypt_note(writeup.encrypted_markdown) or "", writeup.updated_at)


@router.patch("/{writeup_id}/citations/{citation_id}", response_model=WriteupCitationOut)
async def update_writeup_citation(
    writeup_id: str,
    citation_id: str,
    payload: WriteupCitationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    writeup = await _lock_writeup_for_resource_mutation(db, writeup_id, payload.expected_updated_at)
    citation = (
        await db.execute(
            select(WriteupCitation).where(WriteupCitation.id == citation_id, WriteupCitation.writeup_id == writeup_id)
        )
    ).scalar_one_or_none()
    if not citation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Citación no encontrada.")
    updates = payload.model_dump(exclude_unset=True)
    updates.pop("expected_updated_at", None)
    for field in ("board_element_id", "heading_path", "line_start", "line_end", "color"):
        if field in updates:
            setattr(citation, field, updates[field])
    if "quoted_text" in updates:
        citation.quoted_text = encrypt_note(updates["quoted_text"]) or updates["quoted_text"]
        citation.quote_hash = normalize_quote_hash(updates["quoted_text"])
    if "note" in updates:
        citation.note = encrypt_note(updates["note"]) if updates["note"] else None
    citation.updated_at = utc_now()
    await create_revision_snapshot(db, writeup, decrypt_note(writeup.encrypted_markdown) or "", current_user.id if current_user else None, "Cita actualizada")
    await db.commit()
    await db.refresh(citation)
    return serialize_citation(citation, decrypt_note(writeup.encrypted_markdown) or "", writeup.updated_at)


@router.delete("/{writeup_id}/citations/{citation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_writeup_citation(
    writeup_id: str,
    citation_id: str,
    expected_updated_at: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    writeup = await _lock_writeup_for_resource_mutation(db, writeup_id, expected_updated_at)
    citation = (
        await db.execute(
            select(WriteupCitation).where(WriteupCitation.id == citation_id, WriteupCitation.writeup_id == writeup_id)
        )
    ).scalar_one_or_none()
    if not citation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Citación no encontrada.")
    await db.delete(citation)
    await create_revision_snapshot(db, writeup, decrypt_note(writeup.encrypted_markdown) or "", current_user.id if current_user else None, "Cita eliminada")
    await db.commit()
    return Response(
        status_code=status.HTTP_204_NO_CONTENT,
        headers={"X-Writeup-Updated-At": writeup.updated_at.isoformat()},
    )


@router.post("/{writeup_id}/preview", response_model=WriteupPreviewOut)
async def preview_writeup_html(
    writeup_id: str,
    redact_for_client: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    writeup = await get_writeup_or_404(db, writeup_id)
    ctx = await build_export_context(db, writeup, redact_for_client=redact_for_client, include_toc=True)
    return {
        "sanitized_html": render_sanitized_html_fragment(ctx),
        "redacted_for_client": redact_for_client,
    }


async def _export_context(
    db: AsyncSession,
    writeup: Writeup,
    payload: WriteupExportRequest,
) -> ExportBundleContext:
    preview = payload if isinstance(payload, WriteupExportPreviewRequest) else None
    return await build_export_context(
        db,
        writeup,
        redact_for_client=payload.redact_for_client,
        include_watermark=payload.include_watermark,
        include_toc=payload.include_toc,
        toc_depth=payload.toc_depth,
        include_figure_index=payload.include_figure_index,
        include_table_index=payload.include_table_index,
        font_size_pt=payload.font_size_pt,
        watermark_text=payload.watermark_text,
        rendered_diagrams=payload.rendered_diagrams,
        layout=payload.layout,
        draft_markdown=preview.draft_markdown if preview else None,
        draft_title=preview.draft_title if preview else None,
    )


@router.post("/{writeup_id}/export/preview")
async def preview_writeup_export(
    writeup_id: str,
    payload: WriteupExportPreviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    writeup = await get_writeup_or_404(db, writeup_id)
    ctx = await _export_context(db, writeup, payload)
    return Response(
        await run_in_threadpool(
            build_standalone_html_document,
            ctx,
            embed_video=payload.format in {"html", "md_zip"},
            paper_preview=payload.format in {"pdf", "docx"},
            animate_diagrams=payload.format == "html",
        ),
        media_type="text/html",
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.post("/{writeup_id}/export")
async def export_writeup(
    writeup_id: str,
    payload: WriteupExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    writeup = await get_writeup_or_404(db, writeup_id)
    ctx = await _export_context(db, writeup, payload)
    artifact = await run_in_threadpool(compile_writeup_export, payload.format, ctx)
    db.add(
        WriteupExportLog(
            writeup_id=writeup.id,
            export_format=payload.format,
            redacted_for_client=payload.redact_for_client,
            sha256=artifact.sha256,
            byte_size=len(artifact.content),
            exported_by_id=current_user.id if current_user else None,
        )
    )
    await record_event(
        db,
        module="writeups",
        action="writeup_exported",
        entity_type="writeup",
        entity_id=writeup.id,
        summary=f"Writeup exportado ({payload.format}, redact={payload.redact_for_client}): {writeup.title}",
        user_id=current_user.id if current_user else None,
        user_name=current_user.username if current_user else "Bóveda",
    )
    await db.commit()
    return Response(
        content=artifact.content,
        media_type=artifact.media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{artifact.filename}"',
            "X-Export-SHA256": artifact.sha256,
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/{writeup_id}/clone", response_model=WriteupDetailOut, status_code=status.HTTP_201_CREATED)
async def clone_writeup(
    writeup_id: str,
    payload: WriteupCloneRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_writeup_access),
):
    source = await get_writeup_or_404(db, writeup_id)
    source_detail = await build_writeup_detail_dict(db, source)
    source_assets = (await db.execute(select(WriteupAsset).where(
        WriteupAsset.writeup_id == source.id,
        WriteupAsset.is_deleted == False,  # noqa: E712
    ))).scalars().all()
    cloned_title = (payload.title if payload and payload.title else f"{source.title} (Copia)")[:200]
    cloned = Writeup(
        title=cloned_title,
        slug=slugify_title(cloned_title),
        status="borrador",
        severity=source.severity,
        cvss_score=source.cvss_score,
        cvss_vector=source.cvss_vector,
        cwe_id=source.cwe_id,
        cve_id=source.cve_id,
        target_scope=source.target_scope,
        tags_json=source.tags_json,
        encrypted_markdown=encrypt_note(source_detail["markdown_content"]),
        encrypted_executive_summary=encrypt_note(source_detail["executive_summary"])
        if source_detail["executive_summary"]
        else None,
        encrypted_findings_json=encrypt_note(json.dumps(source_detail["findings"], ensure_ascii=False))
        if source_detail["findings"]
        else None,
        encrypted_workbench_json=encrypt_note(json.dumps(source_detail["workbench"], ensure_ascii=False, separators=(",", ":"))),
        prospect_id=source.prospect_id,
        project_id=source.project_id,
        engagement_id=source.engagement_id,
        created_by_id=current_user.id if current_user else None,
    )
    db.add(cloned)
    await db.flush()

    asset_id_map: dict[str, str] = {}
    for asset in source_assets:
        copied = WriteupAsset(
            writeup_id=cloned.id,
            filename=asset.filename,
            mime_type=asset.mime_type,
            original_size_bytes=asset.original_size_bytes,
            optimized_size_bytes=asset.optimized_size_bytes,
            width=asset.width,
            height=asset.height,
            sha256=asset.sha256,
            exif_stripped=asset.exif_stripped,
            encrypted_blob=asset.encrypted_blob,
            is_deleted=False,
            caption=asset.caption,
        )
        db.add(copied)
        await db.flush()
        asset_id_map[asset.id] = copied.id

    if asset_id_map:
        for source_id, copied_id in asset_id_map.items():
            source_detail["markdown_content"] = source_detail["markdown_content"].replace(
                f"asset://{source_id}", f"asset://{copied_id}"
            )
        for finding in source_detail["findings"]:
            finding["evidence_asset_ids"] = [asset_id_map.get(item, item) for item in finding.get("evidence_asset_ids", [])]
        for evidence in source_detail["workbench"].get("evidence", []):
            evidence["asset_ids"] = [asset_id_map.get(item, item) for item in evidence.get("asset_ids", [])]
        cloned.encrypted_markdown = encrypt_note(source_detail["markdown_content"])
        cloned.encrypted_findings_json = encrypt_note(json.dumps(source_detail["findings"], ensure_ascii=False)) if source_detail["findings"] else None
        cloned.encrypted_workbench_json = encrypt_note(json.dumps(source_detail["workbench"], ensure_ascii=False, separators=(",", ":")))
    await _validate_workbench_links(db, cloned.id, source_detail["workbench"], source_detail["findings"])

    source_boards = (
        await db.execute(select(WriteupBoard).where(WriteupBoard.writeup_id == source.id))
    ).scalars().all()
    for board in source_boards:
        scene_raw = decrypt_note(board.encrypted_scene_json) or "{}"
        svg_raw = decrypt_note(board.encrypted_svg_snapshot) if board.encrypted_svg_snapshot else None
        db.add(
            WriteupBoard(
                writeup_id=cloned.id,
                title=board.title,
                encrypted_scene_json=encrypt_note(scene_raw) or encrypt_note("{}"),
                encrypted_svg_snapshot=encrypt_note(svg_raw) if svg_raw else None,
                element_count=board.element_count,
            )
        )
    if not source_boards:
        db.add(
            WriteupBoard(
                writeup_id=cloned.id,
                title="Pizarra de ataque",
                encrypted_scene_json=encrypt_note("{}"),
                element_count=0,
            )
        )

    await create_revision_snapshot(
        db,
        cloned,
        source_detail["markdown_content"],
        current_user.id if current_user else None,
        f"Clonado desde {source.title[:80]}",
    )
    await record_event(
        db,
        module="writeups",
        action="writeup_cloned",
        entity_type="writeup",
        entity_id=cloned.id,
        summary=f"Writeup clonado desde {source.title}: {cloned.title}",
        user_id=current_user.id if current_user else None,
        user_name=current_user.username if current_user else "Bóveda",
    )
    await db.commit()
    await db.refresh(cloned)
    return await build_writeup_detail_dict(db, cloned)
