import uuid

from fastapi import Depends, Response
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin
from fastapi_users.authentication import AuthenticationBackend, CookieTransport, JWTStrategy
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session
from app.models import Researcher, StaffUser

settings = get_settings()


class StaffManager(UUIDIDMixin, BaseUserManager[StaffUser, uuid.UUID]):
    reset_password_token_secret = settings.secret
    verification_token_secret = settings.secret


class ResearcherManager(UUIDIDMixin, BaseUserManager[Researcher, uuid.UUID]):
    reset_password_token_secret = settings.secret
    verification_token_secret = settings.secret


async def get_staff_db(session: AsyncSession = Depends(get_session)):
    yield SQLAlchemyUserDatabase(session, StaffUser)


async def get_researcher_db(session: AsyncSession = Depends(get_session)):
    yield SQLAlchemyUserDatabase(session, Researcher)


async def get_staff_manager(user_db=Depends(get_staff_db)):
    yield StaffManager(user_db)


async def get_researcher_manager(user_db=Depends(get_researcher_db)):
    yield ResearcherManager(user_db)


def _make_backend(name: str, cookie_name: str, secret: str) -> AuthenticationBackend:
    transport = CookieTransport(
        cookie_name=cookie_name,
        cookie_max_age=settings.jwt_lifetime_seconds,
        cookie_httponly=True,
        cookie_secure=settings.cookie_secure,
        cookie_samesite="lax",
        cookie_domain=settings.cookie_domain,
    )

    def get_strategy() -> JWTStrategy:
        return JWTStrategy(secret=secret, lifetime_seconds=settings.jwt_lifetime_seconds)

    return AuthenticationBackend(name=name, transport=transport, get_strategy=get_strategy)


staff_backend = _make_backend("staff-cookie", "bb_staff", settings.staff_secret)
researcher_backend = _make_backend("researcher-cookie", "bb_researcher", settings.researcher_secret)

staff_users = FastAPIUsers[StaffUser, uuid.UUID](get_staff_manager, [staff_backend])
researcher_users = FastAPIUsers[Researcher, uuid.UUID](get_researcher_manager, [researcher_backend])

current_staff = staff_users.current_user(active=True)
current_researcher = researcher_users.current_user(active=True)


def set_auth_cookie(response: Response, backend: AuthenticationBackend, token: str) -> None:
    """Mirror the backend transport's cookie config (used for auto-login after invite signup)."""
    t = backend.transport
    response.set_cookie(
        key=t.cookie_name,
        value=token,
        max_age=t.cookie_max_age,
        path=t.cookie_path,
        httponly=t.cookie_httponly,
        samesite=t.cookie_samesite,
        secure=t.cookie_secure,
        domain=t.cookie_domain,
    )
