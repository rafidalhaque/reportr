"""Super-admin platform directory: all researchers, and promotion to staff/triager."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status as http
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.programs import get_default_org
from app.core.guards import require_global
from app.database import get_session
from app.models import ApplicationField, Notification, Program, ProgramMembership, ProgramRole, Report, Researcher, StaffUser
from app.schemas import (
    AdminMembershipAdd,
    AdminMembershipRead,
    AdminResearcherRead,
    AdminResearcherStatus,
    ApplicationFieldCreate,
    ApplicationFieldRead,
    ApplicationFieldUpdate,
    PromoteRequest,
    StaffRead,
)

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
            id=r.id, email=r.email, name=r.name, status=r.status, answers=r.answers or [],
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


# --- Program memberships, managed by a super admin on any researcher -----------


async def _researcher_or_404(session: AsyncSession, researcher_id: UUID) -> Researcher:
    researcher = await session.get(Researcher, researcher_id)
    if researcher is None:
        raise HTTPException(http.HTTP_404_NOT_FOUND, "Researcher not found")
    return researcher


@router.get("/researchers/{researcher_id}/memberships", response_model=list[AdminMembershipRead])
async def researcher_memberships(
    researcher_id: UUID,
    _admin: StaffUser = Depends(require_global()),
    session: AsyncSession = Depends(get_session),
):
    await _researcher_or_404(session, researcher_id)
    rows = (
        await session.execute(
            select(ProgramMembership, Program)
            .join(Program, ProgramMembership.program_id == Program.id)
            .where(ProgramMembership.researcher_id == researcher_id)
            .order_by(ProgramMembership.created_at)
        )
    ).all()
    return [
        AdminMembershipRead(program_id=p.id, program_name=p.name, program_status=p.status, joined_at=m.created_at)
        for m, p in rows
    ]


@router.post("/researchers/{researcher_id}/memberships", response_model=AdminMembershipRead, status_code=201)
async def assign_researcher(
    researcher_id: UUID,
    payload: AdminMembershipAdd,
    _admin: StaffUser = Depends(require_global()),
    session: AsyncSession = Depends(get_session),
):
    """Add a researcher straight to a program (no invite round-trip), e.g. after being removed elsewhere."""
    researcher = await _researcher_or_404(session, researcher_id)
    if not researcher.hashed_password:
        raise HTTPException(http.HTTP_400_BAD_REQUEST, "This researcher has not activated an account yet")
    if researcher.status == "banned":
        raise HTTPException(http.HTTP_403_FORBIDDEN, "Banned researchers cannot be assigned")
    program = await session.get(Program, payload.program_id)
    if program is None:
        raise HTTPException(http.HTTP_404_NOT_FOUND, "Program not found")
    if program.status == "suspended":
        raise HTTPException(http.HTTP_403_FORBIDDEN, "This program is suspended")
    membership = await session.scalar(
        select(ProgramMembership).where(
            ProgramMembership.researcher_id == researcher_id, ProgramMembership.program_id == program.id
        )
    )
    if membership is not None:
        raise HTTPException(http.HTTP_409_CONFLICT, "Already a member of this program")
    membership = ProgramMembership(researcher_id=researcher_id, program_id=program.id)
    session.add(membership)
    session.add(
        Notification(
            researcher_id=researcher_id,
            kind="membership",
            title=f"You were added to {program.name}",
            body="A platform admin gave you access to this program.",
        )
    )
    await session.commit()
    await session.refresh(membership)
    return AdminMembershipRead(
        program_id=program.id, program_name=program.name, program_status=program.status,
        joined_at=membership.created_at,
    )


@router.delete("/researchers/{researcher_id}/memberships/{program_id}", status_code=204)
async def unassign_researcher(
    researcher_id: UUID,
    program_id: UUID,
    _admin: StaffUser = Depends(require_global()),
    session: AsyncSession = Depends(get_session),
):
    await _researcher_or_404(session, researcher_id)
    await session.execute(
        delete(ProgramMembership).where(
            ProgramMembership.researcher_id == researcher_id, ProgramMembership.program_id == program_id
        )
    )
    await session.commit()


@router.patch("/researchers/{researcher_id}", response_model=AdminResearcherRead)
async def set_researcher_status(
    researcher_id: UUID,
    payload: AdminResearcherStatus,
    _admin: StaffUser = Depends(require_global()),
    session: AsyncSession = Depends(get_session),
):
    """Ban or reinstate a researcher (applicants without an account cannot be activated this way)."""
    researcher = await _researcher_or_404(session, researcher_id)
    if payload.status == "active" and not researcher.hashed_password:
        raise HTTPException(http.HTTP_400_BAD_REQUEST, "This researcher has not activated an account yet")
    researcher.status = payload.status
    await session.commit()
    rows = await list_researchers(q=researcher.email, status=None, _admin=_admin, session=session)
    return next(r for r in rows if r.id == researcher.id)


# --- Researcher application form fields ------------------------------------------


@router.get("/application-fields", response_model=list[ApplicationFieldRead])
async def list_application_fields(
    _admin: StaffUser = Depends(require_global()), session: AsyncSession = Depends(get_session)
):
    return list(
        (await session.scalars(select(ApplicationField).order_by(ApplicationField.position, ApplicationField.created_at))).all()
    )


@router.post("/application-fields", response_model=ApplicationFieldRead, status_code=201)
async def create_application_field(
    payload: ApplicationFieldCreate,
    _admin: StaffUser = Depends(require_global()),
    session: AsyncSession = Depends(get_session),
):
    last = await session.scalar(select(func.max(ApplicationField.position)))
    field = ApplicationField(**payload.model_dump(), position=(last if last is not None else -1) + 1)
    session.add(field)
    await session.commit()
    await session.refresh(field)
    return field


@router.patch("/application-fields/{field_id}", response_model=ApplicationFieldRead)
async def update_application_field(
    field_id: UUID,
    payload: ApplicationFieldUpdate,
    _admin: StaffUser = Depends(require_global()),
    session: AsyncSession = Depends(get_session),
):
    field = await session.get(ApplicationField, field_id)
    if field is None:
        raise HTTPException(http.HTTP_404_NOT_FOUND, "Field not found")
    data = payload.model_dump(exclude_unset=True)
    if data.get("options") is not None:
        data["options"] = list(dict.fromkeys(o.strip() for o in data["options"] if o.strip()))
        if field.field_type != "dropdown":
            data.pop("options")
        elif not data["options"]:
            raise HTTPException(http.HTTP_422_UNPROCESSABLE_ENTITY, "A dropdown needs at least one option")
    for key, value in data.items():
        if value is not None:
            setattr(field, key, value)
    await session.commit()
    await session.refresh(field)
    return field


@router.delete("/application-fields/{field_id}", status_code=204)
async def delete_application_field(
    field_id: UUID,
    _admin: StaffUser = Depends(require_global()),
    session: AsyncSession = Depends(get_session),
):
    """Existing applications keep their answers (snapshotted with the label)."""
    await session.execute(delete(ApplicationField).where(ApplicationField.id == field_id))
    await session.commit()
