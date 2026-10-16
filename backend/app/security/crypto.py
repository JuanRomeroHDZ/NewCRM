import os
import base64
import math
import hashlib
from argon2 import PasswordHasher, Type
from argon2.exceptions import VerifyMismatchError, VerificationError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

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
    except (VerifyMismatchError, VerificationError):
        return False

def derive_encryption_key(master_password: str, salt: bytes = b"emailsaver_vault_v1_salt") -> bytes:
    """Derives a 256-bit AES key from the master password using HKDF-SHA256."""
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        info=b"emailsaver_field_encryption_key"
    )
    return hkdf.derive(master_password.encode("utf-8"))

# Default server key for system-level fallback or when vault key is cached in session
def get_system_master_key() -> bytes:
    server_seed = os.getenv("SERVER_SECRET_KEY", "emailsaver-system-default-master-key-32b")
    return hashlib.sha256(server_seed.encode("utf-8")).digest()

def encrypt_secret(plain_text: str | None, key: bytes | None = None) -> str | None:
    """Encrypts plaintext using AES-256-GCM. Returns base64 nonce + ciphertext + tag."""
    if plain_text is None:
        return None
    if key is None:
        key = get_system_master_key()
    
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce for GCM
    ciphertext = aesgcm.encrypt(nonce, plain_text.encode("utf-8"), None)
    payload = nonce + ciphertext
    return base64.b64encode(payload).decode("utf-8")

def decrypt_secret(encrypted_text: str | None, key: bytes | None = None) -> str | None:
    """Decrypts base64 encoded AES-256-GCM payload. Returns plaintext."""
    if not encrypted_text:
        return None
    if key is None:
        key = get_system_master_key()
        
    try:
        raw_data = base64.b64decode(encrypted_text.encode("utf-8"))
        if len(raw_data) < 28:  # 12 nonce + 16 auth tag
            return None
        nonce = raw_data[:12]
        ciphertext = raw_data[12:]
        aesgcm = AESGCM(key)
        decrypted = aesgcm.decrypt(nonce, ciphertext, None)
        return decrypted.decode("utf-8")
    except Exception:
        return "••••••••"  # Failed decryption fallback

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
    
    # Score 0-100 based on standard entropy thresholds
    # 0-35 bits: Débil, 36-59 bits: Aceptable, 60-79 bits: Fuerte, 80+ bits: Muy Fuerte
    if entropy_bits < 36:
        score = min(35, int((entropy_bits / 36) * 35))
        label = "Débil"
        color = "#f43f5e" # Rose/Red
    elif entropy_bits < 60:
        score = 36 + int(((entropy_bits - 36) / 24) * 24)
        label = "Aceptable"
        color = "#f59e0b" # Amber/Yellow
    elif entropy_bits < 80:
        score = 60 + int(((entropy_bits - 60) / 20) * 20)
        label = "Fuerte"
        color = "#10b981" # Emerald
    else:
        score = min(100, 80 + int(((entropy_bits - 80) / 40) * 20))
        label = "Muy Fuerte"
        color = "#06b6d4" # Cyan / Indigo
        
    return {
        "bits": round(entropy_bits, 1),
        "score": score,
        "label": label,
        "color": color
    }
