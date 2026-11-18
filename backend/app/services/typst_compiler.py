import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path


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
  [*ID*], [*Descripción*], [*Severidad*],
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
            return TypstCompileResult(ok=False, pages=[], pdf_bytes=None, error=err_msg)

        if output_format in ("pdf", "html"):
            if not output_pattern.exists():
                return TypstCompileResult(
                    ok=False,
                    pages=[],
                    pdf_bytes=None,
                    error=f"Typst no generó el archivo {output_format.upper()} de salida.",
                )
            return TypstCompileResult(
                ok=True,
                pages=[],
                pdf_bytes=output_pattern.read_bytes(),
                error=None,
            )

        svg_files = sorted(root_dir.glob("page-*.svg"))
        pages = [svg_path.read_text(encoding="utf-8") for svg_path in svg_files]
        return TypstCompileResult(ok=True, pages=pages, pdf_bytes=None, error=None)
