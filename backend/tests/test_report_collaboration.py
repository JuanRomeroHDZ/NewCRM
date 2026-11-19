import base64
import asyncio
import json
import socket
import uuid

import pytest
from contextlib import AsyncExitStack
from sqlalchemy import select
from websockets.asyncio.client import connect as websocket_connect
import uvicorn

from app.main import app
from app.database import engine
from app.models.core import User
from app.models.report_collaboration import ReportCollaborationPresence, ReportCollaborationState
from app.services.core_auth import create_user_session


async def receive_message_type(websocket, message_type: str) -> dict:
    for _ in range(20):
        message = json.loads(await asyncio.wait_for(websocket.recv(), timeout=5))
        if message.get("type") == message_type:
            return message
    raise AssertionError(f"No se recibió el mensaje WebSocket {message_type}.")


async def make_collaborator(db, username: str, role: str = "operator") -> tuple[str, str]:
    user = User(
        username=username,
        email=f"{username}@example.test",
        full_name=username.replace("_", " ").title(),
        hashed_password="unusable",
        role=role,
        is_active=True,
        must_change_password=False,
    )
    db.add(user)
    await db.commit()
    token, _ = await create_user_session(db, user)
    return user.id, token


def headers(user_token: str, vault_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {user_token}", "X-Vault-Token": vault_token}


@pytest.mark.asyncio
async def test_report_collaboration_acl_checkpoints_revisions_comments_and_review(client, db_session, auth_token):
    vault_token = auth_token
    owner_token = client.headers["Authorization"].removeprefix("Bearer ")
    owner_headers = headers(owner_token, vault_token)
    editor_id, editor_token = await make_collaborator(db_session, "report_editor")
    viewer_id, viewer_token = await make_collaborator(db_session, "report_viewer", role="readonly")
    reviewer_id, reviewer_token = await make_collaborator(db_session, "report_reviewer")
    _, unshared_token = await make_collaborator(db_session, "report_unshared")

    created = await client.post(
        "/api/v1/reports/documents",
        headers=owner_headers,
        json={"title": "Informe colaborativo", "status": "borrador", "source": "= Inicio\n\nTexto base."},
    )
    assert created.status_code == 201, created.text
    document_id = created.json()["id"]
    private_document = await client.post(
        "/api/v1/reports/documents",
        headers=owner_headers,
        json={"title": "Informe privado", "status": "borrador", "source": "= Privado"},
    )
    assert private_document.status_code == 201, private_document.text
    private_document_id = private_document.json()["id"]
    shared_canvas = await client.post(
        "/api/v1/reports/canvases", headers=owner_headers, json={"title": "Lienzo compartido"},
    )
    private_canvas = await client.post(
        "/api/v1/reports/canvases", headers=owner_headers, json={"title": "Lienzo privado"},
    )
    assert shared_canvas.status_code == 201, shared_canvas.text
    assert private_canvas.status_code == 201, private_canvas.text

    for collaborator_id, permission in ((editor_id, "editor"), (viewer_id, "viewer"), (reviewer_id, "reviewer")):
        response = await client.put(
            f"/api/v1/reports/collaboration/document/{document_id}/collaborators/{collaborator_id}",
            headers=owner_headers,
            json={"permission": permission},
        )
        assert response.status_code == 200, response.text
    share_canvas = await client.put(
        f"/api/v1/reports/collaboration/canvas/{shared_canvas.json()['id']}/collaborators/{viewer_id}",
        headers=owner_headers,
        json={"permission": "viewer"},
    )
    assert share_canvas.status_code == 200, share_canvas.text

    editor_headers = headers(editor_token, vault_token)
    viewer_headers = headers(viewer_token, vault_token)
    reviewer_headers = headers(reviewer_token, vault_token)
    unshared_headers = headers(unshared_token, vault_token)

    assert (await client.get(f"/api/v1/reports/collaboration/document/{document_id}/users", headers=owner_headers)).status_code == 200
    assert (await client.get(f"/api/v1/reports/collaboration/document/{document_id}/users", headers=editor_headers)).status_code == 404
    assert (await client.get(f"/api/v1/reports/documents/{document_id}", headers=editor_headers)).status_code == 200
    assert (await client.get(f"/api/v1/reports/documents/{document_id}", headers=unshared_headers)).status_code == 404
    viewer_documents = await client.get("/api/v1/reports/documents", headers=viewer_headers)
    assert viewer_documents.status_code == 200
    assert [item["id"] for item in viewer_documents.json()] == [document_id]
    viewer_canvases = await client.get("/api/v1/reports/canvases", headers=viewer_headers)
    assert viewer_canvases.status_code == 200
    assert [item["id"] for item in viewer_canvases.json()] == [shared_canvas.json()["id"]]
    assert (await client.get(f"/api/v1/reports/documents/{private_document_id}", headers=viewer_headers)).status_code == 404
    assert (await client.get(f"/api/v1/reports/canvases/{private_canvas.json()['id']}", headers=viewer_headers)).status_code == 404
    viewer_bootstrap = await client.post(
        f"/api/v1/reports/collaboration/document/{document_id}/bootstrap",
        headers=viewer_headers,
        json={"initial_state": base64.b64encode(b"viewer-cannot-seed").decode("ascii")},
    )
    assert viewer_bootstrap.status_code == 403, viewer_bootstrap.text
    assert (await client.patch(
        f"/api/v1/reports/documents/{document_id}", headers=viewer_headers,
        json={"title": "No autorizado"},
    )).status_code == 404

    initial_state = base64.b64encode(b"opaque-yjs-v1-state").decode("ascii")
    bootstrap = await client.post(
        f"/api/v1/reports/collaboration/document/{document_id}/bootstrap",
        headers=editor_headers,
        json={"initial_state": initial_state},
    )
    assert bootstrap.status_code == 200, bootstrap.text
    assert bootstrap.json()["permission"] == "editor"
    reviewer_list = await client.get(
        f"/api/v1/reports/collaboration/document/{document_id}/reviewers", headers=editor_headers,
    )
    assert reviewer_list.status_code == 200
    assert reviewer_id in {item["user_id"] for item in reviewer_list.json()}
    generation = bootstrap.json()["generation"]

    stale_checkpoint = await client.post(
        f"/api/v1/reports/collaboration/document/{document_id}/checkpoint",
        headers=editor_headers,
        json={
            "state": initial_state,
            "content": {"title": "Informe colaborativo", "status": "borrador", "source": "= Obsoleto"},
            "through_seq": 10,
            "generation": generation,
        },
    )
    assert stale_checkpoint.status_code == 409, stale_checkpoint.text

    saved = await client.post(
        f"/api/v1/reports/collaboration/document/{document_id}/checkpoint",
        headers=editor_headers,
        json={
            "state": initial_state,
            "content": {
                "title": "Informe colaborativo",
                "status": "borrador",
                "source": "= Versión de equipo\n\nContenido compartido.",
            },
            "through_seq": 0,
            "generation": generation,
            "create_revision": True,
            "revision_reason": "manual",
        },
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["revision"] == 2
    state_record = await db_session.execute(
        select(ReportCollaborationState).where(
            ReportCollaborationState.resource_id == document_id,
        )
    )
    assert state_record.scalar_one().encrypted_state != initial_state

    legacy_write = await client.patch(
        f"/api/v1/reports/documents/{document_id}",
        headers=editor_headers,
        json={"source": "= Sobrescritura antigua"},
    )
    assert legacy_write.status_code == 409
    stored = (await client.get(f"/api/v1/reports/documents/{document_id}", headers=editor_headers)).json()
    assert stored["source"] == "= Versión de equipo\n\nContenido compartido."

    revisions = await client.get(
        f"/api/v1/reports/collaboration/document/{document_id}/revisions", headers=viewer_headers,
    )
    assert revisions.status_code == 200
    assert len(revisions.json()) == 2
    current_revision = revisions.json()[0]
    revision = revisions.json()[1]
    comparison = await client.get(
        f"/api/v1/reports/collaboration/document/{document_id}/revisions/{revision['id']}/diff",
        headers=editor_headers,
    )
    assert comparison.status_code == 200
    assert "Versión de equipo" in comparison.json()["diff"]

    comment = await client.post(
        f"/api/v1/reports/collaboration/document/{document_id}/comments",
        headers=viewer_headers,
        json={"body": "Revisar esta sección.", "anchor": json.dumps({"kind": "typst-range", "start": "YWJj", "end": "ZGVm"})},
    )
    assert comment.status_code == 201, comment.text
    comment_id = comment.json()["id"]
    resolved = await client.patch(
        f"/api/v1/reports/collaboration/document/{document_id}/comments/{comment_id}/resolution?resolved=true",
        headers=viewer_headers,
    )
    assert resolved.status_code == 200
    assert resolved.json()["resolved"] is True

    review = await client.post(
        f"/api/v1/reports/collaboration/document/{document_id}/reviews",
        headers=editor_headers,
        json={"revision_id": current_revision["id"], "reviewer_ids": [reviewer_id]},
    )
    assert review.status_code == 201, review.text
    review_id = (await client.get(
        f"/api/v1/reports/collaboration/document/{document_id}/reviews", headers=reviewer_headers,
    )).json()[0]["id"]
    response = await client.patch(
        f"/api/v1/reports/collaboration/document/{document_id}/reviews/{review_id}",
        headers=reviewer_headers,
        json={"status": "approved", "note": "Aprobado."},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "approved"

    restored = await client.post(
        f"/api/v1/reports/collaboration/document/{document_id}/revisions/{revision['id']}/restore",
        headers=owner_headers,
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["generation"] == generation + 1
    assert (await client.get(f"/api/v1/reports/documents/{document_id}", headers=owner_headers)).json()["source"] == "= Inicio\n\nTexto base."
    assert restored.json()["new_revision"] == 3


@pytest.mark.asyncio
async def test_three_editor_websockets_relay_updates_and_deduplicate_retries(client, db_session, auth_token):
    vault_token = auth_token
    owner_token = client.headers["Authorization"].removeprefix("Bearer ")
    owner_headers = headers(owner_token, vault_token)
    operators = [await make_collaborator(db_session, f"relay_editor_{index}") for index in range(3)]
    created = await client.post(
        "/api/v1/reports/documents",
        headers=owner_headers,
        json={"title": "Relay compartido", "status": "borrador", "source": "= Relay"},
    )
    assert created.status_code == 201, created.text
    document_id = created.json()["id"]
    for user_id, _ in operators:
        shared = await client.put(
            f"/api/v1/reports/collaboration/document/{document_id}/collaborators/{user_id}",
            headers=owner_headers,
            json={"permission": "editor"},
        )
        assert shared.status_code == 200, shared.text

    initial = base64.b64encode(b"opaque-state").decode("ascii")
    bootstrap = await client.post(
        f"/api/v1/reports/collaboration/document/{document_id}/bootstrap",
        headers=owner_headers,
        json={"initial_state": initial},
    )
    assert bootstrap.status_code == 200, bootstrap.text
    generation = bootstrap.json()["generation"]
    identities = [(owner_headers, None)] + [(headers(token, vault_token), user_id) for user_id, token in operators]
    tickets = []
    for user_headers, _ in identities:
        ticket = await client.post(f"/api/v1/reports/collaboration/document/{document_id}/ticket", headers=user_headers)
        assert ticket.status_code == 200, ticket.text
        tickets.append(ticket.json()["ticket"])

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    sock.listen()
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(
        app, host="127.0.0.1", port=port, log_level="critical", access_log=False, lifespan="off",
    ))
    server_task = asyncio.create_task(server.serve(sockets=[sock]))
    try:
        for _ in range(100):
            if server.started:
                break
            await asyncio.sleep(0.02)
        assert server.started, "El servidor WebSocket desechable no inició."
        async with AsyncExitStack() as sockets:
            connections = []
            for ticket in tickets:
                connection = await sockets.enter_async_context(websocket_connect(
                    f"ws://127.0.0.1:{port}/api/v1/reports/collaboration/ws",
                    origin=f"https://127.0.0.1:{port}",
                    subprotocols=["lessso-collab", f"lessso-collab.{ticket}"],
                    open_timeout=5,
                ))
                sync = await receive_message_type(connection, "sync")
                assert sync["generation"] == generation
                connections.append(connection)

            # Presence identity is bound to the authenticated session, so one
            # editor cannot overwrite another editor's client identity.
            shared_presence_id = "presence-client-owned-by-editor"
            presence_update = {"type": "awareness", "client_id": shared_presence_id,
                               "update": base64.b64encode(b"opaque-awareness").decode("ascii")}
            await connections[1].send(json.dumps(presence_update))
            for _ in range(100):
                presence_row = await db_session.scalar(select(ReportCollaborationPresence).where(
                    ReportCollaborationPresence.resource_type == "document",
                    ReportCollaborationPresence.resource_id == document_id,
                    ReportCollaborationPresence.client_id == shared_presence_id,
                ))
                if presence_row is not None:
                    break
                await asyncio.sleep(0.01)
            assert presence_row is not None
            assert presence_row.user_id == operators[0][0]
            await connections[0].send(json.dumps(presence_update))
            spoof_denial = await receive_message_type(connections[0], "error")
            assert "pertenece a otra sesión" in spoof_denial["detail"]
            await db_session.refresh(presence_row)
            assert presence_row.user_id == operators[0][0]

            update_id = str(uuid.uuid4())
            update = {"type": "update", "update_id": update_id, "generation": generation,
                      "update": base64.b64encode(b"independent-editor-change").decode("ascii")}
            await connections[1].send(json.dumps(update))
            first_ack = await receive_message_type(connections[1], "ack")
            assert first_ack["update_id"] == update_id
            for recipient in (connections[0], connections[2]):
                relayed = await receive_message_type(recipient, "update")
                assert relayed["update"] == update["update"]
                assert relayed["seq"] == first_ack["seq"]

            # Retrying the same update after a lost acknowledgement is idempotent.
            await connections[1].send(json.dumps(update))
            retry_ack = await receive_message_type(connections[1], "ack")
            assert retry_ack["seq"] == first_ack["seq"]

            concurrent_retry = {**update, "update_id": str(uuid.uuid4())}
            await asyncio.gather(
                connections[1].send(json.dumps(concurrent_retry)),
                connections[2].send(json.dumps(concurrent_retry)),
            )
            concurrent_acks = await asyncio.gather(
                receive_message_type(connections[1], "ack"),
                receive_message_type(connections[2], "ack"),
            )
            assert concurrent_acks[0]["seq"] == concurrent_acks[1]["seq"]

            reconnect_ticket = await client.post(
                f"/api/v1/reports/collaboration/document/{document_id}/ticket", headers=owner_headers,
            )
            assert reconnect_ticket.status_code == 200
            async with websocket_connect(
                f"ws://127.0.0.1:{port}/api/v1/reports/collaboration/ws",
                origin=f"https://127.0.0.1:{port}",
                subprotocols=["lessso-collab", f"lessso-collab.{reconnect_ticket.json()['ticket']}"],
                open_timeout=5,
            ) as reconnected:
                reconnect_state = await receive_message_type(reconnected, "sync")
                assert any(item["update_id"] == update_id for item in reconnect_state["updates"])

            # A demoted editor cannot write through an already-open socket.
            demoted_id, _ = operators[1]
            demotion = await client.put(
                f"/api/v1/reports/collaboration/document/{document_id}/collaborators/{demoted_id}",
                headers=owner_headers,
                json={"permission": "viewer"},
            )
            assert demotion.status_code == 200
            denied_update = {**update, "update_id": str(uuid.uuid4())}
            await connections[2].send(json.dumps(denied_update))
            denial = await receive_message_type(connections[2], "error")
            assert "permiso de edición" in denial["detail"]
    finally:
        server.should_exit = True
        await server_task
        await engine.dispose()

