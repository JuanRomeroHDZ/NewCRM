import json
from io import BytesIO
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


def test_typst_client_redaction_unwraps_markers_and_hides_sensitive_values():
    source = (
        '= Evidencia\n'
        'IP: 192.168.1.23\n'
        'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature\n'
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
async def test_report_image_asset_is_encrypted_and_resolved_for_preview(client, auth_token, monkeypatch):
    headers = {"X-Vault-Token": auth_token}
    created = await client.post(
        "/api/v1/reports/documents",
        headers=headers,
        json={"title": "Imagen adjunta", "source": "= Documento"},
    )
    assert created.status_code == 201
    doc_id = created.json()["id"]

    image_bytes = BytesIO()
    Image.new("RGB", (2, 2), (32, 64, 96)).save(image_bytes, format="PNG")
    uploaded = await client.post(
        f"/api/v1/reports/documents/{doc_id}/assets",
        headers=headers,
        files={"file": ("captura.png", image_bytes.getvalue(), "image/png")},
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
        json={"title": "Diagrama guardado", "svg_snapshot": "<svg><path d='M0 0'/></svg>"},
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
