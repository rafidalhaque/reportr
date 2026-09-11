/** Shared vocabularies, mirrored from backend/app/constants.py. */

export const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export const REPORT_STATUSES = [
  "new",
  "triaging",
  "duplicate",
  "informative",
  "accepted",
  "resolved",
] as const;
export const REPORT_EDITABLE_STATUSES = ["new", "triaging"] as const;
export const PROGRAM_STATUSES = ["draft", "active", "paused", "closed"] as const;
export const PROGRAM_VISIBILITIES = ["public", "private"] as const;
export const PROGRAM_ROLES = ["owner", "triager", "viewer"] as const;
export const GLOBAL_ROLES = ["super_admin", "org_admin", "staff", "finance", "auditor"] as const;
export const ALLOWED_UPLOAD_EXTENSIONS =
  ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.log,.json,.zip";
