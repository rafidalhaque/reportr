from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

GlobalRole = Literal["super_admin", "org_admin", "staff", "finance", "auditor"]
ProgramRole = Literal["owner", "triager", "viewer"]
Severity = Literal["info", "low", "medium", "high", "critical"]
ReportStatus = Literal["new", "triaging", "duplicate", "informative", "accepted", "resolved"]


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
    portfolio_url: str | None = None


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


# --- Programs ------------------------------------------------------------
class ProgramCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str | None = None
    description: str = ""
    scope_markdown: str = ""
    status: Literal["draft", "active", "paused", "closed"] = "draft"
    visibility: Literal["public", "private"] = "private"


class ProgramUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    scope_markdown: str | None = None
    status: Literal["draft", "active", "paused", "closed"] | None = None
    visibility: Literal["public", "private"] | None = None
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
    message: str = ""
    portfolio_url: str | None = None


class ApplicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: EmailStr
    name: str
    program_id: UUID | None
    message: str
    portfolio_url: str | None
    status: str
    created_at: datetime


class ApplicationDecision(BaseModel):
    program_id: UUID | None = None  # required at approve time if the application has none


# --- Reports -------------------------------------------------------------
class AttachmentIn(BaseModel):
    key: str
    name: str


class ReportCreate(BaseModel):
    program_id: UUID
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    severity: Severity = "medium"
    cvss: str | None = None
    repro_steps: str = ""
    affected_asset: str | None = None
    attachments: list[AttachmentIn] = []


class ReportUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = None
    severity: Severity | None = None
    cvss: str | None = None
    repro_steps: str | None = None
    affected_asset: str | None = None
    attachments: list[AttachmentIn] | None = None


class ReportTriageUpdate(BaseModel):
    status: ReportStatus | None = None
    assigned_staff_id: UUID | None = None


class CommentCreate(BaseModel):
    body: str = Field(min_length=1)
    internal_only: bool = False


class CommentRead(BaseModel):
    id: UUID
    body: str
    internal_only: bool
    author_kind: Literal["staff", "researcher"]
    author_name: str
    created_at: datetime


class AttachmentOut(BaseModel):
    key: str
    name: str
    url: str | None = None


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


class PublicReportCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    severity: Severity = "medium"
    cvss: str | None = None
    repro_steps: str = ""
    affected_asset: str | None = None
    email: EmailStr | None = None  # optional contact; omit to submit anonymously


class PublicReportSubmitOut(BaseModel):
    id: UUID
    reference: str  # short code for correspondence
    email: str | None


class PlatformSettingsRead(BaseModel):
    researcher_applications_enabled: bool


class PlatformSettingsUpdate(BaseModel):
    researcher_applications_enabled: bool | None = None
