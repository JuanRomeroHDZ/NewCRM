"""LESSSO API v1 routers.

Keep router imports lazy: isolated services such as the C2 worker import only
their own router and must not initialize unrelated CRM features or dependencies.
"""

__all__ = [
    "auth",
    "emails",
    "platforms",
    "payments",
    "passwords",
    "graph",
    "trash",
    "exchange",
    "settings",
    "health",
    "security",
    "importer",
    "audit",
    "vault_backup",
]
