"""Hacktivity: platform-wide activity feed visible to every logged-in user.

Privacy: report titles and details are never exposed — only program, severity, bug type and
(for opted-in researchers) the name. Private and draft programs never appear.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import _aware
from app.constants import SCORED_STATUSES
from app.core.deps import get_actor
from app.database import get_session
from app.models import Program, Report, Researcher
from app.schemas import HacktivityEvent

router = APIRouter(tags=["hacktivity"])

_VISIBLE = (Program.visibility.in_(("public", "internal")), Program.status.not_in(("draft", "suspended")))


@router.get("/hacktivity", response_model=list[HacktivityEvent])
async def hacktivity(
    limit: int = 30,
    before: datetime | None = None,
    _actor=Depends(get_actor),
    session: AsyncSession = Depends(get_session),
):
    """Newest first; pass the last event's `at` as `before` to load older ones."""
    limit = max(1, min(limit, 100))
    events: list[HacktivityEvent] = []

    reports = (
        select(Report, Program, Researcher)
        .join(Program, Report.program_id == Program.id)
        .outerjoin(Researcher, Report.researcher_id == Researcher.id)
        .where(Report.status.in_(SCORED_STATUSES), *_VISIBLE)
        .order_by(Report.updated_at.desc())
        .limit(limit)
    )
    if before is not None:
        reports = reports.where(Report.updated_at < before)
    for report, program, researcher in (await session.execute(reports)).all():
        shown = researcher is not None and researcher.leaderboard_opt_in and researcher.status != "banned"
        events.append(
            HacktivityEvent(
                kind="report_resolved" if report.status == "resolved" else "report_accepted",
                at=_aware(report.updated_at),
                program_name=program.name,
                program_slug=program.slug,
                researcher_name=(researcher.name or researcher.email.split("@")[0]) if shown else "Anonymous researcher",
                severity=report.severity,
                cwe_name=report.cwe_name,
            )
        )

    programs = select(Program).where(Program.status == "active", *_VISIBLE).order_by(Program.created_at.desc()).limit(limit)
    if before is not None:
        programs = programs.where(Program.created_at < before)
    for program in (await session.scalars(programs)).all():
        events.append(
            HacktivityEvent(
                kind="program_launched", at=_aware(program.created_at),
                program_name=program.name, program_slug=program.slug,
            )
        )

    events.sort(key=lambda e: e.at, reverse=True)
    return events[:limit]
