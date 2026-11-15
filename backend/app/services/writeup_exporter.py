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
}
ALLOWED_HTML_ATTRS = {
    "a": {"href", "title", "id"},
    "code": {"class"},
    "details": {"open"},
    "div": {"class", "id"},
    "figcaption": {"class"},
    "figure": {"class"},
    "h1": {"id"}, "h2": {"id"}, "h3": {"id"}, "h4": {"id"}, "h5": {"id"}, "h6": {"id"},
    "img": {"src", "alt", "title", "class"},
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


_LABEL_OR_CODE = re.compile(r"(```[\s\S]*?```|`[^`\n]*`)|\{etiqueta:(jade|rojo|azul|dorado|neutro):(pequena|normal|grande):([^{}\n]{1,120})\}")


def format_writeup_labels_plain(text: str) -> str:
    """Render fixed-palette label syntax as readable text outside HTML exports."""
    return _LABEL_OR_CODE.sub(lambda match: match.group(1) or match.group(4), text)


def _render_writeup_labels_html(text: str) -> str:
    def replace(match: re.Match[str]) -> str:
        if match.group(1):
            return match.group(1)
        color, size, label = match.group(2, 3, 4)
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


def render_sanitized_html_fragment(ctx: ExportBundleContext, *, embed_video: bool = True) -> str:
    """Compiles Markdown into strictly sanitized HTML safe for preview, HTML, and PDF exports."""
    processed_md = _preprocess_markdown_for_html(ctx, embed_video=embed_video)
    if ctx.include_toc and "[TOC]" not in processed_md and len(processed_md) > 400:
        processed_md = "[TOC]\n\n" + processed_md
    raw_html = md_lib.markdown(
        processed_md,
        extensions=["extra", "fenced_code", "tables", "toc", "sane_lists", "nl2br"],
        output_format="html5",
    )
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
    body_html = render_sanitized_html_fragment(ctx, embed_video=embed_video)
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
  h2 {{ font-size: 16pt; margin: 28px 0 10px; border-bottom: 1px solid #bbb; padding-bottom: 4px; }}
  h3 {{ font-size: 13pt; }}
  .meta-table, table {{ width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 9pt; }}
  th, td {{ border-bottom: 1px solid #bbb; padding: 7px 6px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }}
  th {{ border-top: 1px solid #555; border-bottom: 1px solid #555; font-weight: 700; }}
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
    return header + text


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


def _add_png_picture(document: Any, png_bytes: bytes, caption: str | None = None) -> None:
    buf = io.BytesIO(png_bytes)
    buf.seek(0)
    document.add_picture(buf, width=Inches(5.8))
    if caption:
        style_names = {s.name for s in document.styles}
        document.add_paragraph(caption, style="Caption" if "Caption" in style_names else None)


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
            color, size, content = match.group(2, 3, 4)
            run = paragraph.add_run(content)
            run.bold = True
            run.font.name = "Liberation Sans"
            run.font.color.rgb = RGBColor.from_string(colors[color])
            run.font.size = Pt(sizes[size])
        offset = match.end()
    paragraph.add_run(text[offset:])


def _build_docx_artifact(ctx: ExportBundleContext) -> tuple[bytes, str, str]:
    document = docx.Document()
    normal = document.styles["Normal"]
    normal.font.name = "Liberation Serif"
    normal.font.size = Pt(11)
    normal.paragraph_format.space_after = Pt(6)
    for style_name in ("Title", "Heading 1", "Heading 2", "Heading 3", "Heading 4"):
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

    body_md = apply_redaction_markers(ctx.markdown_content, ctx.redact_for_client)
    body_md = ANCHOR_PATTERN.sub("", body_md)
    in_code_block = False
    code_lang = ""
    code_lines: list[str] = []

    for line in body_md.splitlines():
        stripped = line.strip()
        if stripped.startswith("```"):
            if in_code_block:
                raw_block = "\n".join(code_lines)
                diagram_svg = ctx.rendered_diagrams.get(_diagram_sha256(raw_block)) if code_lang == "mermaid" else None
                diagram_png = _svg_to_png_bytes(diagram_svg) if diagram_svg else None
                if diagram_png:
                    _add_png_picture(document, diagram_png, "Diagrama Mermaid")
                else:
                    code_p = document.add_paragraph(raw_block)
                    if code_p.runs:
                        code_p.runs[0].font.name = "Courier New"
                        code_p.runs[0].font.size = Pt(9)
                code_lines.clear()
                code_lang = ""
                in_code_block = False
            else:
                code_lang = stripped[3:].strip().lower()
                in_code_block = True
            continue
        if in_code_block:
            code_lines.append(line)
            continue

        asset_match = ASSET_MD_IMG_PATTERN.search(stripped)
        if asset_match:
            caption, asset_id = asset_match.group(1), asset_match.group(2)
            asset = ctx.assets_by_id.get(asset_id)
            if asset:
                if str(asset.get("mime_type") or "").lower().startswith("video/"):
                    document.add_paragraph(f"[Evidencia en video adjunta en paquete HTML/ZIP: {caption or asset.get('filename')}]")
                    continue
                raw_img = decrypt_asset_bytes(asset["encrypted_blob"])
                with PILImage.open(io.BytesIO(raw_img)) as pil_img:
                    png_buf = io.BytesIO()
                    pil_img.save(png_buf, format="PNG")
                    _add_png_picture(document, png_buf.getvalue(), caption or None)
                continue

        board_match = BOARD_MD_IMG_PATTERN.search(stripped)
        if board_match:
            caption, board_id = board_match.group(1), board_match.group(2)
            board = ctx.boards_by_id.get(board_id)
            label = caption or (board["title"] if board else board_id)
            board_png = _svg_to_png_bytes((board or {}).get("svg_snapshot") or "") if board else None
            if board_png:
                _add_png_picture(document, board_png, label)
            else:
                document.add_paragraph(f"[Diagrama de Pizarra adjunto: {label} (ver paquete HTML/ZIP/PDF para gráfico vectorial)]")
            continue

        heading_match = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if heading_match:
            level = min(len(heading_match.group(1)), 4)
            _add_docx_label_runs(document.add_heading(level=level), heading_match.group(2))
        elif stripped.startswith(("- ", "* ")):
            _add_docx_label_runs(document.add_paragraph(style="List Bullet"), stripped[2:])
        elif stripped.startswith("> "):
            _add_docx_label_runs(document.add_paragraph(), stripped[2:].strip())
        elif stripped:
            _add_docx_label_runs(document.add_paragraph(), line)

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
