from app.security.crypto import NOTE_ENC_PREFIX, active_vault_key, decrypt_note, encrypt_note
from app.services.writeup_service import (
    REVISION_PAYLOAD_MARKER,
    decrypt_revision_text,
    encrypt_revision_text,
)


def test_revision_payloads_compress_before_encryption_and_round_trip():
    context = active_vault_key.set(b"w" * 32)
    try:
        text = "# HTB Writeup\n\n" + "## Enumeración\nSalida de Nmap repetida.\n" * 12000
        encrypted = encrypt_revision_text(text)

        assert encrypted and encrypted.startswith(NOTE_ENC_PREFIX)
        assert len(encrypted) < len(encrypt_note(text)) // 8
        assert decrypt_revision_text(encrypted) == text
    finally:
        active_vault_key.reset(context)


def test_revision_reader_accepts_legacy_cipher_and_escapes_marker_lookalikes():
    context = active_vault_key.set(b"w" * 32)
    try:
        legacy = "# Old revision\n" + "content " * 500
        assert decrypt_revision_text(encrypt_note(legacy)) == legacy

        user_text = REVISION_PAYLOAD_MARKER + "raw:this is ordinary user Markdown\n" * 20
        assert decrypt_revision_text(encrypt_revision_text(user_text)) == user_text
    finally:
        active_vault_key.reset(context)


def test_plaintext_that_looks_like_an_encrypted_prefix_is_still_encrypted():
    context = active_vault_key.set(b"w" * 32)
    try:
        user_text = "enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        encrypted = encrypt_note(user_text)
        assert encrypted and encrypted != user_text
        assert user_text not in encrypted
        assert decrypt_note(encrypted) == user_text
    finally:
        active_vault_key.reset(context)
