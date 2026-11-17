from datetime import datetime, timedelta, timezone

import pytest


@pytest.mark.asyncio
async def test_history_filters_metadata_without_loading_markdown_and_fetches_selected_revision(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    created = await client.post(
        "/api/v1/writeups",
        headers=headers,
        json={"title": "HTB Bastion", "markdown_content": "# Recon", "create_default_board": False},
    )
    assert created.status_code == 201
    writeup_id = created.json()["id"]
    lease = await client.post(
        f"/api/v1/writeups/{writeup_id}/edit-lease",
        headers=headers,
        json={"client_id": "history-test-editor-0001"},
    )
    assert lease.status_code == 200, lease.text
    headers = {
        **headers,
        "X-Writeup-Edit-Lease": lease.json()["token"],
        "X-Writeup-Client-ID": lease.json()["client_id"],
    }

    saved = await client.patch(
        f"/api/v1/writeups/{writeup_id}",
        headers=headers,
        json={
            "markdown_content": "# Recon\n\n## Retest\nExplotación validada.",
            "save_revision": True,
            "revision_note": "HTB retest antes de publicar",
            "revision_type": "milestone",
        },
    )
    assert saved.status_code == 200

    authors = await client.get(f"/api/v1/writeups/{writeup_id}/revisions/authors", headers=headers)
    assert authors.status_code == 200
    assert len(authors.json()) == 1
    author = authors.json()[0]
    assert author["id"] and author["name"]

    history = await client.get(
        f"/api/v1/writeups/{writeup_id}/revisions",
        headers=headers,
        params={
            "include_content": "false",
            "search": "retest",
            "change_type": "milestone",
            "author_id": author["id"],
            "limit": 10,
        },
    )
    assert history.status_code == 200
    assert len(history.json()) == 1
    item = history.json()[0]
    assert item["change_note"] == "HTB retest antes de publicar"
    assert item["change_type"] == "milestone"
    assert item["created_by_name"] == author["name"]
    assert item["markdown_content"] is None
    assert item["snapshot"] is None
    assert item["has_content"] is True

    cursor_page = await client.get(
        f"/api/v1/writeups/{writeup_id}/revisions",
        headers=headers,
        params={"before_revision_number": item["revision_number"], "include_content": "false"},
    )
    assert cursor_page.status_code == 200
    assert len(cursor_page.json()) == 1
    assert cursor_page.json()[0]["change_type"] == "initial"

    revision = await client.get(
        f"/api/v1/writeups/{writeup_id}/revisions/{item['id']}",
        headers=headers,
    )
    assert revision.status_code == 200
    assert "Explotación validada" in revision.json()["markdown_content"]
    assert revision.json()["snapshot"] is not None

    # The same revision ID cannot be fetched through a different report URL.
    other = await client.post(
        "/api/v1/writeups",
        headers=headers,
        json={"title": "HTB Other", "create_default_board": False},
    )
    cross_report = await client.get(
        f"/api/v1/writeups/{other.json()['id']}/revisions/{item['id']}",
        headers=headers,
    )
    assert cross_report.status_code == 404


@pytest.mark.asyncio
async def test_history_date_range_validation_and_search_escapes_like_metacharacters(client, auth_token):
    headers = {"X-Vault-Token": auth_token}
    created = await client.post(
        "/api/v1/writeups",
        headers=headers,
        json={"title": "HTB Search", "create_default_board": False},
    )
    assert created.status_code == 201
    writeup_id = created.json()["id"]

    wildcard = await client.get(
        f"/api/v1/writeups/{writeup_id}/revisions",
        headers=headers,
        params={"search": "%"},
    )
    assert wildcard.status_code == 200
    assert wildcard.json() == []

    start = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    end = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    invalid_range = await client.get(
        f"/api/v1/writeups/{writeup_id}/revisions",
        headers=headers,
        params={"created_after": end, "created_before": start},
    )
    assert invalid_range.status_code == 422

    invalid_pagination = await client.get(
        f"/api/v1/writeups/{writeup_id}/revisions",
        headers=headers,
        params={"offset": 1, "before_revision_number": 2},
    )
    assert invalid_pagination.status_code == 422
