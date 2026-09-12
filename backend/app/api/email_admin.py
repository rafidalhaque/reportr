from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import ACTION_MANAGE_SCOPE
from app.core.guards import require_global, require_program_perm
from app.database import get_session
from app.models import EmailTemplate, PlatformEmailSettings, Program, ProgramEmailSettings, StaffUser
from app.schemas import (
    EmailConfigRead,
    EmailConfigUpdate,
    EmailTemplatePreview,
    EmailTemplateRead,
    EmailTemplateUpdate,
    TestSendRequest,
)
from app.services import notifications as notif
from app.services.notifications import (
    DEFAULT_TEMPLATES,
    EVENT_LABELS,
    SAMPLE_CONTEXT,
    _deliver_email,
    render_template,
)

router = APIRouter(tags=["email"])


def _config_read(row) -> EmailConfigRead:
    return EmailConfigRead(
        enabled=row.enabled,
        smtp_host=row.smtp_host,
        smtp_port=row.smtp_port,
        smtp_username=row.smtp_username,
        smtp_password_set=bool(row.smtp_password),
        smtp_use_tls=row.smtp_use_tls,
        from_email=row.from_email,
        from_name=row.from_name,
        notify_email=row.notify_email,
    )


def _apply_update(row, payload: EmailConfigUpdate) -> None:
    data = payload.model_dump(exclude_unset=True)
    for field in ("enabled", "smtp_host", "smtp_port", "smtp_username", "smtp_use_tls",
                  "from_email", "from_name", "notify_email"):
        if field in data:
            setattr(row, field, data[field])
    if "smtp_password" in data:  # None/absent keeps the stored password; "" clears it
        row.smtp_password = data["smtp_password"] or None


# --- Platform SMTP (todo #2) -------------------------------------------------


@router.get("/settings/email", response_model=EmailConfigRead)
async def get_platform_email(
    _admin: StaffUser = Depends(require_global()),  # super_admin only
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(PlatformEmailSettings, 1)
    if row is None:
        row = PlatformEmailSettings(id=1)
        session.add(row)
        await session.commit()
        await session.refresh(row)
    return _config_read(row)


@router.put("/settings/email", response_model=EmailConfigRead)
async def update_platform_email(
    payload: EmailConfigUpdate,
    _admin: StaffUser = Depends(require_global()),
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(PlatformEmailSettings, 1)
    if row is None:
        row = PlatformEmailSettings(id=1)
        session.add(row)
        await session.flush()
    _apply_update(row, payload)
    await session.commit()
    await session.refresh(row)
    return _config_read(row)


# --- Email templates (todo #8) ------------------------------------------------


async def _get_template(session: AsyncSession, name: str) -> EmailTemplate:
    if name not in DEFAULT_TEMPLATES:
        raise HTTPException(404, "Unknown template")
    existing = set((await session.scalars(select(EmailTemplate.name))).all())
    for missing, defaults in DEFAULT_TEMPLATES.items():
        if missing not in existing:
            session.add(EmailTemplate(name=missing, subject=defaults["subject"], body=defaults["body"]))
    await session.flush()
    row = await session.scalar(select(EmailTemplate).where(EmailTemplate.name == name))
    if row is None:  # unreachable after ensure, kept for type-narrowing
        raise HTTPException(500, "Template row missing")
    return row


def _template_read(row: EmailTemplate) -> EmailTemplateRead:
    return EmailTemplateRead(
        name=row.name, label=EVENT_LABELS.get(row.name, row.name), subject=row.subject, body=row.body
    )


@router.get("/settings/email-templates", response_model=list[EmailTemplateRead])
async def list_email_templates(
    _admin: StaffUser = Depends(require_global()),
    session: AsyncSession = Depends(get_session),
):
    await _get_template(session, "new_report")  # seeds any missing rows
    rows = (await session.scalars(select(EmailTemplate).order_by(EmailTemplate.name))).all()
    return [_template_read(r) for r in rows]


@router.put("/settings/email-templates/{name}", response_model=EmailTemplateRead)
async def update_email_template(
    name: str,
    payload: EmailTemplateUpdate,
    admin: StaffUser = Depends(require_global()),
    session: AsyncSession = Depends(get_session),
):
    row = await _get_template(session, name)
    row.subject = payload.subject
    row.body = payload.body
    row.updated_by_id = admin.id
    await session.commit()
    await session.refresh(row)
    return _template_read(row)


@router.post("/settings/email-templates/{name}/reset", response_model=EmailTemplateRead)
async def reset_email_template(
    name: str,
    admin: StaffUser = Depends(require_global()),
    session: AsyncSession = Depends(get_session),
):
    row = await _get_template(session, name)
    defaults = DEFAULT_TEMPLATES[name]
    row.subject = defaults["subject"]
    row.body = defaults["body"]
    row.updated_by_id = admin.id
    await session.commit()
    await session.refresh(row)
    return _template_read(row)


@router.post("/settings/email-templates/{name}/preview", response_model=EmailTemplatePreview)
async def preview_email_template(
    name: str,
    _admin: StaffUser = Depends(require_global()),
    session: AsyncSession = Depends(get_session),
):
    row = await _get_template(session, name)
    context = SAMPLE_CONTEXT.get(name, {})
    return EmailTemplatePreview(
        subject=render_template(row.subject, context),
        body=render_template(row.body, context),
    )


@router.post("/settings/email-templates/{name}/test-send")
async def test_send_email_template(
    name: str,
    payload: TestSendRequest | None = Body(default=None),
    admin: StaffUser = Depends(require_global()),
    session: AsyncSession = Depends(get_session),
):
    row = await _get_template(session, name)
    config = await notif.resolve_email_config(session, None)  # platform config only
    if config is None:
        raise HTTPException(400, "Platform SMTP is not configured — save it first")
    context = dict(SAMPLE_CONTEXT.get(name, {}))
    context["recipient"] = (payload.recipient if payload else None) or config.notify_email
    subject = render_template(row.subject, context)
    body = render_template(row.body, context)
    await _deliver_email(config, subject, body)
    return {"sent_to": config.notify_email}


# --- Program SMTP override (todo #3) ------------------------------------------


async def _get_program_row(session: AsyncSession, program_id: UUID) -> ProgramEmailSettings:
    row = await session.scalar(
        select(ProgramEmailSettings).where(ProgramEmailSettings.program_id == program_id)
    )
    if row is None:
        program = await session.get(Program, program_id)
        if program is None:
            raise HTTPException(404, "Program not found")
        row = ProgramEmailSettings(program_id=program.id, org_id=program.org_id)
        session.add(row)
        await session.flush()
    return row


@router.get("/programs/{program_id}/email-settings", response_model=EmailConfigRead)
async def get_program_email(
    program_id: UUID,
    _user: StaffUser = Depends(require_program_perm(ACTION_MANAGE_SCOPE)),
    session: AsyncSession = Depends(get_session),
):
    row = await session.scalar(
        select(ProgramEmailSettings).where(ProgramEmailSettings.program_id == program_id)
    )
    if row is None:
        return EmailConfigRead(
            enabled=False, smtp_host=None, smtp_port=None, smtp_username=None,
            smtp_password_set=False, smtp_use_tls=True, from_email=None, from_name=None,
            notify_email=None,
        )
    return _config_read(row)


@router.put("/programs/{program_id}/email-settings", response_model=EmailConfigRead)
async def update_program_email(
    program_id: UUID,
    payload: EmailConfigUpdate,
    _user: StaffUser = Depends(require_program_perm(ACTION_MANAGE_SCOPE)),
    session: AsyncSession = Depends(get_session),
):
    row = await _get_program_row(session, program_id)
    _apply_update(row, payload)
    await session.commit()
    await session.refresh(row)
    return _config_read(row)


