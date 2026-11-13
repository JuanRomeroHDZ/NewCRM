import hashlib
import httpx
from app.config import settings

# In-memory LRU-like cache for k-anonymity prefixes: prefix -> dict[suffix, count]
_PWNED_PREFIX_CACHE: dict[str, dict[str, int]] = {}

async def check_pwned_password(password: str) -> tuple[bool | None, int, str]:
    """
    Checks asynchronously if a password has appeared in known data breaches using HIBP k-Anonymity.
    Only the first 5 characters of the SHA-1 hash are sent to the network.
    Never blocks the event loop. Does NOT fail-open silently on network errors.

    Returns:
        (is_pwned: bool | None, pwned_count: int, status: str)
        status can be: 'safe', 'compromised', 'unknown'
    """
    if not password:
        return False, 0, "safe"

    sha1_hash = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix = sha1_hash[:5]
    suffix = sha1_hash[5:]

    # Check cache first
    if prefix in _PWNED_PREFIX_CACHE:
        suffix_map = _PWNED_PREFIX_CACHE[prefix]
        if suffix in suffix_map:
            return True, suffix_map[suffix], "compromised"
        return False, 0, "safe"

    if settings.LOCAL_MODE:
        return None, 0, "unknown"

    url = f"{settings.PWNED_PASSWORDS_API_URL.rstrip('/')}/{prefix}"
    headers = {
        "User-Agent": settings.PWNED_USER_AGENT,
        "Add-Padding": "true"
    }

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.get(url, headers=headers)
            if response.status_code != 200:
                return None, 0, "unknown"

            lines = response.text.splitlines()
            suffix_map = {}
            for line in lines:
                parts = line.strip().split(":")
                if len(parts) == 2:
                    h_suffix, count_str = parts[0].strip().upper(), parts[1].strip()
                    try:
                        suffix_map[h_suffix] = int(count_str)
                    except ValueError:
                        continue

            # Store in cache (limit to 1000 prefixes to bound memory)
            if len(_PWNED_PREFIX_CACHE) > 1000:
                _PWNED_PREFIX_CACHE.clear()
            _PWNED_PREFIX_CACHE[prefix] = suffix_map

            if suffix in suffix_map:
                return True, suffix_map[suffix], "compromised"
            return False, 0, "safe"

    except Exception:
        # Network unreachable, timeout or offline environment: fail with explicit 'unknown' status
        return None, 0, "unknown"
