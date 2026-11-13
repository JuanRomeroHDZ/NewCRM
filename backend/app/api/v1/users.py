from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.core import User
from app.schemas import (
    UserResponse, UserCreateRequest, UserCreateResponse, UserUpdateRequest
)
from app.services.core_auth import (
    get_current_user_from_token, require_role, generate_temporary_password
)
from app.security.crypto import hash_master_password
from app.services.activity_service import record_event

router = APIRouter(prefix="/users", tags=["users"])

@router.get("", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin"]))
):
    stmt = select(User).order_by(User.created_at.asc())
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("", response_model=UserCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"]))
):
    # Check if username or email exists
    stmt = select(User).where((User.username == payload.username) | (User.email == payload.email))
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre de usuario o correo ya se encuentra registrado."
        )

    temp_password = generate_temporary_password(16)
    hashed_pwd = hash_master_password(temp_password)

    new_user = User(
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        hashed_password=hashed_pwd,
        is_active=True,
        must_change_password=True
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    await record_event(
        db,
        module="system",
        action="create",
        entity_type="user",
        entity_id=new_user.id,
        summary=f"Creación de usuario: {new_user.username} con rol {new_user.role}",
        user_id=current_user.id,
        user_name=current_user.username
    )
    await db.commit()

    return UserCreateResponse(
        id=new_user.id,
        username=new_user.username,
        email=new_user.email,
        full_name=new_user.full_name,
        role=new_user.role,
        is_active=new_user.is_active,
        is_totp_enabled=new_user.is_totp_enabled,
        must_change_password=new_user.must_change_password,
        created_at=new_user.created_at,
        temporary_password=temp_password
    )

@router.get("/{user_id}", response_model=UserResponse)
async def get_user_detail(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "business_admin"]))
):
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user

@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    payload: UserUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"]))
):
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user.id == current_user.id:
        if payload.is_active is False:
            raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta de propietario.")
        if payload.role is not None and payload.role != "owner":
            raise HTTPException(status_code=400, detail="No puedes degradar tu propio rol de propietario.")

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.unlock:
        user.failed_login_attempts = 0
        user.locked_until = None

    await db.commit()
    await db.refresh(user)

    await record_event(
        db,
        module="system",
        action="update",
        entity_type="user",
        entity_id=user.id,
        summary=f"Modificación de usuario: {user.username}",
        user_id=current_user.id,
        user_name=current_user.username
    )
    await db.commit()

    return user
