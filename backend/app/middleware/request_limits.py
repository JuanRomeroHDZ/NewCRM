import json
import re
from typing import Any

from fastapi import HTTPException, status
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class RequestBodyTooLarge(Exception):
    pass


class UploadRequestLimitMiddleware:
    """Caps multipart bodies before parsing and spilling uploaded files to disk."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        api_prefix: str,
        eml_max_bytes: int,
        asset_max_bytes: int,
        multipart_overhead_bytes: int = 128 * 1024,
    ) -> None:
        self.app = app
        self.api_prefix = api_prefix.rstrip("/")
        self.multipart_overhead_bytes = multipart_overhead_bytes
        self.route_limits = {
            f"{self.api_prefix}/comms/eml/sanitize": eml_max_bytes,
        }
        self.asset_route = re.compile(
            rf"^{re.escape(self.api_prefix)}/writeups/[^/]+/assets$"
        )
        self.asset_max_bytes = asset_max_bytes

    def _body_limit(self, scope: Scope) -> int | None:
        if scope.get("method") != "POST":
            return None
        path = scope.get("path", "")
        file_limit = self.route_limits.get(path)
        if file_limit is None and self.asset_route.fullmatch(path):
            file_limit = self.asset_max_bytes
        if file_limit is None:
            return None
        return file_limit + self.multipart_overhead_bytes

    @staticmethod
    async def _send_too_large(send: Send) -> None:
        payload = json.dumps(
            {"detail": "El archivo supera el límite de carga permitido."},
            ensure_ascii=False,
        ).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json; charset=utf-8"),
                    (b"content-length", str(len(payload)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": payload})

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        limit = self._body_limit(scope)
        if scope.get("type") != "http" or limit is None:
            await self.app(scope, receive, send)
            return

        content_length = next(
            (value for key, value in scope.get("headers", []) if key.lower() == b"content-length"),
            None,
        )
        if content_length is not None:
            try:
                if int(content_length) > limit:
                    await self._send_too_large(send)
                    return
            except ValueError:
                pass

        received_bytes = 0
        response_started = False

        async def limited_receive() -> Message:
            nonlocal received_bytes
            message = await receive()
            if message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > limit:
                    raise RequestBodyTooLarge
            return message

        async def tracked_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracked_send)
        except RequestBodyTooLarge:
            if not response_started:
                await self._send_too_large(send)


async def read_upload_limited(upload: Any, max_bytes: int) -> bytes:
    """Reads only one byte past the configured limit to avoid unbounded memory use."""
    raw = await upload.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="El archivo supera el límite de carga permitido.",
        )
    return raw
