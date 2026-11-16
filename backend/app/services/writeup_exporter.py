import base64
import csv
from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import html as html_lib
import io
import json
import re
import shutil
import subprocess
import unicodedata
import zipfile
from typing import Any, Callable
import docx
from docx.shared import Inches, Pt, RGBColor
import markdown as md_lib
import nh3
from PIL import Image as PILImage
from weasyprint import HTML as WeasyHTML
from app.config import settings
from app.services.workshop_sanitizer import sanitize_formula_injection, sanitize_svg_content
from app.services.writeup_media import decrypt_asset_bytes


REDACT_PATTERN = re.compile(r"\{\{redact:(.*?)\}\}|\[\[redact:(.*?)\]\]", re.DOTALL | re.IGNORECASE)
ANCHOR_PATTERN = re.compile(r"\{#([a-zA-Z0-9_-]{2,120})\}")
ASSET_MD_IMG_PATTERN = re.compile(r"!\[([^\]]*)\]\(asset://([a-zA-Z0-9_-]{1,64})\)")
BOARD_MD_IMG_PATTERN = re.compile(r"!\[([^\]]*)\]\(board://([a-zA-Z0-9_-]{1,64})\)")
MD_LINK_ASSET_PATTERN = re.compile(r"asset://([a-zA-Z0-9_-]{1,64})")
MD_LINK_BOARD_PATTERN = re.compile(r"board://([a-zA-Z0-9_-]{1,64})")
MERMAID_FENCE_PATTERN = re.compile(r"```mermaid\s*\n(.*?)```", re.DOTALL | re.IGNORECASE)

ALLOWED_HTML_TAGS = {
    "a", "abbr", "b", "blockquote", "br", "code", "dd", "del", "details", "div", "dl", "dt",
    "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i",
    "img", "kbd", "li", "mark", "ol", "p", "pre", "s", "source", "span", "strong", "sub",
    "summary", "sup", "table", "tbody", "td", "th", "thead", "tr", "u", "ul", "video",
    "caption",
}
ALLOWED_HTML_ATTRS = {
    "a": {"href", "title", "id"},
    "code": {"class"},
    "details": {"open"},
    "div": {"class", "id"},
    "figcaption": {"class"},
    "figure": {"class", "id"},
    "h1": {"id"}, "h2": {"id"}, "h3": {"id"}, "h4": {"id"}, "h5": {"id"}, "h6": {"id"},
    "img": {"src", "alt", "title", "class", "id"},
    "ol": {"type", "start"},
    "table": {"id"},
    "ul": {"type"},
    "source": {"src", "type"},
    "span": {"id", "class", "data-anchor"},
    "td": {"align"},
    "th": {"align"},
    "video": {"src", "controls", "loop", "muted", "playsinline", "class"},
}

SEVERITY_COLORS = {
    "critica": "#dc2626",
    "alta": "#ea580c",
    "media": "#d97706",
    "baja": "#0284c7",
    "informativa": "#64748b",
}


@dataclass(frozen=True)
class ExportArtifact:
    content: bytes
    media_type: str
    filename: str
    sha256: str


@dataclass
class ExportBundleContext:
    writeup_id: str
    title: str
    slug: str
    status: str
    severity: str
    cvss_score: float | None
    cvss_vector: str | None
    cwe_id: str | None
    cve_id: str | None
    target_scope: str | None
    tags: list[str]
    executive_summary: str
    markdown_content: str
    findings: list[dict[str, Any]]
    citations: list[dict[str, Any]]
    assets_by_id: dict[str, dict[str, Any]]
    boards_by_id: dict[str, dict[str, Any]]
    redact_for_client: bool = False
    include_watermark: bool = True
    include_toc: bool = True
    toc_depth: int = 6
    include_figure_index: bool = False
    include_table_index: bool = False
    watermark_text: str | None = None
    organization_name: str | None = None
    rendered_diagrams: dict[str, str] = field(default_factory=dict)


def _diagram_sha256(source: str) -> str:
    return hashlib.sha256(source.strip().encode("utf-8")).hexdigest().lower()


def _svg_data_uri(svg_xml: str) -> str:
    b64 = base64.b64encode(svg_xml.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{b64}"


def _svg_to_png_bytes(svg_xml: str, width: int = 1200) -> bytes | None:
    """Rasterizes sanitized SVG into metadata-stripped PNG via rsvg-convert + Pillow for DOCX."""
    clean_svg = sanitize_svg_content(svg_xml)
    if not clean_svg:
        return None
    rsvg_bin = shutil.which("rsvg-convert")
    if not rsvg_bin:
        return None
    try:
        proc = subprocess.run(
            [rsvg_bin, "-w", str(width), "-f", "png", "-"],
            input=clean_svg.encode("utf-8"),
            capture_output=True,
            timeout=10,
            check=True,
        )
        if not proc.stdout:
            return None
        with PILImage.open(io.BytesIO(proc.stdout)) as img:
            rgba = img.convert("RGBA")
            rgba.info.clear()
            out = io.BytesIO()
            rgba.save(out, format="PNG")
            return out.getvalue()
    except Exception:
        return None


def apply_redaction_markers(text: str, redact_for_client: bool) -> str:
    """Masks {{redact:...}} segments in client-safe mode or unwraps them for internal mode."""
    if not text:
        return ""

    def _replace(match: re.Match[str]) -> str:
        inner = match.group(1) if match.group(1) is not None else (match.group(2) or "")
        return "[REDACTED]" if redact_for_client else inner

    return REDACT_PATTERN.sub(_replace, text)


def _ssrf_safe_url_fetcher(url: str, timeout: int = 10, ssl_context: Any = None) -> dict[str, Any]:
    """Blocks all external network or local filesystem fetches during PDF rendering."""
    if url.startswith("data:"):
        header, _, encoded = url[5:].partition(",")
        mime_type = header.split(";")[0] or "application/octet-stream"
        if ";base64" in header:
            data = base64.b64decode(encoded)
        else:
            data = encoded.encode("utf-8")
        return {"string": data, "mime_type": mime_type}
    raise ValueError(f"Recurso externo bloqueado por protección SSRF: {url[:80]}")


def _asset_to_data_uri(asset: dict[str, Any]) -> str:
    raw = decrypt_asset_bytes(asset["encrypted_blob"])
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:{asset['mime_type']};base64,{b64}"


def _board_to_svg_data_uri(board: dict[str, Any]) -> str:
    sanitized_svg = sanitize_svg_content(board.get("svg_snapshot") or "")
    if not sanitized_svg:
        sanitized_svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120">'
            '<rect width="100%" height="100%" fill="#0f172a" rx="8"/>'
            '<text x="24" y="64" fill="#94a3b8" font-family="sans-serif" font-size="14">'
            'Pizarra sin instantanea SVG guardada'
            '</text></svg>'
        )
    return _svg_data_uri(sanitized_svg)


_LABEL_OR_CODE = re.compile(r"(^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\2[ \t]*$|`[^`\n]*`)|\{etiqueta:(jade|rojo|azul|dorado|neutro):(pequena|normal|grande):([^{}\n]{1,120})\}", re.MULTILINE)


def format_writeup_labels_plain(text: str) -> str:
    """Render fixed-palette label syntax as readable text outside HTML exports."""
    return _LABEL_OR_CODE.sub(lambda match: match.group(1) or match.group(5), text)


def _render_writeup_labels_html(text: str) -> str:
    def replace(match: re.Match[str]) -> str:
        if match.group(1):
            return match.group(1)
        color, size, label = match.group(3, 4, 5)
        return f'<span class="writeup-label writeup-label-{color} writeup-label-{size}">{html_lib.escape(label)}</span>'
    return _LABEL_OR_CODE.sub(replace, text)


def _preprocess_markdown_for_html(ctx: ExportBundleContext, *, embed_video: bool = True) -> str:
    text = apply_redaction_markers(ctx.markdown_content, ctx.redact_for_client)
    text = _render_writeup_labels_html(text)
    text = ANCHOR_PATTERN.sub(
        lambda m: f'<span id="{m.group(1)}" class="writeup-anchor" data-anchor="{m.group(1)}"></span>',
        text,
    )

    if ctx.rendered_diagrams:
        def _replace_mermaid(match: re.Match[str]) -> str:
            code = match.group(1) or ""
            key = _diagram_sha256(code)
            svg_xml = ctx.rendered_diagrams.get(key)
            if not svg_xml:
                return match.group(0)
            safe_svg = sanitize_svg_content(svg_xml)
            if not safe_svg:
                return match.group(0)
            return (
                f'<figure class="mermaid-diagram">'
                f'<img src="{_svg_data_uri(safe_svg)}" alt="Diagrama Mermaid" />'
                f'<figcaption>Diagrama Mermaid renderizado</figcaption>'
                f'</figure>'
            )

        text = MERMAID_FENCE_PATTERN.sub(_replace_mermaid, text)

    def _replace_asset(match: re.Match[str]) -> str:
        alt, asset_id = match.group(1), match.group(2)
        asset = ctx.assets_by_id.get(asset_id)
        if not asset:
            return f"*(Evidencia `{asset_id}` no encontrada)*"
        mime = str(asset.get("mime_type") or "").lower()
        safe_caption = html_lib.escape(alt or asset.get("filename") or "Evidencia")
        if mime.startswith("video/"):
            if embed_video:
                data_uri = _asset_to_data_uri(asset)
                return (
                    f'<figure class="video-evidence">'
                    f'<video controls muted loop playsinline src="{data_uri}"></video>'
                    f'<figcaption>{safe_caption} ({html_lib.escape(mime)})</figcaption>'
                    f'</figure>'
                )
            return f'<p><em>[Evidencia en video adjunta en paquete HTML/ZIP: {safe_caption}]</em></p>'
        safe_alt = alt.replace("]", "\\]")
        return f"![{safe_alt}]({_asset_to_data_uri(asset)})"

    def _replace_board(match: re.Match[str]) -> str:
        alt, board_id = match.group(1), match.group(2)
        board = ctx.boards_by_id.get(board_id)
        if not board:
            return f"*(Pizarra `{board_id}` no encontrada)*"
        safe_alt = alt or board.get("title", "Diagrama")
        return f"![{safe_alt}]({_board_to_svg_data_uri(board)})"

    text = ASSET_MD_IMG_PATTERN.sub(_replace_asset, text)
    text = BOARD_MD_IMG_PATTERN.sub(_replace_board, text)
    return text


def _plain_html_text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html_lib.unescape(re.sub(r"<[^>]*>", " ", fragment))).strip()


def _html_attribute(fragment: str, name: str) -> str | None:
    match = re.search(rf"\b{re.escape(name)}\s*=\s*([\"'])(.*?)\1", fragment, re.I | re.S)
    return match.group(2) if match else None


def render_sanitized_html_fragment(ctx: ExportBundleContext, *, embed_video: bool = True, always_toc: bool = False) -> str:
    """Compiles Markdown into strictly sanitized HTML safe for preview, HTML, and PDF exports."""
    processed_md = _preprocess_markdown_for_html(ctx, embed_video=embed_video)
    if ctx.include_toc and "[TOC]" not in processed_md and (always_toc or len(processed_md) > 400):
        processed_md = "[TOC]\n\n" + processed_md
    raw_html = md_lib.markdown(
        processed_md,
        extensions=["extra", "fenced_code", "tables", "toc", "sane_lists", "nl2br"],
        extension_configs={"toc": {"toc_depth": f"1-{ctx.toc_depth}"}},
        output_format="html5",
    )
    indexes: list[str] = []
    if ctx.include_figure_index:
        entries: list[str] = []
        figure_ranges: list[tuple[int, int]] = []

        def index_figure(match: re.Match[str]) -> str:
            number = len(entries) + 1
            original = match.group(0)
            opening = match.group(1)
            body = match.group(2)
            existing_anchor = _html_attribute(opening, "id")
            anchor = existing_anchor or f"export-figure-{number}"
            caption = re.search(r'<figcaption\b[^>]*>([\s\S]*?)</figcaption\s*>', body, re.I)
            image = re.search(r'<img\b([^>]*)>', body, re.I)
            image_label = (_html_attribute(image.group(1), "alt") or "") if image else ""
            label = _plain_html_text(caption.group(1)) if caption else html_lib.unescape(image_label)
            entries.append(f'<li><a href="#{html_lib.escape(anchor, quote=True)}">Figura {number} · {html_lib.escape(label or f"Figura {number}")}</a></li>')
            figure_ranges.append((match.start(), match.end()))
            if existing_anchor:
                return original
            return f'<figure id="{anchor}"{opening}>{body}</figure>'

        raw_html = re.sub(r'<figure\b([^>]*)>([\s\S]*?)</figure\s*>', index_figure, raw_html, flags=re.I)
        figure_ranges = [(match.start(), match.end()) for match in re.finditer(r'<figure\b[^>]*>[\s\S]*?</figure\s*>', raw_html, re.I)]

        def index_image(match: re.Match[str]) -> str:
            if any(start <= match.start() < end for start, end in figure_ranges):
                return match.group(0)
            number = len(entries) + 1
            tag = match.group(0)
            existing_id = _html_attribute(tag, "id")
            anchor = existing_id or f"export-figure-{number}"
            label = html_lib.unescape(_html_attribute(tag, "alt") or _html_attribute(tag, "title") or "")
            entries.append(f'<li><a href="#{html_lib.escape(anchor, quote=True)}">Figura {number} · {html_lib.escape(label or f"Figura {number}")}</a></li>')
            if existing_id:
                return tag
            return re.sub(r'<img\b', f'<img id="{anchor}"', tag, count=1, flags=re.I)

        raw_html = re.sub(r'<img\b[^>]*>', index_image, raw_html, flags=re.I)
        if entries:
            indexes.append('<div class="export-index"><strong>Índice de figuras e imágenes</strong><ul>' + ''.join(entries) + '</ul></div>')
    if ctx.include_table_index:
        tables: list[str] = []
        def index_table(match: re.Match[str]) -> str:
            number = len(tables) + 1
            opening = match.group(0)
            existing_id = _html_attribute(opening, "id")
            anchor = existing_id or f"export-table-{number}"
            full = raw_html[match.start():]
            body = re.match(r'<table\b[^>]*>([\s\S]*?)</table\s*>', full, re.I)
            table_body = body.group(1) if body else ""
            caption = re.search(r'<caption\b[^>]*>([\s\S]*?)</caption\s*>', table_body, re.I)
            headers = re.findall(r'<th\b[^>]*>([\s\S]*?)</th\s*>', table_body, re.I)
            label = _plain_html_text(caption.group(1)) if caption else " · ".join(_plain_html_text(header) for header in headers[:6])
            tables.append(f'<li><a href="#{html_lib.escape(anchor, quote=True)}">Tabla {number}{f" · {html_lib.escape(label)}" if label else ""}</a></li>')
            if existing_id:
                return opening
            return re.sub(r'<table\b', f'<table id="{anchor}"', opening, count=1, flags=re.I)
        raw_html = re.sub(r'<table\b[^>]*>', index_table, raw_html, flags=re.I)
        if tables:
            indexes.append('<div class="export-index"><strong>Índice de tablas</strong><ul>' + ''.join(tables) + '</ul></div>')
    if indexes:
        raw_html = ''.join(indexes) + raw_html
    return nh3.clean(
        raw_html,
        tags=ALLOWED_HTML_TAGS,
        attributes=ALLOWED_HTML_ATTRS,
        url_schemes={"data", "http", "https", "mailto"},
        link_rel="noopener noreferrer",
    )


def _build_findings_html(ctx: ExportBundleContext) -> str:
    if not ctx.findings:
        return ""
    rows = []
    for item in ctx.findings:
        sev = str(item.get("severity", "media")).lower()
        summary = html_lib.escape(apply_redaction_markers(str(item.get("summary", "")), ctx.redact_for_client))
        target = html_lib.escape(apply_redaction_markers(str(item.get("affected_target") or "-"), ctx.redact_for_client))
        cvss = f"{item['cvss_score']:.1f}" if item.get("cvss_score") is not None else "-"
        rows.append(
            f"<tr>"
            f"<td><code>{html_lib.escape(str(item.get('id', '')))}</code></td>"
            f"<td><strong>{html_lib.escape(str(item.get('title', '')))}</strong><br><small>{summary}</small></td>"
            f"<td>{html_lib.escape(sev.upper())}</td>"
            f"<td>{cvss}</td>"
            f"<td>{target}</td>"
            f"<td>{html_lib.escape(str(item.get('status', 'abierta')))}</td>"
            f"</tr>"
        )
    return (
        "<section class='section-box'><h2>Matriz de Hallazgos</h2>"
        "<table class='meta-table'><thead><tr>"
        "<th>ID</th><th>Hallazgo</th><th>Severidad</th><th>CVSS</th><th>Objetivo</th><th>Estado</th>"
        "</tr></thead><tbody>" + "".join(rows) + "</tbody></table></section>"
    )


def _build_citations_html(ctx: ExportBundleContext) -> str:
    if not ctx.citations:
        return ""
    rows = []
    for cit in ctx.citations:
        quote = html_lib.escape(apply_redaction_markers(str(cit.get("quoted_text", "")), ctx.redact_for_client))
        note = html_lib.escape(apply_redaction_markers(str(cit.get("note") or "-"), ctx.redact_for_client))
        stale_tag = " <span class='stale'>DESACTUALIZADA</span>" if cit.get("is_stale") else ""
        rows.append(
            f"<tr>"
            f"<td><code>#{html_lib.escape(str(cit.get('anchor_id', '')))}</code>{stale_tag}</td>"
            f"<td>{html_lib.escape(str(cit.get('board_title') or 'Pizarra'))}</td>"
            f"<td>L{cit.get('line_start', 1)}-L{cit.get('line_end', 1)}</td>"
            f"<td>{quote}</td>"
            f"<td>{note}</td>"
            f"</tr>"
        )
    return (
        "<section class='section-box'><h2>Índice de Citaciones Pizarra ↔ Documento</h2>"
        "<table class='meta-table'><thead><tr>"
        "<th>Ancla</th><th>Pizarra</th><th>Líneas</th><th>Extracto citado</th><th>Nota</th>"
        "</tr></thead><tbody>" + "".join(rows) + "</tbody></table></section>"
    )


def build_standalone_html_document(ctx: ExportBundleContext, *, embed_video: bool = True) -> str:
    """Produces a zero-external-dependency HTML5 report document."""
    body_html = render_sanitized_html_fragment(ctx, embed_video=embed_video, always_toc=True)
    watermark = html_lib.escape(ctx.watermark_text or settings.WRITEUP_WATERMARK_DEFAULT)
    watermark_block = f"<div class='watermark'>{watermark}</div>" if ctx.include_watermark else ""
    exec_text = apply_redaction_markers(ctx.executive_summary or "", ctx.redact_for_client)
    exec_block = (
        f"<section class='section-box'><h2>Resumen Ejecutivo</h2><p>{html_lib.escape(exec_text)}</p></section>"
        if exec_text.strip()
        else ""
    )
    redacted_badge = (
        "<span class='mode-pill client'>MODO CLIENTE (CENSURADO)</span>"
        if ctx.redact_for_client
        else "<span class='mode-pill internal'>REPORTE TÉCNICO INTERNO</span>"
    )
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    target_scope = html_lib.escape(apply_redaction_markers(ctx.target_scope or "No especificado", ctx.redact_for_client))

    org_name = html_lib.escape(ctx.organization_name or settings.WRITEUP_ORGANIZATION_NAME)
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{html_lib.escape(ctx.title)} — {org_name}</title>
<style>
  @page {{
    size: A4;
    margin: 20mm 16mm 20mm 16mm;
    @bottom-right {{ content: "Página " counter(page) " de " counter(pages); font-size: 9pt; color: #64748b; }}

  }}
  body {{ font-family: "Liberation Serif", "DejaVu Serif", Georgia, serif; color: #171717; line-height: 1.55; max-width: 850px; margin: 0 auto; padding: 32px; background: white; font-size: 11pt; }}
  .cover {{ min-height: 70vh; display: flex; flex-direction: column; break-after: page; page-break-after: always; }}
  .letterhead {{ display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #075c4c; padding-bottom: 12px; color: #075c4c; font: bold 10pt "Liberation Sans", sans-serif; overflow-wrap: anywhere; }}
  .watermark {{ color: #555; font: 9pt "Liberation Sans", sans-serif; text-align: right; }}
  .cover-content {{ margin: auto 0; padding: 48px 0; }}
  .cover h1 {{ margin: 0 0 16px; font-size: 30pt; line-height: 1.15; overflow-wrap: anywhere; }}
  .cover-subtitle {{ color: #075c4c; font: bold 10pt "Liberation Sans", sans-serif; }}
  .cover-footer {{ border-top: 1px solid #b8c7c2; padding-top: 12px; color: #555; font: 9pt "Liberation Sans", sans-serif; }}
  .badge, .mode-pill {{ font: 9pt "Liberation Sans", sans-serif; font-weight: 700; letter-spacing: .02em; }}
  .mode-pill {{ margin-left: 12px; color: #555; }}
  .meta-grid {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 16px; padding: 0 0 14px; border-bottom: 1px solid #bbb; font-size: 10pt; overflow-wrap: anywhere; }}
  .section-box {{ margin: 28px 0; }}
  a {{ color: #075c4c; text-decoration-thickness: 1px; text-underline-offset: 3px; }}
  .toc, .export-index {{ margin: 28px 0; padding: 14px 18px; background: #f3f7f5; border: 1px solid #ccdcd5; font: 10pt/1.6 "Liberation Sans", sans-serif; }}
  .toc::before {{ content: "Contenido"; display: block; color: #075c4c; font-weight: 700; margin-bottom: 6px; }}
  .toc ul {{ margin: 0; padding-left: 1.25em; }}
  .toc > ul {{ padding-left: 1em; }}
  .toc a {{ text-decoration: none; }}
  .toc a:hover, .toc a:focus {{ text-decoration: underline; }}
  h2 {{ font-size: 16pt; margin: 28px 0 10px; border-bottom: 1px solid #bbb; padding-bottom: 4px; }}
  h3 {{ font-size: 13pt; }}
  .meta-table, table {{ width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 9pt; }}
  th, td {{ border-bottom: 1px solid #bbb; padding: 7px 6px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }}
  th {{ border-top: 1px solid #555; border-bottom: 1px solid #555; font-weight: 700; }}
  caption {{ text-align: left; font-weight: 700; padding: 6px 0; }}
  thead {{ display: table-header-group; }}
  tr, figure {{ break-inside: avoid; }}
  pre {{ background: #f4f4f4; border: 1px solid #ccc; color: #171717; padding: 10px; overflow-x: auto; font-size: 9pt; white-space: pre-wrap; overflow-wrap: anywhere; }}
  code, kbd {{ font-family: "DejaVu Sans Mono", monospace; font-size: .9em; }}
  pre code {{ padding: 0; }}
  details {{ border-bottom: 1px solid #ccc; padding: 8px 0; margin: 10px 0; }}
  summary {{ cursor: pointer; font-weight: 700; }}
  blockquote {{ border-left: 2px solid #777; margin: 12px 0; padding: 0 14px; color: #444; }}
  img, video {{ max-width: 100%; height: auto; margin: 10px auto; display: block; }}
  figcaption {{ color: #555; font-size: 9pt; text-align: center; }}
  .stale {{ color: #7c2d12; font-size: 9pt; font-weight: 700; }}
  .writeup-label {{ display: inline-block; font-family: "Liberation Sans", sans-serif; font-weight: 700; padding: .1em .45em; border: 1px solid currentColor; border-radius: 3px; }}
  .writeup-label-jade {{ color: #075c4c; }}
  .writeup-label-rojo {{ color: #9b1c1c; }}
  .writeup-label-azul {{ color: #174d86; }}
  .writeup-label-dorado {{ color: #74510c; }}
  .writeup-label-neutro {{ color: #303030; }}
  .writeup-label-pequena {{ font-size: .8em; }}
  .writeup-label-normal {{ font-size: .95em; }}
  .writeup-label-grande {{ font-size: 1.15em; }}
  @media print {{ body {{ padding: 0; }} .cover {{ min-height: 220mm; }} a {{ color: inherit; }} }}
</style>
</head>
<body>
  <section class="cover" aria-label="Portada del informe">
    <header class="letterhead"><span>{org_name}</span>{watermark_block}</header>
    <div class="cover-content">
      <p class="cover-subtitle">INFORME DE SEGURIDAD</p>
      <h1>{html_lib.escape(ctx.title)}</h1>
      <p>Alcance: {target_scope}</p>
    </div>
    <footer class="cover-footer">{redacted_badge}<br>Generado: {generated_at} · Estado: {html_lib.escape(ctx.status)} · Severidad: {html_lib.escape(ctx.severity.upper())}</footer>
  </section>
  <div class="meta-grid">
    <div><strong>CVSS:</strong> {f"{ctx.cvss_score:.1f}" if ctx.cvss_score is not None else "N/A"}</div>
    <div><strong>Vector:</strong> {html_lib.escape(ctx.cvss_vector or "N/A")}</div>
    <div><strong>CWE / CVE:</strong> {html_lib.escape(ctx.cwe_id or "-")} / {html_lib.escape(ctx.cve_id or "-")}</div>
    <div style="grid-column: span 3;"><strong>Alcance autorizado:</strong> {target_scope}</div>
  </div>
  {exec_block}
  <main class="markdown-body">{body_html}</main>
  {_build_findings_html(ctx)}
  {_build_citations_html(ctx)}
</body>
</html>"""


@dataclass(frozen=True)
class _DocumentIndexEntry:
    kind: str
    label: str
    offset: int
    line: int
    level: int = 0
    anchor: str = ""


def _mask_markdown_code(text: str) -> str:
    chars = list(text)
    fence_character: str | None = None
    fence_length = 0
    offset = 0
    for line in text.splitlines(keepends=True):
        content = line.rstrip("\r\n")
        marker = re.match(r"^\s*(`{3,}|~{3,})", content)
        if marker:
            token = marker.group(1)
            if fence_character is None:
                fence_character, fence_length = token[0], len(token)
            elif token[0] == fence_character and len(token) >= fence_length:
                fence_character, fence_length = None, 0
            for index, char in enumerate(line):
                if char not in "\r\n":
                    chars[offset + index] = " "
        elif fence_character is not None:
            for index, char in enumerate(line):
                if char not in "\r\n":
                    chars[offset + index] = " "
        offset += len(line)
    return "".join(chars)


def _index_label(fragment: str) -> str:
    plain = _plain_html_text(format_writeup_labels_plain(fragment))
    return re.sub(r"[`*_~]", "", plain).strip()


def _extract_document_index(text: str) -> list[_DocumentIndexEntry]:
    """Collect headings, figure/image references and both Markdown and HTML tables, excluding code."""
    masked = _mask_markdown_code(text or "")
    entries: list[_DocumentIndexEntry] = []
    object_ranges: list[tuple[int, int, str]] = []

    def add(kind: str, label: str, offset: int, level: int = 0) -> None:
        line = masked.count("\n", 0, offset) + 1
        entries.append(_DocumentIndexEntry(kind, _index_label(label) or kind.title(), offset, line, level))

    for match in re.finditer(r"(?m)^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$", masked):
        label = re.sub(r"\s*\{#[a-zA-Z0-9_-]{2,120}\}\s*$", "", match.group(2)).strip()
        add("heading", label, match.start(), len(match.group(1)))
    for match in re.finditer(r"<h([1-6])\b[^>]*>([\s\S]*?)</h\1\s*>", masked, re.I):
        add("heading", match.group(2), match.start(), int(match.group(1)))

    figure_pattern = re.compile(r"<figure\b([^>]*)>([\s\S]*?)</figure\s*>", re.I)
    for match in figure_pattern.finditer(masked):
        caption = re.search(r"<figcaption\b[^>]*>([\s\S]*?)</figcaption\s*>", match.group(2), re.I)
        image = re.search(r"<img\b[^>]*\balt\s*=\s*([\"'])(.*?)\1[^>]*>", match.group(2), re.I)
        add("figure", caption.group(1) if caption else (image.group(2) if image else "Figura"), match.start())
        object_ranges.append((match.start(), match.end(), "figure"))

    for match in re.finditer(r"<table\b[^>]*>[\s\S]*?</table\s*>", masked, re.I):
        body = match.group(0)
        caption = re.search(r"<caption\b[^>]*>([\s\S]*?)</caption\s*>", body, re.I)
        headers = re.findall(r"<th\b[^>]*>([\s\S]*?)</th\s*>", body, re.I)
        add("table", caption.group(1) if caption else " · ".join(headers[:6]), match.start())
        object_ranges.append((match.start(), match.end(), "table"))

    figure_spans = [(start, end) for start, end, kind in object_ranges if kind == "figure"]
    for match in re.finditer(r"<img\b([^>]*)>", masked, re.I):
        if any(start <= match.start() < end for start, end in figure_spans):
            continue
        alt = re.search(r"\b(?:alt|title)\s*=\s*([\"'])(.*?)\1", match.group(1), re.I)
        add("figure", alt.group(2) if alt else "Imagen", match.start())
        object_ranges.append((match.start(), match.end(), "figure"))

    # Mermaid fences render as figures in HTML/PDF and Word even though the source remains code.
    for match in MERMAID_FENCE_PATTERN.finditer(text or ""):
        add("figure", "Diagrama Mermaid", match.start())
        object_ranges.append((match.start(), match.end(), "figure"))

    for match in re.finditer(r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+[\"'][^\"']*[\"'])?\)", masked):
        if any(start <= match.start() < end for start, end, _kind in object_ranges):
            continue
        add("figure", match.group(1) or "Imagen", match.start())
        object_ranges.append((match.start(), match.end(), "figure"))

    lines = masked.splitlines(keepends=True)
    line_offset = 0
    for index, line in enumerate(lines):
        current = line.rstrip("\r\n")
        if index + 1 < len(lines) and "|" in current and re.match(r"^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$", lines[index + 1].strip()):
            if not any(start <= line_offset < end for start, end, kind in object_ranges if kind == "table"):
                label = " · ".join(cell.strip() for cell in current.strip().strip("|").split("|") if cell.strip())
                add("table", label, line_offset)
                object_ranges.append((line_offset, line_offset + len(line), "table"))
        line_offset += len(line)

    entries.sort(key=lambda entry: (entry.offset, entry.kind))
    heading_counts: dict[str, int] = {}
    finalized: list[_DocumentIndexEntry] = []
    for entry in entries:
        heading_counts[entry.kind] = heading_counts.get(entry.kind, 0) + 1
        if entry.kind == "heading":
            slug_source = unicodedata.normalize("NFKD", entry.label).encode("ascii", "ignore").decode("ascii").lower()
            slug = re.sub(r"[^a-z0-9]+", "-", slug_source).strip("-")[:64] or "seccion"
            anchor = f"lessso-section-{slug}-{heading_counts[entry.kind]}"
        else:
            anchor = f"lessso-{entry.kind}-{heading_counts[entry.kind]}"
        finalized.append(_DocumentIndexEntry(entry.kind, entry.label, entry.offset, entry.line, entry.level, anchor))
    return finalized


def _add_markdown_index_anchors(text: str, entries: list[_DocumentIndexEntry]) -> str:
    insertions: dict[int, list[str]] = {}
    for entry in entries:
        line_start = text.rfind("\n", 0, entry.offset) + 1
        block_start = line_start == entry.offset
        anchor = f'<a id="{entry.anchor}"></a>'
        insertions.setdefault(entry.offset, []).append(anchor + ("\n\n" if block_start else ""))
    for offset in sorted(insertions, reverse=True):
        text = text[:offset] + "".join(insertions[offset]) + text[offset:]
    return text


def _markdown_index_sections(entries: list[_DocumentIndexEntry], ctx: ExportBundleContext) -> str:
    def link_label(label: str) -> str:
        return re.sub(r"([\\\[\]<>])", r"\\\1", label.replace("\r", " ").replace("\n", " "))

    blocks: list[str] = []
    if ctx.include_toc:
        headings = [entry for entry in entries if entry.kind == "heading" and entry.level <= ctx.toc_depth]
        if headings:
            blocks.append("## Contenido\n\n" + "\n".join(f"{'  ' * max(0, entry.level - 1)}- [{link_label(entry.label)}](#{entry.anchor})" for entry in headings))
    if ctx.include_figure_index:
        figures = [entry for entry in entries if entry.kind == "figure"]
        if figures:
            blocks.append("## Índice de figuras e imágenes\n\n" + "\n".join(f"- [Figura {number} · {link_label(entry.label)}](#{entry.anchor})" for number, entry in enumerate(figures, 1)))
    if ctx.include_table_index:
        tables = [entry for entry in entries if entry.kind == "table"]
        if tables:
            blocks.append("## Índice de tablas\n\n" + "\n".join(f"- [Tabla {number} · {link_label(entry.label)}](#{entry.anchor})" for number, entry in enumerate(tables, 1)))
    return "\n\n".join(blocks)


def _export_markdown_text(ctx: ExportBundleContext) -> str:
    text = apply_redaction_markers(ctx.markdown_content, ctx.redact_for_client)

    def _rewrite_asset(match: re.Match[str]) -> str:
        asset_id = match.group(1)
        asset = ctx.assets_by_id.get(asset_id)
        return f"assets/{asset['filename']}" if asset else match.group(0)

    def _rewrite_board(match: re.Match[str]) -> str:
        board_id = match.group(1)
        return f"boards/board_{board_id[:8]}.svg" if board_id in ctx.boards_by_id else match.group(0)

    text = MD_LINK_ASSET_PATTERN.sub(_rewrite_asset, text)
    text = MD_LINK_BOARD_PATTERN.sub(_rewrite_board, text)
    entries = _extract_document_index(text)
    index_sections = _markdown_index_sections(entries, ctx)
    text = _add_markdown_index_anchors(text, entries)
    header = (
        f"---\n"
        f"title: \"{ctx.title.replace(chr(34), chr(39))}\"\n"
        f"status: {ctx.status}\n"
        f"severity: {ctx.severity}\n"
        f"cvss_score: {ctx.cvss_score if ctx.cvss_score is not None else 'null'}\n"
        f"cwe: {ctx.cwe_id or ''}\n"
        f"cve: {ctx.cve_id or ''}\n"
        f"redacted_for_client: {str(ctx.redact_for_client).lower()}\n"
        f"---\n\n"
    )
    return header + (f"{index_sections}\n\n" if index_sections else "") + text


def _build_md_artifact(ctx: ExportBundleContext) -> tuple[bytes, str, str]:
    return _export_markdown_text(ctx).encode("utf-8"), "text/markdown; charset=utf-8", f"{ctx.slug}.md"


def _build_md_zip_artifact(ctx: ExportBundleContext) -> tuple[bytes, str, str]:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{ctx.slug}.md", _export_markdown_text(ctx).encode("utf-8"))
        asset_manifest = []
        for asset in ctx.assets_by_id.values():
            raw = decrypt_asset_bytes(asset["encrypted_blob"])
            zf.writestr(f"assets/{asset['filename']}", raw)
            asset_manifest.append({
                "id": asset["id"],
                "filename": asset["filename"],
                "mime_type": asset["mime_type"],
                "sha256": asset["sha256"],
            })
        for board_id, board in ctx.boards_by_id.items():
            svg = sanitize_svg_content(board.get("svg_snapshot") or "")
            if svg:
                zf.writestr(f"boards/board_{board_id[:8]}.svg", svg.encode("utf-8"))
        for diag_hash, diag_svg in ctx.rendered_diagrams.items():
            clean_diag = sanitize_svg_content(diag_svg)
            if clean_diag:
                zf.writestr(f"diagrams/diagram_{diag_hash[:8]}.svg", clean_diag.encode("utf-8"))
        manifest = {
            "writeup_id": ctx.writeup_id,
            "title": ctx.title,
            "redacted_for_client": ctx.redact_for_client,
            "assets": asset_manifest,
            "findings": ctx.findings,
            "citations": ctx.citations,
        }
        zf.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False, default=str).encode("utf-8"))
    return buf.getvalue(), "application/zip", f"{ctx.slug}_bundle.zip"


def _build_html_artifact(ctx: ExportBundleContext) -> tuple[bytes, str, str]:
    return build_standalone_html_document(ctx).encode("utf-8"), "text/html; charset=utf-8", f"{ctx.slug}.html"


def _build_pdf_artifact(ctx: ExportBundleContext) -> tuple[bytes, str, str]:
    html_doc = build_standalone_html_document(ctx, embed_video=False)
    pdf_bytes = WeasyHTML(string=html_doc, url_fetcher=_ssrf_safe_url_fetcher).write_pdf()
    return pdf_bytes, "application/pdf", f"{ctx.slug}.pdf"


def _add_png_picture(document: Any, png_bytes: bytes, caption: str | None = None) -> Any:
    buf = io.BytesIO(png_bytes)
    buf.seek(0)
    document.add_picture(buf, width=Inches(5.8))
    picture_paragraph = document.paragraphs[-1]
    if caption:
        style_names = {s.name for s in document.styles}
        document.add_paragraph(caption, style="Caption" if "Caption" in style_names else None)
    return picture_paragraph


def _add_docx_label_runs(paragraph: Any, text: str) -> None:
    """Format known labels while leaving code spans and other text intact."""
    colors = {"jade": "075C4C", "rojo": "9B1C1C", "azul": "174D86", "dorado": "74510C", "neutro": "303030"}
    sizes = {"pequena": 9, "normal": 11, "grande": 14}
    offset = 0
    for match in _LABEL_OR_CODE.finditer(text):
        paragraph.add_run(text[offset:match.start()])
        if match.group(1):
            paragraph.add_run(match.group(1))
        else:
            color, size, content = match.group(3, 4, 5)
            run = paragraph.add_run(content)
            run.bold = True
            run.font.name = "Liberation Sans"
            run.font.color.rgb = RGBColor.from_string(colors[color])
            run.font.size = Pt(sizes[size])
        offset = match.end()
    paragraph.add_run(text[offset:])


def _add_docx_bookmark(paragraph: Any, name: str, bookmark_id: int) -> None:
    start = docx.oxml.OxmlElement("w:bookmarkStart")
    start.set(docx.oxml.ns.qn("w:id"), str(bookmark_id))
    start.set(docx.oxml.ns.qn("w:name"), name[:40])
    end = docx.oxml.OxmlElement("w:bookmarkEnd")
    end.set(docx.oxml.ns.qn("w:id"), str(bookmark_id))
    paragraph._p.insert(0, start)
    paragraph._p.append(end)


def _add_docx_internal_link(paragraph: Any, text: str, anchor: str) -> None:
    hyperlink = docx.oxml.OxmlElement("w:hyperlink")
    hyperlink.set(docx.oxml.ns.qn("w:anchor"), anchor[:40])
    run = docx.oxml.OxmlElement("w:r")
    properties = docx.oxml.OxmlElement("w:rPr")
    color = docx.oxml.OxmlElement("w:color")
    color.set(docx.oxml.ns.qn("w:val"), "075C4C")
    properties.append(color)
    underline = docx.oxml.OxmlElement("w:u")
    underline.set(docx.oxml.ns.qn("w:val"), "single")
    properties.append(underline)
    run.append(properties)
    content = docx.oxml.OxmlElement("w:t")
    content.text = text
    run.append(content)
    hyperlink.append(run)
    paragraph._p.append(hyperlink)


def _html_table_rows(html_table: str) -> list[list[str]]:
    rows: list[list[str]] = []
    for row in re.findall(r"<tr\b[^>]*>([\s\S]*?)</tr\s*>", html_table, re.I):
        cells = re.findall(r"<t[hd]\b[^>]*>([\s\S]*?)</t[hd]\s*>", row, re.I)
        if cells:
            rows.append([_plain_html_text(cell) for cell in cells])
    return rows


def _pipe_table_rows(lines: list[str], start: int) -> tuple[list[list[str]], int]:
    def cells(line: str) -> list[str]:
        value = line.strip().strip("|")
        return [cell.strip().replace(r"\|", "|") for cell in re.split(r"(?<!\\)\|", value)]

    header = cells(lines[start])
    rows = [header]
    cursor = start + 2
    while cursor < len(lines) and "|" in lines[cursor]:
        row = cells(lines[cursor])
        if len(row) < len(header):
            row.extend([""] * (len(header) - len(row)))
        rows.append(row[:len(header)])
        cursor += 1
    return rows, cursor


def _append_docx_table(document: Any, rows: list[list[str]], bookmark: tuple[str, int] | None = None) -> None:
    normalized = [row for row in rows if row]
    if not normalized:
        return
    columns = max(len(row) for row in normalized)
    table = document.add_table(rows=len(normalized), cols=columns)
    table.style = "Table Grid"
    for row_index, row in enumerate(normalized):
        for column_index in range(columns):
            cell = table.cell(row_index, column_index)
            cell.text = row[column_index] if column_index < len(row) else ""
            if row_index == 0:
                for run in cell.paragraphs[0].runs:
                    run.bold = True
    if bookmark:
        _add_docx_bookmark(table.cell(0, 0).paragraphs[0], bookmark[0], bookmark[1])


def _to_roman(number: int) -> str:
    if number <= 0:
        return str(number)
    values = ((1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"))
    result: list[str] = []
    remainder = number
    for value, numeral in values:
        count, remainder = divmod(remainder, value)
        result.extend([numeral] * count)
    return "".join(result)


def _append_docx_asset(document: Any, ctx: ExportBundleContext, asset_id: str, caption: str, bookmark: tuple[str, int] | None = None) -> bool:
    asset = ctx.assets_by_id.get(asset_id)
    if not asset or str(asset.get("mime_type") or "").lower().startswith("video/"):
        return False
    raw_img = decrypt_asset_bytes(asset["encrypted_blob"])
    with PILImage.open(io.BytesIO(raw_img)) as pil_img:
        png_buf = io.BytesIO()
        pil_img.save(png_buf, format="PNG")
    paragraph = _add_png_picture(document, png_buf.getvalue(), caption or None)
    if bookmark and paragraph is not None:
        _add_docx_bookmark(paragraph, bookmark[0], bookmark[1])
    return True


def _build_docx_artifact(ctx: ExportBundleContext) -> tuple[bytes, str, str]:
    document = docx.Document()
    normal = document.styles["Normal"]
    normal.font.name = "Liberation Serif"
    normal.font.size = Pt(11)
    normal.paragraph_format.space_after = Pt(6)
    for style_name in ("Title", "Heading 1", "Heading 2", "Heading 3", "Heading 4", "Heading 5", "Heading 6"):
        style = document.styles[style_name]
        style.font.name = "Liberation Serif"
        style.font.color.rgb = RGBColor(23, 23, 23)
    letterhead = document.add_paragraph()
    brand = letterhead.add_run(ctx.organization_name or settings.WRITEUP_ORGANIZATION_NAME)
    brand.font.name = "Liberation Sans"
    brand.font.bold = True
    brand.font.size = Pt(11)
    brand.font.color.rgb = RGBColor(7, 92, 76)
    if ctx.include_watermark:
        classification = document.add_paragraph(ctx.watermark_text or settings.WRITEUP_WATERMARK_DEFAULT)
        for run in classification.runs:
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(85, 85, 85)

    label = document.add_paragraph()
    label.paragraph_format.space_before = Pt(110)
    label_run = label.add_run("INFORME DE SEGURIDAD")
    label_run.font.name = "Liberation Sans"
    label_run.font.bold = True
    label_run.font.size = Pt(10)
    label_run.font.color.rgb = RGBColor(7, 92, 76)
    document.add_heading(ctx.title, level=0)
    document.add_paragraph("Alcance: " + apply_redaction_markers(ctx.target_scope or "No especificado", ctx.redact_for_client))
    cover_footer = document.add_paragraph()
    cover_footer.paragraph_format.space_before = Pt(120)
    cover_footer.add_run("Modo cliente (censurado)" if ctx.redact_for_client else "Reporte técnico interno")
    cover_footer.add_run(f"\nGenerado: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} · Estado: {ctx.status} · Severidad: {ctx.severity.upper()}")
    for run in cover_footer.runs:
        run.font.name = "Liberation Sans"
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(85, 85, 85)
    document.add_page_break()

    meta_table = document.add_table(rows=4, cols=2)
    meta_rows = [
        ("Estado / Severidad", f"{ctx.status} · {ctx.severity.upper()}"),
        ("CVSS / Vector", f"{ctx.cvss_score if ctx.cvss_score is not None else 'N/A'} ({ctx.cvss_vector or '-'})"),
        ("CWE / CVE", f"{ctx.cwe_id or '-'} / {ctx.cve_id or '-'}"),
        ("Alcance", apply_redaction_markers(ctx.target_scope or "No especificado", ctx.redact_for_client)),
    ]
    for idx, (label, val) in enumerate(meta_rows):
        meta_table.cell(idx, 0).text = label
        meta_table.cell(idx, 1).text = val

    if ctx.executive_summary and ctx.executive_summary.strip():
        document.add_heading("Resumen Ejecutivo", level=1)
        document.add_paragraph(apply_redaction_markers(ctx.executive_summary, ctx.redact_for_client))

    body_md = ANCHOR_PATTERN.sub("", apply_redaction_markers(ctx.markdown_content, ctx.redact_for_client))
    index_entries = _extract_document_index(body_md)
    word_anchor_by_position: dict[tuple[str, int], tuple[str, int]] = {}
    for bookmark_id, entry in enumerate(index_entries, start=1):
        word_anchor_by_position[(entry.kind, entry.offset)] = (f"lesssow{bookmark_id}", bookmark_id)

    if ctx.include_toc:
        headings = [entry for entry in index_entries if entry.kind == "heading" and entry.level <= ctx.toc_depth]
        if headings:
            document.add_heading("Contenido", level=1)
            for entry in headings:
                paragraph = document.add_paragraph(style="List Bullet")
                paragraph.paragraph_format.left_indent = Inches(max(0, entry.level - 1) * 0.18)
                _add_docx_internal_link(paragraph, entry.label, word_anchor_by_position[(entry.kind, entry.offset)][0])
    if ctx.include_figure_index:
        figures = [entry for entry in index_entries if entry.kind == "figure"]
        if figures:
            document.add_heading("Índice de figuras e imágenes", level=1)
            for number, entry in enumerate(figures, 1):
                paragraph = document.add_paragraph(style="List Bullet")
                _add_docx_internal_link(paragraph, f"Figura {number} · {entry.label}", word_anchor_by_position[(entry.kind, entry.offset)][0])
    if ctx.include_table_index:
        tables = [entry for entry in index_entries if entry.kind == "table"]
        if tables:
            document.add_heading("Índice de tablas", level=1)
            for number, entry in enumerate(tables, 1):
                paragraph = document.add_paragraph(style="List Bullet")
                _add_docx_internal_link(paragraph, f"Tabla {number} · {entry.label}", word_anchor_by_position[(entry.kind, entry.offset)][0])

    entries_by_line: dict[str, dict[int, list[_DocumentIndexEntry]]] = {
        "heading": {}, "figure": {}, "table": {},
    }
    for entry in index_entries:
        entries_by_line[entry.kind].setdefault(entry.line, []).append(entry)
    consumed_by_line: dict[tuple[str, int], int] = {}

    def take_entry(kind: str, line_number: int) -> _DocumentIndexEntry | None:
        candidates = entries_by_line.get(kind, {}).get(line_number, [])
        key = (kind, line_number)
        offset = consumed_by_line.get(key, 0)
        if offset >= len(candidates):
            return None
        consumed_by_line[key] = offset + 1
        return candidates[offset]

    def make_bookmark(entry: _DocumentIndexEntry | None) -> tuple[str, int] | None:
        return word_anchor_by_position.get((entry.kind, entry.offset)) if entry else None

    lines = body_md.splitlines()
    fence_character: str | None = None
    fence_length = 0
    code_lang = ""
    code_lines: list[str] = []

    index = 0
    while index < len(lines):
        line = lines[index]
        line_number = index + 1
        stripped = line.strip()
        fence_marker = re.match(r"^(`{3,}|~{3,})(.*)$", stripped)
        if fence_marker:
            if fence_character is not None and fence_marker.group(1)[0] == fence_character and len(fence_marker.group(1)) >= fence_length:
                raw_block = "\n".join(code_lines)
                diagram_svg = ctx.rendered_diagrams.get(_diagram_sha256(raw_block)) if code_lang == "mermaid" else None
                diagram_png = _svg_to_png_bytes(diagram_svg) if diagram_svg else None
                if diagram_png:
                    paragraph = _add_png_picture(document, diagram_png, "Diagrama Mermaid")
                else:
                    code_p = document.add_paragraph(raw_block)
                    if code_p.runs:
                        code_p.runs[0].font.name = "Courier New"
                        code_p.runs[0].font.size = Pt(9)
                    paragraph = code_p
                if code_lang == "mermaid":
                    entry = take_entry("figure", code_start_line)
                    bookmark = make_bookmark(entry)
                    if bookmark:
                        _add_docx_bookmark(paragraph, bookmark[0], bookmark[1])
                code_lines.clear()
                code_lang = ""
                fence_character = None
                fence_length = 0
            else:
                fence_character = fence_marker.group(1)[0]
                fence_length = len(fence_marker.group(1))
                code_lang = fence_marker.group(2).strip().lower()
                code_start_line = line_number
                code_lines.clear()
            index += 1
            continue
        if fence_character is not None:
            code_lines.append(line)
            index += 1
            continue

        if re.search(r"<table\b", stripped, re.I):
            html_lines = [line]
            while not re.search(r"</table\s*>", "\n".join(html_lines), re.I) and index + 1 < len(lines):
                index += 1
                html_lines.append(lines[index])
            html_table = "\n".join(html_lines)
            entry = take_entry("table", line_number)
            _append_docx_table(document, _html_table_rows(html_table), make_bookmark(entry))
            index += 1
            continue

        if index + 1 < len(lines) and "|" in stripped and re.match(r"^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$", lines[index + 1]):
            table_rows, next_index = _pipe_table_rows(lines, index)
            entry = take_entry("table", line_number)
            _append_docx_table(document, table_rows, make_bookmark(entry))
            index = next_index
            continue

        if re.search(r"<figure\b", stripped, re.I):
            html_lines = [line]
            while not re.search(r"</figure\s*>", "\n".join(html_lines), re.I) and index + 1 < len(lines):
                index += 1
                html_lines.append(lines[index])
            html_figure = "\n".join(html_lines)
            entry = take_entry("figure", line_number)
            bookmark = make_bookmark(entry)
            img = re.search(r"<img\b([^>]*)>", html_figure, re.I)
            caption = re.search(r"<figcaption\b[^>]*>([\s\S]*?)</figcaption\s*>", html_figure, re.I)
            label = _plain_html_text(caption.group(1)) if caption else (entry.label if entry else "Imagen")
            src = re.search(r"\bsrc\s*=\s*([\"'])(.*?)\1", img.group(1), re.I).group(2) if img and re.search(r"\bsrc\s*=\s*([\"'])(.*?)\1", img.group(1), re.I) else ""
            asset_id = re.match(r"asset://([a-zA-Z0-9_-]{1,64})$", src)
            if asset_id and _append_docx_asset(document, ctx, asset_id.group(1), label, bookmark):
                pass
            else:
                paragraph = document.add_paragraph(f"[Imagen: {label}]")
                if bookmark:
                    _add_docx_bookmark(paragraph, bookmark[0], bookmark[1])
            index += 1
            continue

        if re.search(r"<img\b", stripped, re.I):
            img = re.search(r"<img\b([^>]*)>", stripped, re.I)
            entry = take_entry("figure", line_number)
            bookmark = make_bookmark(entry)
            alt = re.search(r"\b(?:alt|title)\s*=\s*([\"'])(.*?)\1", img.group(1), re.I) if img else None
            src = re.search(r"\bsrc\s*=\s*([\"'])(.*?)\1", img.group(1), re.I) if img else None
            label = _plain_html_text(alt.group(2)) if alt else (entry.label if entry else "Imagen")
            asset_id = re.match(r"asset://([a-zA-Z0-9_-]{1,64})$", src.group(2)) if src else None
            if asset_id and _append_docx_asset(document, ctx, asset_id.group(1), label, bookmark):
                pass
            else:
                paragraph = document.add_paragraph(f"[Imagen: {label}]")
                if bookmark:
                    _add_docx_bookmark(paragraph, bookmark[0], bookmark[1])
            index += 1
            continue

        html_heading = re.match(r"<h([1-6])\b[^>]*>(.*?)</h\1\s*>", stripped, re.I)
        heading_match = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if html_heading or heading_match:
            if html_heading:
                level = int(html_heading.group(1))
                heading_text = _plain_html_text(html_heading.group(2))
            else:
                level = len(heading_match.group(1))
                heading_text = heading_match.group(2)
            paragraph = document.add_heading(level=min(level, 6))
            _add_docx_label_runs(paragraph, heading_text)
            bookmark = make_bookmark(take_entry("heading", line_number))
            if bookmark:
                _add_docx_bookmark(paragraph, bookmark[0], bookmark[1])
            index += 1
            continue

        html_list = re.match(r"<(ol|ul)\b([^>]*)>([\s\S]*)$", stripped, re.I)
        if html_list:
            tag = html_list.group(1).lower()
            list_markup = stripped
            while not re.search(rf"</{tag}\s*>", list_markup, re.I) and index + 1 < len(lines):
                index += 1
                list_markup += "\n" + lines[index].strip()
            list_type = re.search(r"\btype\s*=\s*([\"'])(.*?)\1", html_list.group(2), re.I)
            list_type = list_type.group(2) if list_type else "1"
            for item_number, item in enumerate(re.findall(r"<li\b[^>]*>([\s\S]*?)</li\s*>", list_markup, re.I), 1):
                item_text = _plain_html_text(item)
                paragraph = document.add_paragraph()
                paragraph.paragraph_format.left_indent = Inches(0.25)
                if tag == "ul":
                    marker = "▪" if list_type == "square" else "○" if list_type == "circle" else "•"
                    paragraph.add_run(f"{marker} {item_text}")
                else:
                    roman = _to_roman(item_number)
                    marker = chr(96 + item_number) if list_type == "a" and item_number <= 26 else chr(64 + item_number) if list_type == "A" and item_number <= 26 else roman if list_type == "i" else roman.upper() if list_type == "I" else str(item_number)
                    paragraph.add_run(f"{marker}. {item_text}")
            index += 1
            continue

        asset_match = ASSET_MD_IMG_PATTERN.search(stripped)
        if asset_match:
            caption, asset_id = asset_match.group(1), asset_match.group(2)
            asset = ctx.assets_by_id.get(asset_id)
            if asset:
                if str(asset.get("mime_type") or "").lower().startswith("video/"):
                    paragraph = document.add_paragraph(f"[Evidencia en video adjunta en paquete HTML/ZIP: {caption or asset.get('filename')}]")
                    bookmark = make_bookmark(take_entry("figure", line_number))
                    if bookmark:
                        _add_docx_bookmark(paragraph, bookmark[0], bookmark[1])
                    index += 1
                    continue
                _append_docx_asset(document, ctx, asset_id, caption, make_bookmark(take_entry("figure", line_number)))
                index += 1
                continue

        board_match = BOARD_MD_IMG_PATTERN.search(stripped)
        if board_match:
            caption, board_id = board_match.group(1), board_match.group(2)
            board = ctx.boards_by_id.get(board_id)
            label = caption or (board["title"] if board else board_id)
            board_png = _svg_to_png_bytes((board or {}).get("svg_snapshot") or "") if board else None
            if board_png:
                paragraph = _add_png_picture(document, board_png, label)
            else:
                paragraph = document.add_paragraph(f"[Diagrama de Pizarra adjunto: {label} (ver paquete HTML/ZIP/PDF para gráfico vectorial)]")
            bookmark = make_bookmark(take_entry("figure", line_number))
            if bookmark:
                _add_docx_bookmark(paragraph, bookmark[0], bookmark[1])
            index += 1
            continue

        markdown_images = list(re.finditer(r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+[\"'][^\"']*[\"'])?\)", stripped))
        if markdown_images:
            remainder = stripped
            for image_match in markdown_images:
                alt, src = image_match.group(1), image_match.group(2)
                entry = take_entry("figure", line_number)
                bookmark = make_bookmark(entry)
                asset_id = re.match(r"asset://([a-zA-Z0-9_-]{1,64})$", src)
                board_id = re.match(r"board://([a-zA-Z0-9_-]{1,64})$", src)
                if asset_id and _append_docx_asset(document, ctx, asset_id.group(1), alt, bookmark):
                    pass
                elif board_id:
                    board = ctx.boards_by_id.get(board_id.group(1))
                    board_label = alt or (board or {}).get("title", "Diagrama")
                    board_png = _svg_to_png_bytes((board or {}).get("svg_snapshot") or "") if board else None
                    paragraph = _add_png_picture(document, board_png, board_label) if board_png else document.add_paragraph(f"[Diagrama de Pizarra adjunto: {board_label}]")
                    if bookmark:
                        _add_docx_bookmark(paragraph, bookmark[0], bookmark[1])
                else:
                    paragraph = document.add_paragraph(f"[Imagen: {alt or 'Imagen'}]")
                    if bookmark:
                        _add_docx_bookmark(paragraph, bookmark[0], bookmark[1])
                remainder = remainder.replace(image_match.group(0), "", 1)
            if remainder.strip():
                _add_docx_label_runs(document.add_paragraph(), remainder.strip())
            index += 1
            continue

        if re.match(r"^[-*+]\s+\[[ xX]\]\s+", stripped):
            document.add_paragraph(("☑ " if stripped[3:4].lower() == "x" else "☐ ") + stripped[6:])
        elif stripped.startswith(("- ", "* ", "+ ")):
            _add_docx_label_runs(document.add_paragraph(style="List Bullet"), stripped[2:])
        elif re.match(r"^\d+[.)]\s+", stripped):
            _add_docx_label_runs(document.add_paragraph(style="List Number"), re.sub(r"^\d+[.)]\s+", "", stripped))
        elif stripped.startswith("> "):
            _add_docx_label_runs(document.add_paragraph(), stripped[2:].strip())
        elif stripped:
            _add_docx_label_runs(document.add_paragraph(), line)
        index += 1

    if ctx.findings:
        document.add_heading("Matriz de Hallazgos", level=1)
        f_table = document.add_table(rows=len(ctx.findings) + 1, cols=4)
        f_table.style = "Table Grid"
        for col_idx, col_name in enumerate(["ID", "Hallazgo", "Severidad", "CVSS"]):
            f_table.cell(0, col_idx).text = col_name
        for r_idx, item in enumerate(ctx.findings, start=1):
            f_table.cell(r_idx, 0).text = str(item.get("id", ""))
            f_table.cell(r_idx, 1).text = str(item.get("title", ""))
            f_table.cell(r_idx, 2).text = str(item.get("severity", "")).upper()
            f_table.cell(r_idx, 3).text = str(item.get("cvss_score") if item.get("cvss_score") is not None else "-")

    if ctx.citations:
        document.add_heading("Citaciones Pizarra ↔ Documento", level=1)
        for cit in ctx.citations:
            quote = apply_redaction_markers(str(cit.get("quoted_text", "")), ctx.redact_for_client)
            document.add_paragraph(f"#{cit.get('anchor_id')} (L{cit.get('line_start')}-L{cit.get('line_end')}): {quote}")

    out = io.BytesIO()
    document.save(out)
    return (
        out.getvalue(),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        f"{ctx.slug}.docx",
    )


def _severity_to_sarif_level(severity: str) -> str:
    return {"critica": "error", "alta": "error", "media": "warning"}.get(severity.lower(), "note")


def _build_sarif_artifact(ctx: ExportBundleContext) -> tuple[bytes, str, str]:
    items = ctx.findings or [{
        "id": ctx.cwe_id or ctx.writeup_id[:12],
        "title": ctx.title,
        "severity": ctx.severity,
        "summary": ctx.executive_summary or ctx.title,
        "affected_target": ctx.target_scope or "scope",
        "cvss_score": ctx.cvss_score,
    }]
    rules = []
    results = []
    for item in items:
        rule_id = str(item.get("cwe_id") or item.get("id") or "LESSSO-FINDING")
        title = str(item.get("title", ctx.title))
        sev = str(item.get("severity", ctx.severity))
        rules.append({
            "id": rule_id,
            "name": title,
            "shortDescription": {"text": title},
            "properties": {"severity": sev, "cvss": item.get("cvss_score")},
        })
        results.append({
            "ruleId": rule_id,
            "level": _severity_to_sarif_level(sev),
            "message": {"text": apply_redaction_markers(str(item.get("summary") or title), ctx.redact_for_client)},
            "locations": [{
                "physicalLocation": {
                    "artifactLocation": {
                        "uri": apply_redaction_markers(str(item.get("affected_target") or ctx.slug), ctx.redact_for_client)
                    }
                }
            }],
        })
    sarif_doc = {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": {"driver": {"name": ctx.organization_name or settings.WRITEUP_ORGANIZATION_NAME, "rules": rules}},
            "results": results,
        }],
    }
    return json.dumps(sarif_doc, indent=2, ensure_ascii=False).encode("utf-8"), "application/sarif+json", f"{ctx.slug}.sarif.json"


def _build_json_artifact(ctx: ExportBundleContext) -> tuple[bytes, str, str]:
    payload = {
        "writeup_id": ctx.writeup_id,
        "title": ctx.title,
        "status": ctx.status,
        "severity": ctx.severity,
        "cvss_score": ctx.cvss_score,
        "cvss_vector": ctx.cvss_vector,
        "cwe_id": ctx.cwe_id,
        "cve_id": ctx.cve_id,
        "target_scope": apply_redaction_markers(ctx.target_scope or "", ctx.redact_for_client),
        "tags": ctx.tags,
        "redacted_for_client": ctx.redact_for_client,
        "executive_summary": apply_redaction_markers(ctx.executive_summary, ctx.redact_for_client),
        "markdown_content": apply_redaction_markers(ctx.markdown_content, ctx.redact_for_client),
        "findings": ctx.findings,
        "citations": [
            {**c, "quoted_text": apply_redaction_markers(str(c.get("quoted_text", "")), ctx.redact_for_client)}
            for c in ctx.citations
        ],
        "assets": [
            {k: v for k, v in a.items() if k != "encrypted_blob"}
            for a in ctx.assets_by_id.values()
        ],
    }
    return json.dumps(payload, indent=2, ensure_ascii=False, default=str).encode("utf-8"), "application/json", f"{ctx.slug}.json"


def _build_csv_artifact(ctx: ExportBundleContext) -> tuple[bytes, str, str]:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Tipo", "ID / Ancla", "Título / Pizarra", "Severidad / Líneas", "CVSS", "Objetivo / Texto", "Estado"])
    items = ctx.findings or [{
        "id": ctx.writeup_id[:12],
        "title": ctx.title,
        "severity": ctx.severity,
        "cvss_score": ctx.cvss_score,
        "affected_target": ctx.target_scope or "",
        "status": ctx.status,
    }]
    for item in items:
        writer.writerow([
            "Hallazgo",
            sanitize_formula_injection(str(item.get("id", ""))),
            sanitize_formula_injection(str(item.get("title", ""))),
            sanitize_formula_injection(str(item.get("severity", ""))),
            str(item.get("cvss_score") if item.get("cvss_score") is not None else ""),
            sanitize_formula_injection(apply_redaction_markers(str(item.get("affected_target") or ""), ctx.redact_for_client)),
            sanitize_formula_injection(str(item.get("status", ""))),
        ])
    for cit in ctx.citations:
        writer.writerow([
            "Citacion",
            sanitize_formula_injection(f"#{cit.get('anchor_id', '')}"),
            sanitize_formula_injection(str(cit.get("board_title") or "")),
            f"L{cit.get('line_start', 1)}-L{cit.get('line_end', 1)}",
            "",
            sanitize_formula_injection(apply_redaction_markers(str(cit.get("quoted_text", "")), ctx.redact_for_client)),
            "stale" if cit.get("is_stale") else "sync",
        ])
    return buf.getvalue().encode("utf-8-sig"), "text/csv; charset=utf-8", f"{ctx.slug}.csv"


EXPORT_BUILDERS: dict[str, Callable[[ExportBundleContext], tuple[bytes, str, str]]] = {
    "md": _build_md_artifact,
    "md_zip": _build_md_zip_artifact,
    "html": _build_html_artifact,
    "pdf": _build_pdf_artifact,
    "docx": _build_docx_artifact,
    "sarif": _build_sarif_artifact,
    "json": _build_json_artifact,
    "csv": _build_csv_artifact,
}


def compile_writeup_export(export_format: str, ctx: ExportBundleContext) -> ExportArtifact:
    """Dispatches export generation through uniform strategy registry and hashes output."""
    builder = EXPORT_BUILDERS.get(export_format)
    if builder is None:
        raise ValueError(f"Formato de exportación no soportado: {export_format}")
    content, media_type, filename = builder(ctx)
    return ExportArtifact(
        content=content,
        media_type=media_type,
        filename=filename,
        sha256=hashlib.sha256(content).hexdigest(),
    )
