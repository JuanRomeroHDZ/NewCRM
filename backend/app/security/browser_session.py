"""Browser session transport and CSRF verification."""
import hashlib
import hmac

from fastapi import HTTPException, Request, Response

from app.config import settings

SESSION_COOKIE = "__Host-lessso-session"
CSRF_COOKIE = "__Host-lessso-csrf"


def csrf_for_session(token: str) -> str:
    return hmac.new(settings.SERVER_SECRET_KEY.encode(), f"browser-csrf:{token}".encode(), hashlib.sha256).hexdigest()


def verify_cookie_login_origin(request: Request) -> None:
    if (request.headers.get("x-lessso-session-mode") == "cookie"
            and request.headers.get("sec-fetch-site", "same-origin") not in {"same-origin", "none"}):
        raise HTTPException(status_code=403, detail="Inicia sesión desde el mismo origen.")


def deliver_session(request: Request, response: Response, token: str) -> str | None:
    if request.headers.get("x-lessso-session-mode") != "cookie":
        return token
    response.set_cookie(SESSION_COOKIE, token, secure=True, httponly=True, samesite="strict", path="/")
    response.set_cookie(CSRF_COOKIE, csrf_for_session(token), secure=True, samesite="strict", path="/")
    return None


def request_session_token(request: Request) -> str | None:
    authorization = request.headers.get("authorization", "")
    if authorization.startswith("Bearer "):
        return authorization[7:].strip()
    token = request.cookies.get(SESSION_COOKIE)
    if token and request.method not in {"GET", "HEAD", "OPTIONS"}:
        header = request.headers.get("x-lessso-csrf", "")
        if not hmac.compare_digest(header.encode(), csrf_for_session(token).encode()):
            raise HTTPException(status_code=403, detail="No se pudo verificar el origen de la solicitud.")
    return token


def clear_browser_session(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, secure=True, httponly=True, samesite="strict", path="/")
    response.delete_cookie(CSRF_COOKIE, secure=True, samesite="strict", path="/")
