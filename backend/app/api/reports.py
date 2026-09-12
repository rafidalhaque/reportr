from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.constants import (
    ACTION_TRIAGE_REPORTS,
    ACTION_VIEW_REPORTS,
    ALLOWED_UPLOAD_EXTENSIONS,
    MAX_UPLOAD_BYTES,
    PROGRAM_ROLE_ACTIONS,
    REPORT_EDITABLE_STATUSES,
    REPORT_STATUSES,
    SEVERITIES,
)
from app.core.deps import get_actor
from app.core.permissions import has_global_role, has_program_perm
from app.cwe import resolve_cwe
from app.database import get_session
from app.models import Program, ProgramMembership, ProgramRole, Report, ReportComment, Researcher, StaffUser
from app.schemas import (
    AttachmentOut,
    CommentCreate,
    CommentRead,
    ReportCreate,
    ReportRead,
    ReportTriageUpdate,
    ReportUpdate,
    UploadOut,
)
from app.services.notifications import send_notification
from app.services.storage import get_storage

router = APIRouter(tags=["reports"])

_REPORT_LOAD = (
    selectinload(Report.program),
    selectinload(Report.researcher),
    selectinload(Report.assigned_staff),
)


async def _load_report(session: AsyncSession, report_id: UUID) -> Report:
    # populate_existing: after commits we re-fetch to refresh relationships (identity map keeps stale state)
    report = await session.scalar(
        select(Report).options(*_REPORT_LOAD).execution_options(populate_existing=True).where(Report.id == report_id)
    )
    if report is None:
        raise HTTPException(404, "Report not found")
    return report


async def serialize_report(report: Report, presign: bool = False) -> ReportRead:
    attachments = [
        AttachmentOut(key=a["key"], name=a.get("name", "")) for a in (report.attachments or []) if "key" in a
    ]
    if presign and attachments:
        storage = get_storage()
        if storage is not None:
            signed = await storage.presign_attachments([{"key": a.key, "name": a.name} for a in attachments])
            attachments = [AttachmentOut(**a) for a in signed]
    if report.researcher is not None:
        researcher_name = report.researcher.name or report.researcher.email
    elif report.submitter_email:
        researcher_name = f"{report.submitter_email} (via public form)"
    else:
        researcher_name = "Anonymous (public form)"
    return ReportRead(
        id=report.id,
        reference=report.id.hex[:8].upper(),
        program_id=report.program_id,
        program_name=report.program.name,
        researcher_id=report.researcher_id,
        researcher_name=researcher_name,
        title=report.title,
        description=report.description,
        severity=report.severity,
        cvss=report.cvss,
        cwe_id=report.cwe_id,
        cwe_name=report.cwe_name,
        repro_steps=report.repro_steps,
        affected_asset=report.affected_asset,
        attachments=attachments,
        status=report.status,
        assigned_staff_id=report.assigned_staff_id,
        assigned_staff_name=report.assigned_staff.name if report.assigned_staff else None,
        created_at=report.created_at,
        updated_at=report.updated_at,
    )


# --- Uploads -------------------------------------------------------------


@router.post("/uploads", response_model=UploadOut)
async def upload_attachment(file: UploadFile = File(...), _actor=Depends(get_actor)):
    """Upload to S3/MinIO; the returned object key is referenced from a report's attachments."""
    storage = get_storage()
    if storage is None:
        raise HTTPException(503, "Attachment storage is not configured")
    filename = file.filename or "file"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(400, f"File type .{ext} is not allowed")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File too large (max 5 MB)")
    key = storage.object_key(filename)
    await storage.put(key, data, file.content_type or "application/octet-stream")
    return UploadOut(key=key, name=filename)


# --- Reports -------------------------------------------------------------


@router.get("/reports", response_model=list[ReportRead])
async def list_reports(
    program_id: UUID | None = None,
    status: str | None = None,
    severity: str | None = None,
    actor=Depends(get_actor),
    session: AsyncSession = Depends(get_session),
):
    query = select(Report).options(*_REPORT_LOAD).order_by(Report.created_at.desc())
    if actor.kind == "staff":
        user = actor.staff
        if not has_global_role(user, "org_admin", "auditor"):
            roles = (await session.scalars(select(ProgramRole).where(ProgramRole.staff_id == user.id))).all()
            allowed = [
                r.program_id for r in roles if ACTION_VIEW_REPORTS in PROGRAM_ROLE_ACTIONS.get(r.role, set())
            ]
            if not allowed:
                return []
            query = query.where(Report.program_id.in_(allowed))
    else:
        query = query.where(Report.researcher_id == actor.researcher.id)
    if program_id is not None:
        query = query.where(Report.program_id == program_id)
    if status is not None:
        if status not in REPORT_STATUSES:
            raise HTTPException(400, "Unknown status")
        query = query.where(Report.status == status)
    if severity is not None:
        if severity not in SEVERITIES:
            raise HTTPException(400, "Unknown severity")
        query = query.where(Report.severity == severity)
    reports = (await session.scalars(query)).all()
    return [await serialize_report(r) for r in reports]


@router.post("/reports", response_model=ReportRead, status_code=201)
async def create_report(
    payload: ReportCreate, actor=Depends(get_actor), session: AsyncSession = Depends(get_session)
):
    """Researcher submission — membership-gated (spec §4 researcher permissions)."""
    if actor.kind != "researcher":
        raise HTTPException(403, "Only researchers can submit reports")
    researcher = actor.researcher
    if researcher.status == "banned":
        raise HTTPException(403, "This account is banned")

    program = await session.get(Program, payload.program_id)
    if program is None:
        raise HTTPException(404, "Program not found")
    membership = await session.scalar(
        select(ProgramMembership).where(
            ProgramMembership.researcher_id == researcher.id,
            ProgramMembership.program_id == program.id,
        )
    )
    if membership is None:
        raise HTTPException(403, "You are not a member of this program")
    if program.status != "active":
        raise HTTPException(400, "This program is not accepting reports right now")

    try:
        cwe = resolve_cwe(payload.cwe_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc))

    report = Report(
        org_id=program.org_id,
        program_id=program.id,
        researcher_id=researcher.id,
        title=payload.title,
        description=payload.description,
        severity=payload.severity,
        cvss=payload.cvss,
        cwe_id=cwe[0] if cwe else None,
        cwe_name=cwe[1] if cwe else None,
        repro_steps=payload.repro_steps,
        affected_asset=payload.affected_asset,
        attachments=[a.model_dump() for a in payload.attachments],
    )
    session.add(report)
    await session.commit()
    report = await _load_report(session, report.id)
    await send_notification(
        session,
        "new_report",
        program.id,
        {
            "severity": report.severity,
            "program": program.name,
            "title": report.title,
            "reference": report.id.hex[:8].upper(),
            "reporter": researcher.name or researcher.email,
            "cwe": f"{report.cwe_id} — {report.cwe_name}" if report.cwe_id else "—",
            "description": (report.description or "")[:600],
        },
    )
    return await serialize_report(report)


@router.get("/reports/{report_id}", response_model=ReportRead)
async def get_report(report_id: UUID, actor=Depends(get_actor), session: AsyncSession = Depends(get_session)):
    report = await _load_report(session, report_id)
    if actor.kind == "staff":
        if not await has_program_perm(session, actor.staff, report.program_id, ACTION_VIEW_REPORTS):
            raise HTTPException(403, "Insufficient permissions")
    elif report.researcher_id != actor.researcher.id:
        raise HTTPException(404, "Report not found")  # don't leak other researchers' reports
    return await serialize_report(report, presign=True)


@router.patch("/reports/{report_id}/triage", response_model=ReportRead)
async def triage_report(
    report_id: UUID,
    payload: ReportTriageUpdate,
    actor=Depends(get_actor),
    session: AsyncSession = Depends(get_session),
):
    """Staff-only: status moves + assignment (requires triage_reports)."""
    if actor.kind != "staff":
        raise HTTPException(403, "Staff account required")
    report = await _load_report(session, report_id)
    if not await has_program_perm(session, actor.staff, report.program_id, ACTION_TRIAGE_REPORTS):
        raise HTTPException(403, "Insufficient permissions")

    data = payload.model_dump(exclude_unset=True)
    old_status = report.status
    if "assigned_staff_id" in data:
        if data["assigned_staff_id"] is not None:
            assignee = await session.get(StaffUser, data["assigned_staff_id"])
            if assignee is None:
                raise HTTPException(404, "Assignee not found")
        report.assigned_staff_id = data["assigned_staff_id"]
    if data.get("status") is not None and data["status"] != report.status:
        report.status = data["status"]
    await session.commit()
    report = await _load_report(session, report.id)
    if report.status != old_status:
        await send_notification(
            session,
            "status_change",
            report.program_id,
            {
                "title": report.title,
                "reference": report.id.hex[:8].upper(),
                "program": report.program.name,
                "old_status": old_status,
                "new_status": report.status,
            },
        )
    return await serialize_report(report, presign=True)


@router.patch("/reports/{report_id}", response_model=ReportRead)
async def update_own_report(
    report_id: UUID,
    payload: ReportUpdate,
    actor=Depends(get_actor),
    session: AsyncSession = Depends(get_session),
):
    """Researcher edits own report — locked once triage moves past `triaging` (spec §4)."""
    if actor.kind != "researcher":
        raise HTTPException(403, "Only the report owner can edit a report this way")
    report = await _load_report(session, report_id)
    if report.researcher_id != actor.researcher.id:
        raise HTTPException(404, "Report not found")
    if report.status not in REPORT_EDITABLE_STATUSES:
        raise HTTPException(403, "This report is locked — triage has already begun")
    data = payload.model_dump(exclude_unset=True)
    for field in ("title", "description", "severity", "cvss", "repro_steps", "affected_asset", "attachments"):
        if field in data and data[field] is not None:
            setattr(report, field, data[field])
    await session.commit()
    report = await _load_report(session, report.id)
    return await serialize_report(report, presign=True)


# --- Comments ------------------------------------------------------------


@router.get("/reports/{report_id}/comments", response_model=list[CommentRead])
async def list_comments(report_id: UUID, actor=Depends(get_actor), session: AsyncSession = Depends(get_session)):
    report = await _load_report(session, report_id)
    is_researcher = actor.kind == "researcher"
    if is_researcher and report.researcher_id != actor.researcher.id:
        raise HTTPException(404, "Report not found")
    if not is_researcher and not await has_program_perm(
        session, actor.staff, report.program_id, ACTION_VIEW_REPORTS
    ):
        raise HTTPException(403, "Insufficient permissions")

    query = (
        select(ReportComment)
        .where(ReportComment.report_id == report_id)
        .order_by(ReportComment.created_at)
    )
    if is_researcher:
        query = query.where(ReportComment.internal_only.is_(False))  # internal notes stay staff-side
    comments = (await session.scalars(query)).all()

    storage = get_storage()
    out = []
    for c in comments:
        if c.author_staff_id is not None:
            author = await session.get(StaffUser, c.author_staff_id)
            out.append(
                CommentRead(
                    id=c.id,
                    body=c.body,
                    internal_only=c.internal_only,
                    author_kind="staff",
                    author_name=(author.name or author.email) if author else "staff",
                    attachments=await _presign_attachments(storage, c.attachments),
                    created_at=c.created_at,
                )
            )
        else:
            author = await session.get(Researcher, c.author_researcher_id) if c.author_researcher_id else None
            out.append(
                CommentRead(
                    id=c.id,
                    body=c.body,
                    internal_only=c.internal_only,
                    author_kind="researcher",
                    author_name=(author.name or author.email) if author else "researcher",
                    attachments=await _presign_attachments(storage, c.attachments),
                    created_at=c.created_at,
                )
            )
    return out


async def _presign_attachments(storage, attachments: list[dict] | None) -> list[AttachmentOut]:
    out = []
    for att in attachments or []:
        entry = AttachmentOut(key=att.get("key", ""), name=att.get("name", ""))
        if storage is not None and entry.key:
            try:
                entry.url = await storage.presigned_get(entry.key)
            except Exception:
                entry.url = None
        out.append(entry)
    return out


@router.post("/reports/{report_id}/comments", response_model=CommentRead, status_code=201)
async def create_comment(
    report_id: UUID,
    payload: CommentCreate,
    actor=Depends(get_actor),
    session: AsyncSession = Depends(get_session),
):
    report = await _load_report(session, report_id)
    if actor.kind == "staff":
        if not await has_program_perm(session, actor.staff, report.program_id, ACTION_TRIAGE_REPORTS):
            raise HTTPException(403, "Insufficient permissions")
        comment = ReportComment(
            report_id=report.id,
            author_staff_id=actor.staff.id,
            body=payload.body,
            internal_only=payload.internal_only,
            attachments=[a.model_dump() for a in payload.attachments],
        )
        author_kind, author_name = "staff", actor.staff.name or actor.staff.email
    else:
        if report.researcher_id != actor.researcher.id:
            raise HTTPException(404, "Report not found")
        comment = ReportComment(
            report_id=report.id,
            author_researcher_id=actor.researcher.id,
            body=payload.body,
            internal_only=False,  # researchers can never write internal notes
            attachments=[a.model_dump() for a in payload.attachments],
        )
        author_kind, author_name = "researcher", actor.researcher.name or actor.researcher.email
    session.add(comment)
    await session.commit()
    await session.refresh(comment)
    await send_notification(
        session,
        "new_comment",
        report.program_id,
        {
            "author": author_name,
            "author_kind": author_kind,
            "title": report.title,
            "reference": report.id.hex[:8].upper(),
            "internal": " [internal note]" if comment.internal_only else "",
            "comment": payload.body[:500],
        },
    )
    storage = get_storage()
    return CommentRead(
        id=comment.id,
        body=comment.body,
        internal_only=comment.internal_only,
        author_kind=author_kind,
        author_name=author_name,
        attachments=await _presign_attachments(storage, comment.attachments),
        created_at=comment.created_at,
    )
