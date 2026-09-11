from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.constants import ACTION_MANAGE_INVITES, PROGRAM_ROLE_ACTIONS
from app.core.auth import current_staff
from app.core.permissions import has_global_role, has_program_perm
from app.database import get_session
from app.models import Application, Invite, Program, ProgramRole, StaffUser
from app.schemas import ApplicationDecision, ApplicationRead, InviteRead
from app.services.notifications import get_notifier

router = APIRouter(prefix="/applications", tags=["applications"])


@router.get("", response_model=list[ApplicationRead])
async def list_applications(
    status: str | None = None,
    program_id: UUID | None = None,
    user: StaffUser = Depends(current_staff),
    session: AsyncSession = Depends(get_session),
):
    """org-level roles see all; other staff see applications only for programs where they manage invites."""
    query = select(Application).order_by(Application.created_at.desc())
    if not has_global_role(user, "org_admin", "auditor"):
        roles = (await session.scalars(select(ProgramRole).where(ProgramRole.staff_id == user.id))).all()
        allowed = [
            r.program_id for r in roles if ACTION_MANAGE_INVITES in PROGRAM_ROLE_ACTIONS.get(r.role, set())
        ]
        if not allowed:
            return []
        query = query.where(Application.program_id.in_(allowed))
    if program_id is not None:
        query = query.where(Application.program_id == program_id)
    if status is not None:
        query = query.where(Application.status == status)
    apps = (await session.scalars(query)).all()
    return list(apps)


async def _decision_target(
    session: AsyncSession, user: StaffUser, application_id: UUID, body_program_id: UUID | None
) -> tuple[Application, Program]:
    application = await session.get(Application, application_id)
    if application is None:
        raise HTTPException(404, "Application not found")
    if application.status != "pending":
        raise HTTPException(400, f"Application already {application.status}")
    program_id = body_program_id or application.program_id
    if program_id is None:
        raise HTTPException(400, "This application has no program; pass program_id to approve it")
    program = await session.get(Program, program_id)
    if program is None:
        raise HTTPException(404, "Program not found")
    if not await has_program_perm(session, user, program_id, ACTION_MANAGE_INVITES):
        raise HTTPException(403, "Insufficient permissions for this program")
    return application, program


@router.post("/{application_id}/approve", response_model=InviteRead)
async def approve_application(
    application_id: UUID,
    payload: ApplicationDecision,
    user: StaffUser = Depends(current_staff),
    session: AsyncSession = Depends(get_session),
):
    """Approve → auto-create an invite (spec §3): same downstream flow as a direct staff invite."""
    application, program = await _decision_target(session, user, application_id, payload.program_id)
    settings = get_settings()
    invite = Invite(
        org_id=program.org_id,
        program_id=program.id,
        email=application.email.lower(),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.invite_ttl_days),
        created_by_id=user.id,
    )
    application.status = "approved"
    application.decided_by_id = user.id
    session.add(invite)
    await session.commit()
    await session.refresh(invite)
    await get_notifier().notify(
        "application_approved",
        f"✅ Application from {application.email} approved → invite issued for {program.name}",
    )
    return invite


@router.post("/{application_id}/reject", response_model=ApplicationRead)
async def reject_application(
    application_id: UUID,
    payload: ApplicationDecision,
    user: StaffUser = Depends(current_staff),
    session: AsyncSession = Depends(get_session),
):
    application = await session.get(Application, application_id)
    if application is None:
        raise HTTPException(404, "Application not found")
    if application.status != "pending":
        raise HTTPException(400, f"Application already {application.status}")
    if application.program_id is not None:
        if not await has_program_perm(session, user, application.program_id, ACTION_MANAGE_INVITES):
            raise HTTPException(403, "Insufficient permissions for this program")
    elif not has_global_role(user, "org_admin"):
        raise HTTPException(403, "Insufficient permissions")
    application.status = "rejected"
    application.decided_by_id = user.id
    await session.commit()
    await session.refresh(application)
    return application
