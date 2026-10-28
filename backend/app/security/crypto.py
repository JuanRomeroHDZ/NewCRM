import os
import base64
import math
import hashlib
from contextvars import ContextVar
import argon2.low_level
from argon2 import PasswordHasher, Type
from argon2.exceptions import VerifyMismatchError, VerificationError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from app.config import settings

# Thread/request context variable holding the ephemeral AES-256 vault key in RAM
active_vault_key: ContextVar[bytes | None] = ContextVar("active_vault_key", default=None)

# Argon2id hasher strictly configured
argon2_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MB
    parallelism=4,
    hash_len=32,
    type=Type.ID
)

def hash_master_password(password: str) -> str:
    """Hashes master password using Argon2id."""
    return argon2_hasher.hash(password)

def verify_master_password(hashed: str, password: str) -> bool:
    """Verifies master password against Argon2id hash."""
    try:
        return argon2_hasher.verify(hashed, password)
    except (VerifyMismatchError, VerificationError, Exception):
        return False

def derive_vault_key(master_password: str, salt: bytes | str) -> bytes:
    """
    Derives a 256-bit AES key from the master password using Argon2id.
    Ensures memory-hard key derivation specific to each vault instance.
    """
    if isinstance(salt, str):
        try:
            salt_bytes = bytes.fromhex(salt)
        except ValueError:
            salt_bytes = salt.encode("utf-8")
    else:
        salt_bytes = salt

    if len(salt_bytes) < 16:
        salt_bytes = salt_bytes.ljust(16, b"\x00")

    return argon2.low_level.hash_secret_raw(
        secret=master_password.encode("utf-8"),
        salt=salt_bytes,
        time_cost=3,
        memory_cost=65536,
        parallelism=4,
        hash_len=32,
        type=argon2.low_level.Type.ID
    )

def derive_encryption_key(master_password: str, salt: bytes = b"emailsaver_vault_v1_salt") -> bytes:
    """Fallback HKDF derivation for backward-compatibility if needed."""
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        info=b"emailsaver_field_encryption_key"
    )
    return hkdf.derive(master_password.encode("utf-8"))

def get_server_seed_key() -> bytes:
    """Derives a fallback key from SERVER_SECRET_KEY for backward compatibility migration."""
    seed = settings.SERVER_SECRET_KEY or "emailsaver_fallback_seed_key"
    return hashlib.sha256(seed.encode("utf-8")).digest()

def get_effective_encryption_key(explicit_key: bytes | None = None) -> bytes:
    """
    Retrieves the active AES-256 encryption key.
    Prioritizes:
    1. Explicitly passed key argument
    2. Session-derived active vault key from request ContextVar
    3. Server secret seed (fallback)
    """
    if explicit_key is not None and len(explicit_key) == 32:
        return explicit_key

    ctx_key = active_vault_key.get()
    if ctx_key is not None and len(ctx_key) == 32:
        return ctx_key

    return get_server_seed_key()

NOTE_ENC_PREFIX = "enc:v1:"

def encrypt_secret(plain_text: str | None, key: bytes | None = None) -> str | None:
    """Encrypts plaintext using AES-256-GCM. Returns base64 nonce + ciphertext + tag."""
    if plain_text is None or plain_text == "":
        return None
    effective_key = get_effective_encryption_key(key)
    
    aesgcm = AESGCM(effective_key)
    nonce = os.urandom(12)  # 96-bit nonce for GCM
    ciphertext = aesgcm.encrypt(nonce, plain_text.encode("utf-8"), None)
    payload = nonce + ciphertext
    return base64.b64encode(payload).decode("utf-8")

def decrypt_secret(encrypted_text: str | None, key: bytes | None = None) -> str | None:
    """Decrypts base64 encoded AES-256-GCM payload. Returns plaintext."""
    if not encrypted_text:
        return None
        
    try:
        raw_data = base64.b64decode(encrypted_text.encode("utf-8"))
        if len(raw_data) < 28:  # 12 nonce + 16 auth tag
            return None
        nonce = raw_data[:12]
        ciphertext = raw_data[12:]
        
        # 1. Attempt decryption with primary effective key
        primary_key = get_effective_encryption_key(key)
        try:
            aesgcm = AESGCM(primary_key)
            decrypted = aesgcm.decrypt(nonce, ciphertext, None)
            return decrypted.decode("utf-8")
        except Exception:
            # 2. If primary key failed and server seed is different, attempt fallback decryption
            server_key = get_server_seed_key()
            if server_key != primary_key:
                try:
                    fallback_aes = AESGCM(server_key)
                    decrypted = fallback_aes.decrypt(nonce, ciphertext, None)
                    return decrypted.decode("utf-8")
                except Exception:
                    pass
        return "••••••••"
    except Exception:
        return "••••••••"

def encrypt_note(plain_text: str | None, key: bytes | None = None) -> str | None:
    """Encrypts private notes at rest using AES-256-GCM with an explicit version prefix."""
    if plain_text is None:
        return None
    cleaned = plain_text.strip()
    if not cleaned:
        return None
    if cleaned.startswith(NOTE_ENC_PREFIX):
        return cleaned
    cipher = encrypt_secret(plain_text, key=key)
    return f"{NOTE_ENC_PREFIX}{cipher}" if cipher else None

def decrypt_note(stored_text: str | None, key: bytes | None = None) -> str | None:
    """Decrypts AES-256-GCM encrypted notes or safely returns legacy plaintext."""
    if not stored_text:
        return None
    if stored_text.startswith(NOTE_ENC_PREFIX):
        cipher = stored_text[len(NOTE_ENC_PREFIX):]
        decrypted = decrypt_secret(cipher, key=key)
        return None if decrypted == "••••••••" else decrypted
    return stored_text

def calculate_entropy(password: str) -> dict:
    """Calculates Shannon entropy and strength score (0-100)."""
    if not password:
        return {"bits": 0, "score": 0, "label": "Vacía", "color": "#858d98"}
    
    pool_size = 0
    has_lower = any(c.islower() for c in password)
    has_upper = any(c.isupper() for c in password)
    has_digit = any(c.isdigit() for c in password)
    has_symbol = any(not c.isalnum() for c in password)
    
    if has_lower: pool_size += 26
    if has_upper: pool_size += 26
    if has_digit: pool_size += 10
    if has_symbol: pool_size += 33
    
    if pool_size == 0:
        pool_size = 26
        
    entropy_bits = len(password) * math.log2(pool_size)
    
    if entropy_bits < 36:
        score = min(35, int((entropy_bits / 36) * 35))
        label = "Débil"
        color = "#f43f5e"
    elif entropy_bits < 60:
        score = 36 + int(((entropy_bits - 36) / 24) * 24)
        label = "Aceptable"
        color = "#f59e0b"
    elif entropy_bits < 80:
        score = 60 + int(((entropy_bits - 60) / 20) * 20)
        label = "Fuerte"
        color = "#10b981"
    else:
        score = min(100, 80 + int(((entropy_bits - 80) / 40) * 20))
        label = "Muy Fuerte"
        color = "#06b6d4"
        
    return {
        "bits": round(entropy_bits, 1),
        "score": score,
        "label": label,
        "color": color
    }
