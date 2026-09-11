import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    get_researcher_manager,
    researcher_backend,
    researcher_users,
    set_auth_cookie,
    staff_backend,
    staff_users,
)
from app.core.deps import get_actor
from app.database import get_session
from app.models import Invite, ProgramMembership, Researcher
from app.schemas import MeRead, RegisterWithInvite, ResearcherRead

router = APIRouter(tags=["auth"])
me_router = APIRouter(tags=["me"])

# fastapi-users login/logout, cookie-based, one namespace per user kind
router.include_router(staff_users.get_auth_router(staff_backend), prefix="/staff")
router.include_router(researcher_users.get_auth_router(researcher_backend), prefix="/researchers")


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    return f"{local[:1]}***@{domain}"


def _aware(dt: datetime) -> datetime:
    # SQLite returns naive datetimes even for timezone=True columns; Postgres returns aware ones.
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def load_valid_invite(session: AsyncSession, token: str) -> Invite:
    invite = await session.scalar(select(Invite).where(Invite.token == token))
    if invite is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid invite token")
    if invite.revoked:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This invite has been revoked")
    if invite.accepted_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This invite has already been used")
    if _aware(invite.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This invite has expired")
    return invite


@me_router.get("/me", response_model=MeRead)
async def me(actor=Depends(get_actor)):
    if actor.kind == "staff":
        u = actor.staff
        return MeRead(kind="staff", id=u.id, email=u.email, name=u.name, global_role=u.global_role)
    u = actor.researcher
    return MeRead(kind="researcher", id=u.id, email=u.email, name=u.name, researcher_status=u.status)


@router.post("/researchers/register", response_model=ResearcherRead, status_code=status.HTTP_201_CREATED)
async def register_researcher_with_invite(
    payload: RegisterWithInvite,
    response: Response,
    manager=Depends(get_researcher_manager),
    session: AsyncSession = Depends(get_session),
):
    """Invite-token activation (spec §2): validate token -> create/activate researcher -> grant membership -> auto-login."""
    invite = await load_valid_invite(session, payload.token)
    email = invite.email.lower()

    researcher = await session.scalar(select(Researcher).where(Researcher.email == email))
    if researcher is None:
        researcher = Researcher(
            email=email,
            name=payload.name or email.split("@")[0],
            hashed_password=manager.password_helper.hash(payload.password),
            status="active",
            is_active=True,
        )
        session.add(researcher)
        await session.flush()
    elif researcher.status == "banned":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been banned")
    else:
        if not researcher.hashed_password:  # applicant row created via public form, no account yet
            researcher.hashed_password = manager.password_helper.hash(payload.password)
        if payload.name:
            researcher.name = payload.name
        researcher.status = "active"

    membership = await session.scalar(
        select(ProgramMembership).where(
            ProgramMembership.researcher_id == researcher.id,
            ProgramMembership.program_id == invite.program_id,
        )
    )
    if membership is None:
        session.add(ProgramMembership(researcher_id=researcher.id, program_id=invite.program_id))
    invite.accepted_at = datetime.now(timezone.utc)
    await session.commit()

    strategy = researcher_backend.get_strategy()
    token = await strategy.write_token(researcher)
    set_auth_cookie(response, researcher_backend, token)
    return researcher
