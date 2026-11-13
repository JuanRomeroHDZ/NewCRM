import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import Base, get_db

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)

@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Return ready only when the database and application schema are available."""
    try:
        await db.execute(text("SELECT 1"))
        connection = await db.connection()
        existing_tables = await connection.run_sync(
            lambda sync_connection: set(inspect(sync_connection).get_table_names())
        )
        missing_tables = set(Base.metadata.tables) - existing_tables
        if missing_tables:
            logger.warning("Database readiness check found an incomplete schema.")
            return JSONResponse(
                status_code=503,
                content={"status": "degraded", "database": "schema_not_ready", "service": "lessso-backend", "version": "1.0.0"},
            )
    except Exception as exc:
        logger.warning("Database readiness check failed: %s", type(exc).__name__)
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "database": "unavailable", "service": "lessso-backend", "version": "1.0.0"},
        )

    return {
        "status": "healthy",
        "database": "connected",
        "service": "lessso-backend",
        "version": "1.0.0"
    }
