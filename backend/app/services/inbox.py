"""Researcher-side notifications (in-app inbox + best-effort email)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Invite, Notification, Program, Researcher
from app.services.notifications import send_user_email


async def notify_invited_researcher(session: AsyncSession, invite: Invite, program: Program) -> bool:
    """If the invited email already has a researcher account, drop an invitation in their inbox.

    Returns True when a notification was created. Never raises (inbox is best effort).
    """
    try:
        researcher = await session.scalar(select(Researcher).where(Researcher.email == invite.email.lower()))
        if researcher is None or not researcher.hashed_password or researcher.status == "banned":
            return False  # no account yet -> they use the emailed/shared invite link instead
        session.add(
            Notification(
                researcher_id=researcher.id,
                kind="invite",
                title=f"You're invited to {program.name}",
                body="Open your notifications to accept or decline this invitation.",
                invite_id=invite.id,
            )
        )
        await session.commit()
        await send_user_email(
            session,
            researcher.email,
            f"You're invited to {program.name}",
            f"You've been invited to join {program.name}.\n"
            f"Sign in and open your notifications to accept: {get_settings().frontend_url}/researcher/notifications",
        )
        return True
    except Exception:
        await session.rollback()
        return False
