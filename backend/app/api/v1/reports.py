import re
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.database import get_db
from app.models import utc_now
from app.models.core import User
from app.models.reports import ReportCanvas, ReportDocument
from app.schemas.reports import (
    ReportCanvasCreate,
    ReportCanvasDetailOut,
    ReportCanvasSummaryOut,
    ReportCanvasUpdate,
    ReportDocumentCreate,
    ReportDocumentDetailOut,
    ReportDocumentSummaryOut,
    ReportDocumentUpdate,
    TypstCompileRequest,
    TypstCompileResponse,
)
from app.security.crypto import decrypt_note, encrypt_note
from app.security.tokens import require_vault_unlocked
from app.services.core_auth import get_current_user_from_token
from app.services.typst_compiler import (
    DEFAULT_TYPST_TEMPLATE,
    compile_typst_source,
    get_typst_status,
)

router = APIRouter(prefix="/reports", tags=["reports"], dependencies=[Depends(require_vault_unlocked)])

REPORT_ROLES = {"owner", "business_admin", "operator"}


async def require_report_access(request: Request, db: AsyncSession = Depends(get_db)) -> User | None:
    """Enforce operator role when a user session is attached alongside the unlocked vault."""
    auth_header = request.headers.get("Authorization")
    session_cookie = request.cookies.get("lessso_session")
    if (auth_header and auth_header.startswith("Bearer sess_")) or session_cookie:
        user = await get_current_user_from_token(request, db)
        if user.role not in REPORT_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permisos insuficientes para operar sobre Reportes.",
            )
        return user
    return None


def _safe_pdf_filename(title: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", title.strip()).strip("-").lower()
    return f"{slug or 'documento'}.pdf"


def _doc_summary(doc: ReportDocument) -> ReportDocumentSummaryOut:
    return ReportDocumentSummaryOut(
        id=doc.id,
        title=doc.title,
        status=doc.status,
        prospect_id=doc.prospect_id,
        project_id=doc.project_id,
        engagement_id=doc.engagement_id,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


def _doc_detail(doc: ReportDocument) -> ReportDocumentDetailOut:
    source = decrypt_note(doc.encrypted_source) if doc.encrypted_source else ""
    return ReportDocumentDetailOut(
        id=doc.id,
        title=doc.title,
        status=doc.status,
        source=source or "",
        prospect_id=doc.prospect_id,
        project_id=doc.project_id,
        engagement_id=doc.engagement_id,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


def _canvas_summary(canvas: ReportCanvas) -> ReportCanvasSummaryOut:
    return ReportCanvasSummaryOut(
        id=canvas.id,
        title=canvas.title,
        element_count=canvas.element_count,
        linked_document_id=canvas.linked_document_id,
        prospect_id=canvas.prospect_id,
        project_id=canvas.project_id,
        engagement_id=canvas.engagement_id,
        created_at=canvas.created_at,
        updated_at=canvas.updated_at,
    )


def _canvas_detail(canvas: ReportCanvas) -> ReportCanvasDetailOut:
    scene_json = decrypt_note(canvas.encrypted_scene_json) if canvas.encrypted_scene_json else "{}"
    return ReportCanvasDetailOut(
        id=canvas.id,
        title=canvas.title,
        element_count=canvas.element_count,
        scene_json=scene_json or "{}",
        linked_document_id=canvas.linked_document_id,
        prospect_id=canvas.prospect_id,
        project_id=canvas.project_id,
        engagement_id=canvas.engagement_id,
        created_at=canvas.created_at,
        updated_at=canvas.updated_at,
    )


@router.get("/typst-status")
async def typst_status(_user: User | None = Depends(require_report_access)):
    return await run_in_threadpool(get_typst_status)


@router.get("/overview")
async def reports_overview(
    db: AsyncSession = Depends(get_db),
    _user: User | None = Depends(require_report_access),
):
    docs = (
        await db.execute(
            select(ReportDocument)
            .where(ReportDocument.is_deleted == False)  # noqa: E712
            .order_by(desc(ReportDocument.updated_at))
        )
    ).scalars().all()
    canvases = (
        await db.execute(
            select(ReportCanvas)
            .where(ReportCanvas.is_deleted == False)  # noqa: E712
            .order_by(desc(ReportCanvas.updated_at))
        )
    ).scalars().all()

    total_words = 0
    by_status: dict[str, int] = {}
    for doc in docs:
        by_status[doc.status] = by_status.get(doc.status, 0) + 1
        src = decrypt_note(doc.encrypted_source) if doc.encrypted_source else ""
        if src:
            total_words += len(src.split())

    reading_minutes = max(1, (total_words + 199) // 200) if total_words > 0 else 0
    total_elements = sum(c.element_count for c in canvases)
    linked_canvases = sum(1 for c in canvases if c.linked_document_id)

    return {
        "total_documents": len(docs),
        "total_canvases": len(canvases),
        "linked_canvases": linked_canvases,
        "total_words": total_words,
        "reading_minutes": reading_minutes,
        "total_canvas_elements": total_elements,
        "documents_by_status": by_status,
        "latest_document_title": docs[0].title if docs else None,
        "latest_canvas_title": canvases[0].title if canvases else None,
    }


# ---------------------------------------------------------------------------
# Documentos (Typst)
# ---------------------------------------------------------------------------


@router.get("/documents", response_model=list[ReportDocumentSummaryOut])
async def list_documents(
    db: AsyncSession = Depends(get_db),
    _user: User | None = Depends(require_report_access),
):
    rows = (
        await db.execute(
            select(ReportDocument)
            .where(ReportDocument.is_deleted == False)  # noqa: E712
            .order_by(desc(ReportDocument.updated_at))
        )
    ).scalars().all()
    return [_doc_summary(row) for row in rows]


@router.post("/documents", response_model=ReportDocumentDetailOut, status_code=status.HTTP_201_CREATED)
async def create_document(
    payload: ReportDocumentCreate,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(require_report_access),
):
    source = payload.source if payload.source is not None else DEFAULT_TYPST_TEMPLATE
    doc = ReportDocument(
        title=payload.title.strip(),
        status=payload.status,
        encrypted_source=encrypt_note(source),
        prospect_id=payload.prospect_id,
        project_id=payload.project_id,
        engagement_id=payload.engagement_id,
        created_by_id=user.id if user else None,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _doc_detail(doc)


CANVAS_REF_RE = re.compile(r"canvas://([A-Za-z0-9-]+)(?:\.svg)?")


async def _resolve_canvas_assets(source: str, db: AsyncSession) -> tuple[str, dict[str, bytes]]:
    """Resolve canvas://<id> references in Typst source into local SVG files."""
    canvas_ids = sorted(set(CANVAS_REF_RE.findall(source)))
    if not canvas_ids:
        return source, {}

    rows = (
        await db.execute(
            select(ReportCanvas).where(
                ReportCanvas.id.in_(canvas_ids),
                ReportCanvas.is_deleted == False,  # noqa: E712
            )
        )
    ).scalars().all()

    extra_files: dict[str, bytes] = {}
    id_to_filename: dict[str, str] = {}
    for row in rows:
        if not row.encrypted_svg_snapshot:
            continue
        svg_text = decrypt_note(row.encrypted_svg_snapshot)
        if svg_text:
            filename = f"canvas_{row.id}.svg"
            extra_files[filename] = svg_text.encode("utf-8")
            id_to_filename[row.id] = filename

    def _replace(match: re.Match[str]) -> str:
        cid = match.group(1)
        return id_to_filename.get(cid, match.group(0))

    resolved_source = CANVAS_REF_RE.sub(_replace, source)
    return resolved_source, extra_files


@router.post("/documents/compile", response_model=TypstCompileResponse)
async def compile_document_preview(
    payload: TypstCompileRequest,
    db: AsyncSession = Depends(get_db),
    _user: User | None = Depends(require_report_access),
):
    resolved_source, extra_files = await _resolve_canvas_assets(payload.source, db)
    result = await run_in_threadpool(compile_typst_source, resolved_source, "svg", extra_files)
    return TypstCompileResponse(
        ok=result.ok,
        pages=result.pages,
        page_count=len(result.pages),
        error=result.error,
    )


@router.get("/documents/{doc_id}", response_model=ReportDocumentDetailOut)
async def get_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User | None = Depends(require_report_access),
):
    doc = (
        await db.execute(
            select(ReportDocument).where(
                ReportDocument.id == doc_id,
                ReportDocument.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado.")
    return _doc_detail(doc)


@router.patch("/documents/{doc_id}", response_model=ReportDocumentDetailOut)
async def update_document(
    doc_id: str,
    payload: ReportDocumentUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User | None = Depends(require_report_access),
):
    doc = (
        await db.execute(
            select(ReportDocument).where(
                ReportDocument.id == doc_id,
                ReportDocument.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado.")

    if payload.title is not None:
        doc.title = payload.title.strip()
    if payload.status is not None:
        doc.status = payload.status
    if payload.source is not None:
        doc.encrypted_source = encrypt_note(payload.source)
    if payload.prospect_id is not None:
        doc.prospect_id = payload.prospect_id or None
    if payload.project_id is not None:
        doc.project_id = payload.project_id or None
    if payload.engagement_id is not None:
        doc.engagement_id = payload.engagement_id or None
    doc.updated_at = utc_now()

    await db.commit()
    await db.refresh(doc)
    return _doc_detail(doc)


@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User | None = Depends(require_report_access),
):
    doc = (
        await db.execute(
            select(ReportDocument).where(
                ReportDocument.id == doc_id,
                ReportDocument.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado.")

    doc.is_deleted = True
    doc.deleted_at = utc_now()
    await db.commit()


@router.post("/documents/{doc_id}/pdf")
async def export_document_pdf(
    doc_id: str,
    payload: TypstCompileRequest | None = None,
    db: AsyncSession = Depends(get_db),
    _user: User | None = Depends(require_report_access),
):
    doc = (
        await db.execute(
            select(ReportDocument).where(
                ReportDocument.id == doc_id,
                ReportDocument.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado.")

    source = (
        payload.source
        if payload is not None
        else (decrypt_note(doc.encrypted_source) if doc.encrypted_source else "")
    )
    resolved_source, extra_files = await _resolve_canvas_assets(source or "", db)
    result = await run_in_threadpool(compile_typst_source, resolved_source, "pdf", extra_files)
    if not result.ok or not result.pdf_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result.error or "No se pudo compilar el PDF.",
        )

    filename = _safe_pdf_filename(doc.title)
    return Response(
        content=result.pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/documents/{doc_id}/export")
async def export_document_format(
    doc_id: str,
    format: str = "pdf",
    payload: TypstCompileRequest | None = None,
    db: AsyncSession = Depends(get_db),
    _user: User | None = Depends(require_report_access),
):
    fmt = format.lower().strip()
    if fmt not in {"pdf", "html", "typ"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Formato no soportado (usa pdf, html o typ).")

    doc = (
        await db.execute(
            select(ReportDocument).where(
                ReportDocument.id == doc_id,
                ReportDocument.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado.")

    source = (
        payload.source
        if payload is not None
        else (decrypt_note(doc.encrypted_source) if doc.encrypted_source else "")
    )
    base_name = _safe_pdf_filename(doc.title).rsplit(".", 1)[0]

    if fmt == "typ":
        return Response(
            content=(source or "").encode("utf-8"),
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{base_name}.typ"'},
        )

    resolved_source, extra_files = await _resolve_canvas_assets(source or "", db)
    result = await run_in_threadpool(compile_typst_source, resolved_source, fmt, extra_files)
    if not result.ok or not result.pdf_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result.error or f"No se pudo compilar el archivo {fmt.upper()}.",
        )

    media_type = "application/pdf" if fmt == "pdf" else "text/html; charset=utf-8"
    return Response(
        content=result.pdf_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{base_name}.{fmt}"'},
    )


CVE_RE = re.compile(r"\bCVE-\d{4}-\d{4,7}\b", re.IGNORECASE)
CWE_RE = re.compile(r"\bCWE-\d{1,5}\b", re.IGNORECASE)
IPV4_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")


def _extract_signals(text: str) -> tuple[set[str], set[str], set[str]]:
    cves = {m.upper() for m in CVE_RE.findall(text)}
    cwes = {m.upper() for m in CWE_RE.findall(text)}
    ips = set(IPV4_RE.findall(text))
    return cves, cwes, ips


@router.get("/documents/{doc_id}/correlations")
async def get_document_correlations(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User | None = Depends(require_report_access),
):
    rows = (
        await db.execute(
            select(ReportDocument).where(ReportDocument.is_deleted == False)  # noqa: E712
        )
    ).scalars().all()
    target = next((r for r in rows if r.id == doc_id), None)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado.")

    target_src = decrypt_note(target.encrypted_source) if target.encrypted_source else ""
    t_cves, t_cwes, t_ips = _extract_signals(target_src or "")

    matches = []
    for other in rows:
        if other.id == target.id:
            continue
        other_src = decrypt_note(other.encrypted_source) if other.encrypted_source else ""
        o_cves, o_cwes, o_ips = _extract_signals(other_src or "")

        reasons: list[str] = []
        score = 0
        shared_cves = sorted(t_cves & o_cves)
        shared_cwes = sorted(t_cwes & o_cwes)
        shared_ips = sorted(t_ips & o_ips)

        if shared_cves:
            score += 40 * len(shared_cves)
            reasons.append(f"CVE: {', '.join(shared_cves[:3])}")
        if shared_cwes:
            score += 25 * len(shared_cwes)
            reasons.append(f"CWE: {', '.join(shared_cwes[:3])}")
        if shared_ips:
            score += 15 * len(shared_ips)
            reasons.append(f"IP: {', '.join(shared_ips[:3])}")
        if target.prospect_id and target.prospect_id == other.prospect_id:
            score += 20
            reasons.append("Mismo prospecto")
        if target.project_id and target.project_id == other.project_id:
            score += 20
            reasons.append("Mismo proyecto")

        if reasons:
            matches.append({
                "id": other.id,
                "title": other.title,
                "status": other.status,
                "score": score,
                "reasons": reasons,
            })

    matches.sort(key=lambda item: item["score"], reverse=True)
    return {"total_checked": max(0, len(rows) - 1), "matches": matches[:10]}


# ---------------------------------------------------------------------------
# Lienzos (Excalidraw)
# ---------------------------------------------------------------------------


@router.get("/canvases", response_model=list[ReportCanvasSummaryOut])
async def list_canvases(
    db: AsyncSession = Depends(get_db),
    _user: User | None = Depends(require_report_access),
):
    rows = (
        await db.execute(
            select(ReportCanvas)
            .where(ReportCanvas.is_deleted == False)  # noqa: E712
            .order_by(desc(ReportCanvas.updated_at))
        )
    ).scalars().all()
    return [_canvas_summary(row) for row in rows]


@router.post("/canvases", response_model=ReportCanvasDetailOut, status_code=status.HTTP_201_CREATED)
async def create_canvas(
    payload: ReportCanvasCreate,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(require_report_access),
):
    scene_json = payload.scene_json if payload.scene_json is not None else "{}"
    canvas = ReportCanvas(
        title=payload.title.strip(),
        encrypted_scene_json=encrypt_note(scene_json),
        encrypted_svg_snapshot=encrypt_note(payload.svg_snapshot) if payload.svg_snapshot else None,
        element_count=payload.element_count,
        linked_document_id=payload.linked_document_id,
        prospect_id=payload.prospect_id,
        project_id=payload.project_id,
        engagement_id=payload.engagement_id,
        created_by_id=user.id if user else None,
    )
    db.add(canvas)
    await db.commit()
    await db.refresh(canvas)
    return _canvas_detail(canvas)


@router.get("/canvases/{canvas_id}", response_model=ReportCanvasDetailOut)
async def get_canvas(
    canvas_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User | None = Depends(require_report_access),
):
    canvas = (
        await db.execute(
            select(ReportCanvas).where(
                ReportCanvas.id == canvas_id,
                ReportCanvas.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not canvas:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lienzo no encontrado.")
    return _canvas_detail(canvas)


@router.patch("/canvases/{canvas_id}", response_model=ReportCanvasDetailOut)
async def update_canvas(
    canvas_id: str,
    payload: ReportCanvasUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User | None = Depends(require_report_access),
):
    canvas = (
        await db.execute(
            select(ReportCanvas).where(
                ReportCanvas.id == canvas_id,
                ReportCanvas.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not canvas:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lienzo no encontrado.")

    if payload.title is not None:
        canvas.title = payload.title.strip()
    if payload.scene_json is not None:
        canvas.encrypted_scene_json = encrypt_note(payload.scene_json)
    if payload.svg_snapshot is not None:
        canvas.encrypted_svg_snapshot = encrypt_note(payload.svg_snapshot) if payload.svg_snapshot else None
    if payload.element_count is not None:
        canvas.element_count = payload.element_count
    if payload.linked_document_id is not None:
        canvas.linked_document_id = payload.linked_document_id or None
    if payload.prospect_id is not None:
        canvas.prospect_id = payload.prospect_id or None
    if payload.project_id is not None:
        canvas.project_id = payload.project_id or None
    if payload.engagement_id is not None:
        canvas.engagement_id = payload.engagement_id or None
    canvas.updated_at = utc_now()

    await db.commit()
    await db.refresh(canvas)
    return _canvas_detail(canvas)


@router.delete("/canvases/{canvas_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_canvas(
    canvas_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User | None = Depends(require_report_access),
):
    canvas = (
        await db.execute(
            select(ReportCanvas).where(
                ReportCanvas.id == canvas_id,
                ReportCanvas.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not canvas:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lienzo no encontrado.")

    canvas.is_deleted = True
    canvas.deleted_at = utc_now()
    await db.commit()
