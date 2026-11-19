import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path


# Typst's HTML target emits semantic markup. Give its preview and download the same reader layout.
_HTML_READER_STYLE = """<meta name="viewport" content="width=device-width, initial-scale=1">
<style id="lessso-typst-reader">
  :root { color-scheme: light; }
  body { box-sizing: border-box; max-width: 78ch; margin: 0 auto;
         padding: clamp(1.25rem, 4vw, 3rem); background: #fff; color: #1f2933;
         font: 1rem/1.65 Georgia, "DejaVu Serif", serif; overflow-wrap: anywhere; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.6em 0 .55em; color: #172332; }
  h1 { font-size: 2rem; } h2 { font-size: 1.5rem; } h3 { font-size: 1.2rem; }
  p, figure, ul, ol { margin-block: .8em; }
  a { color: #1b5480; text-underline-offset: .18em; }
  :target { scroll-margin-top: 1rem; }
  img, svg, video { max-width: 100%; height: auto; vertical-align: middle; }
  figure { margin-inline: 0; }
  figcaption { margin-top: .5em; color: #465363; font-size: .9rem; }
  table { display: block; max-width: 100%; overflow: auto; border-collapse: collapse; margin-block: 1rem; }
  th, td { border: 1px solid #cbd5df; padding: .4em .65em; text-align: start; }
  th { background: #eef2f6; }
  pre { overflow: auto; padding: .85em; background: #f2f4f7; }
  code, pre { font-family: "DejaVu Sans Mono", monospace; font-size: .88em; }
  math[display=block] { max-width: 100%; overflow: auto; }
</style>"""


def _style_typst_html(content: bytes) -> bytes:
    html = content.decode("utf-8")
    closing_head = re.search(r"</head\s*>", html, re.IGNORECASE)
    if closing_head:
        at = closing_head.start()
        return (html[:at] + _HTML_READER_STYLE + html[at:]).encode("utf-8")
    return content


DEFAULT_TYPST_TEMPLATE = """#set page(
  paper: "a4",
  margin: (x: 2.2cm, y: 2.2cm),
  fill: rgb("#ffffff"),
)
#set text(
  font: "DejaVu Sans",
  size: 10.5pt,
  fill: rgb("#111827"),
  lang: "es",
)
#set heading(numbering: "1.1")
#set table.cell(breakable: false)

= Informe técnico

*Proyecto:* Evaluación de seguridad \\
*Fecha:* #datetime.today().display("[day]/[month]/[year]")

== Resumen ejecutivo

Describe aquí el alcance, los hallazgos principales y las recomendaciones prioritarias.

== Hallazgos

#table(
  columns: (auto, 1fr, auto),
  inset: 8pt,
  align: horizon,
  table.header([*ID*], [*Descripción*], [*Severidad*]),
  [H-01], [Ejemplo de hallazgo documentado en Typst], [Media],
)

== Recomendaciones

+ Aplicar las correcciones indicadas por orden de criticidad.
+ Validar el cierre mediante nueva comprobación.
"""

MAX_TYPST_SOURCE_CHARS = 300_000
TYPST_COMPILE_TIMEOUT_SECONDS = 15


@dataclass(frozen=True)
class TypstCompileResult:
    ok: bool
    pages: list[str]
    pdf_bytes: bytes | None
    error: str | None


def resolve_typst_binary() -> str | None:
    """Locate the typst CLI binary from env, /app/bin, /usr/local/bin, or PATH."""
    candidates = [
        os.environ.get("TYPST_BIN"),
        "/app/bin/typst",
        "/usr/local/bin/typst",
        "/usr/bin/typst",
        shutil.which("typst"),
    ]
    for candidate in candidates:
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def get_typst_status() -> dict:
    """Return availability and version string of the typst CLI."""
    binary = resolve_typst_binary()
    if not binary:
        return {"available": False, "version": None, "binary": None}
    try:
        proc = subprocess.run(
            [binary, "--version"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        version = proc.stdout.strip() if proc.returncode == 0 else None
        return {"available": proc.returncode == 0, "version": version, "binary": binary}
    except Exception:
        return {"available": False, "version": None, "binary": binary}


def compile_typst_source(
    source: str,
    output_format: str = "svg",
    extra_files: dict[str, bytes] | None = None,
) -> TypstCompileResult:
    """Compile Typst markup inside an isolated temporary root directory."""
    if len(source) > MAX_TYPST_SOURCE_CHARS:
        return TypstCompileResult(
            ok=False,
            pages=[],
            pdf_bytes=None,
            error=f"El documento supera el límite de {MAX_TYPST_SOURCE_CHARS} caracteres.",
        )

    binary = resolve_typst_binary()
    if not binary:
        return TypstCompileResult(
            ok=False,
            pages=[],
            pdf_bytes=None,
            error="El binario de Typst no está disponible en el servidor.",
        )

    with tempfile.TemporaryDirectory(prefix="lessso-typst-") as tmpdir:
        root_dir = Path(tmpdir)
        if extra_files:
            for rel_name, content in extra_files.items():
                safe_name = Path(rel_name).name
                (root_dir / safe_name).write_bytes(content)
        input_file = root_dir / "document.typ"
        input_file.write_text(source, encoding="utf-8")

        if output_format == "pdf":
            output_pattern = root_dir / "document.pdf"
            cmd = [
                binary,
                "compile",
                "--root",
                str(root_dir),
                "--format",
                "pdf",
                str(input_file),
                str(output_pattern),
            ]
        elif output_format == "html":
            output_pattern = root_dir / "document.html"
            cmd = [
                binary,
                "compile",
                "--features",
                "html",
                "--root",
                str(root_dir),
                "--format",
                "html",
                str(input_file),
                str(output_pattern),
            ]
        else:
            output_pattern = root_dir / "page-{0p}.svg"
            cmd = [
                binary,
                "compile",
                "--root",
                str(root_dir),
                "--format",
                "svg",
                str(input_file),
                str(output_pattern),
            ]

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=TYPST_COMPILE_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return TypstCompileResult(
                ok=False,
                pages=[],
                pdf_bytes=None,
                error="La compilación de Typst superó el tiempo máximo permitido (15s).",
            )

        if proc.returncode != 0:
            err_msg = (proc.stderr or proc.stdout or "Error de compilación de Typst.").strip()
            err_msg = err_msg.replace(f"{root_dir}/", "")
            err_msg = re.sub(r"(?:\.\./)*tmp/lessso-typst-[a-zA-Z0-9_-]+/", "", err_msg)
            return TypstCompileResult(ok=False, pages=[], pdf_bytes=None, error=err_msg[:8_000])

        if output_format in ("pdf", "html"):
            if not output_pattern.exists():
                return TypstCompileResult(
                    ok=False,
                    pages=[],
                    pdf_bytes=None,
                    error=f"Typst no generó el archivo {output_format.upper()} de salida.",
                )
            content = output_pattern.read_bytes()
            if output_format == "html":
                content = _style_typst_html(content)
            return TypstCompileResult(
                ok=True,
                pages=[],
                pdf_bytes=content,
                error=None,
            )

        svg_files = sorted(root_dir.glob("page-*.svg"))
        pages = [svg_path.read_text(encoding="utf-8") for svg_path in svg_files]
        return TypstCompileResult(ok=True, pages=pages, pdf_bytes=None, error=None)
