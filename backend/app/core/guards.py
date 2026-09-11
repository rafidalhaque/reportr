import uuid

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_staff
from app.core.permissions import has_global_role, has_program_perm
from app.database import get_session
from app.models import StaffUser


def require_global(*roles: str):
    """Dependency factory: allow super_admin plus the listed global roles."""

    async def checker(user: StaffUser = Depends(current_staff)) -> StaffUser:
        if not has_global_role(user, *roles):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user

    return checker


def require_program_perm(action: str):
    """Dependency factory (spec §4): 403 unless the staff user holds `action` on `program_id`."""

    async def checker(
        program_id: uuid.UUID,
        user: StaffUser = Depends(current_staff),
        session: AsyncSession = Depends(get_session),
    ) -> StaffUser:
        if not await has_program_perm(session, user, program_id, action):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions for this program")
        return user

    return checker
