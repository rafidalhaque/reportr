"""Shared vocabulary: roles, actions, statuses. Single source of truth for RBAC and lifecycles."""

# Staff permission actions (spec §4 — explicit list keeps the matrix testable)
ACTION_MANAGE_SCOPE = "manage_scope"
ACTION_MANAGE_INVITES = "manage_invites"
ACTION_TRIAGE_REPORTS = "triage_reports"
ACTION_VIEW_REPORTS = "view_reports"
ACTION_APPROVE_PAYOUT = "approve_payout"
ALL_ACTIONS = {
    ACTION_MANAGE_SCOPE,
    ACTION_MANAGE_INVITES,
    ACTION_TRIAGE_REPORTS,
    ACTION_VIEW_REPORTS,
    ACTION_APPROVE_PAYOUT,
}

# Global roles -> org-wide actions (default-deny; first match wins per spec resolution rule)
GLOBAL_ROLE_ACTIONS: dict[str, set[str]] = {
    "super_admin": ALL_ACTIONS,
    "org_admin": {ACTION_MANAGE_SCOPE, ACTION_MANAGE_INVITES, ACTION_TRIAGE_REPORTS, ACTION_VIEW_REPORTS},
    "staff": set(),
    "finance": {ACTION_APPROVE_PAYOUT},
    "auditor": {ACTION_VIEW_REPORTS},
}
GLOBAL_ROLES = set(GLOBAL_ROLE_ACTIONS)

# Program-scoped roles -> actions within that program
PROGRAM_ROLE_ACTIONS: dict[str, set[str]] = {
    "owner": {ACTION_MANAGE_SCOPE, ACTION_MANAGE_INVITES, ACTION_TRIAGE_REPORTS, ACTION_VIEW_REPORTS},
    "triager": {ACTION_TRIAGE_REPORTS, ACTION_VIEW_REPORTS},
    "viewer": {ACTION_VIEW_REPORTS},
}
PROGRAM_ROLES = set(PROGRAM_ROLE_ACTIONS)

# "suspended" is set only by a super admin (POST /programs/{id}/suspend) and freezes the program
PROGRAM_STATUSES = ("draft", "active", "paused", "closed", "suspended")
# internal: any logged-in researcher or staff member may view it (not listed publicly)
PROGRAM_VISIBILITIES = ("public", "internal", "private")
RESEARCHER_STATUSES = ("applicant", "active", "banned")
APPLICATION_STATUSES = ("pending", "approved", "rejected")
REPORT_STATUSES = ("new", "triaging", "duplicate", "informative", "accepted", "resolved")
# Researcher may edit own report until triage moves it past these
REPORT_EDITABLE_STATUSES = ("new", "triaging")
SEVERITIES = ("info", "low", "medium", "high", "critical")
# Leaderboard scoring: accepted/resolved reports earn points by severity
SCORED_STATUSES = ("accepted", "resolved")
SEVERITY_POINTS = {"info": 1, "low": 2, "medium": 4, "high": 8, "critical": 16}

STAFF_COOKIE = "bb_staff"
RESEARCHER_COOKIE = "bb_researcher"
JWT_AUDIENCE = "fastapi-users:auth"
EMAIL_CHANGE_AUDIENCE = "reportr:email-change"

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED_UPLOAD_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "pdf", "txt", "md", "log", "json", "zip"}
