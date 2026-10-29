import json
from datetime import datetime, timezone
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.core import ActivityEvent
from app.models import AuditLog

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

async def record_event(
    session: AsyncSession,
    module: str,
    action: str,
    entity_type: str,
    summary: str,
    entity_id: str | None = None,
    details_before: dict | None = None,
    details_after: dict | None = None,
    user_id: str | None = None,
    user_name: str | None = None,
    ip_address: str | None = None
) -> ActivityEvent:
    """
    Records an immutable event in the unified event stream.
    Also syncs with legacy AuditLog table to preserve total backward compatibility.
    """
    now = utc_now()
    before_json = json.dumps(details_before, ensure_ascii=False) if details_before else None
    after_json = json.dumps(details_after, ensure_ascii=False) if details_after else None

    event = ActivityEvent(
        timestamp=now,
        module=module,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=user_id,
        user_name=user_name or "Sistema",
        summary=summary,
        details_before=before_json,
        details_after=after_json,
        ip_address=ip_address,
        is_redacted=True
    )
    session.add(event)

    # Legacy AuditLog synchronization
    legacy_log = AuditLog(
        timestamp=now,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=summary[:250],
        details=after_json,
        ip_address=ip_address
    )
    session.add(legacy_log)
    await session.flush()
    return event

async def get_activity_feed(
    session: AsyncSession,
    module: str | None = None,
    limit: int = 50,
    offset: int = 0
) -> list[dict]:
    """Returns friendly redacted activity items grouped or formatted for user consumption."""
    query = select(ActivityEvent).order_by(desc(ActivityEvent.timestamp))
    if module:
        query = query.where(ActivityEvent.module == module)
    query = query.limit(limit).offset(offset)
    res = await session.execute(query)
    events = res.scalars().all()
    
    return [
        {
            "id": e.id,
            "timestamp": e.timestamp.isoformat(),
            "date": e.timestamp.strftime("%Y-%m-%d"),
            "module": e.module,
            "action": e.action,
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "user_name": e.user_name,
            "summary": e.summary
        }
        for e in events
    ]

async def get_audit_trail(
    session: AsyncSession,
    module: str | None = None,
    entity_type: str | None = None,
    limit: int = 100,
    offset: int = 0
) -> list[dict]:
    """Returns full immutable audit trail for administrators with details before and after."""
    query = select(ActivityEvent).order_by(desc(ActivityEvent.timestamp))
    if module:
        query = query.where(ActivityEvent.module == module)
    if entity_type:
        query = query.where(ActivityEvent.entity_type == entity_type)
    query = query.limit(limit).offset(offset)
    res = await session.execute(query)
    events = res.scalars().all()

    return [
        {
            "id": e.id,
            "timestamp": e.timestamp.isoformat(),
            "module": e.module,
            "action": e.action,
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "user_id": e.user_id,
            "user_name": e.user_name,
            "summary": e.summary,
            "details_before": json.loads(e.details_before) if e.details_before else None,
            "details_after": json.loads(e.details_after) if e.details_after else None,
            "ip_address": e.ip_address
        }
        for e in events
    ]
