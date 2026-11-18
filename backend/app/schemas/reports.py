from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


ReportStatus = Literal["borrador", "en_revision", "finalizado", "entregado"]


class ReportDocumentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    status: ReportStatus = "borrador"
    source: str | None = Field(default=None, max_length=300_000)
    prospect_id: str | None = None
    project_id: str | None = None
    engagement_id: str | None = None


class ReportDocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    status: ReportStatus | None = None
    source: str | None = Field(default=None, max_length=300_000)
    prospect_id: str | None = None
    project_id: str | None = None
    engagement_id: str | None = None


class ReportDocumentSummaryOut(BaseModel):
    id: str
    title: str
    status: str
    prospect_id: str | None = None
    project_id: str | None = None
    engagement_id: str | None = None
    created_at: datetime
    updated_at: datetime


class ReportDocumentDetailOut(ReportDocumentSummaryOut):
    source: str


class ReportDocumentAssetOut(BaseModel):
    id: str
    document_id: str
    filename: str
    mime_type: str
    original_size_bytes: int
    optimized_size_bytes: int
    width: int
    height: int
    sha256: str
    exif_stripped: bool
    created_at: datetime


class TypstCompileRequest(BaseModel):
    source: str = Field(default="", max_length=300_000)
    document_id: str | None = None


class ReportRecoveryEncryptRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    status: ReportStatus = "borrador"
    prospect_id: str | None = None
    project_id: str | None = None
    source: str = Field(default="", max_length=300_000)


class ReportRecoveryCiphertextRequest(BaseModel):
    ciphertext: str = Field(..., min_length=1, max_length=700_000)


class ReportRecoveryCiphertextOut(BaseModel):
    ciphertext: str


class ReportRecoverySourceOut(BaseModel):
    version: int | None = None
    source: str
    title: str | None = None
    status: ReportStatus | None = None
    prospect_id: str | None = None
    project_id: str | None = None


class TypstCompileResponse(BaseModel):
    ok: bool
    pages: list[str] = Field(default_factory=list)
    page_count: int = 0
    error: str | None = None


class ReportCanvasCreate(BaseModel):
    title: str = Field(default="Nuevo lienzo", min_length=1, max_length=200)
    scene_json: str | None = None
    svg_snapshot: str | None = None
    element_count: int = Field(default=0, ge=0)
    linked_document_id: str | None = None
    prospect_id: str | None = None
    project_id: str | None = None
    engagement_id: str | None = None


class ReportCanvasUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    scene_json: str | None = None
    svg_snapshot: str | None = None
    element_count: int | None = Field(default=None, ge=0)
    linked_document_id: str | None = None
    prospect_id: str | None = None
    project_id: str | None = None
    engagement_id: str | None = None


class ReportCanvasSummaryOut(BaseModel):
    id: str
    title: str
    element_count: int
    has_svg_snapshot: bool = False
    linked_document_id: str | None = None
    prospect_id: str | None = None
    project_id: str | None = None
    engagement_id: str | None = None
    created_at: datetime
    updated_at: datetime


class ReportCanvasDetailOut(ReportCanvasSummaryOut):
    scene_json: str
