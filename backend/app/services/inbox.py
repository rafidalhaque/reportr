"""Researcher-side notifications (in-app inbox + best-effort email)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Invite, Notification, Program, Researcher
from app.services.notifications import render_event, send_user_email


async def notify_invited_researcher(session: AsyncSession, invite: Invite, program: Program) -> bool:
    """Tell the invitee about their invite. Best effort; never raises.

    - Existing account: in-app inbox notification + email pointing at the inbox.
    - No account yet (e.g. approved applicant): email with the activation link.
    Email needs platform SMTP; returns True when an email was actually sent.
    """
    try:
        frontend = get_settings().frontend_url
        researcher = await session.scalar(select(Researcher).where(Researcher.email == invite.email.lower()))
        if researcher is not None and researcher.hashed_password and researcher.status != "banned":
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
            event, link = "invite_existing", f"{frontend}/researcher/notifications"
        else:
            event, link = "invite_new", f"{frontend}/invite/{invite.token}"
        subject, body = await render_event(
            session,
            event,
            {"program": program.name, "email": invite.email, "link": link, "expires": f"{invite.expires_at:%Y-%m-%d}"},
        )
        return await send_user_email(session, invite.email, subject, body)
    except Exception:
        await session.rollback()
        return False
