import hashlib
import json
import re
import unicodedata
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.models import InternalProject, Prospect
from app.models.agenda import PentestEngagement
from app.models.writeups import (
    Writeup,
    WriteupAsset,
    WriteupBoard,
    WriteupCitation,
    WriteupExportLog,
    WriteupRevision,
)
from app.security.crypto import decrypt_note, encrypt_note
from app.services.workshop_sanitizer import sanitize_svg_content
from app.services.writeup_exporter import ExportBundleContext


SLUG_STRIP_RE = re.compile(r"[^a-z0-9-]+")


def slugify_title(title: str) -> str:
    """Produces an ASCII URL/filename-safe slug from a writeup title."""
    normalized = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode("ascii").lower()
    slug = SLUG_STRIP_RE.sub("-", normalized).strip("-")
    return (slug[:90] or "writeup")


def normalize_quote_hash(text: str) -> str:
    """Computes SHA-256 over whitespace-normalized text for citation drift detection."""
    collapsed = " ".join((text or "").split())
    return hashlib.sha256(collapsed.encode("utf-8")).hexdigest()


def is_citation_stale(markdown_text: str, anchor_id: str, quoted_text: str) -> bool:
    """Returns True when either the anchor tag or the quoted text no longer matches the document."""
    norm_md = " ".join((markdown_text or "").split())
    norm_quote = " ".join((quoted_text or "").split())
    if not norm_quote:
        return True
    has_anchor = f"{{#{anchor_id}}}" in (markdown_text or "")
    has_quote = norm_quote in norm_md
    return not (has_anchor and has_quote)


def _load_json_list(raw_json: str | None) -> list:
    if not raw_json:
        return []
    try:
        parsed = json.loads(raw_json)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def serialize_board(board: WriteupBoard) -> dict:
    return {
        "id": board.id,
        "writeup_id": board.writeup_id,
        "title": board.title,
        "scene_json": decrypt_note(board.encrypted_scene_json) or "{}",
        "svg_snapshot": decrypt_note(board.encrypted_svg_snapshot),
        "element_count": board.element_count,
        "created_at": board.created_at,
        "updated_at": board.updated_at,
    }


def serialize_citation(cit: WriteupCitation, current_markdown: str) -> dict:
    quoted_text = decrypt_note(cit.quoted_text) or ""
    return {
        "id": cit.id,
        "writeup_id": cit.writeup_id,
        "board_id": cit.board_id,
        "anchor_id": cit.anchor_id,
        "board_element_id": cit.board_element_id,
        "heading_path": cit.heading_path,
        "line_start": cit.line_start,
        "line_end": cit.line_end,
        "quoted_text": quoted_text,
        "quote_hash": cit.quote_hash,
        "is_stale": is_citation_stale(current_markdown, cit.anchor_id, quoted_text),
        "color": cit.color,
        "note": decrypt_note(cit.note),
        "created_at": cit.created_at,
        "updated_at": cit.updated_at,
    }


def serialize_asset(asset: WriteupAsset) -> dict:
    return {
        "id": asset.id,
        "writeup_id": asset.writeup_id,
        "filename": asset.filename,
        "mime_type": asset.mime_type,
        "original_size_bytes": asset.original_size_bytes,
        "optimized_size_bytes": asset.optimized_size_bytes,
        "width": asset.width,
        "height": asset.height,
        "sha256": asset.sha256,
        "exif_stripped": asset.exif_stripped,
        "caption": asset.caption,
        "created_at": asset.created_at,
    }


async def validate_optional_links(
    db: AsyncSession,
    prospect_id: str | None = None,
    project_id: str | None = None,
    engagement_id: str | None = None,
) -> None:
    """Ensures optional CRM/Project/Pentest foreign references exist when provided."""
    checks = [
        (prospect_id, Prospect, "Prospecto vinculado no encontrado."),
        (project_id, InternalProject, "Proyecto vinculado no encontrado."),
        (engagement_id, PentestEngagement, "Compromiso pentest vinculado no encontrado."),
    ]
    for target_id, model_cls, error_msg in checks:
        if not target_id:
            continue
        query = select(model_cls.id).where(model_cls.id == target_id)
        if hasattr(model_cls, "is_deleted"):
            query = query.where(model_cls.is_deleted == False)  # noqa: E712
        found = (await db.execute(query)).scalar_one_or_none()
        if not found:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=error_msg)


async def get_writeup_or_404(db: AsyncSession, writeup_id: str) -> Writeup:
    stmt = select(Writeup).where(Writeup.id == writeup_id, Writeup.is_deleted == False)  # noqa: E712
    writeup = (await db.execute(stmt)).scalar_one_or_none()
    if not writeup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Writeup no encontrado.")
    return writeup


async def create_revision_snapshot(
    db: AsyncSession,
    writeup: Writeup,
    markdown_text: str,
    user_id: str | None,
    change_note: str | None = None,
) -> WriteupRevision | None:
    content_hash = hashlib.sha256((markdown_text or "").encode("utf-8")).hexdigest()
    latest = (
        await db.execute(
            select(WriteupRevision)
            .where(WriteupRevision.writeup_id == writeup.id)
            .order_by(desc(WriteupRevision.revision_number))
            .limit(1)
        )
    ).scalar_one_or_none()
    if latest and latest.content_hash == content_hash:
        return None
    next_num = (latest.revision_number + 1) if latest else 1
    rev = WriteupRevision(
        writeup_id=writeup.id,
        revision_number=next_num,
        change_note=change_note or f"Revisión #{next_num}",
        content_hash=content_hash,
        encrypted_markdown=encrypt_note(markdown_text),
        created_by_id=user_id,
    )
    db.add(rev)
    return rev


async def build_writeup_detail_dict(db: AsyncSession, writeup: Writeup) -> dict:
    markdown_text = decrypt_note(writeup.encrypted_markdown) or ""
    exec_summary = decrypt_note(writeup.encrypted_executive_summary)
    findings = _load_json_list(decrypt_note(writeup.encrypted_findings_json))
    tags = _load_json_list(writeup.tags_json)

    boards = (
        await db.execute(
            select(WriteupBoard).where(WriteupBoard.writeup_id == writeup.id).order_by(WriteupBoard.created_at)
        )
    ).scalars().all()
    citations = (
        await db.execute(
            select(WriteupCitation).where(WriteupCitation.writeup_id == writeup.id).order_by(WriteupCitation.created_at)
        )
    ).scalars().all()
    assets = (
        await db.execute(
            select(WriteupAsset).where(WriteupAsset.writeup_id == writeup.id).order_by(WriteupAsset.created_at)
        )
    ).scalars().all()
    export_logs = (
        await db.execute(
            select(WriteupExportLog)
            .where(WriteupExportLog.writeup_id == writeup.id)
            .order_by(desc(WriteupExportLog.created_at))
            .limit(20)
        )
    ).scalars().all()

    return {
        "id": writeup.id,
        "title": writeup.title,
        "slug": writeup.slug,
        "status": writeup.status,
        "severity": writeup.severity,
        "cvss_score": writeup.cvss_score,
        "cvss_vector": writeup.cvss_vector,
        "cwe_id": writeup.cwe_id,
        "cve_id": writeup.cve_id,
        "target_scope": writeup.target_scope,
        "tags": tags,
        "prospect_id": writeup.prospect_id,
        "project_id": writeup.project_id,
        "engagement_id": writeup.engagement_id,
        "boards_count": len(boards),
        "assets_count": len(assets),
        "citations_count": len(citations),
        "updated_at": writeup.updated_at,
        "created_at": writeup.created_at,
        "markdown_content": markdown_text,
        "executive_summary": exec_summary,
        "findings": findings,
        "boards": [serialize_board(b) for b in boards],
        "citations": [serialize_citation(c, markdown_text) for c in citations],
        "assets": [serialize_asset(a) for a in assets],
        "export_logs": [
            {
                "id": log.id,
                "writeup_id": log.writeup_id,
                "export_format": log.export_format,
                "redacted_for_client": log.redacted_for_client,
                "sha256": log.sha256,
                "byte_size": log.byte_size,
                "created_at": log.created_at,
            }
            for log in export_logs
        ],
    }


async def build_export_context(
    db: AsyncSession,
    writeup: Writeup,
    redact_for_client: bool = False,
    include_watermark: bool = True,
    include_toc: bool = True,
    watermark_text: str | None = None,
    rendered_diagrams: dict[str, str] | None = None,
) -> ExportBundleContext:
    detail = await build_writeup_detail_dict(db, writeup)
    assets_rows = (
        await db.execute(select(WriteupAsset).where(WriteupAsset.writeup_id == writeup.id))
    ).scalars().all()
    assets_by_id = {
        a.id: {
            **serialize_asset(a),
            "encrypted_blob": a.encrypted_blob,
        }
        for a in assets_rows
    }
    boards_by_id = {b["id"]: b for b in detail["boards"]}
    board_titles = {b["id"]: b["title"] for b in detail["boards"]}
    citations = [{**c, "board_title": board_titles.get(c["board_id"], "Pizarra")} for c in detail["citations"]]
    sanitized_diagrams: dict[str, str] = {}
    if rendered_diagrams:
        for key, raw_svg in rendered_diagrams.items():
            clean_svg = sanitize_svg_content(raw_svg)
            if clean_svg:
                sanitized_diagrams[key.lower()] = clean_svg

    return ExportBundleContext(
        writeup_id=writeup.id,
        title=detail["title"],
        slug=detail["slug"],
        status=detail["status"],
        severity=detail["severity"],
        cvss_score=detail["cvss_score"],
        cvss_vector=detail["cvss_vector"],
        cwe_id=detail["cwe_id"],
        cve_id=detail["cve_id"],
        target_scope=detail["target_scope"],
        tags=detail["tags"],
        executive_summary=detail["executive_summary"] or "",
        markdown_content=detail["markdown_content"],
        findings=detail["findings"],
        citations=citations,
        assets_by_id=assets_by_id,
        boards_by_id=boards_by_id,
        redact_for_client=redact_for_client,
        include_watermark=include_watermark,
        include_toc=include_toc,
        watermark_text=watermark_text,
        rendered_diagrams=sanitized_diagrams,
    )


async def count_related_entities(db: AsyncSession, writeup_id: str) -> tuple[int, int, int]:
    boards = (await db.execute(select(func.count(WriteupBoard.id)).where(WriteupBoard.writeup_id == writeup_id))).scalar_one()
    assets = (await db.execute(select(func.count(WriteupAsset.id)).where(WriteupAsset.writeup_id == writeup_id))).scalar_one()
    cits = (await db.execute(select(func.count(WriteupCitation.id)).where(WriteupCitation.writeup_id == writeup_id))).scalar_one()
    return int(boards), int(assets), int(cits)


def sanitize_board_svg(svg: str | None) -> str | None:
    if not svg:
        return None
    return sanitize_svg_content(svg)
