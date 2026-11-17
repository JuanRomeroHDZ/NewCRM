import io
import re
import shutil
import subprocess
import zipfile

import docx
import pytest
from PIL import Image, ImageDraw
from weasyprint import HTML
from app.security.crypto import encrypt_bytes

from app.services.writeup_exporter import (
    ExportBundleContext,
    _build_md_artifact,
    _build_md_zip_artifact,
    _build_docx_artifact,
    _build_pdf_artifact,
    _extract_document_index,
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
    assert len(HTML(string=html, url_fetcher=_ssrf_safe_url_fetcher).render().pages) == 4

    raw_docx, _, _ = _build_docx_artifact(ctx)
    document = docx.Document(io.BytesIO(raw_docx))
    label = next(run for paragraph in document.paragraphs for run in paragraph.runs if run.text == "Respuesta")
    assert str(label.font.color.rgb) == "075C4C"
    assert label.font.size.pt == 14
    with zipfile.ZipFile(io.BytesIO(raw_docx)) as archive:
        xml = archive.read("word/document.xml")
        assert b'w:type="page"' in xml
        assert b"secreto" not in xml


def test_short_html_report_has_working_heading_index():
    ctx = ExportBundleContext(
        'report', 'Informe', 'informe', 'borrador', 'media',
        None, None, None, None, None, [], '',
        '# Introducción\nTexto\n\n## Hallazgos\nContenido', [], [], {}, {},
        include_toc=True,
    )
    result = build_standalone_html_document(ctx)
    assert 'class="toc"' in result
    assert 'href="#introduccion"' in result and 'id="introduccion"' in result
    assert 'href="#hallazgos"' in result and 'id="hallazgos"' in result


def test_export_indexes_link_to_media_tables_and_limit_heading_depth():
    ctx = ExportBundleContext(
        'report', 'Informe', 'informe', 'borrador', 'media',
        None, None, None, None, None, [], '',
        '# General\n\n## Detalle\n\n![Captura](https://example.com/a.png)\n\n| Puerto | Estado |\n|---|---|\n| 80 | abierto |',
        [], [], {}, {}, include_toc=True, toc_depth=1, include_figure_index=True, include_table_index=True,
    )
    result = build_standalone_html_document(ctx)
    assert 'href="#general"' in result
    assert 'href="#detalle"' not in result
    assert 'href="#export-figure-1"' in result and 'id="export-figure-1"' in result
    assert 'href="#export-table-1"' in result and 'id="export-table-1"' in result


def test_html_indexes_include_raw_html_figures_images_and_tables():
    ctx = ExportBundleContext(
        'report', 'Informe', 'informe', 'borrador', 'media',
        None, None, None, None, None, [], '',
        "# Informe\n\n<figure class='evidence'><img src='https://example.invalid/cap.png' alt='Captura'><figcaption>Prueba de acceso</figcaption></figure>\n\n<img src='https://example.invalid/term.png' alt='Terminal'>\n\n<table><caption>Servicios expuestos</caption><tr><th>Puerto</th><th>Servicio</th></tr><tr><td>22</td><td>ssh</td></tr></table>",
        [], [], {}, {}, include_figure_index=True, include_table_index=True,
    )
    result = build_standalone_html_document(ctx)
    assert 'Figura 1. Prueba de acceso' in result
    assert 'Figura 2. Terminal' in result
    assert 'Tabla 1. Servicios expuestos' in result
    assert 'id="export-figure-1"' in result and 'href="#export-figure-1"' in result
    assert 'id="export-figure-2"' in result and 'href="#export-figure-2"' in result
    assert 'id="export-table-1"' in result and 'href="#export-table-1"' in result


def test_markdown_export_adds_hierarchical_contents_and_html_object_indexes():
    source = "# Informe\n\n## Evidencia\n\n<h5>Encabezado insertado</h5>\n\n<figure><img src='asset.png' alt='Pantalla'><figcaption>Panel de acceso</figcaption></figure>\n\n<table><caption>Servicios</caption><tr><th>Puerto</th><th>Estado</th></tr></table>\n\n~~~html\n<table><tr><th>Ignorar</th></tr></table>\n~~~"
    ctx = ExportBundleContext(
        'report', 'Informe', 'informe', 'borrador', 'media',
        None, None, None, None, None, [], '', source,
        [], [], {}, {}, include_toc=True, toc_depth=5, include_figure_index=True, include_table_index=True,
    )
    raw, _, _ = _build_md_artifact(ctx)
    result = raw.decode('utf-8')
    assert '## Contenido' in result and '[Encabezado insertado](#lessso-section-encabezado-insertado-3)' in result
    assert '## Índice de figuras e imágenes' in result and '[Figura 1 · Panel de acceso](#lessso-figure-1)' in result
    assert '## Índice de tablas' in result and '[Tabla 1 · Servicios](#lessso-table-1)' in result
    assert '<a id="lessso-figure-1"></a>' in result
    assert '<a id="lessso-table-1"></a>' in result
    assert 'lessso-table-2' not in result
    extracted = _extract_document_index(source)
    assert [entry.kind for entry in extracted].count('table') == 1
    assert not any(entry.label == 'Ignorar' for entry in extracted)


def test_word_indexes_link_to_markdown_and_raw_html_objects_and_render_list_styles():
    source = "# Informe\n\n<h5>Hallazgo</h5>\n\n<img src='https://example.invalid/evidence.png' alt='Terminal'>\n\n<table><caption>Puertos</caption><tr><th>Puerto</th><th>Servicio</th></tr><tr><td>22</td><td>ssh</td></tr></table>\n\nNombre | Estado\n--- | ---\napp | abierto\n\n<ol type='A'><li>Primero</li><li>Segundo</li></ol>\n\n- [x] Verificado"
    ctx = ExportBundleContext(
        'report', 'Informe', 'informe', 'borrador', 'media',
        None, None, None, None, None, [], '', source,
        [], [], {}, {}, include_toc=True, toc_depth=6, include_figure_index=True, include_table_index=True,
    )
    raw, _, _ = _build_docx_artifact(ctx)
    document = docx.Document(io.BytesIO(raw))
    text = '\n'.join([paragraph.text for paragraph in document.paragraphs] + [cell.text for table in document.tables for row in table.rows for cell in row.cells])
    assert 'Figura 1. Terminal' in document_xml_text(raw)
    assert 'Índice de figuras e imágenes' in document_xml_text(raw)
    assert 'Índice de tablas' in document_xml_text(raw)
    assert 'Tabla 1. Puertos' in text and 'Tabla 2. Nombre · Estado' in text
    assert 'Terminal' in text and '[Imagen: Terminal]' in text
    assert 'Puertos' in text and 'app' in text
    assert 'A. Primero' in text and 'B. Segundo' in text
    assert '☑ Verificado' in text
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        xml = archive.read('word/document.xml')
        assert b'<w:hyperlink' in xml and b'w:anchor="lesssow' in xml
        assert b'<w:bookmarkStart' in xml and b'<w:bookmarkEnd' in xml


def document_xml_text(raw_docx: bytes) -> str:
    """Extract all Word text nodes, including text inside hyperlink elements."""
    with zipfile.ZipFile(io.BytesIO(raw_docx)) as archive:
        xml = archive.read('word/document.xml').decode('utf-8')
    return ' '.join(re.findall(r'<w:t(?:\s+[^>]*)?>([\s\S]*?)</w:t>', xml))


def make_raster_asset() -> dict:
    image = Image.new('RGB', (480, 270), '#d8e7e3')
    ImageDraw.Draw(image).rectangle((24, 24, 456, 246), outline='#075c4c', width=5)
    output = io.BytesIO()
    image.save(output, format='PNG')
    raw = output.getvalue()
    return {
        'id': 'evidence123',
        'filename': 'mapa-prueba.png',
        'mime_type': 'image/png',
        'encrypted_blob': encrypt_bytes(raw),
        'sha256': 'test-image-sha256',
    }


def stress_export_context(asset: dict) -> ExportBundleContext:
    body = [
        '# Contexto general',
        '### Alcance técnico',
        '##### Verificación detallada',
        '',
        'Figura: Mapa regional',
        'Descripción: Evidencia raster de la región evaluada.',
        'Fuente: Elaboración propia (2026).',
        '![Mapa de prueba](asset://evidence123)',
        '',
        'Tabla: Servicios identificados',
        'Descripción: Resumen con celdas largas para validar ajuste de línea.',
        'Fuente: Elaboración propia (2026).',
        '',
        '| Puerto | Servicio | Descripción |',
        '| --- | --- | --- |',
    ]
    body.extend(
        f'| {port} | servicio-{port} | detalle técnico con una etiqueta extensa sin espacios {"X" * 68} |'
        for port in range(20, 56)
    )
    body.extend(['', '## Evidencia adicional'])
    body.extend(f'Párrafo de contenido para comprobar la foliación del cuerpo, sección {index}. ' * 4 for index in range(70))
    return ExportBundleContext(
        'report', 'Informe de prueba', 'informe-prueba', 'borrador', 'media',
        None, None, None, None, 'Laboratorio local', [], '', '\n'.join(body),
        [], [], {'evidence123': asset}, {}, include_toc=True, toc_depth=6,
        include_figure_index=True, include_table_index=True, font_size_pt=10,
    )


def test_pdf_export_embeds_images_wraps_long_tables_and_starts_body_folio_after_indexes(tmp_path):
    for binary in ('pdftotext', 'pdfimages'):
        if not shutil.which(binary):
            pytest.skip(f'{binary} is required for PDF export verification')
    ctx = stress_export_context(make_raster_asset())
    pdf, _, _ = _build_pdf_artifact(ctx)
    pdf_path = tmp_path / 'writeup.pdf'
    pdf_path.write_bytes(pdf)

    extracted = subprocess.run(['pdftotext', '-layout', str(pdf_path), '-'], check=True, capture_output=True, text=True).stdout
    pages = extracted.split('\f')
    first_body_page = next(index for index, page in enumerate(pages) if 'Página 1 de ' in page)
    assert first_body_page >= 1
    assert all('Página ' not in page for page in pages[:first_body_page])
    body_folios = re.findall(r'Página\s+(\d+)\s+de\s+(\d+)', extracted)
    assert len(body_folios) >= 3
    total = int(body_folios[0][1])
    assert [int(page) for page, _ in body_folios] == list(range(1, total + 1))
    assert re.search(r'Contexto general\s+1', extracted)
    assert re.search(r'Figura 1\. Mapa regional\s+1', extracted)
    assert re.search(r'Tabla 1\. Servicios identificados\s+\d+', extracted)
    assert 'Tabla 1. Servicios identificados' in extracted
    assert 'Fuente: Elaboración propia (2026).' in extracted

    image_listing = subprocess.run(['pdfimages', '-list', str(pdf_path)], check=True, capture_output=True, text=True).stdout
    assert re.search(r'\bimage\s+480\s+270\b', image_listing)


def test_docx_export_applies_font_hierarchy_and_embeds_images():
    ctx = stress_export_context(make_raster_asset())
    raw, _, _ = _build_docx_artifact(ctx)
    document = docx.Document(io.BytesIO(raw))
    assert document.styles['Normal'].font.size.pt == 10
    sizes = [document.styles[f'Heading {level}'].font.size.pt for level in (1, 3, 5)]
    assert sizes[0] > sizes[1] > sizes[2]
    text = document_xml_text(raw)
    assert 'Figura 1. Mapa regional' in text
    assert 'Tabla 1. Servicios identificados' in text
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        names = archive.namelist()
        assert any(name.startswith('word/media/') and name.endswith('.png') for name in names)
        document_xml = archive.read('word/document.xml')
        assert b'w:start="1"' in document_xml
        assert b'PAGEREF' in document_xml
        assert any(b'SECTIONPAGES' in archive.read(name) for name in names if name.startswith('word/footer') and name.endswith('.xml'))


def test_markdown_exports_embed_and_bundle_attached_images_with_captions():
    ctx = stress_export_context(make_raster_asset())
    html = build_standalone_html_document(ctx)
    assert '<figure' in html and 'data:image/png;base64,' in html
    assert 'Figura 1. Mapa regional' in html

    raw, _, _ = _build_md_artifact(ctx)
    markdown = raw.decode('utf-8')
    assert '<figure class="writeup-figure">' in markdown
    assert 'data:image/png;base64,' in markdown
    assert '<strong>Figura 1. Mapa regional</strong>' in markdown
    assert 'Fuente: Elaboración propia (2026).' in markdown

    zipped, _, _ = _build_md_zip_artifact(ctx)
    with zipfile.ZipFile(io.BytesIO(zipped)) as archive:
        bundled_markdown = archive.read('informe-prueba.md').decode('utf-8')
        assert '<img src="assets/mapa-prueba.png"' in bundled_markdown
        assert 'Figura 1. Mapa regional' in bundled_markdown
        assert archive.read('assets/mapa-prueba.png').startswith(b'\x89PNG\r\n\x1a\n')


def test_colored_underline_survives_export_without_allowing_arbitrary_styles():
    ctx = ExportBundleContext(
        'report', 'Informe', 'informe', 'borrador', 'media', None, None, None,
        None, None, [], '', '# Informe\n\n<u style="text-decoration-color: #12ABEF; text-decoration-thickness: 1px;">Evidencia</u>\n\n<u style="background: url(https://example.invalid)">Seguro</u>',
        [], [], {}, {},
    )
    html = build_standalone_html_document(ctx)
    assert 'text-decoration-color: #12ABEF; text-decoration-thickness: 1px;' in html
    assert 'background: url(https://example.invalid)' not in html
    raw, _, _ = _build_docx_artifact(ctx)
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        xml = archive.read('word/document.xml')
        assert b'w:color="12ABEF"' in xml
        assert b'Evidencia' in xml
