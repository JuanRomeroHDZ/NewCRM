from datetime import datetime
import math
from typing import Literal
from pydantic import BaseModel, Field, field_validator
from app.config import settings
from app.schemas import validate_finite_number_input, validate_nonblank_input


WriteupStatus = Literal["borrador", "en_revision", "finalizado", "entregado"]
WriteupSeverity = Literal["informativa", "baja", "media", "alta", "critica"]
ExportFormatType = Literal["md_zip", "md", "html", "docx", "pdf", "sarif", "csv", "json"]
WriteupRevisionType = Literal[
    "initial", "autosave", "manual", "milestone", "restore", "edit", "evidence", "board", "citation"
]


class StructuredFindingItem(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=2, max_length=200)
    severity: WriteupSeverity = "media"
    cvss_score: float | None = Field(default=None, ge=0.0, le=10.0)
    cvss_vector: str | None = Field(default=None, max_length=128)
    cwe_id: str | None = Field(default=None, max_length=32)
    cve_id: str | None = Field(default=None, max_length=64)
    affected_target: str | None = Field(default=None, max_length=255)
    status: Literal["abierta", "mitigada", "riesgo_aceptado", "falso_positivo"] = "abierta"
    summary: str = Field(default="", max_length=4000)
    remediation: str = Field(default="", max_length=4000)
    anchor_id: str | None = Field(default=None, max_length=120)

    @field_validator("cvss_score")
    @classmethod
    def check_cvss_finite(cls, v: float | None) -> float | None:
        return validate_finite_number_input(v, "El puntaje CVSS debe ser un número finito válido.")


class WriteupCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    status: WriteupStatus = "borrador"
    severity: WriteupSeverity = "media"
    cvss_score: float | None = Field(default=None, ge=0.0, le=10.0)
    cvss_vector: str | None = Field(default=None, max_length=128)
    cwe_id: str | None = Field(default=None, max_length=32)
    cve_id: str | None = Field(default=None, max_length=64)
    target_scope: str | None = Field(default=None, max_length=500)
    tags: list[str] = Field(default_factory=list, max_length=30)
    markdown_content: str = Field(default="", max_length=settings.WRITEUP_MAX_CONTENT_CHARS)
    executive_summary: str | None = Field(default=None, max_length=25000)
    findings: list[StructuredFindingItem] = Field(default_factory=list, max_length=200)
    prospect_id: str | None = Field(default=None, max_length=36)
    project_id: str | None = Field(default=None, max_length=36)
    engagement_id: str | None = Field(default=None, max_length=36)
    create_default_board: bool = True

    @field_validator("title")
    @classmethod
    def check_title(cls, value: str) -> str:
        return validate_nonblank_input(value, "Ingresa un título para el writeup.")

    @field_validator("cvss_score")
    @classmethod
    def check_cvss(cls, v: float | None) -> float | None:
        if v is not None and not math.isfinite(float(v)):
            raise ValueError("El puntaje CVSS debe ser finito.")
        return v


class WriteupUpdate(BaseModel):
    expected_updated_at: datetime | None = None
    title: str | None = Field(default=None, min_length=2, max_length=200)
    status: WriteupStatus | None = None
    severity: WriteupSeverity | None = None
    cvss_score: float | None = Field(default=None, ge=0.0, le=10.0)
    cvss_vector: str | None = Field(default=None, max_length=128)
    cwe_id: str | None = Field(default=None, max_length=32)
    cve_id: str | None = Field(default=None, max_length=64)
    target_scope: str | None = Field(default=None, max_length=500)
    tags: list[str] | None = Field(default=None, max_length=30)
    markdown_content: str | None = Field(default=None, max_length=settings.WRITEUP_MAX_CONTENT_CHARS)
    executive_summary: str | None = Field(default=None, max_length=25000)
    findings: list[StructuredFindingItem] | None = Field(default=None, max_length=200)
    prospect_id: str | None = Field(default=None, max_length=36)
    project_id: str | None = Field(default=None, max_length=36)
    engagement_id: str | None = Field(default=None, max_length=36)
    save_revision: bool = False
    revision_note: str | None = Field(default=None, max_length=255)
    revision_type: WriteupRevisionType | None = None

    @field_validator("title")
    @classmethod
    def check_opt_title(cls, value: str | None) -> str | None:
        return validate_nonblank_input(value, "El título no puede estar vacío.") if value is not None else None


class WriteupAssetOut(BaseModel):
    id: str
    writeup_id: str
    filename: str
    mime_type: str
    original_size_bytes: int
    optimized_size_bytes: int
    width: int
    height: int
    sha256: str
    exif_stripped: bool
    caption: str | None = None
    created_at: datetime
    # Current parent version lets clients continue a sequence of resource edits safely.
    writeup_updated_at: datetime | None = None


class WriteupBoardCreate(BaseModel):
    expected_updated_at: datetime | None = None
    title: str = Field(default="Pizarra principal", min_length=2, max_length=180)
    scene_json: str = Field(default="{}", max_length=settings.WRITEUP_MAX_CONTENT_CHARS)
    svg_snapshot: str | None = Field(default=None, max_length=settings.WRITEUP_MAX_SVG_CHARS)
    element_count: int = Field(default=0, ge=0, le=50000)


class WriteupBoardUpdate(BaseModel):
    expected_updated_at: datetime | None = None
    title: str | None = Field(default=None, min_length=2, max_length=180)
    scene_json: str | None = Field(default=None, max_length=settings.WRITEUP_MAX_CONTENT_CHARS)
    svg_snapshot: str | None = Field(default=None, max_length=settings.WRITEUP_MAX_SVG_CHARS)
    element_count: int | None = Field(default=None, ge=0, le=50000)


class WriteupBoardOut(BaseModel):
    id: str
    writeup_id: str
    title: str
    scene_json: str
    svg_snapshot: str | None = None
    element_count: int
    created_at: datetime
    updated_at: datetime
    writeup_updated_at: datetime | None = None


class WriteupCitationCreate(BaseModel):
    expected_updated_at: datetime | None = None
    board_id: str = Field(..., min_length=1, max_length=36)
    anchor_id: str = Field(..., min_length=2, max_length=120, pattern=r"^[a-zA-Z0-9_-]+$")
    board_element_id: str | None = Field(default=None, max_length=120)
    heading_path: str | None = Field(default=None, max_length=255)
    line_start: int = Field(default=1, ge=1, le=200000)
    line_end: int = Field(default=1, ge=1, le=200000)
    quoted_text: str = Field(..., min_length=1, max_length=10000)
    color: str = Field(default="#10B981", pattern=r"^#[0-9a-fA-F]{6}$")
    note: str | None = Field(default=None, max_length=2000)


class WriteupCitationUpdate(BaseModel):
    expected_updated_at: datetime | None = None
    board_element_id: str | None = Field(default=None, max_length=120)
    heading_path: str | None = Field(default=None, max_length=255)
    line_start: int | None = Field(default=None, ge=1, le=200000)
    line_end: int | None = Field(default=None, ge=1, le=200000)
    quoted_text: str | None = Field(default=None, min_length=1, max_length=10000)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    note: str | None = Field(default=None, max_length=2000)


class WriteupCitationOut(BaseModel):
    id: str
    writeup_id: str
    board_id: str
    anchor_id: str
    board_element_id: str | None = None
    heading_path: str | None = None
    line_start: int
    line_end: int
    quoted_text: str
    quote_hash: str
    is_stale: bool = False
    color: str
    note: str | None = None
    created_at: datetime
    updated_at: datetime
    writeup_updated_at: datetime | None = None


class WriteupRevisionOut(BaseModel):
    id: str
    writeup_id: str
    revision_number: int
    change_note: str | None = None
    change_type: WriteupRevisionType
    content_hash: str
    markdown_content: str | None = None
    snapshot: dict | None = None
    created_by_id: str | None = None
    created_by_name: str | None = None
    has_content: bool = True
    created_at: datetime


class WriteupRevisionAuthorOut(BaseModel):
    id: str
    name: str


class WriteupExportLogOut(BaseModel):
    id: str
    writeup_id: str
    export_format: str
    redacted_for_client: bool
    sha256: str
    byte_size: int
    created_at: datetime


class WriteupExportRequest(BaseModel):
    format: ExportFormatType = "pdf"
    redact_for_client: bool = False
    include_watermark: bool = True
    include_toc: bool = True
    toc_depth: int = Field(default=6, ge=1, le=6)
    include_figure_index: bool = False
    include_table_index: bool = False
    watermark_text: str | None = Field(default=None, max_length=120)
    rendered_diagrams: dict[str, str] = Field(default_factory=dict)

    @field_validator("rendered_diagrams")
    @classmethod
    def check_rendered_diagrams(cls, value: dict[str, str]) -> dict[str, str]:
        if len(value) > 30:
            raise ValueError("Se permite un máximo de 30 diagramas pre-renderizados por exportación.")
        cleaned: dict[str, str] = {}
        for key, svg in value.items():
            if not key or len(key) > 64 or not all(ch in "0123456789abcdefABCDEF" for ch in key):
                raise ValueError("Clave de diagrama inválida.")
            if not isinstance(svg, str) or len(svg) > settings.WRITEUP_MAX_SVG_CHARS:
                raise ValueError("Diagrama SVG excede el límite permitido.")
            cleaned[key.lower()] = svg
        return cleaned


class WriteupCloneRequest(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)

    @field_validator("title")
    @classmethod
    def check_clone_title(cls, value: str | None) -> str | None:
        return validate_nonblank_input(value, "El título del clon no puede estar vacío.") if value is not None else None


class WriteupSummaryOut(BaseModel):
    id: str
    title: str
    slug: str
    status: str
    severity: str
    cvss_score: float | None = None
    cwe_id: str | None = None
    cve_id: str | None = None
    target_scope: str | None = None
    tags: list[str]
    prospect_id: str | None = None
    project_id: str | None = None
    engagement_id: str | None = None
    boards_count: int = 0
    assets_count: int = 0
    citations_count: int = 0
    updated_at: datetime
    created_at: datetime


class WriteupDetailOut(WriteupSummaryOut):
    cvss_vector: str | None = None
    markdown_content: str
    executive_summary: str | None = None
    findings: list[StructuredFindingItem]
    boards: list[WriteupBoardOut]
    citations: list[WriteupCitationOut]
    assets: list[WriteupAssetOut]
    export_logs: list[WriteupExportLogOut]


class WriteupPreviewOut(BaseModel):
    sanitized_html: str
    redacted_for_client: bool
