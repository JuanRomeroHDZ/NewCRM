import time
import threading
import secrets

class VaultSessionManager:
    """
    In-memory thread-safe ephemeral session store for Level 2 Vault sessions.
    Stores the derived AES-256 encryption key strictly in volatile memory (RAM).
    Wipes keys immediately upon session revocation or timeout.
    """
    def __init__(self):
        self._sessions: dict[str, dict] = {}
        self._lock = threading.Lock()

    def create_session(self, jti: str, key: bytes | None, exp: int) -> None:
        with self._lock:
            # Clean up expired sessions periodically
            now = time.time()
            expired_keys = [k for k, v in self._sessions.items() if v.get("exp", 0) < now]
            for k in expired_keys:
                self._sessions.pop(k, None)

            self._sessions[jti] = {
                "key": key or b"",
                "exp": exp,
                "revoked": False,
                "created_at": now
            }

    def get_session_key(self, jti: str) -> bytes | None:
        with self._lock:
            session = self._sessions.get(jti)
            if not session:
                return None
            if session.get("revoked", False):
                return None
            if session.get("exp", 0) < time.time():
                # Expired: wipe key and return None
                session["key"] = b""
                return None
            return session.get("key") or None

    def is_session_active(self, jti: str) -> bool:
        with self._lock:
            session = self._sessions.get(jti)
            if not session:
                return False
            if session.get("revoked", False):
                return False
            if session.get("exp", 0) < time.time():
                session["key"] = b""
                return False
            return True

    def revoke_session(self, jti: str) -> bool:
        with self._lock:
            session = self._sessions.get(jti)
            if session:
                session["revoked"] = True
                session["key"] = b""  # Zero out encryption key in RAM
                return True
            return False

    def revoke_all_sessions(self) -> None:
        with self._lock:
            for session in self._sessions.values():
                session["revoked"] = True
                session["key"] = b""
            self._sessions.clear()

session_manager = VaultSessionManager()
