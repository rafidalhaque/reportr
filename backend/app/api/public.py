from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import load_valid_invite, mask_email
from app.api.settings import get_or_create_settings
from app.config import get_settings
from app.cwe import resolve_cwe
from app.database import get_session
from app.models import Application, Program, Report, Researcher, ScopeEntry
from app.schemas import (
    ApplicationCreate,
    ApplicationRead,
    InviteInfo,
    PlatformSettingsRead,
    PublicProgramOut,
    PublicReportCreate,
    PublicReportFormInfo,
    PublicReportSubmitOut,
    ScopeEntryRead,
)
from app.services.notifications import send_notification
from app.services.rate_limit import rate_limit

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/platform", response_model=PlatformSettingsRead)
async def public_platform_info(session: AsyncSession = Depends(get_session)):
    """Platform flags the public site needs before rendering its forms."""
    settings = await get_or_create_settings(session)
    return PlatformSettingsRead(researcher_applications_enabled=settings.researcher_applications_enabled)


@router.get("/programs", response_model=list[PublicProgramOut])
async def public_programs(session: AsyncSession = Depends(get_session)):
    """Open programs visible to unauthenticated visitors (public listing page)."""
    programs = (
        await session.scalars(
            select(Program).where(Program.status == "active", Program.visibility == "public")
        )
    ).all()
    return [
        PublicProgramOut(
            id=p.id, name=p.name, slug=p.slug, description=p.description, public_reporting=p.public_reporting
        )
        for p in programs
    ]


@router.get("/invites/{token}", response_model=InviteInfo)
async def invite_info(token: str, session: AsyncSession = Depends(get_session)):
    """Invite landing page pre-check (no auth): is the token valid, which program, masked email."""
    try:
        invite = await load_valid_invite(session, token)
    except HTTPException as exc:
        return InviteInfo(valid=False, reason=exc.detail)
    program = await session.get(Program, invite.program_id)
    return InviteInfo(valid=True, program_name=program.name if program else None, email_masked=mask_email(invite.email))


@router.post(
    "/applications",
    response_model=ApplicationRead,
    status_code=201,
    dependencies=[Depends(rate_limit("public_application", get_settings().rate_limit_applications))],
)
async def public_apply(payload: ApplicationCreate, session: AsyncSession = Depends(get_session)):
    """Unauthenticated 'apply to join' — can be disabled platform-wide by a super admin."""
    settings = await get_or_create_settings(session)
    if not settings.researcher_applications_enabled:
        raise HTTPException(403, "Researcher applications are currently closed")

    email = payload.email.lower()
    program = None
    if payload.program_id is not None:
        program = await session.get(Program, payload.program_id)
        if program is None or program.visibility != "public" or program.status != "active":
            raise HTTPException(400, "This program is not accepting applications")

    researcher = await session.scalar(select(Researcher).where(Researcher.email == email))
    if researcher is None:
        researcher = Researcher(
            email=email,
            name=payload.name,
            hashed_password="",  # set when the invite is accepted
            status="applicant",
            is_active=True,
        )
        session.add(researcher)
    elif researcher.status == "banned":
        raise HTTPException(403, "This account cannot apply")

    application = Application(
        org_id=program.org_id if program else None,
        email=email,
        name=payload.name,
        program_id=program.id if program else None,
        message=payload.message,
        portfolio_url=payload.portfolio_url,
    )
    session.add(application)
    await session.commit()
    await session.refresh(application)
    await send_notification(
        session,
        "new_application",
        program.id if program else None,
        {
            "email": email,
            "for_program": f" for {program.name}" if program else "",
            "message": payload.message or "—",
            "portfolio": payload.portfolio_url or "—",
        },
    )
    return application


@router.get("/programs/{slug}/report-form", response_model=PublicReportFormInfo)
async def public_report_form_info(slug: str, session: AsyncSession = Depends(get_session)):
    """Pre-check for the shareable public report form (enabled per program in its settings).

    For public programs the program details and structured scope are included so the
    reporter can see what's in and out of scope before submitting (todo #15).
    """
    program = await session.scalar(select(Program).where(Program.slug == slug))
    if program is None:
        raise HTTPException(404, "Program not found")
    if not program.public_reporting:
        available, reason = False, "Public reporting is disabled for this program"
    elif program.status != "active":
        available, reason = False, "This program is not accepting reports right now"
    else:
        available, reason = True, None

    scope_markdown, scope_entries = "", []
    if program.visibility == "public":
        scope_markdown = program.scope_markdown
        scope_entries = list(
            (
                await session.scalars(
                    select(ScopeEntry)
                    .where(ScopeEntry.program_id == program.id)
                    .order_by(ScopeEntry.created_at)
                )
            ).all()
        )

    return PublicReportFormInfo(
        available=available,
        reason=reason,
        program_name=program.name,
        program_slug=program.slug,
        description=program.description,
        scope_markdown=scope_markdown,
        scope_entries=[ScopeEntryRead.model_validate(e) for e in scope_entries],
    )


@router.post(
    "/programs/{slug}/reports",
    response_model=PublicReportSubmitOut,
    status_code=201,
    dependencies=[Depends(rate_limit("public_report", get_settings().rate_limit_reports, key_param="slug"))],
)
async def public_submit_report(
    slug: str, payload: PublicReportCreate, session: AsyncSession = Depends(get_session)
):
    """Anonymous or email-only report submission (no account, no membership required)."""
    program = await session.scalar(select(Program).where(Program.slug == slug))
    if program is None:
        raise HTTPException(404, "Program not found")
    if not program.public_reporting:
        raise HTTPException(403, "Public reporting is disabled for this program")
    if program.status != "active":
        raise HTTPException(400, "This program is not accepting reports right now")

    try:
        cwe = resolve_cwe(payload.cwe_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc))

    report = Report(
        org_id=program.org_id,
        program_id=program.id,
        researcher_id=None,
        submitter_email=payload.email.lower() if payload.email else None,
        title=payload.title,
        description=payload.description,
        severity=payload.severity,
        cvss=payload.cvss,
        cwe_id=cwe[0] if cwe else None,
        cwe_name=cwe[1] if cwe else None,
        repro_steps=payload.repro_steps,
        affected_asset=payload.affected_asset,
    )
    session.add(report)
    await session.commit()
    await session.refresh(report)
    await send_notification(
        session,
        "new_report",
        program.id,
        {
            "severity": report.severity,
            "program": program.name,
            "title": report.title,
            "reference": report.id.hex[:8].upper(),
            "reporter": report.submitter_email or "Anonymous (public form)",
            "cwe": f"{report.cwe_id} — {report.cwe_name}" if report.cwe_id else "—",
            "description": (report.description or "")[:600],
        },
    )
    return PublicReportSubmitOut(id=report.id, reference=report.id.hex[:8].upper(), email=report.submitter_email)
