from hashlib import sha256

import pytest

from app.models.core import User
from app.services.core_auth import create_user_session


async def operator_headers(db_session, vault_token, role):
    user = User(
        username=role, email=f"{role}@example.test", full_name=role,
        hashed_password="unusable", role=role, is_active=True, must_change_password=False,
    )
    db_session.add(user)
    await db_session.commit()
    token, _ = await create_user_session(db_session, user)
    return {"X-Vault-Token": vault_token, "Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_protected_modules_require_identity_and_enforce_roles(client, db_session, vault_only_token):
    readonly = await operator_headers(db_session, vault_only_token, "readonly")
    seller = await operator_headers(db_session, vault_only_token, "seller")
    protected = ("/emails", "/platforms", "/finances/incomes", "/reports/documents", "/crm/proposals")
    for endpoint in (*protected, "/prospects"):
        response = await client.get(f"/api/v1{endpoint}", headers={"X-Vault-Token": vault_only_token})
        assert response.status_code == 401
        assert response.headers["X-Auth-Scope"] == "user"
    for endpoint in protected:
        assert (await client.get(f"/api/v1{endpoint}", headers=readonly)).status_code == 403
    assert (await client.get("/api/v1/prospects", headers=readonly)).status_code == 200
    assert (await client.post("/api/v1/prospects", headers=readonly, json={"company_name": "Consulta"})).status_code == 403
    assert (await client.get("/api/v1/finances/incomes", headers=seller)).status_code == 403


@pytest.mark.asyncio
async def test_proposal_to_sale_and_external_invoice(client, db_session, vault_only_token, monkeypatch):
    pdf = b"%PDF-1.7 proposal test"
    compiled_recipients = []

    def compile_fixture(proposal, *, recipient="", approval=False):
        if approval:
            return b"%PDF-1.7 approval test"
        compiled_recipients.append(recipient)
        return pdf

    monkeypatch.setattr("app.api.v1.crm_sales.proposal_pdf", compile_fixture)
    seller = await operator_headers(db_session, vault_only_token, "seller")
    owner = await operator_headers(db_session, vault_only_token, "owner")
    prospect = await client.post("/api/v1/prospects", headers=seller, json={"company_name": "Cliente ejemplo"})
    assert prospect.status_code == 200, prospect.text
    prospect_id = prospect.json()["id"]
    proposal = await client.post("/api/v1/crm/proposals", headers=seller, json={
        "prospect_id": prospect_id, "title": "Servicio anual", "amount": 1800, "currency": "MXN",
    })
    assert proposal.status_code == 200, proposal.text
    summary_url = f"/api/v1/crm/prospects/{prospect_id}/commercial"
    summary = (await client.get(summary_url, headers=seller)).json()
    assert [row["id"] for row in summary["proposals"]] == [proposal.json()["id"]]
    proposal_url = f"/api/v1/crm/proposals/{proposal.json()['id']}"
    sale_payload = {
        "prospect_id": prospect_id, "proposal_id": proposal.json()["id"], "company_name": "Cliente ejemplo",
        "title": "Servicio anual", "total_amount": 1800, "advance_payment": 300, "currency": "MXN",
    }
    sent_payload = {"recipient": "Ada Pérez", "channel": "whatsapp"}
    decision_payload = {
        "decision": "aceptada", "respondent": "Ada Pérez",
        "channel": "email", "evidence": "Mensaje con aprobación del folio",
    }
    assert (await client.post("/api/v1/crm/sales/close", headers=seller, json=sale_payload)).status_code == 400
    assert (await client.post(f"{proposal_url}/send", headers=seller, json=sent_payload)).status_code == 409
    assert (await client.post(f"{proposal_url}/decision", headers=seller, json=decision_payload)).status_code == 409
    prepared = await client.post(f"{proposal_url}/pdf", headers=seller)
    assert prepared.status_code == 200, prepared.text
    assert prepared.content == pdf
    assert prepared.headers["X-Export-SHA256"] == sha256(pdf).hexdigest()
    sent = await client.post(f"{proposal_url}/send", headers=seller, json=sent_payload)
    assert sent.json()["status"] == "enviada"
    assert "issued_pdf" not in sent.json()
    assert (await client.post(f"{proposal_url}/pdf", headers=seller)).content == pdf
    assert compiled_recipients == ["Cliente ejemplo"]
    assert (await client.get(f"{proposal_url}/approval", headers=seller)).status_code == 409
    accepted = await client.post(f"{proposal_url}/decision", headers=seller, json=decision_payload)
    assert accepted.json()["status"] == "aceptada"
    assert accepted.json()["responded_by"] == "seller"
    assert accepted.json()["response_evidence"] == decision_payload["evidence"]
    assert (await client.post(f"{proposal_url}/decision", headers=seller, json=decision_payload)).status_code == 409
    assert (await client.get(f"{proposal_url}/approval", headers=seller)).content == b"%PDF-1.7 approval test"
    assert (await client.post(
        "/api/v1/crm/sales/close", headers=seller, json={**sale_payload, "total_amount": 2000},
    )).status_code == 400
    closed = await client.post("/api/v1/crm/sales/close", headers=seller, json=sale_payload)
    assert closed.status_code == 200, closed.text
    assert closed.json()["balance_amount"] == 1500
    updated = await client.get(f"/api/v1/prospects/{prospect_id}", headers=seller)
    assert updated.json()["status"] == "cliente"
    invoice_payload = {
        "client_id": closed.json()["client_id"], "sale_id": closed.json()["sale_id"], "folio": "F-18",
        "uuid": "12345678-1234-1234-1234-123456789abc", "rfc": "XAXX010101000",
        "amount": 1800, "issue_date": "2026-11-18",
    }
    assert (await client.post("/api/v1/crm/invoices", headers=seller, json=invoice_payload)).status_code == 403
    invoice = await client.post("/api/v1/crm/invoices", headers=owner, json=invoice_payload)
    assert invoice.status_code == 200, invoice.text
    assert (await client.get(summary_url, headers=seller)).json()["invoices"] == []
    result = (await client.get(summary_url, headers=owner)).json()
    assert result["proposals"][0]["status"] == "aceptada"
    assert result["invoices"][0]["id"] == invoice.json()["id"]
    cancellation = await client.post(f"/api/v1/crm/invoices/{invoice.json()['id']}/cancel", headers=owner,
                                     json={"reason": "Cancelada en el sistema emisor"})
    assert cancellation.status_code == 200, cancellation.text
    assert (await client.get(summary_url, headers=owner)).json()["invoices"][0]["status"] == "cancelada"
