import base64
import hashlib
import hmac
import secrets
import struct
import time

def clean_base32_secret(secret: str) -> str:
    cleaned = secret.replace(" ", "").replace("-", "").strip().upper()
    missing_padding = len(cleaned) % 8
    if missing_padding:
        cleaned += "=" * (8 - missing_padding)
    return cleaned

def generate_random_totp_secret() -> str:
    """Generates a secure 160-bit (32 base32 chars) secret key."""
    random_bytes = secrets.token_bytes(20)
    return base64.b32encode(random_bytes).decode("utf-8").replace("=", "")

def generate_totp_code(secret: str, time_step: int = 30, digits: int = 6) -> tuple[str, int]:
    """
    Computes RFC 6238 TOTP token and returns (token, seconds_remaining).
    """
    b32_secret = clean_base32_secret(secret)
    key = base64.b32decode(b32_secret, casefold=True)
    
    current_time = int(time.time())
    counter = current_time // time_step
    counter_bytes = struct.pack(">Q", counter)
    
    hmac_digest = hmac.new(key, counter_bytes, hashlib.sha1).digest()
    offset = hmac_digest[-1] & 0x0F
    binary_code = struct.unpack(">I", hmac_digest[offset : offset + 4])[0] & 0x7FFFFFFF
    
    modulo = 10 ** digits
    token = f"{binary_code % modulo:0{digits}d}"
    remaining = time_step - (current_time % time_step)
    
    return token, remaining

def verify_totp_code(secret: str, code: str, time_step: int = 30, window: int = 1) -> bool:
    """Verifies a 6-digit TOTP token allowing for clock drift of +/- window steps."""
    b32_secret = clean_base32_secret(secret)
    try:
        key = base64.b32decode(b32_secret, casefold=True)
    except Exception:
        return False
        
    current_time = int(time.time())
    current_counter = current_time // time_step
    
    for drift in range(-window, window + 1):
        counter = current_counter + drift
        counter_bytes = struct.pack(">Q", counter)
        hmac_digest = hmac.new(key, counter_bytes, hashlib.sha1).digest()
        offset = hmac_digest[-1] & 0x0F
        binary_code = struct.unpack(">I", hmac_digest[offset : offset + 4])[0] & 0x7FFFFFFF
        computed = f"{binary_code % 1000000:06d}"
        if hmac.compare_digest(computed, code.strip()):
            return True
            
    return False
