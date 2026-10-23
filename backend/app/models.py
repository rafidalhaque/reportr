import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Org(Base):
    __tablename__ = "orgs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(200), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class StaffUser(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = "staff_users"

    org_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orgs.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    global_role: Mapped[str] = mapped_column(String(32), default="staff")

    program_roles: Mapped[list["ProgramRole"]] = relationship(back_populates="staff", cascade="all, delete-orphan")


class Researcher(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = "researchers"

    name: Mapped[str] = mapped_column(String(200), default="")
    portfolio_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="applicant")  # applicant/active/banned
    leaderboard_opt_in: Mapped[bool] = mapped_column(Boolean, default=True)

    memberships: Mapped[list["ProgramMembership"]] = relationship(back_populates="researcher", cascade="all, delete-orphan")


class Program(Base):
    __tablename__ = "programs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orgs.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(200), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    scope_markdown: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="draft")  # draft/active/paused/closed/suspended
    visibility: Mapped[str] = mapped_column(String(32), default="private")  # public/internal/private
    public_reporting: Mapped[bool] = mapped_column(Boolean, default=False)  # unauthenticated report form
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("staff_users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ScopeEntry(Base):
    """Structured scope item for a program (todo #4) — complements scope_markdown."""

    __tablename__ = "program_scope"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orgs.id"), nullable=True)
    program_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programs.id"), nullable=False, index=True)
    target: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    in_scope: Mapped[bool] = mapped_column(Boolean, default=True)
    severity_guide: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orgs.id"), nullable=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    program_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("programs.id"), nullable=True)
    message: Mapped[str] = mapped_column(Text, default="")
    portfolio_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending/approved/rejected
    decided_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("staff_users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Invite(Base):
    __tablename__ = "invites"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orgs.id"), nullable=True)
    program_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programs.id"), nullable=False)
    email: Mapped[str] = mapped_column(String(320), index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, default=lambda: uuid.uuid4().hex)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("staff_users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    program: Mapped[Program] = relationship()


class ProgramMembership(Base):
    __tablename__ = "program_memberships"
    __table_args__ = (UniqueConstraint("researcher_id", "program_id", name="uq_membership"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    researcher_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("researchers.id"), nullable=False)
    program_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programs.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    researcher: Mapped[Researcher] = relationship(back_populates="memberships")
    program: Mapped[Program] = relationship()


class ProgramRole(Base):
    __tablename__ = "program_roles"
    __table_args__ = (UniqueConstraint("staff_id", "program_id", name="uq_program_role"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    staff_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff_users.id"), nullable=False)
    program_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programs.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(32))  # owner/triager/viewer
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    staff: Mapped[StaffUser] = relationship(back_populates="program_roles")
    program: Mapped[Program] = relationship()


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orgs.id"), nullable=True)
    program_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programs.id"), nullable=False, index=True)
    # Authenticated researcher submissions; NULL for public-form reports (anonymous or email-only)
    researcher_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("researchers.id"), nullable=True)
    submitter_email: Mapped[str | None] = mapped_column(String(320), nullable=True)  # email-only public submissions
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    severity: Mapped[str] = mapped_column(String(16), default="medium")
    cvss: Mapped[str | None] = mapped_column(String(64), nullable=True)  # vector string, reference only
    cwe_id: Mapped[str | None] = mapped_column(String(16), nullable=True)  # bug type, e.g. CWE-79
    cwe_name: Mapped[str | None] = mapped_column(String(200), nullable=True)  # resolved from the CWE catalog
    repro_steps: Mapped[str] = mapped_column(Text, default="")
    affected_asset: Mapped[str | None] = mapped_column(String(200), nullable=True)
    attachments: Mapped[list] = mapped_column(JSON, default=list)  # JSON list of {key, name}
    status: Mapped[str] = mapped_column(String(32), default="new", index=True)
    assigned_staff_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("staff_users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    program: Mapped[Program] = relationship()
    researcher: Mapped[Researcher] = relationship()
    assigned_staff: Mapped[StaffUser | None] = relationship()
    comments: Mapped[list["ReportComment"]] = relationship(back_populates="report", cascade="all, delete-orphan")


class ReportComment(Base):
    __tablename__ = "report_comments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reports.id"), nullable=False, index=True)
    author_staff_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("staff_users.id"), nullable=True)
    author_researcher_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("researchers.id"), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    internal_only: Mapped[bool] = mapped_column(Boolean, default=False)
    attachments: Mapped[list] = mapped_column(JSON, default=list)  # JSON list of {key, name}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    report: Mapped[Report] = relationship(back_populates="comments")


class PlatformSettings(Base):
    """Platform-wide settings singleton (row id=1) — super-admin controlled."""

    __tablename__ = "platform_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    researcher_applications_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class PlatformEmailSettings(Base):
    """Platform-wide SMTP configuration for notification emails (super-admin managed, todo #2)."""

    __tablename__ = "platform_email_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    smtp_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_port: Mapped[int | None] = mapped_column(Integer, nullable=True)  # default 587 at use time
    smtp_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_use_tls: Mapped[bool] = mapped_column(Boolean, default=True)
    from_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    from_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notify_email: Mapped[str | None] = mapped_column(String(320), nullable=True)  # notification recipient
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ProgramEmailSettings(Base):
    """Per-program SMTP override (todo #3) — wins over platform settings when enabled."""

    __tablename__ = "program_email_settings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orgs.id"), nullable=True)
    program_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programs.id"), nullable=False, unique=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    smtp_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    smtp_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_use_tls: Mapped[bool] = mapped_column(Boolean, default=True)
    from_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    from_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notify_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class EmailTemplate(Base):
    """Notification templates (todo #8) — {{placeholder}}-rendered for email and Telegram."""

    __tablename__ = "email_templates"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orgs.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)  # event key, e.g. new_report
    subject: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("staff_users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Payout(Base):
    """Phase 2 — model ships now, endpoints come with the payouts milestone."""

    __tablename__ = "payouts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reports.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending/approved/paid
    method: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    """In-app notification for a researcher (e.g. a program invitation)."""

    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    researcher_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("researchers.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(32), default="invite")
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    invite_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("invites.id"), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
