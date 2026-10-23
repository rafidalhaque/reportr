import uuid

import jwt as pyjwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.constants import JWT_AUDIENCE, RESEARCHER_COOKIE, STAFF_COOKIE
from app.database import get_session
from app.models import Researcher, StaffUser

settings = get_settings()


class Actor:
    """Either an authenticated staff member or researcher (never both)."""

    def __init__(self, kind: str, staff: StaffUser | None = None, researcher: Researcher | None = None):
        self.kind = kind
        self.staff = staff
        self.researcher = researcher


async def _user_from_cookie(request: Request, session: AsyncSession, cookie_name: str, secret: str, model):
    token = request.cookies.get(cookie_name)
    if not token:
        return None
    try:
        payload = pyjwt.decode(token, secret, algorithms=["HS256"], audience=JWT_AUDIENCE)
    except pyjwt.PyJWTError:
        return None
    sub = payload.get("sub")
    try:
        user_id = uuid.UUID(sub)
    except (TypeError, ValueError):
        return None
    user = await session.get(model, user_id)
    if user is None or not user.is_active:
        return None
    return user


async def get_actor(
    request: Request, session: AsyncSession = Depends(get_session)
) -> Actor:
    staff = await _user_from_cookie(request, session, STAFF_COOKIE, settings.staff_secret, StaffUser)
    if staff is not None:
        return Actor("staff", staff=staff)
    researcher = await _user_from_cookie(
        request, session, RESEARCHER_COOKIE, settings.researcher_secret, Researcher
    )
    if researcher is not None:
        return Actor("researcher", researcher=researcher)
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")

