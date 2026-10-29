import json
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, update, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.core import JobQueue
from app.config import settings

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

async def enqueue_job(
    session: AsyncSession,
    job_type: str,
    payload: dict,
    queue_name: str = "default",
    max_attempts: int = 3,
    scheduled_at: datetime | None = None
) -> JobQueue:
    """Enqueues a new background task within the current transaction."""
    if scheduled_at is None:
        scheduled_at = utc_now()
    job = JobQueue(
        queue_name=queue_name,
        job_type=job_type,
        payload_json=json.dumps(payload, ensure_ascii=False),
        status="pending",
        attempts=0,
        max_attempts=max_attempts,
        scheduled_at=scheduled_at
    )
    session.add(job)
    await session.flush()
    return job

async def fetch_next_job(
    session: AsyncSession,
    queue_name: str = "default"
) -> JobQueue | None:
    """
    Fetches next pending job with PostgreSQL row-level locking (FOR UPDATE SKIP LOCKED).
    Safe fallback for SQLite in-memory test environments.
    """
    now = utc_now()
    is_sqlite = settings.DATABASE_URL.startswith("sqlite")
    
    query = (
        select(JobQueue)
        .where(
            JobQueue.queue_name == queue_name,
            JobQueue.status == "pending",
            JobQueue.scheduled_at <= now
        )
        .order_by(JobQueue.scheduled_at.asc())
        .limit(1)
    )
    
    if not is_sqlite:
        query = query.with_for_update(skip_locked=True)
        
    res = await session.execute(query)
    job = res.scalar_one_or_none()
    
    if job:
        job.status = "processing"
        job.attempts += 1
        job.updated_at = now
        await session.flush()
        
    return job

async def mark_job_completed(session: AsyncSession, job_id: str) -> None:
    now = utc_now()
    await session.execute(
        update(JobQueue)
        .where(JobQueue.id == job_id)
        .values(status="completed", updated_at=now)
    )

async def mark_job_failed(
    session: AsyncSession,
    job_id: str,
    error_message: str
) -> None:
    """Marks job as failed or reschedules with exponential backoff if attempts < max_attempts."""
    now = utc_now()
    res = await session.execute(select(JobQueue).where(JobQueue.id == job_id))
    job = res.scalar_one_or_none()
    if not job:
        return
        
    if job.attempts < job.max_attempts:
        backoff_seconds = (2 ** job.attempts) * 30  # 60s, 120s, 240s...
        job.status = "pending"
        job.scheduled_at = now + timedelta(seconds=backoff_seconds)
        job.last_error = error_message
    else:
        job.status = "failed"
        job.last_error = error_message
    job.updated_at = now
    await session.flush()

async def mark_job_uncertain(
    session: AsyncSession,
    job_id: str,
    reason: str
) -> None:
    """
    Marks job as uncertain (estado incierto).
    Used when an external call times out and cannot be safely retried automatically.
    Requires manual review or reconciliation.
    """
    now = utc_now()
    await session.execute(
        update(JobQueue)
        .where(JobQueue.id == job_id)
        .values(
            status="uncertain",
            last_error=f"Estado incierto: {reason}. Requiere intervención manual.",
            updated_at=now
        )
    )
