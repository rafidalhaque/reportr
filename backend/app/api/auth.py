import uuid
from datetime import datetime, timedelta, timezone

import jwt as pyjwt
from fastapi import APIRouter, Body, Depends, HTTPException, Response, status
from fastapi_users.password import PasswordHelper
from pydantic import BaseModel, EmailStr, Field
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
from app.constants import EMAIL_CHANGE_AUDIENCE
from app.core.deps import get_actor
from app.database import AsyncSessionLocal, get_session
from app.models import Invite, Program, ProgramMembership, ProgramRole, Researcher, StaffUser
from app.schemas import (
    MeRead,
    ProfileMembership,
    ProfileRead,
    ProfileUpdate,
    RegisterWithInvite,
    ResearcherRead,
)
from app.config import get_settings
from app.services.rate_limit import rate_limit

router = APIRouter(tags=["auth"])
me_router = APIRouter(tags=["me"])

# fastapi-users login/logout, cookie-based, one namespace per user kind
router.include_router(staff_users.get_auth_router(staff_backend), prefix="/staff")
router.include_router(staff_users.get_reset_password_router(), prefix="/staff",
                      dependencies=[Depends(rate_limit("forgot_password", "5/hour"))])
router.include_router(researcher_users.get_auth_router(researcher_backend), prefix="/researchers")
router.include_router(researcher_users.get_reset_password_router(), prefix="/researchers",
                      dependencies=[Depends(rate_limit("forgot_password", "5/hour"))])


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


async def _build_profile(actor, session: AsyncSession) -> ProfileRead:
    if actor.kind == "staff":
        u = actor.staff
        rows = (
            await session.execute(
                select(ProgramRole, Program)
                .join(Program, ProgramRole.program_id == Program.id)
                .where(ProgramRole.staff_id == u.id)
                .order_by(ProgramRole.created_at)
            )
        ).all()
        memberships = [
            ProfileMembership(
                program_id=program.id, program_name=program.name, program_slug=program.slug,
                role=role.role, joined_at=role.created_at,
            )
            for role, program in rows
        ]
        return ProfileRead(
            kind="staff", id=u.id, email=u.email, name=u.name,
            global_role=u.global_role, memberships=memberships,
        )
    u = actor.researcher
    rows = (
        await session.execute(
            select(ProgramMembership, Program)
            .join(Program, ProgramMembership.program_id == Program.id)
            .where(ProgramMembership.researcher_id == u.id)
            .order_by(ProgramMembership.created_at)
        )
    ).all()
    memberships = [
        ProfileMembership(
            program_id=program.id, program_name=program.name, program_slug=program.slug,
            role="member", joined_at=membership.created_at,
        )
        for membership, program in rows
    ]
    return ProfileRead(
        kind="researcher", id=u.id, email=u.email, name=u.name,
        researcher_status=u.status, portfolio_url=u.portfolio_url, memberships=memberships,
    )


@me_router.get("/me/profile", response_model=ProfileRead)
async def my_profile(actor=Depends(get_actor), session: AsyncSession = Depends(get_session)):
    return await _build_profile(actor, session)


@me_router.patch("/me", response_model=ProfileRead)
async def update_me(
    payload: ProfileUpdate, actor=Depends(get_actor), session: AsyncSession = Depends(get_session)
):
    """Edit own profile: name for everyone, portfolio URL for researchers (todo #13).

    Email and password changes live in /me/email and /me/password (todo #14b).
    """
    data = payload.model_dump(exclude_unset=True)
    user = actor.staff if actor.kind == "staff" else actor.researcher
    if data.get("name") is not None:
        user.name = data["name"].strip()
    if actor.kind == "researcher" and "portfolio_url" in data:
        user.portfolio_url = data["portfolio_url"] or None
    await session.commit()
    await session.refresh(user)
    return await _build_profile(actor, session)


# --- Account security: password + email change (todo #14b) -------------------


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    current_password: str


class VerifyEmailChangeRequest(BaseModel):
    token: str


@me_router.patch("/me/password")
async def change_password(
    payload: ChangePasswordRequest,
    actor=Depends(get_actor),
    session: AsyncSession = Depends(get_session),
):
    """Authenticated password change — re-authenticates with the current password."""
    user = actor.staff if actor.kind == "staff" else actor.researcher
    valid, updated_hash = PasswordHelper().verify_and_update(
        payload.current_password, user.hashed_password
    )
    if not valid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.hashed_password = PasswordHelper().hash(payload.new_password)
    await session.commit()
    return {"ok": True}


def _email_change_token(user_id, new_email: str, kind: str) -> str:
    secret = get_settings().staff_secret if kind == "staff" else get_settings().researcher_secret
    return pyjwt.encode(
        {"sub": str(user_id), "new_email": new_email, "kind": kind, "type": "email_change",
         "aud": EMAIL_CHANGE_AUDIENCE,
         "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        secret,
        algorithm="HS256",
    )


@me_router.post("/me/email")
async def request_email_change(
    payload: ChangeEmailRequest,
    actor=Depends(get_actor),
    session: AsyncSession = Depends(get_session),
):
    """Email change: a verification link is emailed to the NEW address."""
    from app.services.notifications import send_user_email

    user = actor.staff if actor.kind == "staff" else actor.researcher
    valid, _ = PasswordHelper().verify_and_update(payload.current_password, user.hashed_password)
    if not valid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    new_email = payload.new_email.lower()
    if new_email == user.email.lower():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That is already your email")
    model = StaffUser if actor.kind == "staff" else Researcher
    if await session.scalar(select(model).where(model.email == new_email)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That email is already in use")

    kind = "staff" if actor.kind == "staff" else "researchers"
    token = _email_change_token(user.id, new_email, kind)
    link = f"{get_settings().frontend_url}/verify-email?token={token}"
    sent = await send_user_email(
        session,
        new_email,
        "Confirm your new email",
        (
            "Confirm your new email address by opening this link (valid for 1 hour):\n"
            f"{link}\n\n"
            "If you didn't request this, ignore this email and your address stays unchanged."
        ),
    )
    if not sent:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Email delivery is not configured — ask an administrator to enable platform SMTP",
        )
    return {"sent": True, "new_email": new_email}


@me_router.post("/me/email/verify")
async def verify_email_change(
    payload: VerifyEmailChangeRequest,
    session: AsyncSession = Depends(get_session),
):
    """Confirm an email change from the emailed link (no auth — the token is the proof)."""
    settings = get_settings()
    for kind, secret in (("staff", settings.staff_secret), ("researchers", settings.researcher_secret)):
        try:
            claims = pyjwt.decode(
                payload.token, secret, algorithms=["HS256"], audience=EMAIL_CHANGE_AUDIENCE
            )
        except pyjwt.PyJWTError:
            continue
        if claims.get("type") != "email_change" or claims.get("kind") != kind:
            continue
        model = StaffUser if kind == "staff" else Researcher
        user = await session.get(model, uuid.UUID(claims["sub"]))
        if user is None:
            break
        new_email = claims["new_email"]
        existing = await session.scalar(select(model).where(model.email == new_email))
        if existing is not None and existing.id != user.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That email is already in use")
        user.email = new_email
        await session.commit()
        return {"email": new_email, "kind": kind}
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired verification link")


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
