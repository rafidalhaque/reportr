from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

GlobalRole = Literal["super_admin", "org_admin", "staff", "finance", "auditor"]
ProgramRole = Literal["owner", "triager", "viewer"]
Severity = Literal["info", "low", "medium", "high", "critical"]
ReportStatus = Literal["new", "triaging", "duplicate", "informative", "accepted", "resolved"]


class ApplicationAnswer(BaseModel):
    field_id: str
    label: str
    field_type: str
    value: Any


# --- Staff & researchers -------------------------------------------------
class StaffCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = ""
    global_role: GlobalRole = "staff"


class StaffRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: EmailStr
    name: str
    global_role: str
    is_active: bool


class StaffUpdate(BaseModel):
    name: str | None = None
    global_role: GlobalRole | None = None
    is_active: bool | None = None


class ResearcherRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: EmailStr
    name: str
    status: str
    answers: list[ApplicationAnswer] = []


class RegisterWithInvite(BaseModel):
    token: str
    password: str = Field(min_length=8)
    name: str = ""


class MeRead(BaseModel):
    kind: Literal["staff", "researcher"]
    id: UUID
    email: EmailStr
    name: str
    global_role: str | None = None
    researcher_status: str | None = None


class ProfileMembership(BaseModel):
    program_id: UUID
    program_name: str
    program_slug: str
    role: str  # staff program role, or "member" for researchers
    joined_at: datetime


class ProfileRead(BaseModel):
    kind: Literal["staff", "researcher"]
    id: UUID
    email: EmailStr
    name: str
    global_role: str | None = None
    researcher_status: str | None = None
    answers: list[ApplicationAnswer] = []  # researchers: answers to the custom profile fields
    leaderboard_opt_in: bool | None = None
    memberships: list[ProfileMembership]


class ProfileUpdate(BaseModel):
    leaderboard_opt_in: bool | None = None  # researchers only
    name: str | None = Field(default=None, max_length=200)
    answers: dict[str, Any] | None = None  # researchers only: {field_id: value} for the custom fields


# --- Programs ------------------------------------------------------------
class ProgramCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str | None = None
    description: str = ""
    scope_markdown: str = ""
    status: Literal["draft", "active", "paused", "closed"] = "draft"
    visibility: Literal["public", "internal", "private"] = "private"
    public_reporting: bool = False


class ProgramUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    scope_markdown: str | None = None
    status: Literal["draft", "active", "paused", "closed"] | None = None
    visibility: Literal["public", "internal", "private"] | None = None
    public_reporting: bool | None = None


class ProgramRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    slug: str
    description: str
    status: str
    visibility: str
    public_reporting: bool
    created_at: datetime


class ProgramDetail(ProgramRead):
    scope_markdown: str


class ProgramRoleSet(BaseModel):
    staff_id: UUID
    role: ProgramRole


class ProgramStats(BaseModel):
    total_reports: int
    by_status: dict[str, int]
    pending_applications: int
    members: int


# --- Program scope (structured, todo #4) ----------------------------------
class ScopeEntryCreate(BaseModel):
    target: str = Field(min_length=1, max_length=200)
    description: str = ""
    in_scope: bool = True
    severity_guide: str | None = Field(default=None, max_length=32)


class ScopeEntryUpdate(BaseModel):
    target: str | None = Field(default=None, max_length=200)
    description: str | None = None
    in_scope: bool | None = None
    severity_guide: str | None = Field(default=None, max_length=32)


class ScopeEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    target: str
    description: str
    in_scope: bool
    severity_guide: str | None
    created_at: datetime


class ScopeImportResult(BaseModel):
    created: int
    skipped: int


# --- Invites -------------------------------------------------------------
class InviteCreate(BaseModel):
    email: EmailStr


class InviteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: EmailStr
    program_id: UUID
    expires_at: datetime
    accepted_at: datetime | None
    revoked: bool
    token: str
    created_at: datetime


class InviteInfo(BaseModel):
    valid: bool
    reason: str | None = None
    program_name: str | None = None
    email_masked: str | None = None


# --- Applications --------------------------------------------------------
class ApplicationCreate(BaseModel):
    email: EmailStr
    name: str = ""
    program_id: UUID | None = None
    answers: dict[str, Any] = Field(default_factory=dict)  # {field_id: value} for the custom fields


class ApplicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: EmailStr
    name: str
    program_id: UUID | None
    status: str
    answers: list[ApplicationAnswer] = []
    created_at: datetime


class ApplicationDecision(BaseModel):
    program_id: UUID | None = None  # required at approve time if the application has none


# --- Reports -------------------------------------------------------------
class AttachmentIn(BaseModel):
    key: str
    name: str


class AttachmentOut(BaseModel):
    key: str
    name: str
    url: str | None = None


class ReportCreate(BaseModel):
    program_id: UUID
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    severity: Severity = "medium"
    cvss: str | None = Field(default=None, max_length=64)
    cwe_id: str | None = Field(default=None, max_length=16)  # must exist in the CWE catalog
    repro_steps: str = ""
    affected_asset: str | None = Field(default=None, max_length=200)
    attachments: list[AttachmentIn] = []


class ReportUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = None
    severity: Severity | None = None
    cvss: str | None = Field(default=None, max_length=64)
    cwe_id: str | None = Field(default=None, max_length=16)
    repro_steps: str | None = None
    affected_asset: str | None = Field(default=None, max_length=200)
    attachments: list[AttachmentIn] | None = None


class ReportTriageUpdate(BaseModel):
    status: ReportStatus | None = None
    assigned_staff_id: UUID | None = None


class CommentCreate(BaseModel):
    body: str = Field(min_length=1)
    internal_only: bool = False
    attachments: list[AttachmentIn] = Field(default_factory=list, max_length=10)


class CommentRead(BaseModel):
    id: UUID
    body: str
    internal_only: bool
    author_kind: Literal["staff", "researcher"]
    author_name: str
    attachments: list[AttachmentOut]
    created_at: datetime


class ReportRead(BaseModel):
    id: UUID
    reference: str  # short code (first 8 hex of id) quoted by public-form submitters
    program_id: UUID
    program_name: str
    researcher_id: UUID | None
    researcher_name: str
    title: str
    description: str
    severity: str
    cvss: str | None
    cwe_id: str | None
    cwe_name: str | None
    repro_steps: str
    affected_asset: str | None
    attachments: list[AttachmentOut]
    status: str
    assigned_staff_id: UUID | None
    assigned_staff_name: str | None
    created_at: datetime
    updated_at: datetime


# --- Uploads -------------------------------------------------------------
class UploadOut(BaseModel):
    key: str
    name: str
    url: str | None = None


# --- Public report form & platform settings ------------------------------
class PublicProgramOut(BaseModel):
    id: UUID
    name: str
    slug: str
    description: str
    public_reporting: bool = False


class PublicReportFormInfo(BaseModel):
    available: bool
    reason: str | None = None
    program_name: str
    program_slug: str
    description: str
    # Scope details are only exposed when the program itself is public (todo #15)
    scope_markdown: str = ""
    scope_entries: list[ScopeEntryRead] = []


class PublicReportCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    severity: Severity = "medium"
    cvss: str | None = Field(default=None, max_length=64)
    cwe_id: str | None = Field(default=None, max_length=16)  # must exist in the CWE catalog
    repro_steps: str = ""
    affected_asset: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None  # optional contact; omit to submit anonymously


class PublicReportSubmitOut(BaseModel):
    id: UUID
    reference: str  # short code for correspondence
    email: str | None


class PlatformSettingsRead(BaseModel):
    researcher_applications_enabled: bool


class PlatformSettingsUpdate(BaseModel):
    researcher_applications_enabled: bool | None = None


# --- Email stack (todos #2/#3/#8) --------------------------------------------
class EmailConfigRead(BaseModel):
    enabled: bool
    smtp_host: str | None
    smtp_port: int | None
    smtp_username: str | None
    smtp_password_set: bool  # the password itself is never returned
    smtp_use_tls: bool
    from_email: str | None
    from_name: str | None
    notify_email: str | None


class EmailConfigUpdate(BaseModel):
    enabled: bool | None = None
    smtp_host: str | None = Field(default=None, max_length=255)
    smtp_port: int | None = Field(default=None, ge=1, le=65535)
    smtp_username: str | None = Field(default=None, max_length=255)
    smtp_password: str | None = None  # absent/None keeps the stored password; "" clears it
    smtp_use_tls: bool | None = None
    from_email: str | None = Field(default=None, max_length=320)
    from_name: str | None = Field(default=None, max_length=200)
    notify_email: str | None = Field(default=None, max_length=320)


class EmailTemplateRead(BaseModel):
    name: str
    label: str
    subject: str
    body: str


class EmailTemplateUpdate(BaseModel):
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1)


class EmailTemplatePreview(BaseModel):
    subject: str
    body: str


class TestSendRequest(BaseModel):
    recipient: EmailStr | None = None


# --- Leaderboard, stats, hall of fame ----------------------------------------
class LeaderboardEntry(BaseModel):
    rank: int
    name: str
    accepted: int
    points: int
    is_me: bool = False


class ResearcherStats(BaseModel):
    submitted: int
    accepted: int
    points: int
    avg_severity: str | None  # mean severity of accepted reports
    rank: int | None  # global rank; None when opted out or nothing accepted yet
    leaderboard_opt_in: bool


class HallOfFame(BaseModel):
    program_name: str
    program_slug: str
    entries: list[LeaderboardEntry]


# --- Researcher inbox ---------------------------------------------------------
class NotificationRead(BaseModel):
    id: UUID
    kind: str
    title: str
    body: str
    invite_id: UUID | None
    invite_pending: bool  # invitation can still be accepted/declined
    read: bool
    created_at: datetime


class UnreadCount(BaseModel):
    unread: int


# --- Platform admin: researcher directory & promotion -------------------------
class AdminResearcherRead(BaseModel):
    id: UUID
    email: str
    name: str
    status: str
    answers: list[ApplicationAnswer]
    has_account: bool  # False for applicants who never activated an invite
    reports: int
    programs: int
    is_staff: bool  # a staff account with the same email exists


class PromoteRequest(BaseModel):
    role: Literal["staff", "triager"]
    program_id: UUID | None = None  # required for "triager"


class AdminMembershipRead(BaseModel):
    program_id: UUID
    program_name: str
    program_status: str
    joined_at: datetime


class AdminMembershipAdd(BaseModel):
    program_id: UUID


class AdminResearcherStatus(BaseModel):
    status: Literal["active", "banned"]


# --- Custom application form fields (super admin) ----------------------------
FieldType = Literal["text", "textarea", "dropdown", "checkbox", "url", "number"]


def _clean_options(options: list[str]) -> list[str]:
    seen: list[str] = []
    for o in options:
        o = o.strip()
        if o and o not in seen:
            seen.append(o)
    return seen


class ApplicationFieldCreate(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    field_type: FieldType
    required: bool = False
    options: list[str] = Field(default_factory=list, max_length=50)  # dropdown choices
    help_text: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def _check(self):
        self.options = _clean_options(self.options) if self.field_type == "dropdown" else []
        if self.field_type == "dropdown" and not self.options:
            raise ValueError("A dropdown needs at least one option")
        return self


class ApplicationFieldUpdate(BaseModel):
    """The field type is fixed once created (existing answers depend on it)."""

    label: str | None = Field(default=None, min_length=1, max_length=200)
    required: bool | None = None
    options: list[str] | None = Field(default=None, max_length=50)
    help_text: str | None = Field(default=None, max_length=500)
    position: int | None = None


class ApplicationFieldRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    label: str
    field_type: str
    required: bool
    options: list[str]
    help_text: str
    position: int


# --- Hacktivity (platform-wide activity feed) ---------------------------------
class HacktivityEvent(BaseModel):
    kind: Literal["report_accepted", "report_resolved", "program_launched"]
    at: datetime
    program_name: str
    program_slug: str
    researcher_name: str | None = None  # opted-in researchers only, else "Anonymous researcher"
    severity: str | None = None
    cwe_name: str | None = None
