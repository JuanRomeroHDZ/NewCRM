import json
import pytest
from app.services.typst_compiler import MAX_TYPST_SOURCE_CHARS, compile_typst_source


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
    assert json.loads(canvas["scene_json"])["elements"][0]["id"] == "el-1"

    listed = await client.get("/api/v1/reports/canvases", headers=headers)
    assert listed.status_code == 200
    assert any(item["id"] == canvas_id for item in listed.json())

    updated = await client.patch(
        f"/api/v1/reports/canvases/{canvas_id}",
        headers=headers,
        json={"title": "Topología Red v2", "element_count": 3},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Topología Red v2"
    assert updated.json()["element_count"] == 3

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
