import io
import zipfile

import docx
from weasyprint import HTML

from app.services.writeup_exporter import (
    ExportBundleContext,
    _build_docx_artifact,
    _ssrf_safe_url_fetcher,
    build_standalone_html_document,
)


def test_cover_precedes_body_and_docx_preserves_label_format():
    ctx = ExportBundleContext(
        "report", "Informe <seguro>", "informe", "borrador", "alta",
        None, None, None, None, "{{redact:secreto}}", [], "",
        "# Prueba\n{etiqueta:jade:grande:Respuesta}", [], [], {}, {},
        redact_for_client=True, organization_name="Empresa <prueba>",
    )
    html = build_standalone_html_document(ctx)
    assert "Empresa &lt;prueba&gt;" in html
    assert "secreto" not in html
    assert html.index('aria-label="Portada del informe"') < html.index('<main class="markdown-body">')
    assert len(HTML(string=html, url_fetcher=_ssrf_safe_url_fetcher).render().pages) == 2

    raw_docx, _, _ = _build_docx_artifact(ctx)
    document = docx.Document(io.BytesIO(raw_docx))
    label = next(run for paragraph in document.paragraphs for run in paragraph.runs if run.text == "Respuesta")
    assert str(label.font.color.rgb) == "075C4C"
    assert label.font.size.pt == 14
    with zipfile.ZipFile(io.BytesIO(raw_docx)) as archive:
        xml = archive.read("word/document.xml")
        assert b'w:type="page"' in xml
        assert b"secreto" not in xml
