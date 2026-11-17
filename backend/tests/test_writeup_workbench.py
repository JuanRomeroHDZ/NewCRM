import pytest


@pytest.mark.asyncio
async def test_workbench_persists_redacts_exports_and_shares_snippets(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    report = await client.post(
        "/api/v1/writeups",
        headers=headers,
        json={
            "title": "Prueba del laboratorio",
            "findings": [{"id": "finding-1", "title": "Exposición de servicio"}],
            "workbench": {
                "machines": [{
                    "id": "machine-1",
                    "name": "Máquina de laboratorio",
                    "target": "10.10.10.5",
                    "status": "en_progreso",
                    "questions": [{"id": "question-1", "question": "¿Qué servicio responde?", "answer": "SSH", "status": "respondida"}],
                    "steps": [{"id": "step-1", "text": "Revisar versión", "status": "pendiente"}],
                }],
                "evidence": [{
                    "id": "evidence-1",
                    "title": "Enumeración inicial",
                    "target": "10.10.10.5",
                    "captured_at": "2026-11-16T12:00:00Z",
                    "command": "curl -H 'Authorization: redact-this-command' https://10.10.10.5",
                    "result": "password=redact-this-result",
                    "finding_ids": ["finding-1"],
                    "redact_command": True,
                    "redact_result": True,
                    "redact_target": True,
                }],
            },
        },
    )
    assert report.status_code == 201, report.text
    report_id = report.json()["id"]
    saved = report.json()["workbench"]
    assert saved["machines"][0]["questions"][0]["answer"] == "SSH"
    assert saved["machines"][0]["steps"][0]["status"] == "pendiente"
    assert saved["evidence"][0]["finding_ids"] == ["finding-1"]
    assert saved["evidence"][0]["target"] == "10.10.10.5"
    assert saved["evidence"][0]["redact_target"] is True

    client_export = await client.post(
        f"/api/v1/writeups/{report_id}/export",
        headers=headers,
        json={"format": "md", "redact_for_client": True, "include_watermark": False, "include_toc": False},
    )
    assert client_export.status_code == 200, client_export.text
    assert b"redact-this-command" not in client_export.content
    assert b"redact-this-result" not in client_export.content
    assert b"10.10.10.5" not in client_export.content
    assert b"- Objetivo: \\[CENSURADO\\]" in client_export.content
    assert client_export.content.count(b"[CENSURADO]") == 2

    internal_export = await client.post(
        f"/api/v1/writeups/{report_id}/export",
        headers=headers,
        json={"format": "md", "redact_for_client": False, "include_watermark": False, "include_toc": False},
    )
    assert internal_export.status_code == 200, internal_export.text
    assert b"redact-this-command" in internal_export.content
    assert b"redact-this-result" in internal_export.content

    template = "nmap -p {{puerto}} {{ip}}; echo 'literal, no se ejecuta'"
    created_snippet = await client.post(
        "/api/v1/writeups/snippets",
        headers=headers,
        json={"name": "Enumeración básica", "template": template},
    )
    assert created_snippet.status_code == 201, created_snippet.text
    snippet_id = created_snippet.json()["id"]
    assert created_snippet.json()["template"] == template
    listed_snippets = await client.get("/api/v1/writeups/snippets", headers=headers)
    assert listed_snippets.status_code == 200
    assert any(item["id"] == snippet_id and item["template"] == template for item in listed_snippets.json())

    updated_snippet = await client.patch(
        f"/api/v1/writeups/snippets/{snippet_id}",
        headers=headers,
        json={"name": "Enumeración validada"},
    )
    assert updated_snippet.status_code == 200
    assert updated_snippet.json()["name"] == "Enumeración validada"
    assert updated_snippet.json()["template"] == template

    deleted_snippet = await client.delete(f"/api/v1/writeups/snippets/{snippet_id}", headers=headers)
    assert deleted_snippet.status_code == 204

    persisted_report = await client.get(f"/api/v1/writeups/{report_id}", headers=headers)
    assert persisted_report.status_code == 200
    assert persisted_report.json()["workbench"] == saved
