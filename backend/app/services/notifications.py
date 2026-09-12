"""Notification dispatch (todos #2/#3/#8): template-driven, Telegram + email.

Every event renders through an `EmailTemplate` row (falling back to the code
defaults below) with `{{placeholder}}` substitution, then fans out to:
  - Telegram (platform bot, if configured) — subject + body
  - Email — via SMTP: the program's override when enabled (todo #3), else the
    platform SMTP settings (todo #2). Emails go to the configured notify_email
    (the triage inbox); researcher-facing mail (invites etc.) is a later step.
"""

import logging
import re
import smtplib
import ssl
from dataclasses import dataclass, replace
from email.message import EmailMessage
from email.utils import formataddr
from uuid import UUID

import anyio
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import EmailTemplate, PlatformEmailSettings, ProgramEmailSettings

logger = logging.getLogger("notifications")

_RENDER_RE = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def render_template(text: str, context: dict) -> str:
    return _RENDER_RE.sub(lambda m: str(context.get(m.group(1), "")), text)


# --- Event registry: labels + default templates + preview samples (todo #8) ----

DEFAULT_TEMPLATES: dict[str, dict[str, str]] = {
    "new_report": {
        "subject": "New {{severity}} report {{reference}} — {{title}}",
        "body": (
            "A new {{severity}} report was submitted to {{program}}.\n\n"
            "Title: {{title}}\n"
            "Reference: {{reference}}\n"
            "Reporter: {{reporter}}\n"
            "Type of bug: {{cwe}}\n\n"
            "{{description}}"
        ),
    },
    "status_change": {
        "subject": "Report {{reference}}: {{old_status}} → {{new_status}}",
        "body": "Report {{title}} ({{reference}}) in {{program}} moved from {{old_status}} to {{new_status}}.",
    },
    "new_comment": {
        "subject": "New comment on {{reference}} — {{title}}",
        "body": "{{author}} ({{author_kind}}) commented on {{title}} ({{reference}}){{internal}}:\n\n{{comment}}",
    },
    "new_application": {
        "subject": "New researcher application — {{email}}",
        "body": (
            "A new researcher application arrived from {{email}}{{for_program}}.\n\n"
            "Message: {{message}}\n"
            "Portfolio: {{portfolio}}"
        ),
    },
    "application_approved": {
        "subject": "Application approved — {{email}}",
        "body": "{{email}} was approved for {{program}}. An invite has been issued and expires on {{expires}}.",
    },
    "invite_created": {
        "subject": "Invite created — {{program}}",
        "body": "An invite for {{email}} to {{program}} was created. It expires on {{expires}}.",
    },
}

EVENT_LABELS: dict[str, str] = {
    "new_report": "New report",
    "status_change": "Report status change",
    "new_comment": "New comment",
    "new_application": "New application",
    "application_approved": "Application approved",
    "invite_created": "Invite created",
}

SAMPLE_CONTEXT: dict[str, dict[str, str]] = {
    "new_report": {
        "severity": "high", "program": "Sample Program", "title": "Sample XSS finding",
        "reference": "ABCD1234", "reporter": "jane@example.com", "cwe": "CWE-79 — Cross-site Scripting (XSS)",
        "description": "Sample description of the finding.",
    },
    "status_change": {"title": "Sample finding", "reference": "ABCD1234", "program": "Sample Program",
                      "old_status": "new", "new_status": "triaging"},
    "new_comment": {"author": "Jane", "author_kind": "staff", "title": "Sample finding",
                    "reference": "ABCD1234", "internal": "", "comment": "Sample comment body."},
    "new_application": {"email": "jane@example.com", "for_program": " for Sample Program",
                        "message": "Sample message.", "portfolio": "https://jane.example.com"},
    "application_approved": {"email": "jane@example.com", "program": "Sample Program", "expires": "2026-09-30"},
    "invite_created": {"email": "jane@example.com", "program": "Sample Program", "expires": "2026-09-30"},
}


# --- Channels -------------------------------------------------------------

class TelegramNotifier:
    def __init__(self, bot_token: str, chat_id: str):
        self.bot_token = bot_token
        self.chat_id = chat_id
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=10)
        return self._client

    async def notify(self, text: str) -> None:
        try:
            resp = await self._get_client().post(
                f"https://api.telegram.org/bot{self.bot_token}/sendMessage",
                json={"chat_id": self.chat_id, "text": text, "disable_web_page_preview": True},
            )
            if resp.status_code != 200:
                logger.warning("telegram notify failed: %s", resp.text[:200])
        except httpx.HTTPError as exc:
            logger.warning("telegram notify error: %s", exc)

    async def close(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()


_telegram: TelegramNotifier | None = None


def get_telegram() -> TelegramNotifier | None:
    global _telegram
    s = get_settings()
    if s.telegram_bot_token and s.telegram_chat_id:
        if _telegram is None:
            _telegram = TelegramNotifier(s.telegram_bot_token, s.telegram_chat_id)
        return _telegram
    return None


@dataclass
class EmailConfig:
    host: str
    port: int
    username: str | None
    password: str | None
    use_tls: bool
    from_email: str
    from_name: str | None
    notify_email: str
    source: str  # "program" | "platform"


async def resolve_platform_smtp(session: AsyncSession) -> EmailConfig | None:
    """Platform SMTP for transactional user emails; requires host + from_email."""
    prow = await session.get(PlatformEmailSettings, 1)
    if prow and prow.enabled and prow.smtp_host and prow.from_email:
        return EmailConfig(
            host=prow.smtp_host, port=prow.smtp_port or 587, username=prow.smtp_username,
            password=prow.smtp_password, use_tls=prow.smtp_use_tls,
            from_email=prow.from_email, from_name=prow.from_name,
            notify_email=prow.notify_email or "", source="platform",
        )
    return None


async def resolve_email_config(session: AsyncSession, program_id: UUID | None) -> EmailConfig | None:
    """Program override first (todo #3), then platform settings (todo #2)."""
    if program_id is not None:
        row = await session.scalar(
            select(ProgramEmailSettings).where(ProgramEmailSettings.program_id == program_id)
        )
        if row and row.enabled and row.smtp_host and row.notify_email:
            return EmailConfig(
                host=row.smtp_host, port=row.smtp_port or 587, username=row.smtp_username,
                password=row.smtp_password, use_tls=row.smtp_use_tls,
                from_email=row.from_email, from_name=row.from_name,
                notify_email=row.notify_email, source="program",
            )
    platform = await resolve_platform_smtp(session)
    if platform and platform.notify_email:
        return platform
    return None


async def send_user_email(
    session: AsyncSession | None, recipient: str, subject: str, body: str
) -> bool:
    """Transactional email to a user via platform SMTP (todo #14b). False when SMTP is off/fails.

    `session=None` opens its own (for contexts outside a request, like the reset hook)."""
    own = session is None
    if own:
        session = AsyncSessionLocal()
    try:
        config = await resolve_platform_smtp(session)
        if config is None:
            return False
        config = replace(config, notify_email=recipient)
        await _deliver_email(config, subject, body)
        return True
    except Exception:
        logger.exception("user email to %s failed", recipient)
        return False
    finally:
        if own:
            await session.close()


def _deliver_email_sync(config: EmailConfig, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = formataddr((config.from_name or "", config.from_email))
    msg["To"] = config.notify_email
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(config.host, config.port, timeout=15) as smtp:
        if config.use_tls:
            smtp.starttls(context=ssl.create_default_context())
        if config.username:
            smtp.login(config.username, config.password or "")
        smtp.send_message(msg)


async def _deliver_email(config: EmailConfig, subject: str, body: str) -> None:
    await anyio.to_thread.run_sync(_deliver_email_sync, config, subject, body)


# --- Entry point ----------------------------------------------------------

async def send_notification(
    session: AsyncSession, event: str, program_id: UUID | None, context: dict
) -> None:
    """Render the event through its template and fan out to Telegram + email.

    Never raises: notification failures must not break the API request.
    """
    try:
        defaults = DEFAULT_TEMPLATES.get(event)
        template = await session.scalar(select(EmailTemplate).where(EmailTemplate.name == event))
        subject = render_template(template.subject if template else (defaults or {}).get("subject", event), context)
        body = render_template(template.body if template else (defaults or {}).get("body", ""), context)

        telegram = get_telegram()
        if telegram:
            await telegram.notify(f"{subject}\n\n{body}")

        config = await resolve_email_config(session, program_id)
        if config:
            await _deliver_email(config, subject, body)
    except Exception:
        logger.exception("notification dispatch failed for event %s", event)
