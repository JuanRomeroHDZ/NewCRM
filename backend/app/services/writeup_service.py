import hashlib
import json
import re
import unicodedata
import base64
import zlib
from datetime import datetime
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
REVISION_PAYLOAD_MARKER = "\x1eLESSSO-WR-PAYLOAD:v1:"


def encrypt_revision_text(text: str | None) -> str | None:
    """Compress large revision text before encryption, preserving the legacy note cipher."""
    if text is None:
        return None
    marker = REVISION_PAYLOAD_MARKER
    raw = text.encode("utf-8")
    compressed = zlib.compress(raw, level=6)
    # Include the envelope/base64 overhead so short or incompressible strings
    # continue using the existing representation without growing the row.
    if len(compressed) + 64 < len(raw):
        envelope = marker + "zlib:" + base64.b64encode(compressed).decode("ascii")
    elif text.startswith(marker):
        # Escape user content that could otherwise be mistaken for our envelope.
        envelope = marker + "raw:" + base64.b64encode(raw).decode("ascii")
    else:
        return encrypt_note(text)
    return encrypt_note(envelope)


def decrypt_revision_text(stored_text: str | None) -> str | None:
    """Reads both compressed v1 revision envelopes and historical encrypted notes."""
    plain = decrypt_note(stored_text)
    if not plain or not plain.startswith(REVISION_PAYLOAD_MARKER):
        return plain
    mode, separator, payload = plain[len(REVISION_PAYLOAD_MARKER):].partition(":")
    if not separator or mode not in {"zlib", "raw"}:
        raise ValueError("Formato de revisión comprimida no válido.")
    try:
        decoded = base64.b64decode(payload.encode("ascii"), validate=True)
        raw = zlib.decompress(decoded) if mode == "zlib" else decoded
        return raw.decode("utf-8")
    except (ValueError, zlib.error, UnicodeDecodeError) as exc:
        raise ValueError("No se pudo descifrar o descomprimir la revisión.") from exc


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


def serialize_board(board: WriteupBoard, writeup_updated_at: datetime | None = None) -> dict:
    return {
        "id": board.id,
        "writeup_id": board.writeup_id,
        "title": board.title,
        "scene_json": decrypt_note(board.encrypted_scene_json) or "{}",
        "svg_snapshot": decrypt_note(board.encrypted_svg_snapshot),
        "element_count": board.element_count,
        "created_at": board.created_at,
        "updated_at": board.updated_at,
        "writeup_updated_at": writeup_updated_at,
    }


def serialize_citation(cit: WriteupCitation, current_markdown: str, writeup_updated_at: datetime | None = None) -> dict:
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
        "writeup_updated_at": writeup_updated_at,
    }


def serialize_asset(asset: WriteupAsset, writeup_updated_at: datetime | None = None) -> dict:
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
        "writeup_updated_at": writeup_updated_at,
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
    change_type: str | None = None,
) -> WriteupRevision | None:
    await db.flush()
    # Serialize revision numbering and snapshot creation across workers on PostgreSQL.
    await db.execute(select(Writeup.id).where(Writeup.id == writeup.id).with_for_update())
    boards = (await db.execute(select(WriteupBoard).where(WriteupBoard.writeup_id == writeup.id).order_by(WriteupBoard.id))).scalars().all()
    citations = (await db.execute(select(WriteupCitation).where(WriteupCitation.writeup_id == writeup.id).order_by(WriteupCitation.id))).scalars().all()
    assets = (await db.execute(select(WriteupAsset).where(WriteupAsset.writeup_id == writeup.id, WriteupAsset.is_deleted == False).order_by(WriteupAsset.id))).scalars().all()  # noqa: E712
    snapshot = {
        "version": 1,
        "fields": {field: getattr(writeup, field) for field in (
            "title", "status", "severity", "cvss_score", "cvss_vector", "cwe_id", "cve_id",
            "target_scope", "tags_json", "prospect_id", "project_id", "engagement_id")},
        "executive_summary": decrypt_note(writeup.encrypted_executive_summary),
        "findings": _load_json_list(decrypt_note(writeup.encrypted_findings_json)),
        "boards": [{k: v for k, v in serialize_board(board).items() if k not in ("created_at", "updated_at", "writeup_updated_at")} for board in boards],
        "citations": [{k: v for k, v in serialize_citation(cit, markdown_text).items() if k not in ("created_at", "updated_at", "is_stale", "writeup_updated_at")} for cit in citations],
        "assets": [{k: v for k, v in serialize_asset(asset).items() if k not in ("created_at", "writeup_updated_at")} for asset in assets],
    }
    snapshot_json = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    content_hash = hashlib.sha256((markdown_text + "\0" + snapshot_json).encode("utf-8")).hexdigest()
    latest = (
        await db.execute(
            select(WriteupRevision)
            .where(WriteupRevision.writeup_id == writeup.id)
            .order_by(desc(WriteupRevision.revision_number))
            .limit(1)
        )
    ).scalar_one_or_none()
    normalized_note = (change_note or "").strip()
    inferred_type = change_type or infer_revision_type(normalized_note)
    # Named milestones are explicit user intent and remain useful bookmarks even
    # when they point at an otherwise identical snapshot.
    if latest and latest.content_hash == content_hash and inferred_type != "milestone":
        return None
    next_num = (latest.revision_number + 1) if latest else 1
    rev = WriteupRevision(
        writeup_id=writeup.id,
        revision_number=next_num,
        change_note=normalized_note or f"Revisión #{next_num}",
        change_type=inferred_type,
        content_hash=content_hash,
        encrypted_markdown=encrypt_revision_text(markdown_text),
        encrypted_snapshot=encrypt_revision_text(snapshot_json),
        created_by_id=user_id,
    )
    db.add(rev)
    return rev


def infer_revision_type(change_note: str) -> str:
    """Map existing action labels to stable history categories."""
    normalized = unicodedata.normalize("NFKD", change_note.casefold())
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    if "version inicial" in normalized:
        return "initial"
    if "guardado automatico" in normalized:
        return "autosave"
    if "instantanea manual" in normalized:
        return "manual"
    if "restaur" in normalized:
        return "restore"
    if "evidencia" in normalized:
        return "evidence"
    if "pizarra" in normalized:
        return "board"
    if "cita" in normalized:
        return "citation"
    return "edit"


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
            select(WriteupAsset).where(WriteupAsset.writeup_id == writeup.id, WriteupAsset.is_deleted == False).order_by(WriteupAsset.created_at)  # noqa: E712
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
        "boards": [serialize_board(b, writeup.updated_at) for b in boards],
        "citations": [serialize_citation(c, markdown_text, writeup.updated_at) for c in citations],
        "assets": [serialize_asset(a, writeup.updated_at) for a in assets],
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
        await db.execute(select(WriteupAsset).where(WriteupAsset.writeup_id == writeup.id, WriteupAsset.is_deleted == False))  # noqa: E712
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

    from app.services.config_service import get_runtime_config
    runtime_cfg = await get_runtime_config(db)
    writeup_defaults = runtime_cfg.get("writeup_defaults") or {}

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
        watermark_text=watermark_text or writeup_defaults.get("watermark_default"),
        organization_name=writeup_defaults.get("organization_name"),
        rendered_diagrams=sanitized_diagrams,
    )


async def count_related_entities(db: AsyncSession, writeup_id: str) -> tuple[int, int, int]:
    boards = (await db.execute(select(func.count(WriteupBoard.id)).where(WriteupBoard.writeup_id == writeup_id))).scalar_one()
    assets = (await db.execute(select(func.count(WriteupAsset.id)).where(WriteupAsset.writeup_id == writeup_id, WriteupAsset.is_deleted == False))).scalar_one()  # noqa: E712
    cits = (await db.execute(select(func.count(WriteupCitation.id)).where(WriteupCitation.writeup_id == writeup_id))).scalar_one()
    return int(boards), int(assets), int(cits)


def sanitize_board_svg(svg: str | None) -> str | None:
    if not svg:
        return None
    return sanitize_svg_content(svg)
