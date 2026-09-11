"""Idempotent seed: default org + super_admin + demo program (the `docker-compose up` onboarding story)."""

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import Org, PlatformSettings, Program, StaffUser

logger = logging.getLogger("seed")

DEMO_SCOPE = """## Scope

| Asset | In scope | Severity guide |
|---|---|---|
| `*.demo.example.com` | ✅ | Up to critical |
| `demo.example.com/api/*` | ✅ | Up to critical |
| Marketing site | ❌ | Out of scope |

## Rules

- No automated scanning without prior approval.
- Do not access data that is not yours.
- Report responsibly; give us 90 days before public disclosure.
"""


async def run_seed(session: AsyncSession | None = None) -> dict:
    settings = get_settings()
    own_session = session is None
    if own_session:
        session = AsyncSessionLocal()

    try:
        org = await session.scalar(select(Org).limit(1))
        if org is None:
            org = Org(name="Demo Org", slug="demo-org")
            session.add(org)
            await session.flush()
            logger.info("Created default org '%s'", org.name)

        if await session.get(PlatformSettings, 1) is None:
            session.add(PlatformSettings(id=1))
            logger.info("Created platform settings (researcher applications enabled)")

        admin_count = await session.scalar(select(func.count()).select_from(StaffUser))
        if not admin_count:
            from fastapi_users.password import PasswordHelper

            admin = StaffUser(
                email=settings.seed_admin_email.lower(),
                name="Admin",
                global_role="super_admin",
                hashed_password=PasswordHelper().hash(settings.seed_admin_password),
                is_active=True,
                org_id=org.id,
            )
            session.add(admin)
            logger.info("Created super_admin %s", admin.email)

        program_count = await session.scalar(select(func.count()).select_from(Program))
        if not program_count:
            program = Program(
                org_id=org.id,
                name="Demo Program",
                slug="demo-program",
                description="Example program seeded for local evaluation.",
                scope_markdown=DEMO_SCOPE,
                status="active",
                visibility="public",
            )
            session.add(program)
            logger.info("Created demo program '%s'", program.name)

        await session.commit()
        return {"org": org.slug}
    finally:
        if own_session:
            await session.close()
