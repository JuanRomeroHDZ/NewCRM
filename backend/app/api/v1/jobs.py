from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.core import User, JobQueue
from app.schemas import JobResponse
from app.services.core_auth import require_role
from app.services.activity_service import record_event
from app.services.job_queue import utc_now

router = APIRouter(prefix="/jobs", tags=["jobs"])

@router.get("", response_model=list[JobResponse])
async def list_jobs(
    queue: str | None = None,
    status_filter: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin"]))
):
    query = select(JobQueue).order_by(desc(JobQueue.scheduled_at)).limit(limit)
    if queue:
        query = query.where(JobQueue.queue_name == queue)
    if status_filter:
        query = query.where(JobQueue.status == status_filter)
    res = await db.execute(query)
    return res.scalars().all()

@router.post("/retry/{job_id}", response_model=JobResponse)
async def retry_single_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin"]))
):
    res = await db.execute(select(JobQueue).where(JobQueue.id == job_id))
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")

    job.status = "pending"
    job.scheduled_at = utc_now()
    job.last_error = None
    job.updated_at = utc_now()

    await record_event(
        db,
        module="system",
        action="update",
        entity_type="job",
        entity_id=job.id,
        summary=f"Reintento manual de trabajo {job.job_type} ({job.id})",
        user_id=current_user.id,
        user_name=current_user.username
    )
    await db.commit()
    await db.refresh(job)
    return job
