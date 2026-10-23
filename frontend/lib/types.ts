/** API shapes mirrored from backend/app/schemas.py. IDs are UUID strings. */

export type GlobalRole = "super_admin" | "org_admin" | "staff" | "finance" | "auditor";
export type ProgramRole = "owner" | "triager" | "viewer";
export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type ReportStatus =
  | "new"
  | "triaging"
  | "duplicate"
  | "informative"
  | "accepted"
  | "resolved";
export type ProgramStatus = "draft" | "active" | "paused" | "closed" | "suspended";
export type Visibility = "public" | "internal" | "private";

export interface Me {
  kind: "staff" | "researcher";
  id: string;
  email: string;
  name: string;
  global_role?: GlobalRole | string;
  researcher_status?: string;
}

export interface Program {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: ProgramStatus | string;
  visibility: Visibility | string;
  public_reporting: boolean;
  created_at: string;
}

export interface ProgramDetail extends Program {
  scope_markdown: string;
}

export interface ProgramStats {
  total_reports: number;
  by_status: Record<string, number>;
  pending_applications: number;
  members: number;
}

export interface ScopeEntry {
  id: string;
  target: string;
  description: string;
  in_scope: boolean;
  severity_guide: string | null;
  created_at: string;
}

export interface ScopeImportResult {
  created: number;
  skipped: number;
}

export interface Invite {
  id: string;
  email: string;
  program_id: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  revoked: boolean;
  created_at: string;
}

export interface InviteInfo {
  valid: boolean;
  reason?: string | null;
  program_name?: string | null;
  email_masked?: string | null;
}

export interface ApplicationAnswer {
  field_id: string;
  label: string;
  field_type: string;
  value: string | number | boolean | null;
}

export interface ApplicationField {
  id: string;
  label: string;
  field_type: "text" | "textarea" | "dropdown" | "checkbox" | "url" | "number";
  required: boolean;
  options: string[];
  help_text: string;
  position: number;
}

export interface Application {
  answers?: ApplicationAnswer[];
  id: string;
  email: string;
  name: string;
  program_id: string | null;
  status: string;
  created_at: string;
}

export interface StaffMember {
  id: string;
  email: string;
  name: string;
  global_role: GlobalRole | string;
  is_active: boolean;
}

export interface Researcher {
  id: string;
  email: string;
  name: string;
  status: string;
  answers?: ApplicationAnswer[];
}

export interface ProgramRoleEntry {
  id: string;
  staff_id: string;
  staff_name: string;
  staff_email: string;
  role: ProgramRole | string;
}

export interface Attachment {
  key: string;
  name: string;
  url?: string | null;
}

export interface Report {
  id: string;
  reference: string;
  program_id: string;
  program_name: string;
  researcher_id: string | null;
  researcher_name: string;
  title: string;
  description: string;
  severity: Severity | string;
  cvss: string | null;
  cwe_id: string | null;
  cwe_name: string | null;
  repro_steps: string;
  affected_asset: string | null;
  attachments: Attachment[];
  status: ReportStatus | string;
  assigned_staff_id: string | null;
  assigned_staff_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  body: string;
  internal_only: boolean;
  author_kind: "staff" | "researcher";
  author_name: string;
  attachments: Attachment[];
  created_at: string;
}

export interface UploadOut {
  key: string;
  name: string;
  url?: string | null;
}

export interface PublicProgram {
  id: string;
  name: string;
  slug: string;
  description: string;
  public_reporting: boolean;
}

export interface PublicReportFormInfo {
  available: boolean;
  reason?: string | null;
  program_name: string;
  program_slug: string;
  description: string;
  scope_markdown: string;
  scope_entries: ScopeEntry[];
}

export interface PublicReportSubmitResult {
  id: string;
  reference: string;
  email: string | null;
}

export interface PlatformSettings {
  researcher_applications_enabled: boolean;
}

export interface ProfileMembership {
  program_id: string;
  program_name: string;
  program_slug: string;
  role: string; // staff program role, or "member" for researchers
  joined_at: string;
}

export interface Profile {
  kind: "staff" | "researcher";
  id: string;
  email: string;
  name: string;
  global_role?: string | null;
  researcher_status?: string | null;
  answers?: ApplicationAnswer[];
  leaderboard_opt_in?: boolean | null;
  memberships: ProfileMembership[];
}

export interface EmailConfigSettings {
  enabled: boolean;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_password_set: boolean;
  smtp_use_tls: boolean;
  from_email: string | null;
  from_name: string | null;
  notify_email: string | null;
}

export interface EmailTemplateEntry {
  name: string;
  label: string;
  subject: string;
  body: string;
}

export interface EmailTemplatePreview {
  subject: string;
  body: string;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  accepted: number;
  points: number;
  is_me: boolean;
}

export interface ResearcherStats {
  submitted: number;
  accepted: number;
  points: number;
  avg_severity: string | null;
  rank: number | null;
  leaderboard_opt_in: boolean;
}

export interface HallOfFame {
  program_name: string;
  program_slug: string;
  entries: LeaderboardEntry[];
}

export interface InboxNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  invite_id: string | null;
  invite_pending: boolean;
  read: boolean;
  created_at: string;
}
