"""RBAC engine (spec §4): default-deny, first match wins.

Resolution order:
1. super_admin -> allow
2. global role grants the action org-wide -> allow
3. program_roles row for (staff, program) grants the action -> allow
4. no match -> deny
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import GLOBAL_ROLE_ACTIONS, PROGRAM_ROLE_ACTIONS
from app.models import ProgramRole, StaffUser


async def has_program_perm(session: AsyncSession, user: StaffUser, program_id: uuid.UUID, action: str) -> bool:
    if user.global_role == "super_admin":
        return True
    if action in GLOBAL_ROLE_ACTIONS.get(user.global_role, set()):
        return True
    role = await session.scalar(
        select(ProgramRole).where(ProgramRole.staff_id == user.id, ProgramRole.program_id == program_id)
    )
    if role and action in PROGRAM_ROLE_ACTIONS.get(role.role, set()):
        return True
    return False


def has_global_role(user: StaffUser, *roles: str) -> bool:
    return user.global_role == "super_admin" or user.global_role in roles
