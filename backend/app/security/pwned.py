import hashlib
import urllib.request
import urllib.error

def check_pwned_password(password: str) -> tuple[bool, int]:
    """
    Checks if a password has appeared in known data breaches using HIBP k-Anonymity.
    Only the first 5 characters of the SHA-1 hash are sent to the network.
    Returns: (is_pwned: bool, pwned_count: int)
    """
    if not password:
        return False, 0

    sha1_hash = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix = sha1_hash[:5]
    suffix = sha1_hash[5:]

    url = f"https://api.pwnedpasswords.com/range/{prefix}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "EmailSaver-SelfHosted-Vault",
            "Add-Padding": "true"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=3.5) as response:
            lines = response.read().decode("utf-8").splitlines()
            for line in lines:
                parts = line.strip().split(":")
                if len(parts) == 2:
                    h_suffix, count_str = parts[0].strip().upper(), parts[1].strip()
                    if h_suffix == suffix:
                        return True, int(count_str)
            return False, 0
    except (urllib.error.URLError, TimeoutError, Exception):
        # Graceful fallback in offline/airgapped or restricted network environments
        return False, 0
