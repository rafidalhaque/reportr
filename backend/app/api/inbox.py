"""Researcher inbox: notifications and accepting/declining program invitations."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import _aware, load_valid_invite
from app.core.deps import Actor, get_actor
from app.database import get_session
from app.models import Invite, Notification, ProgramMembership, Researcher
from app.schemas import NotificationRead, UnreadCount

router = APIRouter(prefix="/me", tags=["inbox"])


async def _researcher(actor: Actor = Depends(get_actor)) -> Researcher:
    if actor.kind != "researcher":
        raise HTTPException(403, "Researcher account required")
    return actor.researcher


def _pending(invite: Invite | None, email: str) -> bool:
    return (
        invite is not None
        and invite.email.lower() == email.lower()
        and not invite.revoked
        and invite.accepted_at is None
        and _aware(invite.expires_at) >= datetime.now(timezone.utc)
    )


@router.get("/notifications", response_model=list[NotificationRead])
async def list_notifications(
    me: Researcher = Depends(_researcher), session: AsyncSession = Depends(get_session)
):
    rows = (
        await session.scalars(
            select(Notification).where(Notification.researcher_id == me.id).order_by(Notification.created_at.desc()).limit(100)
        )
    ).all()
    out = []
    for n in rows:
        invite = await session.get(Invite, n.invite_id) if n.invite_id else None
        out.append(
            NotificationRead(
                id=n.id, kind=n.kind, title=n.title, body=n.body, invite_id=n.invite_id,
                invite_pending=_pending(invite, me.email), read=n.read_at is not None, created_at=n.created_at,
            )
        )
    return out


@router.get("/notifications/unread-count", response_model=UnreadCount)
async def unread_count(me: Researcher = Depends(_researcher), session: AsyncSession = Depends(get_session)):
    count = await session.scalar(
        select(func.count()).select_from(Notification).where(
            Notification.researcher_id == me.id, Notification.read_at.is_(None)
        )
    )
    return UnreadCount(unread=int(count or 0))


@router.post("/notifications/read-all", status_code=204)
async def mark_all_read(me: Researcher = Depends(_researcher), session: AsyncSession = Depends(get_session)):
    await session.execute(
        update(Notification)
        .where(Notification.researcher_id == me.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(timezone.utc))
    )
    await session.commit()


async def _own_invite_notification(session: AsyncSession, me: Researcher, invite_id: UUID) -> tuple[Invite, list[Notification]]:
    invite = await session.get(Invite, invite_id)
    if invite is None or invite.email.lower() != me.email.lower():
        raise HTTPException(404, "Invitation not found")
    notes = (
        await session.scalars(
            select(Notification).where(Notification.researcher_id == me.id, Notification.invite_id == invite_id)
        )
    ).all()
    return invite, list(notes)


@router.post("/invites/{invite_id}/accept", status_code=204)
async def accept_invite(
    invite_id: UUID, me: Researcher = Depends(_researcher), session: AsyncSession = Depends(get_session)
):
    invite, notes = await _own_invite_notification(session, me, invite_id)
    await load_valid_invite(session, invite.token)  # revoked / used / expired -> 400
    if await session.scalar(
        select(ProgramMembership).where(
            ProgramMembership.researcher_id == me.id, ProgramMembership.program_id == invite.program_id
        )
    ) is None:
        session.add(ProgramMembership(researcher_id=me.id, program_id=invite.program_id))
    now = datetime.now(timezone.utc)
    invite.accepted_at = now
    for n in notes:
        n.read_at = n.read_at or now
    await session.commit()


@router.post("/invites/{invite_id}/decline", status_code=204)
async def decline_invite(
    invite_id: UUID, me: Researcher = Depends(_researcher), session: AsyncSession = Depends(get_session)
):
    invite, notes = await _own_invite_notification(session, me, invite_id)
    if invite.accepted_at is not None:
        raise HTTPException(400, "This invite has already been used")
    invite.revoked = True
    now = datetime.now(timezone.utc)
    for n in notes:
        n.read_at = n.read_at or now
    await session.commit()
