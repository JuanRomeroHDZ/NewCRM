import base64
import csv
from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import html as html_lib
import io
import json
import math
import re
import shutil
import subprocess
import unicodedata
import zipfile
from typing import Any, Callable
import docx
from docx.enum.section import WD_SECTION_START
from docx.enum.text import WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.shared import Inches, Pt, RGBColor
import markdown as md_lib
import nh3
from PIL import Image as PILImage
from weasyprint import HTML as WeasyHTML
from weasyprint.urls import URLFetcher, URLFetcherResponse
from app.config import settings
from app.services.workshop_sanitizer import sanitize_formula_injection, sanitize_svg_content
from app.services.writeup_media import decrypt_asset_bytes


REDACT_PATTERN = re.compile(r"\{\{redact:(.*?)\}\}|\[\[redact:(.*?)\]\]", re.DOTALL | re.IGNORECASE)
ANCHOR_PATTERN = re.compile(r"\{#([a-zA-Z0-9_-]{2,120})\}")
ASSET_MD_IMG_PATTERN = re.compile(r"!\[([^\]]*)\]\(asset://([a-zA-Z0-9_-]{1,64})\)")
BOARD_MD_IMG_PATTERN = re.compile(r"!\[([^\]]*)\]\(board://([a-zA-Z0-9_-]{1,64})\)")
MD_LINK_ASSET_PATTERN = re.compile(r"asset://([a-zA-Z0-9_-]{1,64})")
MD_LINK_BOARD_PATTERN = re.compile(r"board://([a-zA-Z0-9_-]{1,64})")
MERMAID_FENCE_PATTERN = re.compile(
    r"^ {0,3}(?P<fence>`{3,}|~{3,})mermaid[ \t]*\r?\n(?P<body>[\s\S]*?)^ {0,3}(?P=fence)[ \t]*(?=\r?$)",
    re.MULTILINE | re.IGNORECASE,
)

ALLOWED_HTML_TAGS = {
    "a", "abbr", "b", "blockquote", "br", "code", "dd", "del", "details", "div", "dl", "dt",
    "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i",
    "img", "kbd", "li", "mark", "ol", "p", "pre", "s", "source", "span", "strong", "sub",
    "summary", "sup", "table", "tbody", "td", "th", "thead", "tr", "u", "ul", "video",
    "caption", "tfoot", "ins",
}
ALLOWED_HTML_ATTRS = {
    "a": {"href", "title", "id", "class"},
    "code": {"class"},
    "details": {"open"},
    "div": {"class", "id", "data-kind", "data-title", "data-description", "data-source", "data-number"},
    "figcaption": {"class"},
    "figure": {"class", "id"},
    "h1": {"id"}, "h2": {"id"}, "h3": {"id"}, "h4": {"id"}, "h5": {"id"}, "h6": {"id"},
    "img": {"src", "alt", "title", "class", "id"},
    "ol": {"type", "start"},
    "table": {"id"},
    "ul": {"type"},
    "source": {"src", "type"},
    "span": {"id", "class", "data-anchor"},
    "td": {"align", "colspan", "rowspan"},
    "th": {"align", "colspan", "rowspan"},
    "u": {"style"},
    "video": {"src", "controls", "loop", "muted", "playsinline", "class"},
}


def _safe_export_attribute(tag: str, attribute: str, value: str) -> str | None:
    if attribute in {"colspan", "rowspan"}:
        return value if re.fullmatch(r"[1-9][0-9]?", value) else None
    if tag == "u" and attribute == "style":
        match = re.fullmatch(r"\s*text-decoration-color:\s*(#[0-9a-fA-F]{6})\s*;\s*text-decoration-thickness:\s*1px\s*;?\s*", value)
        return f"text-decoration-color: {match.group(1)}; text-decoration-thickness: 1px;" if match else None
    return value

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
    font_size_pt: int = 11
    rendered_diagrams: dict[str, str] = field(default_factory=dict)
    client_name: str | None = None
    version_at: datetime | None = None


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


class _SSRFURLFetcher(URLFetcher):
    """Allow embedded report assets and block network or filesystem fetches."""

    def __init__(self) -> None:
        super().__init__(allowed_protocols={"data"}, fail_on_errors=False)

    def fetch(self, url: str, headers: dict[str, str] | None = None) -> URLFetcherResponse:
        if not url.startswith("data:"):
            raise ValueError(f"Recurso externo bloqueado por protección SSRF: {url[:80]}")

        header, _, encoded = url[5:].partition(",")
        mime_type = header.split(";")[0] or "application/octet-stream"
        if ";base64" in header:
            data = base64.b64decode(encoded)
        else:
            data = encoded.encode("utf-8")
        return URLFetcherResponse(url, body=data, headers={"Content-Type": mime_type})


_ssrf_safe_url_fetcher = _SSRFURLFetcher()


def _asset_to_data_uri(asset: dict[str, Any]) -> str:
    raw = decrypt_asset_bytes(asset["encrypted_blob"])
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:{asset['mime_type']};base64,{b64}"


def frame_legacy_board_snapshot(board: dict[str, Any], citations: list[dict[str, Any]]) -> str | None:
    """Fit snapshots generated before the canvas exporter framed their contents."""
    svg = board.get("svg_snapshot")
    if not svg:
        return svg

    legacy_root = re.match(r'(<svg xmlns="http://www.w3.org/2000/svg") viewBox="0 0 \d+ \d+" width="\d+" height="\d+">', svg)
    legacy_background = '<rect width="100%" height="100%" fill="#080A0A" rx="12"/>'
    if not legacy_root or legacy_background not in svg:
        return svg
    try:
        scene = json.loads(board.get("scene_json") or "{}")
        if not isinstance(scene, dict):
            return svg
        elements = scene.get("elements") or []
        positions = scene.get("citationPositions") or {}
        bounds = []

        def point(x: float, y: float) -> None:
            if math.isfinite(x) and math.isfinite(y):
                bounds.append((x, y))

        for element in elements:
            x, y = element["x"], element["y"]
            point(x, y)
            label_width = len(str(element.get("text") or element.get("assetId") or "")) * 10
            box_width = max(element.get("w", 0), 24)
            if element.get("type") in ("text", "image"):
                box_width = max(box_width, label_width + 96)
            point(x + box_width, y + max(element.get("h", 0), 24))
            for px, py in element.get("points") or []:
                point(px, py)
            if element.get("type") == "arrow":
                x2, y2 = element.get("x2", x), element.get("y2", y)
                half = label_width / 2
                point(x2, y2)
                point((x + x2) / 2 - half, (y + y2) / 2 - 80)
                point((x + x2) / 2 + half, (y + y2) / 2)
        for index, citation in enumerate(citations):
            position = positions.get(citation["id"]) or {"x": 840, "y": 36 + index * 105}
            x, y = position["x"], position["y"]
            point(x, y)
            point(x + 310, y + 86)
    except (ValueError, TypeError, AttributeError, KeyError, OverflowError):
        return svg
    if not bounds:
        return svg
    xs, ys = zip(*bounds)
    left, top = math.floor(min(xs)) - 32, math.floor(min(ys)) - 32
    width, height = math.ceil(max(xs)) - left + 32, math.ceil(max(ys)) - top + 32
    root = f'{legacy_root[1]} viewBox="{left} {top} {width} {height}" width="{width}" height="{height}">'
    background = f'<rect x="{left}" y="{top}" width="{width}" height="{height}" fill="#080A0A" rx="12"/>'
    return root + svg[legacy_root.end():].replace(legacy_background, background, 1)


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


_MATH_INLINE = r"\$(?![\s$])(?P<inline_text>(?:\\[^\n]|[^\\$\n|])+?)(?<!\s)\$(?![$\d])"
_MATH_BLOCK = r"^ {0,3}\$\$[ \t]*(?P<block_text>[^$]+?)\$\$[ \t]*(?=\n|$)"
_MATH_OR_CODE = re.compile(
    r"(?P<code>^(?: {0,3})(?P<fence>`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}(?P=fence)[ \t]*(?=\n|$)|(?P<tick>`+)[^\n]*?(?P=tick)|<[^>\n]+>)"
    rf"|(?P<block>{_MATH_BLOCK})|(?P<inline>(?<![\\$]){_MATH_INLINE})", re.MULTILINE,
)
_INLINE_MATH_OR_CODE = re.compile(rf"(?P<code>(?P<tick>`+)[^\n]*?(?P=tick))|(?P<inline>(?<![\\$]){_MATH_INLINE})")
_BLOCK_MATH = re.compile(_MATH_BLOCK, re.MULTILINE)


def _math_svg(expression: str, *, inline: bool, size: float = 14) -> tuple[str, float] | None:
    if not expression.strip() or len(expression) > 3500:
        return None
    try:
        import ziamath

        math = ziamath.Latex(expression.strip(), inline=inline, size=size, color="#171717", margin=0.6)
        node = math.svgxml()
        width = float(node.attrib["width"])
        height = float(node.attrib["height"])
        if not (0 < width <= 2200 and 0 < height <= 1200):
            return None
        return math.svg(), width
    except Exception:
        # Unsupported TeX remains readable in its original notation.
        return None


def _render_math_html(markdown: str) -> str:
    count = 0
    def replace(match: re.Match[str]) -> str:
        nonlocal count
        if match.group("code") or count >= 160:
            return match[0]
        count += 1
        inline = match.group("inline") is not None
        expression = match["inline_text"] if inline else match["block_text"]
        result = _math_svg(expression, inline=inline, size=15 if inline else 17)
        if not result:
            return match[0]
        svg, _ = result
        mode = "inline" if inline else "block"
        alt = html_lib.escape(expression.strip(), quote=True)
        img = f'<img class="report-math-{mode}" src="{_svg_data_uri(svg)}" alt="{alt}" />'
        return img if inline else f'\n\n<div class="report-equation">{img}</div>\n\n'
    return _MATH_OR_CODE.sub(replace, markdown)


def _preprocess_markdown_for_html(ctx: ExportBundleContext, *, embed_video: bool = True) -> str:
    text = apply_redaction_markers(ctx.markdown_content, ctx.redact_for_client)
    text = _render_writeup_labels_html(text)
    text = _markdown_object_caption_markers(text)
    text = ANCHOR_PATTERN.sub(
        lambda m: f'<span id="{m.group(1)}" class="writeup-anchor" data-anchor="{m.group(1)}"></span>',
        text,
    )

    if ctx.rendered_diagrams:
        def _replace_mermaid(match: re.Match[str]) -> str:
            code = match["body"]
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
    return _render_math_html(text)


def _plain_html_text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html_lib.unescape(re.sub(r"<[^>]*>", " ", fragment))).strip()


def _html_attribute(fragment: str, name: str) -> str | None:
    match = re.search(rf"\b{re.escape(name)}\s*=\s*([\"'])(.*?)\1", fragment, re.I | re.S)
    return match.group(2) if match else None


_CAPTION_DIRECTIVE = re.compile(r"^\s*(Figura|Imagen|Tabla)(?:\s+\d+)?\s*[.:]\s*(.*?)\s*$|^\s*(Descripci[oó]n|Fuente)\s*:\s*(.*?)\s*$", re.I)


def _caption_directives_before(text: str, offset: int, kind: str) -> dict[str, str]:
    """Reads the compact caption block immediately before a Markdown object."""
    lines = (text or "")[:offset].splitlines()
    cursor = len(lines) - 1
    while cursor >= 0 and not lines[cursor].strip():
        cursor -= 1
    fields: dict[str, str] = {}
    title_keys = {"figure": {"figura", "imagen"}, "table": {"tabla"}}.get(kind, set())
    while cursor >= 0:
        match = _CAPTION_DIRECTIVE.match(lines[cursor])
        if not match:
            break
        key = (match.group(1) or match.group(3)).casefold()
        value = (match.group(2) if match.group(1) else match.group(4)).strip()
        if key in title_keys:
            if "title" in fields:
                break
            fields["title"] = value
        elif key.startswith("descripci"):
            fields["description"] = value
        elif key == "fuente":
            fields["source"] = value
        else:
            break
        cursor -= 1
    return fields


def _markdown_object_caption_markers(text: str, numbers: dict[tuple[str, int], int] | None = None) -> str:
    """Turns Figura/Tabla, Descripción and Fuente lines into export-only metadata."""
    lines = (text or "").splitlines()
    output: list[str] = []
    index = 0
    fence_character: str | None = None
    fence_length = 0

    def object_starts(kind: str, position: int) -> bool:
        if position >= len(lines):
            return False
        candidate = lines[position].strip()
        if kind == "figure":
            return bool(re.match(r"^!\[[^\]]*\]\(|^<(?:figure|img)\b", candidate, re.I))
        if re.match(r"^<table\b", candidate, re.I):
            return True
        return (
            position + 1 < len(lines)
            and "|" in candidate
            and bool(re.match(r"^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$", lines[position + 1]))
        )

    while index < len(lines):
        fence = re.match(r"^\s*(`{3,}|~{3,})", lines[index])
        if fence:
            token = fence.group(1)
            if fence_character is None:
                fence_character, fence_length = token[0], len(token)
            elif token[0] == fence_character and len(token) >= fence_length:
                fence_character, fence_length = None, 0
            output.append(lines[index])
            index += 1
            continue
        if fence_character is not None:
            output.append(lines[index])
            index += 1
            continue
        match = _CAPTION_DIRECTIVE.match(lines[index])
        key = (match.group(1) or match.group(3)).casefold() if match else ""
        kind = "figure" if key in {"figura", "imagen"} else "table" if key == "tabla" else ""
        if not match or not kind:
            output.append(lines[index])
            index += 1
            continue

        fields = {"title": (match.group(2) if match.group(1) else match.group(4)).strip()}
        cursor = index + 1
        while cursor < len(lines):
            if not lines[cursor].strip():
                lookahead = cursor
                while lookahead < len(lines) and not lines[lookahead].strip():
                    lookahead += 1
                if lookahead >= len(lines) or not _CAPTION_DIRECTIVE.match(lines[lookahead]):
                    cursor = lookahead
                    break
                cursor = lookahead
                continue
            directive = _CAPTION_DIRECTIVE.match(lines[cursor])
            if not directive:
                break
            field_key = (directive.group(1) or directive.group(3)).casefold()
            if field_key.startswith("descripci"):
                fields["description"] = (directive.group(2) if directive.group(1) else directive.group(4)).strip()
            elif field_key == "fuente":
                fields["source"] = (directive.group(2) if directive.group(1) else directive.group(4)).strip()
            else:
                break
            cursor += 1

        target = cursor
        while target < len(lines) and not lines[target].strip():
            target += 1
        if not object_starts(kind, target):
            output.extend(lines[index:cursor if cursor > index else index + 1])
            index = cursor if cursor > index else index + 1
            continue

        attrs = [f'data-kind="{kind}"']
        number = (numbers or {}).get((kind, target + 1))
        if number:
            attrs.append(f'data-number="{number}"')
        for key in ("title", "description", "source"):
            if fields.get(key):
                attrs.append(f'data-{key}="{html_lib.escape(fields[key], quote=True)}"')
        output.append('<div class="writeup-object-caption" ' + " ".join(attrs) + "></div>")
        output.extend(lines[cursor:target])
        index = target
    return "\n".join(output)


def _caption_markup(title: str, description: str = "", source: str = "", *, kind: str) -> str:
    safe_title = html_lib.escape(title.strip())
    prefix = "Figura" if kind == "figure" else "Tabla"
    parts = [f"<strong>{prefix}: {safe_title}</strong>"]
    if description.strip():
        parts.append(f'<span class="caption-description">{html_lib.escape(description.strip())}</span>')
    if source.strip():
        parts.append(f'<small class="caption-source">Fuente: {html_lib.escape(source.strip())}</small>')
    return "<br />".join(parts)


def _caption_fields_from_html(inner: str, kind: str) -> dict[str, str]:
    first_line = re.split(r'<br\b[^>]*>|<small\b', inner, maxsplit=1, flags=re.I)[0]
    title = _plain_html_text(first_line)
    if kind == "table":
        title = re.sub(r"^Tabla\s*(?:\d+\s*[.:]\s*|:\s*)", "", title, flags=re.I)
    else:
        title = re.sub(r"^(?:Figura|Imagen)\s*(?:\d+\s*[.:]\s*|:\s*)", "", title, flags=re.I)
    fields = {"title": title.strip()} if title.strip() else {}
    description = re.search(r'<span\b[^>]*class=["\']caption-description["\'][^>]*>([\s\S]*?)</span\s*>', inner, re.I)
    source = re.search(r'<small\b[^>]*>([\s\S]*?)</small\s*>', inner, re.I)
    if description:
        fields["description"] = _plain_html_text(description.group(1))
    if source:
        fields["source"] = re.sub(r"^Fuente\s*:\s*", "", _plain_html_text(source.group(1)), flags=re.I)
    return fields


def _apply_html_caption_markers(raw_html: str) -> str:
    marker = re.compile(r'<div\b([^>]*\bclass\s*=\s*(["\'])writeup-object-caption\2[^>]*)>\s*</div\s*>', re.I)
    output: list[str] = []
    cursor = 0
    for match in marker.finditer(raw_html):
        if match.start() < cursor:
            continue
        attrs = match.group(1)
        kind = _html_attribute(attrs, "data-kind") or "figure"
        title = html_lib.unescape(_html_attribute(attrs, "data-title") or "")
        description = html_lib.unescape(_html_attribute(attrs, "data-description") or "")
        source = html_lib.unescape(_html_attribute(attrs, "data-source") or "")
        caption = _caption_markup(title, description, source, kind=kind)
        tail = raw_html[match.end():]
        whitespace = re.match(r"\s*", tail).group(0)
        rest = tail[len(whitespace):]
        replacement = ""
        target_length = 0
        if kind == "figure":
            figure = re.match(r'(<figure\b[^>]*>)([\s\S]*?)</figure\s*>', rest, re.I)
            if figure:
                body = re.sub(r'<figcaption\b[^>]*>[\s\S]*?</figcaption\s*>', "", figure.group(2), flags=re.I)
                replacement = f'<figure{figure.group(1)[7:]}{body}<figcaption>{caption}</figcaption></figure>'
                target_length = figure.end()
            else:
                image_paragraph = re.match(r'<p>\s*(<img\b[^>]*>)\s*</p>', rest, re.I)
                image_match = None if image_paragraph else re.match(r'<img\b[^>]*>', rest, re.I)
                image_tag = image_paragraph.group(1) if image_paragraph else image_match.group(0) if image_match else ""
                if image_tag:
                    replacement = f'<figure class="writeup-figure">{image_tag}<figcaption>{caption}</figcaption></figure>'
                    target_length = image_paragraph.end() if image_paragraph else image_match.end()
        else:
            table = re.match(r'(<table\b[^>]*>)([\s\S]*?)</table\s*>', rest, re.I)
            if table:
                body = re.sub(r'<caption\b[^>]*>[\s\S]*?</caption\s*>', "", table.group(2), flags=re.I)
                replacement = f'{table.group(1)}<caption>{caption}</caption>{body}</table>'
                target_length = table.end()
        if not replacement:
            continue
        output.append(raw_html[cursor:match.start()])
        output.append(replacement)
        cursor = match.end() + len(whitespace) + target_length
    output.append(raw_html[cursor:])
    return "".join(output)


def _render_markdown_caption_markers(text: str) -> str:
    """Renders editor caption directives as portable HTML captions in Markdown exports."""
    lines = (text or "").splitlines()
    output: list[str] = []
    index = 0
    marker_pattern = re.compile(r'<div\b([^>]*\bclass\s*=\s*(["\'])writeup-object-caption\2[^>]*)>\s*</div\s*>', re.I)
    while index < len(lines):
        marker = marker_pattern.match(lines[index].strip())
        if not marker:
            output.append(lines[index])
            index += 1
            continue
        attrs = marker.group(1)
        kind = _html_attribute(attrs, "data-kind") or "figure"
        title = html_lib.unescape(_html_attribute(attrs, "data-title") or "")
        description = html_lib.unescape(_html_attribute(attrs, "data-description") or "")
        source = html_lib.unescape(_html_attribute(attrs, "data-source") or "")
        try:
            number = max(1, min(100_000, int(_html_attribute(attrs, "data-number") or "1")))
        except ValueError:
            number = 1
        if kind not in {"figure", "table"}:
            kind = "figure"
        target = index + 1
        while target < len(lines) and not lines[target].strip():
            target += 1
        if target >= len(lines):
            index += 1
            continue
        candidate = lines[target].strip()
        if kind == "figure":
            image = re.match(r'!\[([^\]]*)\]\(([^)\s]+)(?:\s+["\']([^"\']*)["\'])?\)', candidate)
            if image:
                alt = html_lib.escape(image.group(1), quote=True)
                raw_src = image.group(2)
                if not re.match(r"^(?:https?://|/(?!/)|(?:data:image/(?:png|jpeg|gif|webp|svg\+xml);base64,)|(?:assets|boards)/)", raw_src, re.I):
                    output.append(f"![{image.group(1)}]({raw_src})")
                    index = target + 1
                    continue
                src = html_lib.escape(raw_src, quote=True)
                caption = [f'<strong>Figura {number}. {html_lib.escape(title or image.group(1) or "Imagen")}</strong>']
                if description:
                    caption.append(f'<span class="caption-description">{html_lib.escape(description)}</span>')
                if source:
                    caption.append(f'<small class="caption-source">Fuente: {html_lib.escape(source)}</small>')
                output.append(f'<figure class="writeup-figure"><img src="{src}" alt="{alt}" /><figcaption>{"<br />".join(caption)}</figcaption></figure>')
                index = target + 1
                continue
        else:
            pipe_table = (
                target + 1 < len(lines)
                and "|" in candidate
                and bool(re.match(r"^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$", lines[target + 1]))
            )
            if pipe_table:
                rows, next_index = _pipe_table_rows(lines, target)
                title_html = f'<strong>Tabla {number}. {html_lib.escape(title or "Datos")}</strong>'
                details = [title_html]
                if description:
                    details.append(f'<span class="caption-description">{html_lib.escape(description)}</span>')
                if source:
                    details.append(f'<small class="caption-source">Fuente: {html_lib.escape(source)}</small>')
                header = rows[0] if rows else []
                body_rows = rows[1:] if rows else []
                head_html = "<thead><tr>" + "".join(f"<th>{html_lib.escape(cell)}</th>" for cell in header) + "</tr></thead>"
                rows_html = "".join("<tr>" + "".join(f"<td>{html_lib.escape(cell)}</td>" for cell in row) + "</tr>" for row in body_rows)
                output.append(f'<table><caption>{"<br />".join(details)}</caption>{head_html}<tbody>{rows_html}</tbody></table>')
                index = next_index
                continue

        closing_tag = "</figure>" if kind == "figure" else "</table>"
        end = target + 1
        if re.search(r"^<(?:figure|img|table)\b", candidate, re.I):
            while end < len(lines) and not re.search(re.escape(closing_tag), "\n".join(lines[target:end]), re.I):
                end += 1
        fragment = "\n".join([lines[index], *lines[target:end]])
        rendered = _apply_html_caption_markers(fragment)
        label = "Figura" if kind == "figure" else "Tabla"
        rendered = rendered.replace(f"<strong>{label}: ", f"<strong>{label} {number}. ")
        output.append(rendered)
        index = end
    return "\n".join(output)


def _compile_sanitized_html_parts(
    ctx: ExportBundleContext,
    *,
    embed_video: bool = True,
    always_toc: bool = False,
) -> tuple[list[str], str]:
    """Compiles safe standalone index pages and the sanitized Markdown body."""
    processed_md = _preprocess_markdown_for_html(ctx, embed_video=embed_video)
    if ctx.include_toc and "[TOC]" not in processed_md and (always_toc or len(processed_md) > 400):
        processed_md = "[TOC]\n\n" + processed_md
    raw_html = md_lib.markdown(
        processed_md,
        extensions=["extra", "fenced_code", "tables", "toc", "sane_lists", "nl2br"],
        extension_configs={"toc": {"toc_depth": f"1-{ctx.toc_depth}"}},
        output_format="html5",
    )
    toc_html = ""
    if ctx.include_toc:
        toc_match = re.search(r'<div\b[^>]*class="toc"[^>]*>[\s\S]*?</div\s*>', raw_html, re.I)
        if toc_match:
            toc_html = toc_match.group(0)
            raw_html = raw_html[:toc_match.start()] + raw_html[toc_match.end():]
    raw_html = _apply_html_caption_markers(raw_html)

    figure_items: list[str] = []
    figure_number = 0

    def caption_title(fragment: str, kind: str = "figure") -> str:
        first_line = re.split(r'<br\b[^>]*>|<small\b|<span\b[^>]*class="caption-description"', fragment, maxsplit=1, flags=re.I)[0]
        label = _plain_html_text(first_line)
        if kind == "table":
            label = re.sub(r"^Tabla\s*(?:\d+\s*[.:]\s*|:\s*)", "", label, flags=re.I)
        else:
            label = re.sub(r"^(?:Figura|Imagen)\s*(?:\d+\s*[.:]\s*|:\s*)", "", label, flags=re.I)
        return label.strip()

    def strip_caption_prefix(inner: str, kind: str) -> str:
        prefix = r"^(?:Tabla)\s*(?:\d+\s*[.:]\s*|:\s*)" if kind == "table" else r"^(?:Figura|Imagen)\s*(?:\d+\s*[.:]\s*|:\s*)"
        strong = re.match(r"^(\s*<strong\b[^>]*>)([\s\S]*?)(</strong\s*>)([\s\S]*)$", inner, re.I)
        if strong:
            stripped = re.sub(prefix, "", strong.group(2), count=1, flags=re.I)
            if stripped != strong.group(2):
                return strong.group(1) + stripped + strong.group(3) + strong.group(4)
        return re.sub(prefix, "", inner, count=1, flags=re.I)

    def numbered_caption(inner: str, number: int, fallback: str) -> tuple[str, str]:
        title = caption_title(inner) or fallback or f"Figura {number}"
        cleaned = strip_caption_prefix(inner, "figure")
        return f"<strong>Figura {number}. </strong>{cleaned}", title

    def index_figure(match: re.Match[str]) -> str:
        nonlocal figure_number
        figure_number += 1
        opening, body = match.group(1), match.group(2)
        existing_anchor = _html_attribute(opening, "id")
        anchor = existing_anchor or f"export-figure-{figure_number}"
        image = re.search(r'<img\b([^>]*)>', body, re.I)
        image_label = (_html_attribute(image.group(1), "alt") or _html_attribute(image.group(1), "title") or "") if image else ""
        caption = re.search(r'<figcaption\b[^>]*>([\s\S]*?)</figcaption\s*>', body, re.I)
        caption_inner, label = numbered_caption(caption.group(1), figure_number, html_lib.unescape(image_label)) if caption else (f"<strong>Figura {figure_number}. </strong>{html_lib.escape(html_lib.unescape(image_label) or 'Imagen')}", html_lib.unescape(image_label) or "Imagen")
        if caption:
            body = body[:caption.start()] + f'<figcaption class="figure-caption">{caption_inner}</figcaption>' + body[caption.end():]
        else:
            body += f'<figcaption class="figure-caption">{caption_inner}</figcaption>'
        figure_items.append(f'<li><a href="#{html_lib.escape(anchor, quote=True)}">Figura {figure_number}. {html_lib.escape(label)}</a></li>')
        id_attr = "" if existing_anchor else f' id="{anchor}"'
        return f'<figure{id_attr}{opening}>{body}</figure>'

    raw_html = re.sub(r'<figure\b([^>]*)>([\s\S]*?)</figure\s*>', index_figure, raw_html, flags=re.I)
    figure_ranges = [(match.start(), match.end()) for match in re.finditer(r'<figure\b[^>]*>[\s\S]*?</figure\s*>', raw_html, re.I)]

    # Markdown images are promoted to figures so they receive a small, numbered caption in every rendered format.
    def index_standalone_image(match: re.Match[str]) -> str:
        if 'class="report-math-' in match[0]:
            return match[0]
        nonlocal figure_number
        if any(start <= match.start() < end for start, end in figure_ranges):
            return match.group(0)
        tag = match.group(1) if match.group(1) else match.group(0)
        figure_number += 1
        existing_image_id = _html_attribute(tag, "id")
        anchor = existing_image_id or f"export-figure-{figure_number}"
        alt = html_lib.unescape(_html_attribute(tag, "alt") or _html_attribute(tag, "title") or "Imagen")
        label = alt or "Imagen"
        figure_items.append(f'<li><a href="#{html_lib.escape(anchor, quote=True)}">Figura {figure_number}. {html_lib.escape(label)}</a></li>')
        figure_id_attr = "" if existing_image_id else f' id="{anchor}"'
        # Keep the complete image tag intact while avoiding a block figure nested inside its Markdown paragraph.
        figure_markup = f'<figure class="writeup-figure"{figure_id_attr}>{tag}<figcaption class="figure-caption"><strong>Figura {figure_number}. </strong>{html_lib.escape(label)}</figcaption></figure>'
        return figure_markup

    raw_html = re.sub(r'<p>\s*(<img\b[^>]*>)\s*</p>|<img\b[^>]*>', index_standalone_image, raw_html, flags=re.I)

    table_items: list[str] = []
    table_number = 0

    def index_table(match: re.Match[str]) -> str:
        nonlocal table_number
        table_number += 1
        full = match.group(0)
        opening = match.group(1)
        body = match.group(2)
        existing_anchor = _html_attribute(opening, "id")
        anchor = existing_anchor or f"export-table-{table_number}"
        caption = re.search(r'<caption\b[^>]*>([\s\S]*?)</caption\s*>', body, re.I)
        headers = re.findall(r'<th\b[^>]*>([\s\S]*?)</th\s*>', body, re.I)
        fallback = " · ".join(_plain_html_text(header) for header in headers[:6]) or "Datos de la tabla"
        inner = caption.group(1) if caption else html_lib.escape(fallback)
        label = caption_title(inner, "table")
        if not label:
            label = _plain_html_text(inner).strip() or fallback
        inner = strip_caption_prefix(inner, "table")
        caption_html = f'<caption class="table-caption"><strong>Tabla {table_number}. </strong>{inner}</caption>'
        if caption:
            body = body[:caption.start()] + caption_html + body[caption.end():]
        else:
            body = caption_html + body
        id_attr = "" if existing_anchor else f' id="{anchor}"'
        table_items.append(f'<li><a href="#{html_lib.escape(anchor, quote=True)}">Tabla {table_number}. {html_lib.escape(label)}</a></li>')
        return f'<table{id_attr}{opening}>{body}</table>'

    raw_html = re.sub(r'<table\b([^>]*)>([\s\S]*?)</table\s*>', index_table, raw_html, flags=re.I)

    index_pages: list[str] = []
    if toc_html:
        index_pages.append('<div class="document-index-page"><h1>Tabla de contenido</h1>' + toc_html + '</div>')
    if ctx.include_figure_index and figure_items:
        index_pages.append('<div class="document-index-page"><h1>Índice de figuras e imágenes</h1><ul>' + ''.join(figure_items) + '</ul></div>')
    if ctx.include_table_index and table_items:
        index_pages.append('<div class="document-index-page"><h1>Índice de tablas</h1><ul>' + ''.join(table_items) + '</ul></div>')
    if not embed_video:
        raw_html = re.sub(r"<details(?![^>]*\bopen\b)(?=[\s>])", "<details open", raw_html, flags=re.I)
    clean_options = {
        "tags": ALLOWED_HTML_TAGS,
        "attributes": ALLOWED_HTML_ATTRS,
        "attribute_filter": _safe_export_attribute,
        "url_schemes": {"data", "http", "https", "mailto"},
        "link_rel": "noopener noreferrer",
    }
    return [nh3.clean(page, **clean_options) for page in index_pages], nh3.clean(raw_html, **clean_options)


def render_sanitized_html_fragment(ctx: ExportBundleContext, *, embed_video: bool = True, always_toc: bool = False) -> str:
    """Compiles Markdown into strictly sanitized HTML safe for preview, HTML, and PDF exports."""
    index_pages, body = _compile_sanitized_html_parts(ctx, embed_video=embed_video, always_toc=always_toc)
    return "".join(index_pages) + body


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


def _cover_details(ctx: ExportBundleContext) -> list[tuple[str, str]]:
    version_at = ctx.version_at
    if version_at is not None and version_at.tzinfo is not None:
        version_at = version_at.astimezone(timezone.utc)
    details = [
        ("Cliente", apply_redaction_markers(ctx.client_name or "", ctx.redact_for_client)),
        ("Alcance", apply_redaction_markers(ctx.target_scope or "", ctx.redact_for_client)),
        ("Versión", version_at.strftime("%d/%m/%Y · %H:%M UTC") if version_at else ""),
    ]
    return [(label, value) for label, value in details if value.strip()]


def _report_metadata(ctx: ExportBundleContext) -> list[tuple[str, str]]:
    fields = [
        ("CVSS", f"{ctx.cvss_score:.1f}" if ctx.cvss_score is not None else ""),
        ("Vector", ctx.cvss_vector or ""),
        ("CWE", ctx.cwe_id or ""),
        ("CVE", ctx.cve_id or ""),
        ("Alcance autorizado", apply_redaction_markers(ctx.target_scope or "", ctx.redact_for_client)),
    ]
    return [(label, text) for label, text in fields if text.strip()]


def build_standalone_html_document(
    ctx: ExportBundleContext,
    *,
    embed_video: bool = True,
    pdf_section: str = "all",
    page_refs: dict[str, int] | None = None,
) -> str:
    """Produces a zero-external-dependency HTML5 report document."""
    index_pages, markdown_body = _compile_sanitized_html_parts(ctx, embed_video=embed_video, always_toc=True)
    indexes_html = "".join(index_pages)
    if pdf_section == "frontmatter" and page_refs:
        def add_page_ref(match: re.Match[str]) -> str:
            anchor = html_lib.unescape(match.group(1))
            page = page_refs.get(anchor)
            suffix = f'<span class="index-page-number">{page}</span>' if page else ""
            link = match.group(0)
            label = re.search(r"<a\b[^>]*>([\s\S]*?)</a>", link, re.I)
            if not label:
                return link
            opening = re.sub(r"<a\b", '<a class="has-page-ref"', link[:label.start(1)], count=1, flags=re.I)
            return opening + '<span class="index-entry-label">' + label.group(1) + "</span>" + suffix + "</a>"

        indexes_html = re.sub(r'<a\b[^>]*href="#([^"]+)"[^>]*>[\s\S]*?</a>', add_page_ref, indexes_html, flags=re.I)
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
    font_size_pt = max(8, min(18, int(ctx.font_size_pt or 11)))
    org_name = html_lib.escape(ctx.organization_name or settings.WRITEUP_ORGANIZATION_NAME)
    cover_details = "".join(
        f"<p><strong>{label}:</strong> {html_lib.escape(value)}</p>"
        for label, value in _cover_details(ctx)
    )
    cover_html = f"""
  <section class="cover" aria-label="Portada del informe">
    <header class="letterhead"><span>{org_name}</span>{watermark_block}</header>
    <div class="cover-content">
      <p class="cover-subtitle">INFORME DE SEGURIDAD</p>
      <h1>{html_lib.escape(ctx.title)}</h1>
      {cover_details}
    </div>
    <footer class="cover-footer">{redacted_badge}<br>Generado: {generated_at} · Estado: {html_lib.escape(ctx.status)} · Severidad: {html_lib.escape(ctx.severity.upper())}</footer>
  </section>"""
    metadata = "".join(
        f'<div class="{"scope-meta" if label == "Alcance autorizado" else "metadata-field"}"><strong>{label}:</strong> {html_lib.escape(value)}</div>'
        for label, value in _report_metadata(ctx)
    )
    meta_block = f'<div class="meta-grid">{metadata}</div>' if metadata else ""
    preamble_html = f'<section class="report-preamble">{meta_block}{exec_block}</section>' if meta_block or exec_block else ""
    report_html = f'<div class="report-content">{preamble_html}<main class="markdown-body">{markdown_body}</main>{_build_findings_html(ctx)}{_build_citations_html(ctx)}</div>'

    if pdf_section == "frontmatter":
        document_body = cover_html + indexes_html
    elif pdf_section == "report":
        document_body = report_html
    else:
        document_body = cover_html + indexes_html + report_html

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" />
<title>{html_lib.escape(ctx.title)} — {org_name}</title>
<style>
  @page {{
    size: A4;
    margin: 20mm 16mm 20mm 16mm;
    @bottom-right {{ content: ""; font-size: 9pt; color: #64748b; }}

  }}
  @page frontmatter {{ size: A4; margin: 20mm 16mm 20mm 16mm; @bottom-right {{ content: ""; }} }}
  @page report-content {{ size: A4; margin: 20mm 16mm 20mm 16mm; @bottom-right {{ content: "Página " counter(page) " de " counter(pages); font-size: 9pt; color: #64748b; }} }}
  body {{ font-family: "Liberation Serif", "DejaVu Serif", Georgia, serif; color: #171717; line-height: 1.55; max-width: 850px; margin: 0 auto; padding: 32px; background: white; font-size: {font_size_pt}pt; }}
  .cover, .document-index-page {{ page: frontmatter; }}
  .report-content {{ page: report-content; }}
  .cover {{ display: flex; flex-direction: column; break-after: page; }}
  .document-index-page {{ margin: 18pt 0; }}
  .document-index-page h1 {{ font-size: 19pt; margin: 0 0 10pt; color: #171717; }}
  .document-index-page ul {{ margin: 0; padding-left: 1.2em; }}
  .document-index-page li {{ margin: 0 0 2pt; }}
  .document-index-page a {{ display: flex; justify-content: space-between; gap: 16px; text-decoration: none; }}
  .document-index-page a.has-page-ref {{ display: table; width: 100%; text-decoration: none; }}
  .index-entry-label, .index-page-number {{ display: table-cell; border-bottom: 1px dotted #9aa1a8; }}
  .index-entry-label {{ width: 99%; }}
  .index-page-number {{ width: 1%; padding-left: 10px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }}
  .document-index-page a:not(.has-page-ref)::after {{ content: leader(".") target-counter(attr(href), page); }}
  .index-page-number {{ flex: 0 0 auto; color: #555; font-variant-numeric: tabular-nums; }}
  .letterhead {{ display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #075c4c; padding-bottom: 12px; color: #075c4c; font: bold 10pt "Liberation Sans", sans-serif; overflow-wrap: anywhere; }}
  .watermark {{ color: #555; font: 9pt "Liberation Sans", sans-serif; text-align: right; }}
  .cover-content {{ margin: auto 0; padding: 28px 0; }}
  .cover h1 {{ margin: 0 0 16px; font-size: 30pt; line-height: 1.15; overflow-wrap: anywhere; }}
  .cover-subtitle {{ color: #075c4c; font: bold 10pt "Liberation Sans", sans-serif; }}
  .cover-footer {{ border-top: 1px solid #b8c7c2; padding-top: 12px; color: #555; font: 9pt "Liberation Sans", sans-serif; }}
  .badge, .mode-pill {{ font: 9pt "Liberation Sans", sans-serif; font-weight: 700; letter-spacing: .02em; }}
  .mode-pill {{ margin-left: 12px; color: #555; }}
  .meta-grid {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 16px; padding: 0 0 14px; border-bottom: 1px solid #bbb; font-size: .9em; overflow-wrap: anywhere; }}
  .scope-meta {{ grid-column: span 3; }}
  .section-box {{ margin: 16pt 0; }}
  .report-preamble {{ margin: 12pt 0; }}
  .report-preamble .section-box p {{ white-space: pre-wrap; }}
  .cover-content p:not(.cover-subtitle) {{ margin: 4pt 0; font: 11pt "Liberation Sans", sans-serif; }}
  body :is(h1, h2, h3, h4, h5, h6, caption) {{ break-after: avoid; }}
  p, li {{ orphans: 3; widows: 3; }}
  a {{ color: #075c4c; text-decoration-thickness: 1px; text-underline-offset: 3px; }}
  .toc {{ margin: 0; padding: 0; font: .9em/1.36 "Liberation Sans", sans-serif; }}
  .toc ul {{ margin: 0; padding-left: 1.25em; }}
  .toc > ul {{ padding-left: 1em; }}
  .toc a {{ text-decoration: none; }}
  .toc a:hover, .toc a:focus {{ text-decoration: underline; }}
  .markdown-body h1 {{ font-size: 1.8em; line-height: 1.2; margin: 1.4em 0 .5em; break-after: avoid; }}
  .markdown-body h2 {{ font-size: 1.55em; line-height: 1.25; margin: 1.35em 0 .45em; border-bottom: 1px solid #bbb; padding-bottom: 4px; break-after: avoid; }}
  .markdown-body h3 {{ font-size: 1.3em; line-height: 1.3; margin: 1.2em 0 .4em; break-after: avoid; }}
  .markdown-body h4 {{ font-size: 1.15em; margin: 1.1em 0 .35em; break-after: avoid; }}
  .markdown-body h5 {{ font-size: 1.05em; margin: 1em 0 .3em; break-after: avoid; }}
  .markdown-body h6 {{ font-size: .95em; margin: 1em 0 .3em; break-after: avoid; }}
  .meta-table, table {{ width: 100%; table-layout: fixed; border-collapse: collapse; margin: 14px 0; font-size: .88em; }}
  th, td {{ border-bottom: 1px solid #bbb; padding: 6px 5px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }}
  th {{ border-top: 1px solid #555; border-bottom: 1px solid #555; font-weight: 700; }}
  caption {{ caption-side: top; text-align: left; font-weight: 400; padding: 0 0 7px; color: #3f4650; font-size: .9em; line-height: 1.45; }}
  caption strong, figcaption strong {{ color: #171717; font-weight: 700; }}
  .caption-description {{ display: block; margin-top: 2px; color: #42484f; }}
  .caption-source {{ display: block; margin-top: 2px; color: #60666d; font-size: .9em; }}
  thead {{ display: table-header-group; }}
  tr, figure {{ break-inside: avoid; }}
  pre {{ background: #f4f4f4; border: 1px solid #ccc; color: #171717; padding: 10px; overflow: auto; font-size: 9pt; white-space: pre-wrap; overflow-wrap: anywhere; }}
  code, kbd {{ font-family: "DejaVu Sans Mono", monospace; font-size: .9em; }}
  pre code {{ padding: 0; font-size: inherit; }}
  details {{ border-bottom: 1px solid #ccc; padding: 8px 0; margin: 10px 0; }}
  summary {{ cursor: pointer; font-weight: 700; }}
  blockquote {{ border-left: 2px solid #777; margin: 12px 0; padding: 0 14px; color: #444; }}
  img, video {{ max-width: 100%; height: auto; margin: 10px auto; display: block; }}
  figure {{ margin: 12pt 0; }}
  img.report-math-inline {{ display: inline; margin: 0; vertical-align: middle; }}
  img.report-math-block {{ margin: 6pt auto; max-height: 150mm; }}
  .report-equation {{ break-inside: avoid; }}
  .mermaid-diagram img {{ max-height: 165mm; object-fit: contain; }}
  figcaption {{ color: #4b5563; font: 9pt/1.45 "Liberation Sans", sans-serif; text-align: center; }}
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
  @media print {{ body {{ padding: 0; }} figure img {{ max-height: 190mm; object-fit: contain; }} .cover {{ min-height: 220mm; }} a {{ color: inherit; }} }}
</style>
</head>
<body>
  {document_body}
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
        directive = _caption_directives_before(masked, match.start(), "figure")
        add("figure", directive.get("title") or (caption.group(1) if caption else (image.group(2) if image else "Figura")), match.start())
        object_ranges.append((match.start(), match.end(), "figure"))

    for match in re.finditer(r"<table\b[^>]*>[\s\S]*?</table\s*>", masked, re.I):
        body = match.group(0)
        caption = re.search(r"<caption\b[^>]*>([\s\S]*?)</caption\s*>", body, re.I)
        headers = re.findall(r"<th\b[^>]*>([\s\S]*?)</th\s*>", body, re.I)
        directive = _caption_directives_before(masked, match.start(), "table")
        add("table", caption.group(1) if caption else directive.get("title") or " · ".join(headers[:6]), match.start())
        object_ranges.append((match.start(), match.end(), "table"))

    figure_spans = [(start, end) for start, end, kind in object_ranges if kind == "figure"]
    for match in re.finditer(r"<img\b([^>]*)>", masked, re.I):
        if any(start <= match.start() < end for start, end in figure_spans):
            continue
        alt = re.search(r"\b(?:alt|title)\s*=\s*([\"'])(.*?)\1", match.group(1), re.I)
        directive = _caption_directives_before(masked, match.start(), "figure")
        add("figure", directive.get("title") or (alt.group(2) if alt else "Imagen"), match.start())
        object_ranges.append((match.start(), match.end(), "figure"))

    # Mermaid fences render as figures in HTML/PDF and Word even though the source remains code.
    for match in MERMAID_FENCE_PATTERN.finditer(text or ""):
        add("figure", "Diagrama Mermaid", match.start())
        object_ranges.append((match.start(), match.end(), "figure"))

    for match in re.finditer(r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+[\"'][^\"']*[\"'])?\)", masked):
        if any(start <= match.start() < end for start, end, _kind in object_ranges):
            continue
        directive = _caption_directives_before(masked, match.start(), "figure")
        add("figure", directive.get("title") or match.group(1) or "Imagen", match.start())
        object_ranges.append((match.start(), match.end(), "figure"))

    lines = masked.splitlines(keepends=True)
    line_offset = 0
    for index, line in enumerate(lines):
        current = line.rstrip("\r\n")
        if index + 1 < len(lines) and "|" in current and re.match(r"^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$", lines[index + 1].strip()):
            if not any(start <= line_offset < end for start, end, kind in object_ranges if kind == "table"):
                directive = _caption_directives_before(masked, line_offset, "table")
                label = directive.get("title") or " · ".join(cell.strip() for cell in current.strip().strip("|").split("|") if cell.strip())
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


def _export_markdown_text(ctx: ExportBundleContext, *, bundle_assets: bool = False) -> str:
    text = apply_redaction_markers(ctx.markdown_content, ctx.redact_for_client)

    def _rewrite_asset(match: re.Match[str]) -> str:
        asset_id = match.group(1)
        asset = ctx.assets_by_id.get(asset_id)
        if not asset:
            return match.group(0)
        if bundle_assets:
            return f"assets/{asset['filename']}"
        raw = decrypt_asset_bytes(asset["encrypted_blob"])
        encoded = base64.b64encode(raw).decode("ascii")
        return f"data:{asset['mime_type']};base64,{encoded}"

    def _rewrite_board(match: re.Match[str]) -> str:
        board_id = match.group(1)
        board = ctx.boards_by_id.get(board_id)
        if not board:
            return match.group(0)
        if bundle_assets:
            return f"boards/board_{board_id[:8]}.svg"
        svg = sanitize_svg_content(board.get("svg_snapshot") or "")
        if not svg:
            return match.group(0)
        return f"data:image/svg+xml;base64,{base64.b64encode(svg.encode('utf-8')).decode('ascii')}"

    text = MD_LINK_ASSET_PATTERN.sub(_rewrite_asset, text)
    text = MD_LINK_BOARD_PATTERN.sub(_rewrite_board, text)
    source_entries = _extract_document_index(text)
    caption_counts = {"figure": 0, "table": 0}
    caption_numbers: dict[tuple[str, int], int] = {}
    for entry in source_entries:
        if entry.kind in caption_counts:
            caption_counts[entry.kind] += 1
            caption_numbers[(entry.kind, entry.line)] = caption_counts[entry.kind]
    text = _markdown_object_caption_markers(text, caption_numbers)
    text = _render_markdown_caption_markers(text)
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
        zf.writestr(f"{ctx.slug}.md", _export_markdown_text(ctx, bundle_assets=True).encode("utf-8"))
        zf.writestr(f"{ctx.slug}.html", build_standalone_html_document(ctx).encode("utf-8"))
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
        published_text = apply_redaction_markers(ctx.markdown_content, ctx.redact_for_client)
        included_diagrams = {_diagram_sha256(match["body"]) for match in MERMAID_FENCE_PATTERN.finditer(published_text)}
        for diag_hash, diag_svg in ctx.rendered_diagrams.items():
            clean_diag = sanitize_svg_content(diag_svg)
            if diag_hash in included_diagrams and clean_diag:
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
    report_html = build_standalone_html_document(ctx, embed_video=False, pdf_section="report")
    report_document = WeasyHTML(string=report_html, url_fetcher=_ssrf_safe_url_fetcher).render()
    page_refs = {
        anchor: page_number
        for page_number, page in enumerate(report_document.pages, start=1)
        for anchor in page.anchors
    }
    frontmatter_html = build_standalone_html_document(
        ctx,
        embed_video=False,
        pdf_section="frontmatter",
        page_refs=page_refs,
    )
    frontmatter_document = WeasyHTML(string=frontmatter_html, url_fetcher=_ssrf_safe_url_fetcher).render()
    combined = frontmatter_document.copy([*frontmatter_document.pages, *report_document.pages])
    pdf_bytes = combined.write_pdf()
    return pdf_bytes, "application/pdf", f"{ctx.slug}.pdf"


def _add_png_picture(document: Any, png_bytes: bytes, caption: str | None = None) -> Any:
    buf = io.BytesIO(png_bytes)
    buf.seek(0)
    section = document.sections[-1]
    max_width = section.page_width - section.left_margin - section.right_margin
    max_height = section.page_height - section.top_margin - section.bottom_margin - Inches(1)
    with PILImage.open(buf) as image:
        width, height = image.size
    buf.seek(0)
    document.add_picture(buf, width=min(max_width, int(max_height * width / height)))
    picture_paragraph = document.paragraphs[-1]
    if caption:
        picture_paragraph.paragraph_format.keep_with_next = True
        _add_docx_caption_text(document, caption)
    return picture_paragraph


def _add_docx_caption_text(document: Any, caption: str) -> Any:
    style_names = {style.name for style in document.styles}
    paragraph = document.add_paragraph(style="Caption" if "Caption" in style_names else None)
    paragraph.paragraph_format.keep_together = True
    lines = caption.splitlines()
    for index, line in enumerate(lines):
        if index:
            paragraph.add_run().add_break()
        run = paragraph.add_run(line)
        run.font.name = "Liberation Sans"
        run.font.size = Pt(9 if index == 0 else 8)
        run.font.color.rgb = RGBColor(55, 65, 81)
        run.bold = index == 0
    return paragraph


def _add_docx_label_runs(paragraph: Any, text: str, size: int) -> None:
    """Format known labels while leaving code spans and other text intact."""
    underline_pattern = re.compile(r'<u\s+style="text-decoration-color:\s*(#[0-9a-fA-F]{6});\s*text-decoration-thickness:\s*1px;"\s*>(.*?)</u>', re.I | re.S)
    colors = {"jade": "075C4C", "rojo": "9B1C1C", "azul": "174D86", "dorado": "74510C", "neutro": "303030"}
    sizes = {"pequena": 9, "normal": 11, "grande": 14}
    def add_math(segment: str) -> None:
        offset = 0
        for token in _INLINE_MATH_OR_CODE.finditer(segment):
            if token["code"]:
                continue
            paragraph.add_run(segment[offset:token.start()])
            expression = token["inline_text"]
            result = _math_svg(expression, inline=True, size=size * 4 / 3)
            png = _svg_to_png_bytes(result[0], width=min(1320, math.ceil(result[1] * 3))) if result else None
            if result and png:
                image = paragraph.add_run().add_picture(io.BytesIO(png), width=Inches(min(result[1] / 96, 6)))
                image._inline.docPr.set("descr", expression)
            else:
                paragraph.add_run(token[0])
            offset = token.end()
        paragraph.add_run(segment[offset:])

    def add_plain(segment: str) -> None:
        offset = 0
        for match in _LABEL_OR_CODE.finditer(segment):
            add_math(segment[offset:match.start()])
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
        add_math(segment[offset:])
    offset = 0
    for match in underline_pattern.finditer(text):
        add_plain(text[offset:match.start()])
        run = paragraph.add_run(html_lib.unescape(match.group(2)))
        underline = docx.oxml.OxmlElement("w:u")
        underline.set(docx.oxml.ns.qn("w:val"), "single")
        underline.set(docx.oxml.ns.qn("w:color"), match.group(1)[1:].upper())
        run._element.get_or_add_rPr().append(underline)
        offset = match.end()
    add_plain(text[offset:])


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


def _add_docx_field(paragraph: Any, instruction: str, placeholder: str = "1") -> None:
    field = docx.oxml.OxmlElement("w:fldSimple")
    field.set(docx.oxml.ns.qn("w:instr"), instruction)
    run = docx.oxml.OxmlElement("w:r")
    value = docx.oxml.OxmlElement("w:t")
    value.text = placeholder
    run.append(value)
    field.append(run)
    paragraph._p.append(field)


def _add_docx_index_entry(paragraph: Any, label: str, anchor: str) -> None:
    paragraph.paragraph_format.line_spacing = 1.1
    paragraph.paragraph_format.space_after = Pt(2)
    paragraph.paragraph_format.tab_stops.add_tab_stop(Inches(6.4), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
    _add_docx_internal_link(paragraph, label, anchor)
    paragraph.add_run("\t")
    _add_docx_field(paragraph, f"PAGEREF {anchor} \\h")


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


def _append_docx_table(
    document: Any,
    rows: list[list[str]],
    bookmark: tuple[str, int] | None = None,
    caption: str | None = None,
    font_size_pt: int = 11,
) -> None:
    normalized = [row for row in rows if row]
    if not normalized:
        return
    if caption:
        _add_docx_caption_text(document, caption).paragraph_format.keep_with_next = True
    columns = max(len(row) for row in normalized)
    table = document.add_table(rows=len(normalized), cols=columns)
    table.style = "Table Grid"
    table.rows[0]._tr.get_or_add_trPr().append(docx.oxml.OxmlElement("w:tblHeader"))
    for row_index, row in enumerate(normalized):
        for column_index in range(columns):
            cell = table.cell(row_index, column_index)
            value = row[column_index] if column_index < len(row) else ""
            if _INLINE_MATH_OR_CODE.search(value):
                _add_docx_label_runs(cell.paragraphs[0], value, font_size_pt)
            else:
                cell.text = value
            if row_index == 0:
                for run in cell.paragraphs[0].runs:
                    run.bold = True
            for paragraph in cell.paragraphs:
                for run in paragraph.runs:
                    run.font.size = Pt(max(7, round(font_size_pt * 0.88, 1)))
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
    font_size_pt = max(8, min(18, int(ctx.font_size_pt or 11)))
    normal = document.styles["Normal"]
    normal.font.name = "Liberation Serif"
    normal.font.size = Pt(font_size_pt)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.35
    heading_scales = (1.75, 1.5, 1.3, 1.15, 1.05, 0.95)
    for heading_level, scale in enumerate(heading_scales, start=1):
        style_name = f"Heading {heading_level}"
        style = document.styles[style_name]
        style.font.name = "Liberation Serif"
        style.font.size = Pt(round(font_size_pt * scale, 1))
        style.font.bold = True
        style.paragraph_format.keep_with_next = True
        style.font.color.rgb = RGBColor(23, 23, 23)
    title_style = document.styles["Title"]
    title_style.font.name = "Liberation Serif"
    title_style.font.size = Pt(30)
    title_style.font.color.rgb = RGBColor(23, 23, 23)
    title_style.paragraph_format.keep_with_next = True
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
    label.paragraph_format.space_before = Pt(84)
    label_run = label.add_run("INFORME DE SEGURIDAD")
    label_run.font.name = "Liberation Sans"
    label_run.font.bold = True
    label_run.font.size = Pt(10)
    label_run.font.color.rgb = RGBColor(7, 92, 76)
    document.add_heading(ctx.title, level=0)
    for field_name, field_value in _cover_details(ctx):
        paragraph = document.add_paragraph()
        paragraph.add_run(f"{field_name}: ").bold = True
        paragraph.add_run(field_value)
    cover_footer = document.add_paragraph()
    cover_footer.paragraph_format.space_before = Pt(60)
    cover_footer.add_run("Modo cliente (censurado)" if ctx.redact_for_client else "Reporte técnico interno")
    cover_footer.add_run(f"\nGenerado: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} · Estado: {ctx.status} · Severidad: {ctx.severity.upper()}")
    for run in cover_footer.runs:
        run.font.name = "Liberation Sans"
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(85, 85, 85)
    body_md = ANCHOR_PATTERN.sub("", apply_redaction_markers(ctx.markdown_content, ctx.redact_for_client))
    index_entries = _extract_document_index(body_md)
    word_anchor_by_position: dict[tuple[str, int], tuple[str, int]] = {}
    for bookmark_id, entry in enumerate(index_entries, start=1):
        word_anchor_by_position[(entry.kind, entry.offset)] = (f"lesssow{bookmark_id}", bookmark_id)

    body_section = document.add_section(WD_SECTION_START.NEW_PAGE)
    page_numbering = docx.oxml.OxmlElement("w:pgNumType")
    page_numbering.set(docx.oxml.ns.qn("w:start"), "1")
    body_section._sectPr.append(page_numbering)
    body_section.footer.is_linked_to_previous = False
    footer = body_section.footer.paragraphs[0]
    footer.alignment = docx.enum.text.WD_ALIGN_PARAGRAPH.RIGHT
    footer.add_run("Página ")
    _add_docx_field(footer, "PAGE")
    update_fields = docx.oxml.OxmlElement("w:updateFields")
    update_fields.set(docx.oxml.ns.qn("w:val"), "true")
    document.settings._element.append(update_fields)

    if ctx.include_toc:
        headings = [entry for entry in index_entries if entry.kind == "heading" and entry.level <= ctx.toc_depth]
        if headings:
            document.add_heading("Tabla de contenido", level=1)
            for entry in headings:
                paragraph = document.add_paragraph()
                paragraph.paragraph_format.left_indent = Inches(max(0, entry.level - 1) * 0.18)
                anchor = word_anchor_by_position[(entry.kind, entry.offset)][0]
                _add_docx_index_entry(paragraph, entry.label, anchor)
    if ctx.include_figure_index:
        figures = [entry for entry in index_entries if entry.kind == "figure"]
        if figures:
            document.add_heading("Índice de figuras e imágenes", level=1)
            for number, entry in enumerate(figures, 1):
                paragraph = document.add_paragraph()
                anchor = word_anchor_by_position[(entry.kind, entry.offset)][0]
                _add_docx_index_entry(paragraph, f"Figura {number}. {entry.label}", anchor)
    if ctx.include_table_index:
        tables = [entry for entry in index_entries if entry.kind == "table"]
        if tables:
            document.add_heading("Índice de tablas", level=1)
            for number, entry in enumerate(tables, 1):
                paragraph = document.add_paragraph()
                anchor = word_anchor_by_position[(entry.kind, entry.offset)][0]
                _add_docx_index_entry(paragraph, f"Tabla {number}. {entry.label}", anchor)

    meta_rows = _report_metadata(ctx)
    if meta_rows:
        meta_table = document.add_table(rows=len(meta_rows), cols=2)
        for idx, (label, value) in enumerate(meta_rows):
            meta_table.cell(idx, 0).paragraphs[0].add_run(label).bold = True
            meta_table.cell(idx, 1).text = value

    if ctx.executive_summary and ctx.executive_summary.strip():
        document.add_heading("Resumen Ejecutivo", level=1)
        document.add_paragraph(apply_redaction_markers(ctx.executive_summary, ctx.redact_for_client))

    entries_by_line: dict[str, dict[int, list[_DocumentIndexEntry]]] = {
        "heading": {}, "figure": {}, "table": {},
    }
    for entry in index_entries:
        entries_by_line[entry.kind].setdefault(entry.line, []).append(entry)
    consumed_by_line: dict[tuple[str, int], int] = {}

    object_number_by_position: dict[tuple[str, int], int] = {}
    object_counters: dict[str, int] = {"figure": 0, "table": 0}
    for entry in index_entries:
        if entry.kind in object_counters:
            object_counters[entry.kind] += 1
            object_number_by_position[(entry.kind, entry.offset)] = object_counters[entry.kind]

    pending_caption: dict[str, str] = {}

    def docx_object_caption(kind: str, entry: _DocumentIndexEntry | None, fallback: str = "", html_inner: str | None = None) -> str:
        fields = _caption_fields_from_html(html_inner, kind) if html_inner is not None else {}
        fields.update(pending_caption)
        pending_caption.clear()
        number = object_number_by_position.get((kind, entry.offset), 1) if entry else 1
        title = fields.get("title") or (entry.label if entry else "") or fallback or ("Imagen" if kind == "figure" else "Datos")
        title = re.sub(r"^(?:Figura|Imagen|Tabla)\s*(?:\d+\s*[.:]\s*|:\s*)", "", title, flags=re.I).strip()
        label = "Figura" if kind == "figure" else "Tabla"
        lines = [f"{label} {number}. {title}"]
        if fields.get("description"):
            lines.append(fields["description"])
        if fields.get("source"):
            lines.append(f"Fuente: {fields['source']}")
        return "\n".join(lines)

    def trailing_caption_lines(next_line: int) -> int:
        cursor = next_line
        while cursor < len(lines) and not lines[cursor].strip():
            cursor += 1
        captured = False
        while cursor < len(lines):
            directive = _CAPTION_DIRECTIVE.match(lines[cursor].strip())
            if not directive:
                break
            key = (directive.group(1) or directive.group(3)).casefold()
            value = (directive.group(2) if directive.group(1) else directive.group(4)).strip()
            if key.startswith("descripci"):
                pending_caption["description"] = value
            elif key == "fuente":
                pending_caption["source"] = value
            else:
                break
            captured = True
            cursor += 1
        return cursor if captured else next_line

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
                figure_entry = take_entry("figure", code_start_line) if code_lang == "mermaid" else None
                after_diagram = trailing_caption_lines(index + 1) if code_lang == "mermaid" else index + 1
                figure_caption = docx_object_caption("figure", figure_entry, "Diagrama Mermaid") if code_lang == "mermaid" else None
                if diagram_png:
                    paragraph = _add_png_picture(document, diagram_png, figure_caption)
                else:
                    code_p = document.add_paragraph(raw_block)
                    if code_p.runs:
                        code_p.runs[0].font.name = "Courier New"
                        code_p.runs[0].font.size = Pt(9)
                    paragraph = code_p
                    if figure_caption:
                        _add_docx_caption_text(document, figure_caption)
                if code_lang == "mermaid":
                    bookmark = make_bookmark(figure_entry)
                    if bookmark:
                        _add_docx_bookmark(paragraph, bookmark[0], bookmark[1])
                    index = after_diagram - 1
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

        if stripped.startswith("$$"):
            block = _BLOCK_MATH.match("\n".join(lines[index:index + 100]))
            if block:
                expression = block["block_text"].strip()
                result = _math_svg(expression, inline=False, size=font_size_pt * 1.5)
                png = _svg_to_png_bytes(result[0], width=min(1600, math.ceil(result[1] * 3))) if result else None
                if result and png:
                    paragraph = document.add_paragraph()
                    paragraph.alignment = docx.enum.text.WD_ALIGN_PARAGRAPH.CENTER
                    image = paragraph.add_run().add_picture(io.BytesIO(png), width=Inches(min(result[1] / 96, 6)))
                    image._inline.docPr.set("descr", expression)
                else:
                    document.add_paragraph(block[0])
                index += block[0].count("\n") + 1
                continue

        caption_directive = _CAPTION_DIRECTIVE.match(stripped)
        if caption_directive:
            directive_key = (caption_directive.group(1) or caption_directive.group(3)).casefold()
            directive_value = (caption_directive.group(2) if caption_directive.group(1) else caption_directive.group(4)).strip()
            if directive_key in {"figura", "imagen"}:
                pending_caption["kind"] = "figure"
                pending_caption["title"] = directive_value
            elif directive_key == "tabla":
                pending_caption["kind"] = "table"
                pending_caption["title"] = directive_value
            elif directive_key.startswith("descripci"):
                pending_caption["description"] = directive_value
            elif directive_key == "fuente":
                pending_caption["source"] = directive_value
            index += 1
            continue

        if re.search(r"<table\b", stripped, re.I):
            html_lines = [line]
            while not re.search(r"</table\s*>", "\n".join(html_lines), re.I) and index + 1 < len(lines):
                index += 1
                html_lines.append(lines[index])
            html_table = "\n".join(html_lines)
            entry = take_entry("table", line_number)
            next_index = trailing_caption_lines(index + 1)
            caption_match = re.search(r"<caption\b[^>]*>([\s\S]*?)</caption\s*>", html_table, re.I)
            table_caption = docx_object_caption("table", entry, html_inner=caption_match.group(1) if caption_match else None)
            _append_docx_table(document, _html_table_rows(html_table), make_bookmark(entry), table_caption, font_size_pt)
            index = next_index
            continue

        if index + 1 < len(lines) and "|" in stripped and re.match(r"^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$", lines[index + 1]):
            table_rows, next_index = _pipe_table_rows(lines, index)
            entry = take_entry("table", line_number)
            next_index = trailing_caption_lines(next_index)
            table_caption = docx_object_caption("table", entry)
            _append_docx_table(document, table_rows, make_bookmark(entry), table_caption, font_size_pt)
            index = trailing_caption_lines(next_index)
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
            image_alt = (_html_attribute(img.group(1), "alt") or "Imagen") if img else "Imagen"
            next_index = trailing_caption_lines(index + 1)
            figure_caption = docx_object_caption("figure", entry, image_alt, caption.group(1) if caption else None)
            src = re.search(r"\bsrc\s*=\s*([\"'])(.*?)\1", img.group(1), re.I).group(2) if img and re.search(r"\bsrc\s*=\s*([\"'])(.*?)\1", img.group(1), re.I) else ""
            asset_id = re.match(r"asset://([a-zA-Z0-9_-]{1,64})$", src)
            if asset_id and _append_docx_asset(document, ctx, asset_id.group(1), figure_caption, bookmark):
                pass
            else:
                paragraph = document.add_paragraph(f"[Imagen: {image_alt}]")
                _add_docx_caption_text(document, figure_caption)
                if bookmark:
                    _add_docx_bookmark(paragraph, bookmark[0], bookmark[1])
            index = next_index
            continue

        if re.search(r"<img\b", stripped, re.I):
            img = re.search(r"<img\b([^>]*)>", stripped, re.I)
            entry = take_entry("figure", line_number)
            bookmark = make_bookmark(entry)
            alt = re.search(r"\b(?:alt|title)\s*=\s*([\"'])(.*?)\1", img.group(1), re.I) if img else None
            src = re.search(r"\bsrc\s*=\s*([\"'])(.*?)\1", img.group(1), re.I) if img else None
            label = _plain_html_text(alt.group(2)) if alt else (entry.label if entry else "Imagen")
            next_index = trailing_caption_lines(index + 1)
            figure_caption = docx_object_caption("figure", entry, label)
            asset_id = re.match(r"asset://([a-zA-Z0-9_-]{1,64})$", src.group(2)) if src else None
            if asset_id and _append_docx_asset(document, ctx, asset_id.group(1), figure_caption, bookmark):
                pass
            else:
                paragraph = document.add_paragraph(f"[Imagen: {label}]")
                _add_docx_caption_text(document, figure_caption)
                if bookmark:
                    _add_docx_bookmark(paragraph, bookmark[0], bookmark[1])
            index = next_index
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
            _add_docx_label_runs(paragraph, heading_text, font_size_pt)
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
            alt, asset_id = asset_match.group(1), asset_match.group(2)
            asset = ctx.assets_by_id.get(asset_id)
            if asset:
                next_index = trailing_caption_lines(index + 1)
                entry = take_entry("figure", line_number)
                caption = docx_object_caption("figure", entry, alt or asset.get("filename", "Imagen"))
                if str(asset.get("mime_type") or "").lower().startswith("video/"):
                    paragraph = document.add_paragraph(f"[Evidencia en video adjunta en paquete HTML/ZIP: {alt or asset.get('filename')}]")
                    _add_docx_caption_text(document, caption)
                    bookmark = make_bookmark(entry)
                    if bookmark:
                        _add_docx_bookmark(paragraph, bookmark[0], bookmark[1])
                    index = next_index
                    continue
                if not _append_docx_asset(document, ctx, asset_id, caption, make_bookmark(entry)):
                    paragraph = document.add_paragraph(f"[Imagen: {alt or 'Imagen'}]")
                    _add_docx_caption_text(document, caption)
                    if (bookmark := make_bookmark(entry)):
                        _add_docx_bookmark(paragraph, bookmark[0], bookmark[1])
                index = next_index
                continue

        board_match = BOARD_MD_IMG_PATTERN.search(stripped)
        if board_match:
            caption, board_id = board_match.group(1), board_match.group(2)
            board = ctx.boards_by_id.get(board_id)
            label = caption or (board["title"] if board else board_id)
            next_index = trailing_caption_lines(index + 1)
            entry = take_entry("figure", line_number)
            figure_caption = docx_object_caption("figure", entry, label)
            board_png = _svg_to_png_bytes((board or {}).get("svg_snapshot") or "") if board else None
            if board_png:
                paragraph = _add_png_picture(document, board_png, figure_caption)
            else:
                paragraph = document.add_paragraph(f"[Diagrama de Pizarra adjunto: {label} (ver paquete HTML/ZIP/PDF para gráfico vectorial)]")
                _add_docx_caption_text(document, figure_caption)
            bookmark = make_bookmark(entry)
            if bookmark:
                _add_docx_bookmark(paragraph, bookmark[0], bookmark[1])
            index = next_index
            continue

        markdown_images = list(re.finditer(r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+[\"'][^\"']*[\"'])?\)", stripped))
        if markdown_images:
            remainder = stripped
            next_index = trailing_caption_lines(index + 1)
            for image_match in markdown_images:
                alt, src = image_match.group(1), image_match.group(2)
                entry = take_entry("figure", line_number)
                bookmark = make_bookmark(entry)
                figure_caption = docx_object_caption("figure", entry, alt or "Imagen")
                asset_id = re.match(r"asset://([a-zA-Z0-9_-]{1,64})$", src)
                board_id = re.match(r"board://([a-zA-Z0-9_-]{1,64})$", src)
                if asset_id and _append_docx_asset(document, ctx, asset_id.group(1), figure_caption, bookmark):
                    pass
                elif board_id:
                    board = ctx.boards_by_id.get(board_id.group(1))
                    board_label = alt or (board or {}).get("title", "Diagrama")
                    board_png = _svg_to_png_bytes((board or {}).get("svg_snapshot") or "") if board else None
                    paragraph = _add_png_picture(document, board_png, figure_caption) if board_png else document.add_paragraph(f"[Diagrama de Pizarra adjunto: {board_label}]")
                    if not board_png:
                        _add_docx_caption_text(document, figure_caption)
                    if bookmark:
                        _add_docx_bookmark(paragraph, bookmark[0], bookmark[1])
                else:
                    paragraph = document.add_paragraph(f"[Imagen: {alt or 'Imagen'}]")
                    _add_docx_caption_text(document, figure_caption)
                    if bookmark:
                        _add_docx_bookmark(paragraph, bookmark[0], bookmark[1])
                remainder = remainder.replace(image_match.group(0), "", 1)
            if remainder.strip():
                _add_docx_label_runs(document.add_paragraph(), remainder.strip(), font_size_pt)
            index = next_index
            continue

        if re.match(r"^[-*+]\s+\[[ xX]\]\s+", stripped):
            document.add_paragraph(("☑ " if stripped[3:4].lower() == "x" else "☐ ") + stripped[6:])
        elif stripped.startswith(("- ", "* ", "+ ")):
            _add_docx_label_runs(document.add_paragraph(style="List Bullet"), stripped[2:], font_size_pt)
        elif re.match(r"^\d+[.)]\s+", stripped):
            _add_docx_label_runs(document.add_paragraph(style="List Number"), re.sub(r"^\d+[.)]\s+", "", stripped), font_size_pt)
        elif stripped.startswith("> "):
            _add_docx_label_runs(document.add_paragraph(), stripped[2:].strip(), font_size_pt)
        elif stripped:
            _add_docx_label_runs(document.add_paragraph(), line, font_size_pt)
        index += 1

    if ctx.findings:
        document.add_heading("Matriz de Hallazgos", level=1)
        finding_rows = [["ID", "Hallazgo", "Severidad", "CVSS", "Estado"]]
        for item in ctx.findings:
            finding_rows.append([
                str(item.get("id", "")),
                apply_redaction_markers(str(item.get("title", "")), ctx.redact_for_client),
                str(item.get("severity", "")).upper(),
                str(item.get("cvss_score") if item.get("cvss_score") is not None else "-"),
                str(item.get("status", "")).replace("_", " ").capitalize(),
            ])
        _append_docx_table(document, finding_rows, font_size_pt=font_size_pt)

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
