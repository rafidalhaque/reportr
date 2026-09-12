import re
import uuid
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.constants import (
    ACTION_MANAGE_INVITES,
    ACTION_MANAGE_SCOPE,
    ACTION_VIEW_REPORTS,
    PROGRAM_ROLES,
)
from app.core.deps import get_actor
from app.core.guards import require_global, require_program_perm
from app.core.permissions import has_global_role, has_program_perm
from app.database import get_session
from app.models import (
    Application,
    Invite,
    Org,
    Program,
    ProgramMembership,
    ProgramRole,
    Report,
    Researcher,
    StaffUser,
)
from app.schemas import (
    InviteCreate,
    InviteRead,
    ProgramCreate,
    ProgramDetail,
    ProgramRead,
    ProgramRoleSet,
    ProgramStats,
    ProgramUpdate,
    ResearcherRead,
)
from app.services.notifications import get_notifier

router = APIRouter(prefix="/programs", tags=["programs"])


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "program"


async def get_default_org(session: AsyncSession) -> Org | None:
    return await session.scalar(select(Org).order_by(Org.created_at).limit(1))


async def _unique_slug(session: AsyncSession, desired: str) -> str:
    base = slugify(desired)
    slug, counter = base, 2
    while await session.scalar(select(Program).where(Program.slug == slug)) is not None:
        slug = f"{base}-{counter}"
        counter += 1
    return slug


@router.post("", response_model=ProgramRead, status_code=status.HTTP_201_CREATED)
async def create_program(
    payload: ProgramCreate,
    user: StaffUser = Depends(require_global("org_admin")),
    session: AsyncSession = Depends(get_session),
):
    org = await get_default_org(session)
    program = Program(
        org_id=org.id if org else None,
        name=payload.name,
        slug=await _unique_slug(session, payload.slug or payload.name),
        description=payload.description,
        scope_markdown=payload.scope_markdown,
        status=payload.status,
        visibility=payload.visibility,
        public_reporting=payload.public_reporting,
        created_by_id=user.id,
    )
    session.add(program)
    await session.commit()
    await session.refresh(program)
    return program


@router.get("", response_model=list[ProgramRead])
async def list_programs(actor=Depends(get_actor), session: AsyncSession = Depends(get_session)):
    """Staff: super_admin/org_admin/auditor see all, others see programs they hold a role on.
    Researchers: programs they hold a membership in."""
    query = select(Program).order_by(Program.created_at.desc())
    if actor.kind == "researcher":
        programs = (
            await session.scalars(
                query.join(ProgramMembership, ProgramMembership.program_id == Program.id).where(
                    ProgramMembership.researcher_id == actor.researcher.id
                )
            )
        ).all()
        return list(programs)
    user = actor.staff
    if has_global_role(user, "org_admin", "auditor"):
        programs = (await session.scalars(query)).all()
    else:
        programs = (
            await session.scalars(
                query.join(ProgramRole, ProgramRole.program_id == Program.id).where(ProgramRole.staff_id == user.id)
            )
        ).all()
    return list(programs)


@router.get("/{program_id}", response_model=ProgramDetail)
async def get_program(program_id: UUID, actor=Depends(get_actor), session: AsyncSession = Depends(get_session)):
    if actor.kind == "researcher":
        program = await session.get(Program, program_id)
        membership = await session.scalar(
            select(ProgramMembership).where(
                ProgramMembership.researcher_id == actor.researcher.id,
                ProgramMembership.program_id == program_id,
            )
        )
        if program is None or membership is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Program not found")
        return program
    user = actor.staff
    if not await has_program_perm(session, user, program_id, ACTION_VIEW_REPORTS):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions for this program")
    program = await session.get(Program, program_id)
    if program is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Program not found")
    return program


@router.patch("/{program_id}", response_model=ProgramDetail)
async def update_program(
    program_id: UUID,
    payload: ProgramUpdate,
    _user: StaffUser = Depends(require_program_perm(ACTION_MANAGE_SCOPE)),
    session: AsyncSession = Depends(get_session),
):
    program = await session.get(Program, program_id)
    if program is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Program not found")
    data = payload.model_dump(exclude_unset=True)
    for field in ("name", "description", "scope_markdown", "status", "visibility", "public_reporting"):
        if data.get(field) is not None:
            setattr(program, field, data[field])
    await session.commit()
    await session.refresh(program)
    return program


@router.get("/{program_id}/stats", response_model=ProgramStats)
async def program_stats(
    program_id: UUID,
    _user: StaffUser = Depends(require_program_perm(ACTION_VIEW_REPORTS)),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.execute(
            select(Report.status, func.count()).where(Report.program_id == program_id).group_by(Report.status)
        )
    ).all()
    by_status = {s: c for s, c in rows}
    pending_apps = await session.scalar(
        select(func.count()).select_from(Application).where(
            Application.program_id == program_id, Application.status == "pending"
        )
    )
    members = await session.scalar(
        select(func.count()).select_from(ProgramMembership).where(ProgramMembership.program_id == program_id)
    )
    return ProgramStats(
        total_reports=sum(by_status.values()),
        by_status=by_status,
        pending_applications=int(pending_apps or 0),
        members=int(members or 0),
    )


# --- Invites -------------------------------------------------------------


@router.post("/{program_id}/invites", response_model=InviteRead, status_code=status.HTTP_201_CREATED)
async def create_invite(
    program_id: UUID,
    payload: InviteCreate,
    program: Program = Depends(require_program_perm(ACTION_MANAGE_INVITES)),
    session: AsyncSession = Depends(get_session),
):
    settings = get_settings()
    email = payload.email.lower()
    pending = await session.scalar(
        select(Invite).where(
            Invite.program_id == program_id,
            Invite.email == email,
            Invite.revoked.is_(False),
            Invite.accepted_at.is_(None),
        )
    )
    if pending is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A pending invite already exists for this email")
    invite = Invite(
        org_id=program.org_id,
        program_id=program_id,
        email=email,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.invite_ttl_days),
    )
    session.add(invite)
    await session.commit()
    await session.refresh(invite)
    await get_notifier().notify(
        "invite_created", f"✉️ Invite created for {email} → {program.name} (expires {invite.expires_at:%Y-%m-%d})"
    )
    return invite


@router.get("/{program_id}/invites", response_model=list[InviteRead])
async def list_invites(
    program_id: UUID,
    _user: StaffUser = Depends(require_program_perm(ACTION_MANAGE_INVITES)),
    session: AsyncSession = Depends(get_session),
):
    invites = (
        await session.scalars(
            select(Invite).where(Invite.program_id == program_id).order_by(Invite.created_at.desc())
        )
    ).all()
    return list(invites)


@router.delete("/{program_id}/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invite(
    program_id: UUID,
    invite_id: UUID,
    _user: StaffUser = Depends(require_program_perm(ACTION_MANAGE_INVITES)),
    session: AsyncSession = Depends(get_session),
):
    invite = await session.get(Invite, invite_id)
    if invite is None or invite.program_id != program_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invite not found")
    invite.revoked = True
    await session.commit()


# --- Members -------------------------------------------------------------


@router.get("/{program_id}/members", response_model=list[ResearcherRead])
async def list_members(
    program_id: UUID,
    _user: StaffUser = Depends(require_program_perm(ACTION_MANAGE_INVITES)),
    session: AsyncSession = Depends(get_session),
):
    researchers = (
        await session.scalars(
            select(Researcher)
            .join(ProgramMembership, ProgramMembership.researcher_id == Researcher.id)
            .where(ProgramMembership.program_id == program_id)
            .order_by(Researcher.email)
        )
    ).all()
    return list(researchers)


@router.delete("/{program_id}/members/{researcher_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    program_id: UUID,
    researcher_id: UUID,
    _user: StaffUser = Depends(require_program_perm(ACTION_MANAGE_INVITES)),
    session: AsyncSession = Depends(get_session),
):
    await session.execute(
        delete(ProgramMembership).where(
            ProgramMembership.program_id == program_id, ProgramMembership.researcher_id == researcher_id
        )
    )
    await session.commit()


# --- Staff assignments on this program (program_roles) -------------------


class ProgramRoleRead(BaseModel):
    id: UUID
    staff_id: UUID
    staff_name: str
    staff_email: str
    role: str


@router.get("/{program_id}/roles", response_model=list[ProgramRoleRead])
async def list_program_roles(
    program_id: UUID,
    _user: StaffUser = Depends(require_global("org_admin")),
    session: AsyncSession = Depends(get_session),
):
    roles = (
        await session.scalars(
            select(ProgramRole).where(ProgramRole.program_id == program_id).order_by(ProgramRole.created_at)
        )
    ).all()
    out = []
    for role in roles:
        staff = await session.get(StaffUser, role.staff_id)
        out.append(
            ProgramRoleRead(
                id=role.id,
                staff_id=role.staff_id,
                staff_name=staff.name if staff else "",
                staff_email=staff.email if staff else "",
                role=role.role,
            )
        )
    return out


@router.post("/{program_id}/roles", response_model=ProgramRoleRead, status_code=status.HTTP_201_CREATED)
async def set_program_role(
    program_id: UUID,
    payload: ProgramRoleSet,
    _user: StaffUser = Depends(require_global("org_admin")),
    session: AsyncSession = Depends(get_session),
):
    if payload.role not in PROGRAM_ROLES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown program role")
    staff = await session.get(StaffUser, payload.staff_id)
    if staff is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff user not found")
    existing = await session.scalar(
        select(ProgramRole).where(
            ProgramRole.staff_id == payload.staff_id, ProgramRole.program_id == program_id
        )
    )
    if existing is not None:
        existing.role = payload.role
        role = existing
    else:
        role = ProgramRole(staff_id=payload.staff_id, program_id=program_id, role=payload.role)
        session.add(role)
    await session.commit()
    await session.refresh(role)
    return ProgramRoleRead(
        id=role.id, staff_id=staff.id, staff_name=staff.name, staff_email=staff.email, role=role.role
    )


@router.delete("/{program_id}/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_program_role(
    program_id: UUID,
    role_id: UUID,
    _user: StaffUser = Depends(require_global("org_admin")),
    session: AsyncSession = Depends(get_session),
):
    role = await session.get(ProgramRole, role_id)
    if role is None or role.program_id != program_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Program role not found")
    await session.delete(role)
    await session.commit()
