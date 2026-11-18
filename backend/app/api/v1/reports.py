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


@router.post("/documents/compile", response_model=TypstCompileResponse)
async def compile_document_preview(
    payload: TypstCompileRequest,
    _user: User | None = Depends(require_report_access),
):
    result = await run_in_threadpool(compile_typst_source, payload.source, "svg")
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
    result = await run_in_threadpool(compile_typst_source, source or "", "pdf")
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
