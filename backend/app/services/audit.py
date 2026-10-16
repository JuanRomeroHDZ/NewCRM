from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import AuditLog

async def log_audit_event(
    db: AsyncSession,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    entity_name: str | None = None,
    details: str | None = None,
    ip_address: str | None = None
) -> AuditLog:
    """Creates an immutable audit log entry within the current transaction."""
    entry = AuditLog(
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        details=details,
        ip_address=ip_address
    )
    db.add(entry)
    return entry
