from contextlib import asynccontextmanager
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import Invite

settings = get_settings()

scheduler = AsyncIOScheduler(timezone="UTC")


async def expire_invites() -> None:
    """Background job: delete unaccepted, unrevoked invites past their expiry."""
    async with AsyncSessionLocal() as session:
        await session.execute(
            delete(Invite).where(
                Invite.accepted_at.is_(None),
                Invite.revoked.is_(False),
                Invite.expires_at < datetime.now(timezone.utc),
            )
        )
        await session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.seed_on_start:
        from app.seed import run_seed

        await run_seed()
    if settings.env != "test":
        scheduler.add_job(expire_invites, "interval", hours=1, id="expire_invites")
        scheduler.start()
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api import applications, auth, programs, public, reports, staff  # noqa: E402
from app.api import email_admin as email_admin_api  # noqa: E402
from app.api import scope as scope_api  # noqa: E402
from app.api import settings as settings_api  # noqa: E402  (aliased: `settings` is the config object)

app.include_router(auth.me_router, prefix="/api")
app.include_router(auth.router, prefix="/api/auth")
app.include_router(programs.router, prefix="/api")
app.include_router(staff.router, prefix="/api")
app.include_router(applications.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(settings_api.router, prefix="/api")
app.include_router(scope_api.router, prefix="/api")
app.include_router(email_admin_api.router, prefix="/api")
app.include_router(public.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
