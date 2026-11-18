import hashlib
import io
import json
import zipfile
import docx
from docx.enum.section import WD_SECTION_START
from httpx import ASGITransport, AsyncClient
from PIL import Image
import pytest
from datetime import timedelta
from sqlalchemy import func, select
from app.models.core import User
from app.main import app
from app.models.writeups import Writeup, WriteupAsset, WriteupRevision
from app.models.writeups import WriteupEditLock
from app.models import utc_now
from app.security.crypto import BYTES_ENC_PREFIX, NOTE_ENC_PREFIX, hash_master_password
from app.services.core_auth import create_user_session


def _make_jpeg_with_exif(width: int = 2400, height: int = 1200) -> bytes:
    img = Image.new("RGB", (width, height), color=(32, 64, 128))
    exif = Image.Exif()
    exif[271] = "TestCameraMaker"  # Make
    exif[272] = "LabDevice"  # Model
    exif[305] = "PrivateCameraSoftware"  # Software
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif, quality=92)
    return buf.getvalue()


async def _lease_headers(client, writeup_id: str, headers: dict[str, str], client_id: str = "writeup-test-editor-0001") -> dict[str, str]:
    response = await client.post(
        f"/api/v1/writeups/{writeup_id}/edit-lease",
        headers=headers,
        json={"client_id": client_id},
    )
    assert response.status_code == 200, response.text
    return {
        **headers,
        "X-Writeup-Edit-Lease": response.json()["token"],
        "X-Writeup-Client-ID": client_id,
    }


@pytest.mark.asyncio
async def test_manual_writeup_lock_is_persistent_but_does_not_block_reading_or_preview(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    created = await client.post("/api/v1/writeups", headers=headers, json={"title": "Informe bloqueado", "markdown_content": "# Evidencia"})
    assert created.status_code == 201
    writeup_id = created.json()["id"]
    headers = await _lease_headers(client, writeup_id, headers)

    locked = await client.post(f"/api/v1/writeups/{writeup_id}/manual-lock", headers=headers)
    assert locked.status_code == 200
    assert locked.json()["manual_locked"] is True

    revoked = await client.post("/api/v1/auth/lock", headers={"X-Vault-Token": auth_token})
    assert revoked.status_code == 200
    second_vault = await client.post("/api/v1/auth/unlock", json={"master_password": "MasterPasswordTest123!"})
    assert second_vault.status_code == 200
    second_headers = {"X-Vault-Token": second_vault.json()["token"]}
    # A vault-only lock has no durable user identity; reopening the vault
    # rotates its token, so another valid unlocked vault can release it.
    other_unlock = await client.delete(f"/api/v1/writeups/{writeup_id}/manual-lock", headers=second_headers)
    assert other_unlock.status_code == 200
    relocked = await client.post(f"/api/v1/writeups/{writeup_id}/manual-lock", headers=second_headers)
    assert relocked.status_code == 200
    revoked_again = await client.post("/api/v1/auth/lock", headers=second_headers)
    assert revoked_again.status_code == 200
    third_vault = await client.post("/api/v1/auth/unlock", json={"master_password": "MasterPasswordTest123!"})
    assert third_vault.status_code == 200
    other_headers = {"X-Vault-Token": third_vault.json()["token"]}

    detail = await client.get(f"/api/v1/writeups/{writeup_id}", headers=other_headers)
    assert detail.status_code == 200
    assert detail.json()["manual_locked"] is True
    assert detail.json()["markdown_content"] == "# Evidencia"
    preview = await client.post(f"/api/v1/writeups/{writeup_id}/preview", headers=other_headers)
    assert preview.status_code == 200
    export = await client.post(
        f"/api/v1/writeups/{writeup_id}/export",
        headers=other_headers,
        json={"format": "json", "font_size_pt": 18},
    )
    assert export.status_code == 200

    for invalid_font_size in (7, 19):
        invalid_export = await client.post(
            f"/api/v1/writeups/{writeup_id}/export",
            headers=other_headers,
            json={"format": "json", "font_size_pt": invalid_font_size},
        )
        assert invalid_export.status_code == 422

    blocked = await client.patch(f"/api/v1/writeups/{writeup_id}", headers=other_headers, json={"title": "No debe cambiar"})
    assert blocked.status_code == 423
    assert "bloqueado" in blocked.json()["detail"].lower()
    blocked_board = await client.post(
        f"/api/v1/writeups/{writeup_id}/boards",
        headers=other_headers,
        json={"title": "No debe crear", "scene_json": "{}", "element_count": 0},
    )
    assert blocked_board.status_code == 423
    blocked_delete = await client.delete(f"/api/v1/writeups/{writeup_id}", headers=other_headers)
    assert blocked_delete.status_code == 423

    unlocked = await client.delete(f"/api/v1/writeups/{writeup_id}/manual-lock", headers=other_headers)
    assert unlocked.status_code == 200 and unlocked.json()["manual_locked"] is False
    headers = await _lease_headers(client, writeup_id, other_headers)
    updated = await client.patch(f"/api/v1/writeups/{writeup_id}", headers=headers, json={"title": "Edición permitida"})
    assert updated.status_code == 200
    assert updated.json()["title"] == "Edición permitida"


@pytest.mark.asyncio
async def test_writeup_edit_lease_is_exclusive_and_release_and_expiry_reopen_editing(client, db_session, auth_token):
    base_headers = {"X-Vault-Token": auth_token}
    created = await client.post("/api/v1/writeups", headers=base_headers, json={"title": "Informe con reserva"})
    assert created.status_code == 201
    writeup_id = created.json()["id"]

    unreserved_write = await client.patch(f"/api/v1/writeups/{writeup_id}", headers=base_headers, json={"title": "Sin reserva"})
    assert unreserved_write.status_code == 423

    first = await client.post(f"/api/v1/writeups/{writeup_id}/edit-lease", headers=base_headers, json={"client_id": "editor-tab-a-0001"})
    assert first.status_code == 200
    first_lease = first.json()
    assert first_lease["ttl_seconds"] == 90
    assert first_lease["token"]

    reload_recovery = await client.post(
        f"/api/v1/writeups/{writeup_id}/edit-lease",
        headers=base_headers,
        json={"client_id": first_lease["client_id"]},
    )
    assert reload_recovery.status_code == 200
    assert reload_recovery.json()["token"] != first_lease["token"]
    first_lease = reload_recovery.json()

    stale_token_recovery = await client.post(
        f"/api/v1/writeups/{writeup_id}/edit-lease",
        headers={**base_headers, "X-Writeup-Edit-Lease": "stale-token", "X-Writeup-Client-ID": first_lease["client_id"]},
        json={"client_id": first_lease["client_id"]},
    )
    assert stale_token_recovery.status_code == 200
    assert stale_token_recovery.json()["token"] != first_lease["token"]
    first_lease = stale_token_recovery.json()

    other_tab_renew = await client.post(
        f"/api/v1/writeups/{writeup_id}/edit-lease",
        headers={**base_headers, "X-Writeup-Client-ID": "editor-tab-b-0002"},
        json={"client_id": "editor-tab-b-0002"},
    )
    assert other_tab_renew.status_code == 423

    legitimate_renew = await client.post(
        f"/api/v1/writeups/{writeup_id}/edit-lease",
        headers={**base_headers, "X-Writeup-Edit-Lease": first_lease["token"], "X-Writeup-Client-ID": first_lease["client_id"]},
        json={"client_id": first_lease["client_id"]},
    )
    assert legitimate_renew.status_code == 200
    first_lease = legitimate_renew.json()

    second = await client.post(f"/api/v1/writeups/{writeup_id}/edit-lease", headers=base_headers, json={"client_id": "editor-tab-b-0002"})
    assert second.status_code == 423
    assert "reservado" in second.json()["detail"].lower()

    second_vault = await client.post("/api/v1/auth/unlock", json={"master_password": "MasterPasswordTest123!"})
    assert second_vault.status_code == 200
    other_session_headers = {"X-Vault-Token": second_vault.json()["token"]}
    other_session_renew = await client.post(
        f"/api/v1/writeups/{writeup_id}/edit-lease",
        headers=other_session_headers,
        json={"client_id": "editor-tab-a-0001"},
    )
    assert other_session_renew.status_code == 423

    blocked = await client.patch(f"/api/v1/writeups/{writeup_id}", headers=base_headers, json={"title": "Sin reserva"})
    assert blocked.status_code == 423

    first_headers = {**base_headers, "X-Writeup-Edit-Lease": first_lease["token"], "X-Writeup-Client-ID": first_lease["client_id"]}
    updated = await client.patch(f"/api/v1/writeups/{writeup_id}", headers=first_headers, json={"title": "Con reserva"})
    assert updated.status_code == 200
    assert (await client.get(f"/api/v1/writeups/{writeup_id}", headers=base_headers)).status_code == 200

    released = await client.delete(f"/api/v1/writeups/{writeup_id}/edit-lease", headers=first_headers)
    assert released.status_code == 200 and released.json()["released"] is True
    second = await client.post(f"/api/v1/writeups/{writeup_id}/edit-lease", headers=other_session_headers, json={"client_id": "editor-tab-b-0002"})
    assert second.status_code == 200

    lock_row = await db_session.get(WriteupEditLock, writeup_id)
    lock_row.lease_expires_at = utc_now() - timedelta(seconds=1)
    await db_session.commit()
    expired_lease_write = await client.patch(f"/api/v1/writeups/{writeup_id}", headers=base_headers, json={"title": "Reserva vencida"})
    assert expired_lease_write.status_code == 423
    after_expiry = await _lease_headers(client, writeup_id, other_session_headers, "writeup-test-editor-0003")
    reacquired_write = await client.patch(f"/api/v1/writeups/{writeup_id}", headers=after_expiry, json={"title": "Reserva renovada"})
    assert reacquired_write.status_code == 200


def test_writeup_router_has_no_put_mutation_without_lock_guard():
    writeup_routes = [route for route in app.routes if getattr(route, "path", "").startswith("/api/v1/writeups")]
    assert not any("PUT" in getattr(route, "methods", set()) for route in writeup_routes)


@pytest.mark.asyncio
async def test_writeup_title_limits_accept_200_and_reject_invalid_without_partial_rows(client, db_session, auth_token):
    headers = {"X-Vault-Token": auth_token}
    valid = await client.post(
        "/api/v1/writeups",
        headers=headers,
        json={"title": "Informe " + "A" * 192, "create_default_board": False},
    )
    assert valid.status_code == 201
    assert len(valid.json()["title"]) == 200

    for title in ("A", "A" * 201, " " * 200):
        rejected = await client.post(
            "/api/v1/writeups",
            headers=headers,
            json={"title": title, "create_default_board": False},
        )
        assert rejected.status_code == 422

    count = await db_session.scalar(select(func.count(Writeup.id)))
    assert count == 1


@pytest.mark.asyncio
async def test_writeup_finding_limits_accept_boundaries_and_reject_overflow(client, db_session, auth_token):
    headers = {"X-Vault-Token": auth_token}
    boundary_finding = {
        "id": "I" * 64,
        "title": "T" * 200,
        "cvss_vector": "V" * 128,
        "cwe_id": "C" * 32,
        "cve_id": "E" * 64,
        "affected_target": "h" * 255,
        "summary": "S" * 4000,
        "remediation": "R" * 4000,
    }
    accepted = await client.post(
        "/api/v1/writeups",
        headers=headers,
        json={"title": "Informe de límites", "findings": [boundary_finding], "create_default_board": False},
    )
    assert accepted.status_code == 201

    for field, overflow in (
        ("id", "I" * 65),
        ("title", "T" * 201),
        ("cvss_vector", "V" * 129),
        ("cwe_id", "C" * 33),
        ("cve_id", "E" * 65),
        ("affected_target", "h" * 256),
        ("summary", "S" * 4001),
        ("remediation", "R" * 4001),
    ):
        finding = {**boundary_finding, field: overflow}
        rejected = await client.post(
            "/api/v1/writeups",
            headers=headers,
            json={"title": "Informe de límites", "findings": [finding], "create_default_board": False},
        )
        assert rejected.status_code == 422, field

    count = await db_session.scalar(select(func.count(Writeup.id)))
    assert count == 1


@pytest.mark.asyncio
async def test_writeup_allows_200_findings_and_rejects_201_without_partial_rows(client, db_session, auth_token):
    headers = {"X-Vault-Token": auth_token}
    findings = [{"id": f"F-{index}", "title": "Hallazgo de prueba"} for index in range(200)]
    accepted = await client.post(
        "/api/v1/writeups",
        headers=headers,
        json={"title": "Informe con 200 hallazgos", "findings": findings, "create_default_board": False},
    )
    assert accepted.status_code == 201
    assert len(accepted.json()["findings"]) == 200

    rejected = await client.post(
        "/api/v1/writeups",
        headers=headers,
        json={
            "title": "Informe con 201 hallazgos",
            "findings": findings + [{"id": "F-extra", "title": "Exceso"}],
            "create_default_board": False,
        },
    )
    assert rejected.status_code == 422
    count = await db_session.scalar(select(func.count(Writeup.id)))
    assert count == 1


@pytest.mark.asyncio
async def test_writeups_crud_encryption_and_revisions(client, db_session, auth_token):
    headers = {"X-Vault-Token": auth_token}

    unauth = await client.get("/api/v1/writeups")
    assert unauth.status_code == 401

    create_res = await client.post(
        "/api/v1/writeups",
        headers=headers,
        json={
            "title": "SQL Injection en Portal Pagos",
            "severity": "alta",
            "cvss_score": 8.6,
            "cwe_id": "CWE-89",
            "target_scope": "https://pagos.ejemplo.local",
            "tags": ["sqli", "api"],
            "executive_summary": "Se identificó inyección SQL ciega en el parámetro `order_id`.",
            "markdown_content": "# Hallazgo {#sqli-1}\n\nEl parámetro {{redact:SECRET_API_KEY_99}} es vulnerable.\n",
            "findings": [
                {
                    "id": "F-01",
                    "title": "Blind SQLi en /api/orders",
                    "severity": "alta",
                    "cvss_score": 8.6,
                    "cwe_id": "CWE-89",
                    "affected_target": "https://pagos.ejemplo.local/api/orders",
                    "status": "abierta",
                    "summary": "Token expuesto: {{redact:SECRET_API_KEY_99}}",
                    "remediation": "Usar consultas parametrizadas.",
                }
            ],
        },
    )
    assert create_res.status_code == 201
    created = create_res.json()
    writeup_id = created["id"]
    headers = await _lease_headers(client, writeup_id, headers)
    assert len(created["boards"]) == 1

    # Verify encryption at rest in DB
    db_row = (await db_session.execute(select(Writeup).where(Writeup.id == writeup_id))).scalar_one()
    assert db_row.encrypted_markdown.startswith(NOTE_ENC_PREFIX)
    assert "SECRET_API_KEY_99" not in db_row.encrypted_markdown

    # Update with new revision and verify revision history + restore
    patch_res = await client.patch(
        f"/api/v1/writeups/{writeup_id}",
        headers=headers,
        json={
            "markdown_content": "# Hallazgo {#sqli-1}\n\nTexto modificado.\n",
            "save_revision": True,
            "revision_note": "Segunda iteración",
        },
    )
    assert patch_res.status_code == 200

    revs_res = await client.get(f"/api/v1/writeups/{writeup_id}/revisions", headers=headers)
    assert revs_res.status_code == 200
    revs = revs_res.json()
    assert len(revs) == 2

    oldest_rev_id = revs[-1]["id"]
    restore_res = await client.post(
        f"/api/v1/writeups/{writeup_id}/revisions/{oldest_rev_id}/restore",
        headers=headers,
    )
    assert restore_res.status_code == 200
    assert "SECRET_API_KEY_99" in restore_res.json()["markdown_content"]


@pytest.mark.asyncio
async def test_revision_restores_metadata_findings_boards_and_prior_state(client, db_session, auth_token):
    headers = {"X-Vault-Token": auth_token}
    created = (await client.post("/api/v1/writeups", headers=headers, json={"title": "Original", "markdown_content": "# Original", "severity": "alta"})).json()
    wid = created["id"]
    headers = await _lease_headers(client, wid, headers)
    bid = created["boards"][0]["id"]
    board = await client.patch(f"/api/v1/writeups/{wid}/boards/{bid}", headers=headers, json={"title": "Mapa original", "scene_json": '{"elements":[]}'})
    assert board.status_code == 200
    citation = await client.post(f"/api/v1/writeups/{wid}/citations", headers=headers, json={"board_id": bid, "anchor_id": "anchor-1", "quoted_text": "Original"})
    assert citation.status_code == 201
    upload = await client.post(f"/api/v1/writeups/{wid}/assets", headers=headers, files={"file": ("capture.jpg", _make_jpeg_with_exif(40, 40), "image/jpeg")})
    assert upload.status_code == 201
    aid = upload.json()["id"]
    saved = await client.patch(f"/api/v1/writeups/{wid}", headers=headers, json={"title": "Versión completa", "severity": "critica", "findings": [{"id": "F1", "title": "Hallazgo secreto", "severity": "alta", "status": "abierta"}], "markdown_content": "# Primera", "save_revision": True})
    assert saved.status_code == 200
    revisions = (await client.get(f"/api/v1/writeups/{wid}/revisions", headers=headers)).json()
    target = revisions[0]
    stored = (await db_session.execute(select(WriteupRevision).where(WriteupRevision.id == target["id"]))).scalar_one()
    assert stored.encrypted_snapshot.startswith(NOTE_ENC_PREFIX)
    assert "Hallazgo secreto" not in stored.encrypted_snapshot
    assert (await client.patch(f"/api/v1/writeups/{wid}/boards/{bid}", headers=headers, json={"title": "Mapa cambiado"})).status_code == 200
    assert (await client.delete(f"/api/v1/writeups/{wid}/citations/{citation.json()['id']}", headers=headers)).status_code == 204
    assert (await client.delete(f"/api/v1/writeups/{wid}/assets/{aid}", headers=headers)).status_code == 204
    assert (await client.patch(f"/api/v1/writeups/{wid}", headers=headers, json={"title": "Cambio posterior", "markdown_content": "# Cambio"})).status_code == 200
    restored = await client.post(f"/api/v1/writeups/{wid}/revisions/{target['id']}/restore", headers=headers)
    assert restored.status_code == 200, restored.text
    data = restored.json()
    assert data["title"] == "Versión completa"
    assert data["severity"] == "critica"
    assert data["findings"][0]["title"] == "Hallazgo secreto"
    assert data["boards"][0]["id"] == bid and data["boards"][0]["title"] == "Mapa original"
    assert data["citations"][0]["id"] == citation.json()["id"]
    assert data["citations"][0]["board_id"] == bid
    assert data["assets"][0]["id"] == aid
    assert (await client.get(f"/api/v1/writeups/{wid}/assets/{aid}", headers=headers)).status_code == 200
    history = (await client.get(f"/api/v1/writeups/{wid}/revisions", headers=headers)).json()
    prior = next(item for item in history if item["change_note"] == "Antes de restaurar")
    assert prior["snapshot"]["fields"]["title"] == "Cambio posterior"
    assert (await client.get(f"/api/v1/writeups/{wid}/revisions?limit=1&offset=1", headers=headers)).json()[0]["id"] == history[1]["id"]

    # A legacy row only contains Markdown; restoring it must leave newer fields intact.
    legacy = (await db_session.execute(select(WriteupRevision).where(WriteupRevision.id == target["id"]))).scalar_one()
    legacy.encrypted_snapshot = None
    await db_session.commit()
    assert (await client.patch(f"/api/v1/writeups/{wid}", headers=headers, json={"title": "No reemplazar"})).status_code == 200
    legacy_restore = await client.post(f"/api/v1/writeups/{wid}/revisions/{target['id']}/restore", headers=headers)
    assert legacy_restore.status_code == 200
    assert legacy_restore.json()["title"] == "No reemplazar"
    assert legacy_restore.json()["markdown_content"] == "# Primera"


@pytest.mark.asyncio
async def test_writeup_asset_optimization_exif_strip_and_encryption(client, db_session, auth_token):
    headers = {"X-Vault-Token": auth_token}
    create_res = await client.post(
        "/api/v1/writeups",
        headers=headers,
        json={"title": "Prueba de Evidencia Visual", "markdown_content": "# Evidencias\n"},
    )
    writeup_id = create_res.json()["id"]
    headers = await _lease_headers(client, writeup_id, headers)

    # Reject non-image spoofed payload
    bad_upload = await client.post(
        f"/api/v1/writeups/{writeup_id}/assets",
        headers=headers,
        files={"file": ("evil.png", b"<script>alert(1)</script>", "image/png")},
    )
    assert bad_upload.status_code == 400

    # Upload oversized JPEG with EXIF GPS metadata -> must resize, strip EXIF, convert to WebP & encrypt
    raw_jpeg = _make_jpeg_with_exif(width=2400, height=1200)
    up_res = await client.post(
        f"/api/v1/writeups/{writeup_id}/assets",
        headers=headers,
        files={"file": ("captura campo.jpg", raw_jpeg, "image/jpeg")},
        data={"caption": "Consola Burp"},
    )
    assert up_res.status_code == 201
    asset_meta = up_res.json()
    assert asset_meta["mime_type"] == "image/webp"
    assert asset_meta["width"] <= 1920
    assert asset_meta["height"] <= 960
    assert asset_meta["exif_stripped"] is True

    db_asset = (await db_session.execute(select(WriteupAsset).where(WriteupAsset.id == asset_meta["id"]))).scalar_one()
    assert db_asset.encrypted_blob.startswith(BYTES_ENC_PREFIX)

    # Fetch decrypted asset binary and confirm EXIF Make/GPS tags are completely stripped
    bin_res = await client.get(f"/api/v1/writeups/{writeup_id}/assets/{asset_meta['id']}", headers=headers)
    assert bin_res.status_code == 200
    assert bin_res.headers["content-type"] == "image/webp"
    with Image.open(io.BytesIO(bin_res.content)) as out_img:
        assert len(out_img.getexif()) == 0


@pytest.mark.asyncio
async def test_writeup_board_xss_citations_and_multi_format_exports(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    md_text = (
        "# Vector SSRF {#ssrf-anchor}\n\n"
        "El endpoint reenvía cabeceras internas con llave {{redact:INTERNAL_JWT_XYZ}}.\n\n"
        "<script>alert('xss')</script>\n\n"
        "![SsrfExternal](http://169.254.169.254/latest/meta-data/)\n"
    )
    create_res = await client.post(
        "/api/v1/writeups",
        headers=headers,
        json={
            "title": "SSRF y Diagrama Red Interna",
            "severity": "critica",
            "cvss_score": 9.3,
            "markdown_content": md_text,
            "findings": [
                {
                    "id": "SSRF-1",
                    "title": "=cmd|' /C calc'!A0",
                    "severity": "critica",
                    "cvss_score": 9.3,
                    "affected_target": "https://api.cliente.local/fetch",
                    "summary": "Fuga de {{redact:INTERNAL_JWT_XYZ}}",
                }
            ],
        },
    )
    assert create_res.status_code == 201
    detail = create_res.json()
    writeup_id = detail["id"]
    board_id = detail["boards"][0]["id"]
    headers = await _lease_headers(client, writeup_id, headers)

    # Attach an image asset so exports embed both asset:// and board://
    up_res = await client.post(
        f"/api/v1/writeups/{writeup_id}/assets",
        headers=headers,
        files={"file": ("proof.jpg", _make_jpeg_with_exif(640, 360), "image/jpeg")},
    )
    asset_id = up_res.json()["id"]
    updated_md = md_text + f"\n![Evidencia](asset://{asset_id})\n![Mapa](board://{board_id})\n"
    await client.patch(f"/api/v1/writeups/{writeup_id}", headers=headers, json={"markdown_content": updated_md})

    # Update board with malicious SVG containing script & onload -> must sanitize
    board_res = await client.patch(
        f"/api/v1/writeups/{writeup_id}/boards/{board_id}",
        headers=headers,
        json={
            "title": "Topología Pivot",
            "scene_json": json.dumps({"elements": [{"id": "rect-1", "type": "rectangle"}]}),
            "svg_snapshot": '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" onload="alert(1)"><script>alert(2)</script><rect width="200" height="80"/></svg>',
            "element_count": 1,
        },
    )
    assert board_res.status_code == 200
    assert "<script" not in board_res.json()["svg_snapshot"]
    assert "onload" not in board_res.json()["svg_snapshot"]

    # Create citation & verify stale detection works dynamically
    cit_res = await client.post(
        f"/api/v1/writeups/{writeup_id}/citations",
        headers=headers,
        json={
            "board_id": board_id,
            "anchor_id": "ssrf-anchor",
            "board_element_id": "rect-1",
            "heading_path": "# Vector SSRF",
            "line_start": 3,
            "line_end": 3,
            "quoted_text": "El endpoint reenvía cabeceras internas con llave {{redact:INTERNAL_JWT_XYZ}}.",
            "color": "#ef4444",
        },
    )
    assert cit_res.status_code == 201
    assert cit_res.json()["is_stale"] is False

    # Preview XSS sanitized & client redaction checks
    preview_res = await client.post(f"/api/v1/writeups/{writeup_id}/preview?redact_for_client=true", headers=headers)
    assert preview_res.status_code == 200
    preview_html = preview_res.json()["sanitized_html"]
    assert "<script>" not in preview_html
    assert "INTERNAL_JWT_XYZ" not in preview_html
    assert "[REDACTED]" in preview_html

    # Test all export formats cleanly
    html_res = await client.post(
        f"/api/v1/writeups/{writeup_id}/export",
        headers=headers,
        json={"format": "html", "redact_for_client": True},
    )
    assert html_res.status_code == 200
    assert b"<script>" not in html_res.content
    assert b"INTERNAL_JWT_XYZ" not in html_res.content
    assert b"[REDACTED]" in html_res.content
    assert b'aria-label="Portada del informe"' in html_res.content
    assert html_res.content.index(b'aria-label="Portada del informe"') < html_res.content.index(b'<main class="markdown-body">')

    zip_res = await client.post(
        f"/api/v1/writeups/{writeup_id}/export",
        headers=headers,
        json={"format": "md_zip", "redact_for_client": False},
    )
    assert zip_res.status_code == 200
    with zipfile.ZipFile(io.BytesIO(zip_res.content), "r") as zf:
        names = zf.namelist()
        assert any(n.endswith(".md") for n in names)
        assert any(n.startswith("assets/") and n.endswith(".webp") for n in names)
        assert any(n.startswith("boards/") and n.endswith(".svg") for n in names)
        assert "manifest.json" in names

    docx_res = await client.post(
        f"/api/v1/writeups/{writeup_id}/export",
        headers=headers,
        json={"format": "docx", "redact_for_client": True},
    )
    assert docx_res.status_code == 200
    assert docx_res.content[:2] == b"PK"
    document = docx.Document(io.BytesIO(docx_res.content))
    assert len(document.sections) == 2
    assert document.sections[1].start_type == WD_SECTION_START.NEW_PAGE
    with zipfile.ZipFile(io.BytesIO(docx_res.content)) as document_zip:
        document_xml = document_zip.read("word/document.xml")
        assert b"INFORME DE SEGURIDAD" in document_xml
        assert b"INTERNAL_JWT_XYZ" not in document_xml

    pdf_res = await client.post(
        f"/api/v1/writeups/{writeup_id}/export",
        headers=headers,
        json={"format": "pdf", "redact_for_client": True},
    )
    assert pdf_res.status_code == 200
    assert pdf_res.content[:5] == b"%PDF-"

    sarif_res = await client.post(
        f"/api/v1/writeups/{writeup_id}/export",
        headers=headers,
        json={"format": "sarif", "redact_for_client": True},
    )
    assert sarif_res.status_code == 200
    sarif_json = json.loads(sarif_res.content.decode("utf-8"))
    assert sarif_json["version"] == "2.1.0"
    assert "INTERNAL_JWT_XYZ" not in sarif_res.text

    csv_res = await client.post(
        f"/api/v1/writeups/{writeup_id}/export",
        headers=headers,
        json={"format": "csv", "redact_for_client": True},
    )
    assert csv_res.status_code == 200
    assert "'=cmd" in csv_res.text

    # Now mutate markdown quote -> verify citation becomes stale!
    await client.patch(
        f"/api/v1/writeups/{writeup_id}",
        headers=headers,
        json={"markdown_content": "# Vector SSRF {#ssrf-anchor}\n\nTexto reescrito sin la cita original.\n"},
    )
    detail_after = (await client.get(f"/api/v1/writeups/{writeup_id}", headers=headers)).json()
    assert detail_after["citations"][0]["is_stale"] is True
    assert len(detail_after["export_logs"]) >= 5


@pytest.mark.asyncio
async def test_writeups_rbac_blocks_readonly_user(client, db_session, auth_token):
    viewer = User(
        username="viewer_user",
        email="viewer@lessso.local",
        full_name="Readonly Viewer",
        role="readonly",
        hashed_password=hash_master_password("ViewerPass123!"),
        is_active=True,
    )
    db_session.add(viewer)
    await db_session.commit()
    viewer_token, _ = await create_user_session(db_session, viewer)

    denied = await client.get(
        "/api/v1/writeups",
        headers={"X-Vault-Token": auth_token, "Authorization": f"Bearer {viewer_token}"},
    )
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_writeups_preserved_across_vault_rekey(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    created = await client.post(
        "/api/v1/writeups",
        headers=headers,
        json={"title": "Writeup Rekey", "markdown_content": "# Secreto {#rk-1}\n\nPayload secreto\n"},
    )
    assert created.status_code == 201
    wid = created.json()["id"]
    headers = await _lease_headers(client, wid, headers)
    up = await client.post(
        f"/api/v1/writeups/{wid}/assets",
        headers=headers,
        files={"file": ("shot.jpg", _make_jpeg_with_exif(320, 240), "image/jpeg")},
    )
    assert up.status_code == 201
    aid = up.json()["id"]

    rekey_res = await client.put(
        "/api/v1/settings",
        headers=headers,
        json={"current_master_password": "MasterPasswordTest123!", "new_master_password": "NewMasterPassword456!"},
    )
    assert rekey_res.status_code == 200
    new_unlock = await client.post("/api/v1/auth/unlock", json={"master_password": "NewMasterPassword456!"})
    assert new_unlock.status_code == 200
    new_headers = {"X-Vault-Token": new_unlock.json()["token"]}

    detail_res = await client.get(f"/api/v1/writeups/{wid}", headers=new_headers)
    assert detail_res.status_code == 200
    assert "Payload secreto" in detail_res.json()["markdown_content"]
    img_res = await client.get(f"/api/v1/writeups/{wid}/assets/{aid}", headers=new_headers)
    assert img_res.status_code == 200
    assert img_res.headers["content-type"] == "image/webp"


@pytest.mark.asyncio
async def test_writeup_animated_gif_preserved_and_video_conversion(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    created = await client.post(
        "/api/v1/writeups",
        headers=headers,
        json={
            "title": "PoC Animado GIF & HTML",
            "markdown_content": "# Demo {#demo}\n\n<details><summary>Payload</summary><kbd>Ctrl+V</kbd> <mark>XSS</mark></details>\n",
        },
    )
    assert created.status_code == 201
    wid = created.json()["id"]
    headers = await _lease_headers(client, wid, headers)

    # Build a 3-frame animated GIF and verify animation & metadata stripping are preserved
    frames = [
        Image.new("RGB", (320, 200), (15, 23, 42)),
        Image.new("RGB", (320, 200), (99, 102, 241)),
        Image.new("RGB", (320, 200), (16, 185, 129)),
    ]
    gif_buf = io.BytesIO()
    frames[0].save(
        gif_buf,
        format="GIF",
        save_all=True,
        append_images=frames[1:],
        duration=[90, 90, 90],
        loop=0,
        comment=b"GPS_SECRET_COMMENT",
    )
    up_gif = await client.post(
        f"/api/v1/writeups/{wid}/assets",
        headers=headers,
        files={"file": ("exploit.gif", gif_buf.getvalue(), "image/gif")},
    )
    assert up_gif.status_code == 201
    gif_meta = up_gif.json()
    assert gif_meta["mime_type"] == "image/gif"

    dl_gif = await client.get(f"/api/v1/writeups/{wid}/assets/{gif_meta['id']}", headers=headers)
    assert dl_gif.status_code == 200
    assert b"GPS_SECRET_COMMENT" not in dl_gif.content
    with Image.open(io.BytesIO(dl_gif.content)) as dec_gif:
        assert getattr(dec_gif, "is_animated", False) is True
        assert getattr(dec_gif, "n_frames", 1) == 3

    # Attempting convert-to-gif on an image asset must return 400
    non_video_conv = await client.post(
        f"/api/v1/writeups/{wid}/assets/{gif_meta['id']}/convert-to-gif",
        headers=headers,
    )
    assert non_video_conv.status_code == 400

    # HTML export preserves safe details/kbd/mark tags cleanly
    exp_html = await client.post(
        f"/api/v1/writeups/{wid}/export",
        headers=headers,
        json={"format": "html", "redact_for_client": False},
    )
    assert exp_html.status_code == 200
    assert b"<details>" in exp_html.content and b"<kbd>" in exp_html.content and b"<mark>" in exp_html.content

    # End-to-end MP4 upload + FFmpeg Video -> Animated GIF conversion + PDF/DOCX safety
    import shutil, subprocess, tempfile
    ffmpeg_bin = shutil.which("ffmpeg")
    if ffmpeg_bin:
        with tempfile.TemporaryDirectory() as tmpdir:
            mp4_path = f"{tmpdir}/poc.mp4"
            subprocess.run(
                [ffmpeg_bin, "-y", "-f", "lavfi", "-i", "color=c=blue:s=160x120:d=1", "-pix_fmt", "yuv420p", mp4_path],
                check=True,
                capture_output=True,
            )
            with open(mp4_path, "rb") as f:
                mp4_bytes = f.read()
        up_vid = await client.post(
            f"/api/v1/writeups/{wid}/assets",
            headers=headers,
            files={"file": ("poc.mp4", mp4_bytes, "video/mp4")},
        )
        assert up_vid.status_code == 201
        vid_id = up_vid.json()["id"]
        assert up_vid.json()["mime_type"] == "video/mp4"

        conv_res = await client.post(
            f"/api/v1/writeups/{wid}/assets/{vid_id}/convert-to-gif?fps=6&max_width=240",
            headers=headers,
        )
        assert conv_res.status_code == 201
        assert conv_res.json()["mime_type"] == "image/gif"


@pytest.mark.asyncio
async def test_writeup_rendered_mermaid_export_and_clone(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    mermaid_src = "flowchart LR\n  A[Attacker] --> B[WAF]"
    diag_hash = hashlib.sha256(mermaid_src.encode("utf-8")).hexdigest()
    dirty_svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80" width="240" height="80">'
        '<script>alert(1)</script>'
        '<rect x="10" y="10" width="220" height="60" rx="8" fill="#1e293b" onclick="alert(2)"/>'
        '<text x="24" y="45" fill="#f8fafc">Attacker to WAF</text>'
        '</svg>'
    )
    created = await client.post(
        "/api/v1/writeups",
        headers=headers,
        json={
            "title": "Mermaid Export & Clone Target",
            "severity": "alta",
            "cvss_score": 7.5,
            "cwe_id": "CWE-918",
            "target_scope": "api.acme.local",
            "tags": ["ssrf", "waf"],
            "markdown_content": f"# Flujo\n\n```mermaid\n{mermaid_src}\n```\n",
            "findings": [
                {
                    "id": "F-10",
                    "title": "SSRF en webhook",
                    "severity": "alta",
                    "cvss_score": 7.5,
                    "status": "abierta",
                    "summary": "Bypass de filtros",
                    "remediation": "Validar DNS y bloquear rangos internos",
                }
            ],
        },
    )
    assert created.status_code == 201
    wid = created.json()["id"]

    # Export HTML, PDF, DOCX, MD_ZIP with pre-rendered SVG diagram (XSS must be stripped)
    for fmt in ("html", "pdf", "docx", "md_zip"):
        exp = await client.post(
            f"/api/v1/writeups/{wid}/export",
            headers=headers,
            json={"format": fmt, "rendered_diagrams": {diag_hash: dirty_svg}},
        )
        assert exp.status_code == 200
        assert len(exp.content) > 100
        if fmt == "html":
            text_html = exp.content.decode("utf-8")
            assert "data:image/svg+xml;base64," in text_html
            assert "<script" not in text_html
        elif fmt == "md_zip":
            with zipfile.ZipFile(io.BytesIO(exp.content)) as zf:
                diag_files = [n for n in zf.namelist() if n.startswith("diagrams/diagram_")]
                assert len(diag_files) == 1
                diag_xml = zf.read(diag_files[0]).decode("utf-8")
                assert "<script" not in diag_xml
                assert "onclick" not in diag_xml

    # Clone writeup into fresh draft preserving findings, boards, and markdown
    cloned = await client.post(
        f"/api/v1/writeups/{wid}/clone",
        headers=headers,
        json={"title": "Plantilla SSRF Reutilizable"},
    )
    assert cloned.status_code == 201
    cjson = cloned.json()
    assert cjson["id"] != wid
    assert cjson["title"] == "Plantilla SSRF Reutilizable"
    assert cjson["status"] == "borrador"
    assert len(cjson["findings"]) == 1
    assert len(cjson["boards"]) == 1
    assert "flowchart LR" in cjson["markdown_content"]




@pytest.mark.asyncio
async def test_concurrent_editor_cannot_overwrite_or_restore_newer_report(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    created = await client.post("/api/v1/writeups", headers=headers, json={
        "title": "Informe concurrente", "markdown_content": "Original", "create_default_board": False,
    })
    assert created.status_code == 201
    report = created.json()
    report_id = report["id"]
    headers = await _lease_headers(client, report_id, headers)
    original_version = report["updated_at"]
    first = await client.patch(f"/api/v1/writeups/{report_id}", headers=headers, json={
        "expected_updated_at": original_version, "markdown_content": "Cambios de la primera sesión",
    })
    assert first.status_code == 200
    stale = await client.patch(f"/api/v1/writeups/{report_id}", headers=headers, json={
        "expected_updated_at": original_version, "markdown_content": "Cambios obsoletos",
    })
    assert stale.status_code == 409
    revisions = await client.get(f"/api/v1/writeups/{report_id}/revisions", headers=headers)
    restore = await client.post(
        f"/api/v1/writeups/{report_id}/revisions/{revisions.json()[-1]['id']}/restore",
        headers=headers, params={"expected_updated_at": original_version},
    )
    assert restore.status_code == 409
    current = await client.get(f"/api/v1/writeups/{report_id}", headers=headers)
    assert current.json()["markdown_content"] == "Cambios de la primera sesión"
    assert (await client.patch(f"/api/v1/writeups/{report_id}", headers=headers, json={
        "expected_updated_at": current.json()["updated_at"], "markdown_content": "Edición posterior",
    })).status_code == 200


@pytest.mark.asyncio
async def test_two_writeup_sessions_reject_stale_board_citation_and_evidence_mutations(client, auth_token):
    """Parent updated_at is an atomic token shared by every mutable writeup resource."""
    headers = {"X-Vault-Token": auth_token}
    created = await client.post("/api/v1/writeups", headers=headers, json={
        "title": "Informe con recursos concurrentes", "markdown_content": "# Evidencia\nTexto citado {#evidence}",
        "create_default_board": True,
    })
    assert created.status_code == 201
    report = created.json()
    report_id = report["id"]
    board_id = report["boards"][0]["id"]
    headers = await _lease_headers(client, report_id, headers)
    stale_version = report["updated_at"]

    # Separate HTTP clients model two browsers that loaded the same report version.
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as second_session:
        fresh = await client.patch(
            f"/api/v1/writeups/{report_id}/boards/{board_id}",
            headers=headers,
            json={"expected_updated_at": stale_version, "title": "Mapa actualizado"},
        )
        assert fresh.status_code == 200
        current_version = fresh.json()["writeup_updated_at"]
        assert current_version != stale_version

        stale_citation = await second_session.post(
            f"/api/v1/writeups/{report_id}/citations",
            headers=headers,
            json={
                "expected_updated_at": stale_version, "board_id": board_id, "anchor_id": "evidence",
                "line_start": 2, "line_end": 2, "quoted_text": "Texto citado",
            },
        )
        assert stale_citation.status_code == 409

        stale_board_delete = await second_session.delete(
            f"/api/v1/writeups/{report_id}/boards/{board_id}",
            headers=headers,
            params={"expected_updated_at": stale_version},
        )
        assert stale_board_delete.status_code == 409

        stale_evidence_upload = await second_session.post(
            f"/api/v1/writeups/{report_id}/assets",
            headers=headers,
            data={"expected_updated_at": stale_version},
            files={"file": ("capture.jpg", b"stale request must fail before processing", "image/jpeg")},
        )
        assert stale_evidence_upload.status_code == 409

        accepted = await second_session.post(
            f"/api/v1/writeups/{report_id}/citations",
            headers=headers,
            json={
                "expected_updated_at": current_version, "board_id": board_id, "anchor_id": "evidence",
                "line_start": 2, "line_end": 2, "quoted_text": "Texto citado",
            },
        )
        assert accepted.status_code == 201
        assert accepted.json()["writeup_updated_at"] != current_version

    # The active editor lease is required across all child-resource mutation routes.
    legacy_board = await client.post(
        f"/api/v1/writeups/{report_id}/boards", headers=headers,
        json={"title": "Pizarra de cliente antiguo"},
    )
    assert legacy_board.status_code == 201
    detail = await client.get(f"/api/v1/writeups/{report_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["updated_at"] == legacy_board.json()["writeup_updated_at"]
    assert all(board["writeup_updated_at"] == detail.json()["updated_at"] for board in detail.json()["boards"])
