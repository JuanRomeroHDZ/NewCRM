from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.graph import generate_relational_graph
from app.schemas import GraphResponse
from app.security.tokens import require_vault_unlocked

router = APIRouter(prefix="/graph", tags=["graph"], dependencies=[Depends(require_vault_unlocked)])

@router.get("", response_model=GraphResponse)
async def get_graph(db: AsyncSession = Depends(get_db)):
    """Returns the relational network nodes, edges, cycle warnings, and SPOF analysis."""
    graph_data = await generate_relational_graph(db)
    return graph_data
