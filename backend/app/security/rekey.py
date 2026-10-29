"""Cambio transaccional de clave para los datos cifrados actuales."""

import base64
import json

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models import (
    ClientIncome, DomainRenewal, EmailAccount, InternalProject, OneTimeExpense,
    PasswordHistory, PaymentMethod, PlatformAccount, Prospect, SecureResource, UserSettings,
)
from app.security.crypto import NOTE_ENC_PREFIX, encrypt_note, encrypt_secret, get_server_seed_key


class RekeyError(Exception):
    """Un dato no puede verificarse y el cambio completo debe cancelarse."""


SECRET_FIELDS = {
    EmailAccount: ("encrypted_password",),
    PlatformAccount: ("encrypted_password", "encrypted_pin", "encrypted_recovery_codes", "encrypted_totp_secret"),
    PaymentMethod: ("encrypted_card_number",),
    PasswordHistory: ("encrypted_password",),
}
NOTE_FIELDS = {
    EmailAccount: ("notes",), PlatformAccount: ("notes",), PaymentMethod: ("billing_notes",),
    Prospect: ("notes",), ClientIncome: ("notes",), DomainRenewal: ("notes",),
    OneTimeExpense: ("notes",), InternalProject: ("notes",), SecureResource: ("notes", "encrypted_content"),
}
MODELS = tuple(dict.fromkeys((*SECRET_FIELDS, *NOTE_FIELDS)))


def _decrypt_verified(value: str, old_key: bytes) -> str:
    try:
        raw = base64.b64decode(value, validate=True)
        if len(raw) < 28:
            raise ValueError
        for key in dict.fromkeys((old_key, get_server_seed_key())):
            try:
                return AESGCM(key).decrypt(raw[:12], raw[12:], None).decode("utf-8")
            except (InvalidTag, UnicodeDecodeError):
                continue
    except (ValueError, TypeError):
        pass
    raise RekeyError("No se pudo verificar un dato cifrado.")


def _rekey_secret(value: str | None, old_key: bytes, new_key: bytes) -> str | None:
    if not value:
        return value
    return encrypt_secret(_decrypt_verified(value, old_key), key=new_key)


def _rekey_note(value: str | None, old_key: bytes, new_key: bytes) -> str | None:
    if not value:
        return value
    plain = _decrypt_verified(value[len(NOTE_ENC_PREFIX):], old_key) if value.startswith(NOTE_ENC_PREFIX) else value
    return encrypt_note(plain, key=new_key)


def _rekey_items(value: str | None, key_name: str, old_key: bytes, new_key: bytes, *, flagged: bool = False) -> str | None:
    if not value:
        return value
    try:
        items = json.loads(value)
        if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
            raise ValueError
        for item in items:
            if item.get(key_name) and (not flagged or item.get("is_encrypted")):
                item[key_name] = _rekey_secret(item[key_name], old_key, new_key)
        return json.dumps(items, ensure_ascii=False)
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise RekeyError("No se pudo verificar una colección cifrada.") from exc


async def rekey_vault(db: AsyncSession, old_key: bytes, new_key: bytes) -> None:
    if len(old_key) != 32 or len(new_key) != 32:
        raise RekeyError("No se pudo verificar la clave de la bóveda.")

    if db.bind and db.bind.dialect.name == "postgresql":
        tables = sorted({model.__tablename__ for model in (*MODELS, UserSettings)})
        await db.execute(text("LOCK TABLE " + ", ".join('"' + table + '"' for table in tables) + " IN SHARE ROW EXCLUSIVE MODE"))

    for model in MODELS:
        rows = (await db.execute(select(model))).scalars().all()
        for row in rows:
            for field in SECRET_FIELDS.get(model, ()):
                setattr(row, field, _rekey_secret(getattr(row, field), old_key, new_key))
            for field in NOTE_FIELDS.get(model, ()):
                setattr(row, field, _rekey_note(getattr(row, field), old_key, new_key))
            if model is EmailAccount:
                row.encrypted_backup_codes = _rekey_items(row.encrypted_backup_codes, "code", old_key, new_key, flagged=True)
                row.encrypted_security_questions = _rekey_items(row.encrypted_security_questions, "answer", old_key, new_key, flagged=True)
            if model is PlatformAccount:
                row.api_keys = _rekey_items(row.api_keys, "encrypted_key", old_key, new_key)
                row.env_variables = _rekey_items(row.env_variables, "encrypted_value", old_key, new_key)
            if hasattr(row, "updated_at") and db.is_modified(row):
                # Recifrar no debe cambiar la fecha de edición del registro.
                flag_modified(row, "updated_at")
