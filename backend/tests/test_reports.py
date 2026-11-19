import json
import subprocess
from io import BytesIO
from pathlib import Path
import zipfile
import pytest
from PIL import Image
from app.api.v1.reports import prepare_typst_source
from app.services.typst_compiler import MAX_TYPST_SOURCE_CHARS, TypstCompileResult, compile_typst_source


@pytest.mark.asyncio
async def test_report_documents_crud_and_soft_delete(client, auth_token):
    headers = {"X-Vault-Token": auth_token}

    created = await client.post(
        "/api/v1/reports/documents",
        headers=headers,
        json={"title": "Informe Typst Demo", "status": "borrador", "source": "= Hola\n\nContenido."},
    )
    assert created.status_code == 201, created.text
    doc = created.json()
    doc_id = doc["id"]
    assert doc["title"] == "Informe Typst Demo"
    assert doc["source"] == "= Hola\n\nContenido."

    listed = await client.get("/api/v1/reports/documents", headers=headers)
    assert listed.status_code == 200
    assert any(item["id"] == doc_id for item in listed.json())

    updated = await client.patch(
        f"/api/v1/reports/documents/{doc_id}",
        headers=headers,
        json={"title": "Informe Actualizado", "status": "en_revision", "source": "= Nuevo\n\nTexto."},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Informe Actualizado"
    assert updated.json()["status"] == "en_revision"
    assert updated.json()["source"] == "= Nuevo\n\nTexto."

    fetched = await client.get(f"/api/v1/reports/documents/{doc_id}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["source"] == "= Nuevo\n\nTexto."

    deleted = await client.delete(f"/api/v1/reports/documents/{doc_id}", headers=headers)
    assert deleted.status_code == 204

    after_delete = await client.get(f"/api/v1/reports/documents/{doc_id}", headers=headers)
    assert after_delete.status_code == 404


@pytest.mark.asyncio
async def test_report_canvases_crud_and_soft_delete(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    scene = json.dumps({"elements": [{"id": "el-1", "type": "rectangle"}], "appState": {"theme": "dark"}, "files": {}})

    created = await client.post(
        "/api/v1/reports/canvases",
        headers=headers,
        json={"title": "Topología Red", "scene_json": scene, "element_count": 1},
    )
    assert created.status_code == 201, created.text
    canvas = created.json()
    canvas_id = canvas["id"]
    assert canvas["title"] == "Topología Red"
    assert canvas["element_count"] == 1
    assert canvas["has_svg_snapshot"] is False

    unsaved_preview = await client.post(
        "/api/v1/reports/documents/compile",
        headers=headers,
        json={"source": f'#figure(image("canvas://{canvas_id}"))'},
    )
    assert unsaved_preview.status_code == 422
    assert "Guarda el lienzo" in unsaved_preview.json()["detail"]
    assert json.loads(canvas["scene_json"])["elements"][0]["id"] == "el-1"

    listed = await client.get("/api/v1/reports/canvases", headers=headers)
    assert listed.status_code == 200
    assert any(item["id"] == canvas_id for item in listed.json())

    updated = await client.patch(
        f"/api/v1/reports/canvases/{canvas_id}",
        headers=headers,
        json={"title": "Topología Red v2", "element_count": 3, "svg_snapshot": "<svg></svg>"},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Topología Red v2"
    assert updated.json()["element_count"] == 3
    assert updated.json()["has_svg_snapshot"] is True

    deleted = await client.delete(f"/api/v1/reports/canvases/{canvas_id}", headers=headers)
    assert deleted.status_code == 204

    after_delete = await client.get(f"/api/v1/reports/canvases/{canvas_id}", headers=headers)
    assert after_delete.status_code == 404


def test_typst_compiler_rejects_oversized_source():
    oversized = "a" * (MAX_TYPST_SOURCE_CHARS + 1)
    result = compile_typst_source(oversized, output_format="svg")
    assert result.ok is False
    assert "límite" in (result.error or "").lower()


@pytest.mark.asyncio
async def test_typst_live_compile_svg_pdf_and_error(client, auth_token):
    headers = {"X-Vault-Token": auth_token}

    status_res = await client.get("/api/v1/reports/typst-status", headers=headers)
    assert status_res.status_code == 200
    assert status_res.json()["available"] is True

    svg_res = await client.post(
        "/api/v1/reports/documents/compile",
        headers=headers,
        json={"source": "= Prueba Typst\n\nTexto de ejemplo."},
    )
    assert svg_res.status_code == 200
    svg_data = svg_res.json()
    assert svg_data["ok"] is True
    assert svg_data["page_count"] == 1
    assert "<svg" in svg_data["pages"][0]

    bad_res = await client.post(
        "/api/v1/reports/documents/compile",
        headers=headers,
        json={"source": "#unknown_function()"},
    )
    assert bad_res.status_code == 200
    assert bad_res.json()["ok"] is False
    assert bad_res.json()["error"]

    doc_res = await client.post(
        "/api/v1/reports/documents",
        headers=headers,
        json={"title": "PDF Test", "source": "= Documento PDF\n\nContenido."},
    )
    assert doc_res.status_code == 201
    doc_id = doc_res.json()["id"]

    pdf_res = await client.post(f"/api/v1/reports/documents/{doc_id}/pdf", headers=headers)
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"].startswith("application/pdf")
    assert pdf_res.content.startswith(b"%PDF-")


@pytest.mark.asyncio
async def test_typst_export_endpoint_compiles_attached_image_and_long_table(
    client, auth_token, tmp_path: Path
):
    """Exercise encrypted asset resolution and the real Typst PDF/HTML exporters together."""
    headers = {"X-Vault-Token": auth_token}
    created = await client.post(
        "/api/v1/reports/documents",
        headers=headers,
        json={"title": "Exportación de integración", "source": "= Integración Typst"},
    )
    assert created.status_code == 201, created.text
    doc_id = created.json()["id"]

    image_bytes = BytesIO()
    Image.new("RGB", (320, 180), (45, 92, 135)).save(image_bytes, format="PNG")
    uploaded = await client.post(
        f"/api/v1/reports/documents/{doc_id}/assets",
        headers=headers,
        files={"file": ("captura.png", image_bytes.getvalue(), "image/png")},
    )
    assert uploaded.status_code == 201, uploaded.text
    asset_id = uploaded.json()["id"]

    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect width="100" height="80" fill="#111827"/><circle cx="50" cy="40" r="24" fill="#0f766e"/></svg>'
    canvas = await client.post(
        "/api/v1/reports/canvases",
        headers=headers,
        json={"title": "Diagrama exportable", "element_count": 1, "svg_snapshot": svg},
    )
    assert canvas.status_code == 201, canvas.text
    canvas_id = canvas.json()["id"]

    rows = "\n".join(
        f"  [H-{index:02d}], [Hallazgo {index}: {'Detalle técnico y recomendación prioritaria. ' * 9}], [Media],"
        for index in range(1, 43)
    )
    source = f'''#set page(paper: "a4", margin: 1.7cm)
#set text(font: "DejaVu Sans", size: 9pt, lang: "es")
#set heading(numbering: "1.1")
#set table.cell(breakable: false)

= Informe de integración Typst

Texto verificable del documento exportado.

#figure(image("asset://{asset_id}", width: 62%), caption: [Captura adjunta de integración])

#figure(image("canvas://{canvas_id}", width: 45%), caption: [Diagrama adjunto])

== Hallazgos y tabla extensa

#table(
  columns: (auto, 1fr, auto),
  inset: 5pt,
  align: horizon,
  table.header([*ID*], [*Descripción*], [*Severidad*]),
{rows}
)

== Cierre

Texto al final de la tabla para verificar el flujo de páginas.
'''

    pdf = await client.post(
        f"/api/v1/reports/documents/{doc_id}/export?format=pdf",
        headers=headers,
        json={"source": source},
    )
    assert pdf.status_code == 200, pdf.text
    assert pdf.headers["content-type"].startswith("application/pdf")
    assert pdf.content.startswith(b"%PDF-")
    pdf_path = tmp_path / "report.pdf"
    pdf_path.write_bytes(pdf.content)

    info = subprocess.run(
        ["pdfinfo", str(pdf_path)], check=True, capture_output=True, text=True
    ).stdout
    page_line = next(line for line in info.splitlines() if line.startswith("Pages:"))
    assert int(page_line.split(":", 1)[1].strip()) >= 2

    extracted = subprocess.run(
        ["pdftotext", str(pdf_path), "-"], check=True, capture_output=True, text=True
    ).stdout
    assert "Informe de integración Typst" in extracted
    assert all(f"H-{index:02d}" in extracted for index in range(1, 43))
    assert "Texto al final de la tabla" in extracted
    assert extracted.count("Severidad") >= 2

    images = subprocess.run(
        ["pdfimages", "-list", str(pdf_path)], check=True, capture_output=True, text=True
    ).stdout
    assert "image" in images.lower()

    # The image is raster, but the canvas stays vector in the PDF. Verify that
    # Poppler actually renders both source colors in their expected vertical order.
    rendered = tmp_path / "first-page"
    subprocess.run(
        ["pdftoppm", "-f", "1", "-l", "1", "-singlefile", "-r", "72", "-png", str(pdf_path), str(rendered)],
        check=True, capture_output=True,
    )
    with Image.open(rendered.with_suffix(".png")) as page:
        page = page.convert("RGB")
        center_column = [page.getpixel((page.width // 2, y)) for y in range(page.height)]
        def rows_matching(color):
            # Image optimization can round a color channel before export.
            return [
                y for y, pixel in enumerate(center_column)
                if max(abs(actual - expected) for actual, expected in zip(pixel, color)) <= 5
            ]

        raster_rows = rows_matching((45, 92, 135))
        canvas_rows = rows_matching((15, 118, 110))
        assert len(raster_rows) > 20 and len(canvas_rows) > 20
        assert max(raster_rows) < min(canvas_rows)

    html = await client.post(
        f"/api/v1/reports/documents/{doc_id}/export?format=html",
        headers=headers,
        json={"source": source},
    )
    assert html.status_code == 200, html.text
    assert html.headers["content-type"].startswith("text/html")
    html_text = html.content.decode("utf-8")
    assert "Informe de integración Typst" in html_text
    assert "Hallazgos y tabla extensa" in html_text
    assert "<img" in html_text.lower()
    assert "asset://" not in html_text
    assert "canvas://" not in html_text

    project = await client.post(
        f"/api/v1/reports/documents/{doc_id}/export?format=typst_zip",
        headers=headers,
        json={"source": source},
    )
    assert project.status_code == 200, project.text
    assert project.headers["content-type"].startswith("application/zip")
    assert project.headers["content-disposition"].endswith(".typst.zip\"")

    with zipfile.ZipFile(BytesIO(project.content)) as archive:
        names = archive.namelist()
        assert names[0] == "document.typ"
        assert all("/" not in name and chr(92) not in name for name in names)
        project_source = archive.read("document.typ").decode("utf-8")
        assert "asset://" not in project_source and "canvas://" not in project_source
        assert "H-42" in project_source and "Texto al final de la tabla" in project_source
        image_names = [name for name in names if name.startswith("report_asset_")]
        canvas_names = [name for name in names if name.startswith("canvas_")]
        assert len(image_names) == 1 and len(canvas_names) == 1
        assert image_names[0] in project_source and canvas_names[0] in project_source
        assert archive.read(image_names[0])
        assert svg in archive.read(canvas_names[0]).decode("utf-8")

        resources = {name: archive.read(name) for name in names if name != "document.typ"}
        compiled = compile_typst_source(project_source, output_format="pdf", extra_files=resources)
        assert compiled.ok, compiled.error
        assert compiled.pdf_bytes and compiled.pdf_bytes.startswith(b"%PDF-")


def test_typst_client_redaction_unwraps_markers_and_hides_sensitive_values():
    fake_token = ".".join(("eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxIn0", "signature"))
    source = (
        '= Evidencia\n'
        'IP: 192.168.1.23\n'
        f'Authorization: Bearer {fake_token}\n'
        'password = "mi-clave"\n'
        'IPv6: 2001:db8::1\n'
        'Nota: {{redact:secreto interno}}\n'
    )

    internal = prepare_typst_source(source)
    assert '192.168.1.23' in internal
    assert 'secreto interno' in internal
    assert '{{redact:' not in internal

    client_copy = prepare_typst_source(source, redact_for_client=True)
    assert '192.168.1.23' not in client_copy
    assert 'eyJhbGci' not in client_copy
    assert 'mi-clave' not in client_copy
    assert '2001:db8::1' not in client_copy
    assert 'secreto interno' not in client_copy
    assert '[IP CENSURADA]' in client_copy
    assert '[CENSURADO]' in client_copy


@pytest.mark.asyncio
async def test_typ_export_unwraps_editor_redaction_markers(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    created = await client.post(
        "/api/v1/reports/documents",
        headers=headers,
        json={"title": "Exportación Typst", "source": "= Informe"},
    )
    assert created.status_code == 201
    doc_id = created.json()["id"]

    exported = await client.post(
        f"/api/v1/reports/documents/{doc_id}/export?format=typ",
        headers=headers,
        json={"source": "= Informe\n\nDato: {{redact:secreto}}"},
    )
    assert exported.status_code == 200
    assert exported.text == "= Informe\n\nDato: secreto"


@pytest.mark.asyncio
async def test_report_recovery_is_encrypted_and_can_be_restored(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    created = await client.post(
        "/api/v1/reports/documents",
        headers=headers,
        json={"title": "Recuperación local", "source": "= Original"},
    )
    assert created.status_code == 201
    doc_id = created.json()["id"]
    source = "= Borrador sensible\n\nToken: dato privado."

    encrypted = await client.post(
        f"/api/v1/reports/documents/{doc_id}/recovery/encrypt",
        headers=headers,
        json={
            "title": "Borrador local",
            "status": "en_revision",
            "prospect_id": "prospect-local",
            "project_id": "project-local",
            "source": source,
        },
    )
    assert encrypted.status_code == 200
    ciphertext = encrypted.json()["ciphertext"]
    assert ciphertext.startswith("enc:v1:")
    assert source not in ciphertext

    restored = await client.post(
        f"/api/v1/reports/documents/{doc_id}/recovery/decrypt",
        headers=headers,
        json={"ciphertext": ciphertext},
    )
    assert restored.status_code == 200
    assert restored.json()["source"] == source
    assert restored.json()["title"] == "Borrador local"
    assert restored.json()["status"] == "en_revision"
    assert restored.json()["prospect_id"] == "prospect-local"
    assert restored.json()["project_id"] == "project-local"
    assert restored.json()["version"] == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("source_format", ["PNG", "AVIF"])
async def test_report_image_asset_is_encrypted_and_resolved_for_preview(client, auth_token, monkeypatch, source_format):
    headers = {"X-Vault-Token": auth_token}
    created = await client.post(
        "/api/v1/reports/documents",
        headers=headers,
        json={"title": "Imagen adjunta", "source": "= Documento"},
    )
    assert created.status_code == 201
    doc_id = created.json()["id"]

    image_bytes = BytesIO()
    Image.new("RGB", (2, 2), (32, 64, 96)).save(image_bytes, format=source_format)
    extension = source_format.lower()
    uploaded = await client.post(
        f"/api/v1/reports/documents/{doc_id}/assets",
        headers=headers,
        files={"file": (f"captura.{extension}", image_bytes.getvalue(), f"image/{extension}")},
    )
    assert uploaded.status_code == 201, uploaded.text
    asset = uploaded.json()
    assert asset["document_id"] == doc_id
    assert asset["exif_stripped"] is True
    assert asset["optimized_size_bytes"] > 0

    fetched = await client.get(
        f"/api/v1/reports/documents/{doc_id}/assets/{asset['id']}",
        headers=headers,
    )
    assert fetched.status_code == 200
    assert fetched.headers["cache-control"] == "no-store"
    assert fetched.headers["content-type"] == "image/webp"
    if source_format == "PNG":
        with Image.open(BytesIO(fetched.content)) as decoded:
            assert decoded.getpixel((0, 0)) == (32, 64, 96)

    captured = {}

    def fake_compile(source, output_format, extra_files):
        captured.update(source=source, output_format=output_format, extra_files=extra_files)
        return TypstCompileResult(ok=True, pages=["<svg></svg>"], pdf_bytes=None, error=None)

    monkeypatch.setattr("app.api.v1.reports.compile_typst_source", fake_compile)

    compiled = await client.post(
        "/api/v1/reports/documents/compile",
        headers=headers,
        json={
            "document_id": doc_id,
            "source": f'= Documento\n\n#figure(image("asset://{asset["id"]}", width: 80%), caption: [Captura])',
        },
    )
    assert compiled.status_code == 200
    assert compiled.json()["ok"] is True
    assert "asset://" not in captured["source"]
    assert captured["output_format"] == "svg"
    assert len(captured["extra_files"]) == 1
    resolved_image = next(iter(captured["extra_files"].values()))
    assert resolved_image.startswith(b"RIFF") or resolved_image.startswith(b"\x89PNG")


@pytest.mark.asyncio
async def test_report_canvas_asset_is_resolved_for_preview(client, auth_token, monkeypatch):
    headers = {"X-Vault-Token": auth_token}
    document = await client.post(
        "/api/v1/reports/documents",
        headers=headers,
        json={"title": "Lienzo adjunto", "source": "= Documento"},
    )
    assert document.status_code == 201
    doc_id = document.json()["id"]
    created = await client.post(
        "/api/v1/reports/canvases",
        headers=headers,
        json={"title": "Diagrama guardado", "element_count": 1, "svg_snapshot": "<svg><path d='M0 0'/></svg>"},
    )
    assert created.status_code == 201
    canvas_id = created.json()["id"]

    captured = {}

    def fake_compile(source, output_format, extra_files):
        captured.update(source=source, output_format=output_format, extra_files=extra_files)
        return TypstCompileResult(ok=True, pages=["<svg></svg>"], pdf_bytes=None, error=None)

    monkeypatch.setattr("app.api.v1.reports.compile_typst_source", fake_compile)
    compiled = await client.post(
        "/api/v1/reports/documents/compile",
        headers=headers,
        json={"document_id": doc_id, "source": f'#figure(image("canvas://{canvas_id}"))'},
    )
    assert compiled.status_code == 200
    assert compiled.json()["ok"] is True
    assert f"canvas_{canvas_id}.svg" in captured["source"]
    assert captured["extra_files"][f"canvas_{canvas_id}.svg"].startswith(b"<svg>")


@pytest.mark.asyncio
async def test_report_rejects_legacy_snapshot_for_empty_canvas(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    created = await client.post(
        "/api/v1/reports/canvases",
        headers=headers,
        json={"title": "Lienzo vacío", "element_count": 0, "svg_snapshot": "<svg/>"},
    )
    assert created.status_code == 201
    canvas_id = created.json()["id"]
    preview = await client.post(
        "/api/v1/reports/documents/compile",
        headers=headers,
        json={"source": f'#image("canvas://{canvas_id}")'},
    )
    assert preview.status_code == 422
    assert "está vacío" in preview.json()["detail"]
