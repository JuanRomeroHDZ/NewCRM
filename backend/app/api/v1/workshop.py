import os
import hashlib
import hmac
import secrets
import string
import math
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from app.database import get_db
from app.models.core import User
from app.models import InternalProject
from app.services.core_auth import require_role
from app.services.workshop_sanitizer import sanitize_svg_content
from app.services.activity_service import record_event

router = APIRouter(prefix="/workshop", tags=["workshop"])

# Schemas
class HashRequest(BaseModel):
    text: str
    algorithm: str = Field("sha256", pattern="^(sha256|sha512|md5|hmac_sha256)$")
    secret_key: str | None = None

class HashResponse(BaseModel):
    algorithm: str
    hash_result: str

class PasswordGenRequest(BaseModel):
    length: int = Field(20, ge=8, le=128)
    include_uppercase: bool = True
    include_lowercase: bool = True
    include_digits: bool = True
    include_symbols: bool = True

class PasswordGenResponse(BaseModel):
    password: str
    entropy_bits: float
    strength: str

class DiagramSaveRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=128)
    svg_content: str = Field(..., max_length=5 * 1024 * 1024)  # 5MB max
    area: str = "creatividad"

class DiagramResponse(BaseModel):
    title: str
    sanitized_svg: str
    size_bytes: int

class InternalProjectCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=180)
    category: str = "Sistema / SaaS"
    status: str = "en_desarrollo"
    scope: str = "business"
    repo_url: str | None = None
    production_url: str | None = None
    tech_stack: str | None = None
    monthly_maintenance_cost: float = 0.0
    notes: str | None = None

# Routes
@router.post("/hash", response_model=HashResponse)
async def compute_hash(
    payload: HashRequest,
    current_user: User = Depends(require_role(["owner", "business_admin", "seller", "readonly"]))
):
    text_bytes = payload.text.encode("utf-8")
    algo = payload.algorithm.lower()

    if algo == "sha256":
        res = hashlib.sha256(text_bytes).hexdigest()
    elif algo == "sha512":
        res = hashlib.sha512(text_bytes).hexdigest()
    elif algo == "md5":
        res = hashlib.md5(text_bytes).hexdigest()
    elif algo == "hmac_sha256":
        key = (payload.secret_key or "").encode("utf-8")
        res = hmac.new(key, text_bytes, hashlib.sha256).hexdigest()
    else:
        raise HTTPException(status_code=400, detail="Algoritmo no soportado")

    return HashResponse(algorithm=algo, hash_result=res)

@router.post("/generate-password", response_model=PasswordGenResponse)
async def generate_secure_password(
    payload: PasswordGenRequest,
    current_user: User = Depends(require_role(["owner", "business_admin", "seller", "readonly"]))
):
    charset = ""
    pool_size = 0
    if payload.include_lowercase:
        charset += string.ascii_lowercase
        pool_size += 26
    if payload.include_uppercase:
        charset += string.ascii_uppercase
        pool_size += 26
    if payload.include_digits:
        charset += string.digits
        pool_size += 10
    if payload.include_symbols:
        symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?"
        charset += symbols
        pool_size += len(symbols)

    if not charset:
        charset = string.ascii_letters + string.digits
        pool_size = 62

    pwd = "".join(secrets.choice(charset) for _ in range(payload.length))
    entropy = payload.length * math.log2(pool_size) if pool_size > 0 else 0.0

    strength = "debil"
    if entropy >= 80:
        strength = "muy_fuerte"
    elif entropy >= 60:
        strength = "fuerte"
    elif entropy >= 40:
        strength = "moderada"

    return PasswordGenResponse(
        password=pwd,
        entropy_bits=round(entropy, 2),
        strength=strength
    )

@router.post("/diagrams/sanitize", response_model=DiagramResponse)
async def sanitize_diagram_svg(
    payload: DiagramSaveRequest,
    current_user: User = Depends(require_role(["owner", "business_admin", "seller"]))
):
    cleaned_svg = sanitize_svg_content(payload.svg_content)
    return DiagramResponse(
        title=payload.title,
        sanitized_svg=cleaned_svg,
        size_bytes=len(cleaned_svg.encode("utf-8"))
    )

@router.get("/projects", response_model=list[dict])
async def list_internal_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin"]))
):
    stmt = select(InternalProject).where(InternalProject.is_deleted == False).order_by(InternalProject.name.asc())
    res = await db.execute(stmt)
    projects = res.scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "category": p.category,
            "status": p.status,
            "scope": p.scope,
            "tech_stack": p.tech_stack,
            "repo_url": p.repo_url,
            "production_url": p.production_url,
            "monthly_maintenance_cost": p.monthly_maintenance_cost
        }
        for p in projects
    ]

@router.post("/projects", status_code=status.HTTP_201_CREATED)
async def create_internal_project(
    payload: InternalProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin"]))
):
    project = InternalProject(
        name=payload.name,
        category=payload.category,
        status=payload.status,
        scope=payload.scope,
        repo_url=payload.repo_url,
        production_url=payload.production_url,
        tech_stack=payload.tech_stack,
        monthly_maintenance_cost=payload.monthly_maintenance_cost
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    await record_event(
        db,
        module="workshop",
        action="create",
        entity_type="project",
        entity_id=project.id,
        summary=f"Proyecto creado en Taller: {project.name}",
        user_id=current_user.id,
        user_name=current_user.username
    )
    await db.commit()

    return {"message": "Proyecto creado exitosamente en Taller", "id": project.id}
