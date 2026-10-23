"""Leaderboard, researcher stats and per-program hall of fame (spec §5, phase 2).

Points come from accepted/resolved reports weighted by severity (constants.SEVERITY_POINTS).
Only researchers with `leaderboard_opt_in` and a non-banned account are ranked; public-form
(anonymous) reports never score.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import ACTION_VIEW_REPORTS, SCORED_STATUSES, SEVERITIES, SEVERITY_POINTS
from app.core.deps import get_actor
from app.core.permissions import has_program_perm
from app.database import get_session
from app.models import Program, ProgramMembership, Report, Researcher
from app.schemas import HallOfFame, LeaderboardEntry, ResearcherStats

router = APIRouter(tags=["leaderboard"])


async def _ranked(
    session: AsyncSession, program_id: UUID | None, me_id: UUID | None = None
) -> list[LeaderboardEntry]:
    query = (
        select(Researcher.id, Researcher.name, Researcher.email, Report.severity)
        .join(Report, Report.researcher_id == Researcher.id)
        .where(
            Report.status.in_(SCORED_STATUSES),
            Researcher.leaderboard_opt_in.is_(True),
            Researcher.status != "banned",
        )
    )
    if program_id is not None:
        query = query.where(Report.program_id == program_id)
    totals: dict[UUID, dict] = {}
    for rid, name, email, severity in (await session.execute(query)).all():
        t = totals.setdefault(rid, {"name": name or email.split("@")[0], "accepted": 0, "points": 0})
        t["accepted"] += 1
        t["points"] += SEVERITY_POINTS.get(severity, 0)
    ordered = sorted(totals.items(), key=lambda kv: (-kv[1]["points"], -kv[1]["accepted"], kv[1]["name"].lower()))
    entries: list[LeaderboardEntry] = []
    for index, (rid, t) in enumerate(ordered):
        prev = entries[-1] if entries else None
        tied = prev is not None and (prev.points, prev.accepted) == (t["points"], t["accepted"])
        entries.append(
            LeaderboardEntry(
                rank=prev.rank if tied else index + 1,
                name=t["name"], accepted=t["accepted"], points=t["points"], is_me=rid == me_id,
            )
        )
    return entries


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def leaderboard(
    program_id: UUID | None = None,
    limit: int = 50,
    actor=Depends(get_actor),
    session: AsyncSession = Depends(get_session),
):
    """Global ranking, or per program (members / staff with view access only)."""
    if program_id is not None:
        if actor.kind == "researcher":
            member = await session.scalar(
                select(ProgramMembership).where(
                    ProgramMembership.researcher_id == actor.researcher.id,
                    ProgramMembership.program_id == program_id,
                )
            )
            if member is None:
                raise HTTPException(404, "Program not found")
        elif not await has_program_perm(session, actor.staff, program_id, ACTION_VIEW_REPORTS):
            raise HTTPException(403, "Insufficient permissions for this program")
    me_id = actor.researcher.id if actor.kind == "researcher" else None
    return (await _ranked(session, program_id, me_id))[: max(1, min(limit, 200))]


@router.get("/me/stats", response_model=ResearcherStats)
async def my_stats(actor=Depends(get_actor), session: AsyncSession = Depends(get_session)):
    if actor.kind != "researcher":
        raise HTTPException(403, "Researcher account required")
    me = actor.researcher
    reports = (await session.execute(select(Report.status, Report.severity).where(Report.researcher_id == me.id))).all()
    scored = [sev for st, sev in reports if st in SCORED_STATUSES]
    avg = None
    if scored:
        avg = SEVERITIES[round(sum(SEVERITIES.index(s) for s in scored if s in SEVERITIES) / len(scored))]
    rank = next((e.rank for e in await _ranked(session, None, me.id) if e.is_me), None)
    return ResearcherStats(
        submitted=len(reports), accepted=len(scored),
        points=sum(SEVERITY_POINTS.get(s, 0) for s in scored),
        avg_severity=avg, rank=rank, leaderboard_opt_in=me.leaderboard_opt_in,
    )


@router.get("/public/programs/{slug}/hall-of-fame", response_model=HallOfFame)
async def hall_of_fame(slug: str, session: AsyncSession = Depends(get_session)):
    """Public hall of fame — only for public programs (private ones 404)."""
    program = await session.scalar(select(Program).where(Program.slug == slug))
    if program is None or program.visibility != "public" or program.status == "draft":
        raise HTTPException(404, "Program not found")
    return HallOfFame(
        program_name=program.name, program_slug=program.slug, entries=await _ranked(session, program.id)
    )
