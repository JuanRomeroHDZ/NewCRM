import pytest
import time
import jwt
from app.config import settings
from app.security.tokens import (
    create_vault_token,
    verify_vault_token,
    revoke_vault_token,
    get_vault_remaining_seconds
)
from app.security.sessions import session_manager

def test_token_creation_and_verification():
    key = b"1" * 32
    token = create_vault_token(timeout_minutes=5, encryption_key=key)
    assert token is not None
    assert verify_vault_token(token) is True
    assert get_vault_remaining_seconds(token) > 0

def test_token_revocation():
    key = b"2" * 32
    token = create_vault_token(timeout_minutes=5, encryption_key=key)
    assert verify_vault_token(token) is True

    # Revoke session
    revoked = revoke_vault_token(token)
    assert revoked is True
    # Once revoked, verify must immediately fail
    assert verify_vault_token(token) is False
    assert get_vault_remaining_seconds(token) == 0

def test_invalid_and_expired_token():
    assert verify_vault_token(None) is False
    assert verify_vault_token("invalid.jwt.token") is False
    assert verify_vault_token("") is False


def test_revocation_rejects_forged_token():
    token = create_vault_token(timeout_minutes=5, encryption_key=b"3" * 32)
    payload = jwt.decode(token, settings.SERVER_SECRET_KEY, algorithms=["HS256"])
    forged = jwt.encode(payload, "clave-ficticia-diferente-para-prueba-123", algorithm="HS256")
    assert revoke_vault_token(forged) is False
    assert verify_vault_token(token) is True
    assert revoke_vault_token(token) is True
