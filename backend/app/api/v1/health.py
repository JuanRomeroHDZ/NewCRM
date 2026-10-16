from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db

router = APIRouter(tags=["health"])

@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Healthcheck endpoint for Docker containers and orchestrators."""
    try:
        await db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "database": db_status,
        "service": "emailsaver-backend",
        "version": "1.0.0"
    }
