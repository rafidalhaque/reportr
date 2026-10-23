"""Super-admin platform directory: all researchers, and promotion to staff/triager."""

from fastapi import APIRouter, Depends, HTTPException, status as http
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.programs import get_default_org
from app.core.guards import require_global
from app.database import get_session
from app.models import Program, ProgramMembership, ProgramRole, Report, Researcher, StaffUser
from app.schemas import AdminResearcherRead, PromoteRequest, StaffRead

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/researchers", response_model=list[AdminResearcherRead])
async def list_researchers(
    q: str = "",
    status: str | None = None,
    _admin: StaffUser = Depends(require_global()),  # super_admin only
    session: AsyncSession = Depends(get_session),
):
    query = select(Researcher).order_by(Researcher.email)
    if q.strip():
        like = f"%{q.strip().lower()}%"
        query = query.where(func.lower(Researcher.email).like(like) | func.lower(Researcher.name).like(like))
    if status:
        query = query.where(Researcher.status == status)
    researchers = (await session.scalars(query)).all()
    reports = dict((await session.execute(
        select(Report.researcher_id, func.count()).where(Report.researcher_id.is_not(None)).group_by(Report.researcher_id)
    )).all())
    programs = dict((await session.execute(
        select(ProgramMembership.researcher_id, func.count()).group_by(ProgramMembership.researcher_id)
    )).all())
    staff_emails = set((await session.scalars(select(func.lower(StaffUser.email)))).all())
    return [
        AdminResearcherRead(
            id=r.id, email=r.email, name=r.name, status=r.status, portfolio_url=r.portfolio_url,
            has_account=bool(r.hashed_password), reports=reports.get(r.id, 0), programs=programs.get(r.id, 0),
            is_staff=r.email.lower() in staff_emails,
        )
        for r in researchers
    ]


@router.post("/researchers/{researcher_id}/promote", response_model=StaffRead)
async def promote_researcher(
    researcher_id: str,
    payload: PromoteRequest,
    _admin: StaffUser = Depends(require_global()),
    session: AsyncSession = Depends(get_session),
):
    """Give a researcher a staff login (same email + password hash), optionally as triager of a program.

    The researcher account stays; staff and researcher sign-ins remain separate.
    """
    from uuid import UUID

    try:
        rid = UUID(researcher_id)
    except ValueError:
        raise HTTPException(http.HTTP_404_NOT_FOUND, "Researcher not found")
    researcher = await session.get(Researcher, rid)
    if researcher is None:
        raise HTTPException(http.HTTP_404_NOT_FOUND, "Researcher not found")
    if not researcher.hashed_password:
        raise HTTPException(http.HTTP_400_BAD_REQUEST, "This researcher has not activated an account yet")
    if researcher.status == "banned":
        raise HTTPException(http.HTTP_403_FORBIDDEN, "Banned researchers cannot be promoted")

    program = None
    if payload.role == "triager":
        if payload.program_id is None:
            raise HTTPException(http.HTTP_400_BAD_REQUEST, "program_id is required to promote to triager")
        program = await session.get(Program, payload.program_id)
        if program is None:
            raise HTTPException(http.HTTP_404_NOT_FOUND, "Program not found")

    staff = await session.scalar(select(StaffUser).where(func.lower(StaffUser.email) == researcher.email.lower()))
    if staff is None:
        org = await get_default_org(session)
        staff = StaffUser(
            email=researcher.email.lower(), name=researcher.name, hashed_password=researcher.hashed_password,
            global_role="staff", is_active=True, org_id=org.id if org else None,
        )
        session.add(staff)
        await session.flush()
    elif payload.role == "staff":
        raise HTTPException(http.HTTP_409_CONFLICT, "A staff account with this email already exists")

    if program is not None:
        role = await session.scalar(
            select(ProgramRole).where(ProgramRole.staff_id == staff.id, ProgramRole.program_id == program.id)
        )
        if role is None:
            session.add(ProgramRole(staff_id=staff.id, program_id=program.id, role="triager"))
        elif role.role == "viewer":  # never downgrade an owner
            role.role = "triager"
    await session.commit()
    await session.refresh(staff)
    return staff
