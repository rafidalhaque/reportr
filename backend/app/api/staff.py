from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_staff_manager
from app.core.guards import require_global
from app.database import get_session
from app.models import StaffUser
from app.schemas import StaffCreate, StaffRead, StaffUpdate

router = APIRouter(prefix="/staff", tags=["staff"])


@router.get("", response_model=list[StaffRead])
async def list_staff(
    _user: StaffUser = Depends(require_global("org_admin")),
    session: AsyncSession = Depends(get_session),
):
    staff = (await session.scalars(select(StaffUser).order_by(StaffUser.email))).all()
    return list(staff)


@router.post("", response_model=StaffRead, status_code=status.HTTP_201_CREATED)
async def create_staff(
    payload: StaffCreate,
    _admin: StaffUser = Depends(require_global()),  # super_admin only
    manager=Depends(get_staff_manager),
    session: AsyncSession = Depends(get_session),
):
    existing = await session.scalar(select(StaffUser).where(StaffUser.email == payload.email))
    if existing is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A staff user with this email already exists")
    user = StaffUser(
        email=payload.email,
        name=payload.name,
        global_role=payload.global_role,
        hashed_password=manager.password_helper.hash(payload.password),
        is_active=True,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@router.patch("/{staff_id}", response_model=StaffRead)
async def update_staff(
    staff_id: UUID,
    payload: StaffUpdate,
    _admin: StaffUser = Depends(require_global()),  # super_admin only
    session: AsyncSession = Depends(get_session),
):
    user = await session.get(StaffUser, staff_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff user not found")
    data = payload.model_dump(exclude_unset=True)
    for field in ("name", "global_role", "is_active"):
        if field in data and data[field] is not None:
            setattr(user, field, data[field])
    await session.commit()
    await session.refresh(user)
    return user
