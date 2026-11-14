import pytest
from fastapi import HTTPException

from app.middleware.request_limits import UploadRequestLimitMiddleware, read_upload_limited


def _http_scope(path: str, headers: list[tuple[bytes, bytes]] | None = None) -> dict:
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "headers": headers or [],
        "client": ("127.0.0.1", 12345),
        "server": ("test", 80),
        "root_path": "",
    }


@pytest.mark.asyncio
async def test_upload_limit_rejects_content_length_before_reading_body():
    received = False
    sent = []

    async def endpoint(scope, receive, send):
        await receive()

    async def receive():
        nonlocal received
        received = True
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    middleware = UploadRequestLimitMiddleware(
        endpoint,
        api_prefix="/api/v1",
        eml_max_bytes=10,
        asset_max_bytes=10,
        multipart_overhead_bytes=2,
    )
    await middleware(
        _http_scope(
            "/api/v1/comms/eml/sanitize",
            [(b"content-length", b"13")],
        ),
        receive,
        send,
    )

    assert received is False
    assert sent[0]["status"] == 413


@pytest.mark.asyncio
async def test_upload_limit_rejects_chunked_body_at_first_excess_chunk():
    chunks = iter((b"12345678", b"90123"))
    sent = []

    async def endpoint(scope, receive, send):
        while True:
            message = await receive()
            if not message.get("more_body"):
                break

    async def receive():
        try:
            chunk = next(chunks)
            return {"type": "http.request", "body": chunk, "more_body": True}
        except StopIteration:
            return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    middleware = UploadRequestLimitMiddleware(
        endpoint,
        api_prefix="/api/v1",
        eml_max_bytes=10,
        asset_max_bytes=10,
        multipart_overhead_bytes=2,
    )
    await middleware(_http_scope("/api/v1/comms/eml/sanitize"), receive, send)

    assert sent[0]["status"] == 413
    assert "límite".encode("utf-8") in sent[1]["body"]


@pytest.mark.asyncio
async def test_upload_reader_reads_only_one_byte_past_limit():
    observed_sizes = []

    class OversizedUpload:
        async def read(self, size=-1):
            observed_sizes.append(size)
            return b"123456789"

    with pytest.raises(HTTPException) as exc:
        await read_upload_limited(OversizedUpload(), 8)

    assert exc.value.status_code == 413
    assert observed_sizes == [9]
