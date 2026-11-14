import json
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import utc_now
from app.models.core import User
from app.models.writeups import (
    Writeup,
    WriteupAsset,
    WriteupBoard,
    WriteupCitation,
    WriteupExportLog,
    WriteupRevision,
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
    WriteupPreviewOut,
    WriteupRevisionOut,
    WriteupSummaryOut,
    WriteupUpdate,
)
from app.security.crypto import decrypt_note, encrypt_note
from app.config import settings
from app.middleware.request_limits import read_upload_limited
from app.security.tokens import require_vault_unlocked
from app.services.activity_service import record_event
from app.services.core_auth import get_current_user_from_token
from app.services.writeup_exporter import compile_writeup_export, render_sanitized_html_fragment
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
    get_writeup_or_404,
    normalize_quote_hash,
    sanitize_board_svg,
    serialize_asset,
    serialize_board,
    serialize_citation,
    slugify_title,
    validate_optional_links,
)


WRITEUP_ROLES = {"owner", "business_admin", "operator"}


async def require_writeup_access(request: Request, db: AsyncSession = Depends(get_db)) -> User | None:
    """Enforces role check when an operator Bearer/cookie session is attached alongside the unlocked vault."""
    auth_header = request.headers.get("Authorization")
    session_cookie = request.cookies.get("lessso_session")
    if (auth_header and auth_header.startswith("Bearer sess_")) or session_cookie:
        user = await get_current_user_from_token(request, db)
        if user.role not in WRITEUP_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permisos insuficientes para operar sobre writeups de pentesting.",
            )
        return user
    return None


router = APIRouter(
    prefix="/writeups",
    tags=["Pentest Writeups & Whiteboards"],
    dependencies=[Depends(require_vault_unlocked)],
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
    current_user: User | None = Depends(require_writeup_access),
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


@router.post("", response_model=WriteupDetailOut, status_code=status.HTTP_201_CREATED)
async def create_writeup(
    payload: WriteupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(require_writeup_access),
):
    await validate_optional_links(db, payload.prospect_id, payload.project_id, payload.engagement_id)
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
    if payload.markdown_content.strip():
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
    current_user: User | None = Depends(require_writeup_access),
):
    writeup = await get_writeup_or_404(db, writeup_id)
    return await build_writeup_detail_dict(db, writeup)


@router.patch("/{writeup_id}", response_model=WriteupDetailOut)
async def update_writeup(
    writeup_id: str,
    payload: WriteupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(require_writeup_access),
):
    writeup = await get_writeup_or_404(db, writeup_id)
    updates = payload.model_dump(exclude_unset=True)
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
    if "markdown_content" in updates:
        writeup.encrypted_markdown = encrypt_note(updates["markdown_content"])
        if updates.get("save_revision"):
            await create_revision_snapshot(
                db,
                writeup,
                updates["markdown_content"],
                current_user.id if current_user else None,
                updates.get("revision_note"),
            )

    writeup.updated_at = utc_now()
    await db.commit()
    await db.refresh(writeup)
    return await build_writeup_detail_dict(db, writeup)


@router.delete("/{writeup_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_writeup(
    writeup_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(require_writeup_access),
):
    writeup = await get_writeup_or_404(db, writeup_id)
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
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{writeup_id}/revisions", response_model=list[WriteupRevisionOut])
async def list_revisions(
    writeup_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(require_writeup_access),
):
    await get_writeup_or_404(db, writeup_id)
    rows = (
        await db.execute(
            select(WriteupRevision)
            .where(WriteupRevision.writeup_id == writeup_id)
            .order_by(desc(WriteupRevision.revision_number))
            .limit(40)
        )
    ).scalars().all()
    return [
        {
            "id": r.id,
            "writeup_id": r.writeup_id,
            "revision_number": r.revision_number,
            "change_note": r.change_note,
            "content_hash": r.content_hash,
            "markdown_content": decrypt_note(r.encrypted_markdown) or "",
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.post("/{writeup_id}/revisions/{revision_id}/restore", response_model=WriteupDetailOut)
async def restore_revision(
    writeup_id: str,
    revision_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(require_writeup_access),
):
    writeup = await get_writeup_or_404(db, writeup_id)
    rev = (
        await db.execute(
            select(WriteupRevision).where(WriteupRevision.id == revision_id, WriteupRevision.writeup_id == writeup_id)
        )
    ).scalar_one_or_none()
    if not rev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Revisión no encontrada.")
    restored_md = decrypt_note(rev.encrypted_markdown) or ""
    writeup.encrypted_markdown = encrypt_note(restored_md)
    writeup.updated_at = utc_now()
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
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(require_writeup_access),
):
    await get_writeup_or_404(db, writeup_id)
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
    await db.commit()
    await db.refresh(asset)
    return serialize_asset(asset)


@router.post("/{writeup_id}/assets/{asset_id}/convert-to-gif", response_model=WriteupAssetOut, status_code=status.HTTP_201_CREATED)
async def convert_writeup_video_to_gif(
    writeup_id: str,
    asset_id: str,
    fps: int | None = Query(default=None, ge=1, le=30),
    max_width: int | None = Query(default=None, ge=160, le=1920),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(require_writeup_access),
):
    await get_writeup_or_404(db, writeup_id)
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
    await db.commit()
    await db.refresh(gif_asset)
    return serialize_asset(gif_asset)


@router.get("/{writeup_id}/assets/{asset_id}")
async def get_writeup_asset_binary(
    writeup_id: str,
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(require_writeup_access),
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
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(require_writeup_access),
):
    await get_writeup_or_404(db, writeup_id)
    asset = (
        await db.execute(select(WriteupAsset).where(WriteupAsset.id == asset_id, WriteupAsset.writeup_id == writeup_id))
    ).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidencia visual no encontrada.")
    await db.delete(asset)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{writeup_id}/boards", response_model=WriteupBoardOut, status_code=status.HTTP_201_CREATED)
async def create_writeup_board(
    writeup_id: str,
    payload: WriteupBoardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(require_writeup_access),
):
    await get_writeup_or_404(db, writeup_id)
    clean_svg = sanitize_board_svg(payload.svg_snapshot)
    board = WriteupBoard(
        writeup_id=writeup_id,
        title=payload.title,
        encrypted_scene_json=encrypt_note(payload.scene_json),
        encrypted_svg_snapshot=encrypt_note(clean_svg) if clean_svg else None,
        element_count=payload.element_count,
    )
    db.add(board)
    await db.commit()
    await db.refresh(board)
    return serialize_board(board)


@router.patch("/{writeup_id}/boards/{board_id}", response_model=WriteupBoardOut)
async def update_writeup_board(
    writeup_id: str,
    board_id: str,
    payload: WriteupBoardUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(require_writeup_access),
):
    await get_writeup_or_404(db, writeup_id)
    board = (
        await db.execute(select(WriteupBoard).where(WriteupBoard.id == board_id, WriteupBoard.writeup_id == writeup_id))
    ).scalar_one_or_none()
    if not board:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pizarra no encontrada.")
    updates = payload.model_dump(exclude_unset=True)
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
    await db.commit()
    await db.refresh(board)
    return serialize_board(board)


@router.delete("/{writeup_id}/boards/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_writeup_board(
    writeup_id: str,
    board_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(require_writeup_access),
):
    await get_writeup_or_404(db, writeup_id)
    board = (
        await db.execute(select(WriteupBoard).where(WriteupBoard.id == board_id, WriteupBoard.writeup_id == writeup_id))
    ).scalar_one_or_none()
    if not board:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pizarra no encontrada.")
    await db.delete(board)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{writeup_id}/citations", response_model=WriteupCitationOut, status_code=status.HTTP_201_CREATED)
async def create_writeup_citation(
    writeup_id: str,
    payload: WriteupCitationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(require_writeup_access),
):
    writeup = await get_writeup_or_404(db, writeup_id)
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
    await db.commit()
    await db.refresh(citation)
    return serialize_citation(citation, decrypt_note(writeup.encrypted_markdown) or "")


@router.patch("/{writeup_id}/citations/{citation_id}", response_model=WriteupCitationOut)
async def update_writeup_citation(
    writeup_id: str,
    citation_id: str,
    payload: WriteupCitationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(require_writeup_access),
):
    writeup = await get_writeup_or_404(db, writeup_id)
    citation = (
        await db.execute(
            select(WriteupCitation).where(WriteupCitation.id == citation_id, WriteupCitation.writeup_id == writeup_id)
        )
    ).scalar_one_or_none()
    if not citation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Citación no encontrada.")
    updates = payload.model_dump(exclude_unset=True)
    for field in ("board_element_id", "heading_path", "line_start", "line_end", "color"):
        if field in updates:
            setattr(citation, field, updates[field])
    if "quoted_text" in updates:
        citation.quoted_text = encrypt_note(updates["quoted_text"]) or updates["quoted_text"]
        citation.quote_hash = normalize_quote_hash(updates["quoted_text"])
    if "note" in updates:
        citation.note = encrypt_note(updates["note"]) if updates["note"] else None
    citation.updated_at = utc_now()
    await db.commit()
    await db.refresh(citation)
    return serialize_citation(citation, decrypt_note(writeup.encrypted_markdown) or "")


@router.delete("/{writeup_id}/citations/{citation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_writeup_citation(
    writeup_id: str,
    citation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(require_writeup_access),
):
    await get_writeup_or_404(db, writeup_id)
    citation = (
        await db.execute(
            select(WriteupCitation).where(WriteupCitation.id == citation_id, WriteupCitation.writeup_id == writeup_id)
        )
    ).scalar_one_or_none()
    if not citation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Citación no encontrada.")
    await db.delete(citation)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{writeup_id}/preview", response_model=WriteupPreviewOut)
async def preview_writeup_html(
    writeup_id: str,
    redact_for_client: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(require_writeup_access),
):
    writeup = await get_writeup_or_404(db, writeup_id)
    ctx = await build_export_context(db, writeup, redact_for_client=redact_for_client, include_toc=True)
    return {
        "sanitized_html": render_sanitized_html_fragment(ctx),
        "redacted_for_client": redact_for_client,
    }


@router.post("/{writeup_id}/export")
async def export_writeup(
    writeup_id: str,
    payload: WriteupExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(require_writeup_access),
):
    writeup = await get_writeup_or_404(db, writeup_id)
    ctx = await build_export_context(
        db,
        writeup,
        redact_for_client=payload.redact_for_client,
        include_watermark=payload.include_watermark,
        include_toc=payload.include_toc,
        watermark_text=payload.watermark_text,
        rendered_diagrams=payload.rendered_diagrams,
    )
    artifact = compile_writeup_export(payload.format, ctx)
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
    current_user: User | None = Depends(require_writeup_access),
):
    source = await get_writeup_or_404(db, writeup_id)
    source_detail = await build_writeup_detail_dict(db, source)
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
        prospect_id=source.prospect_id,
        project_id=source.project_id,
        engagement_id=source.engagement_id,
        created_by_id=current_user.id if current_user else None,
    )
    db.add(cloned)
    await db.flush()

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
