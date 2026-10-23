# Open Source Multi-Program Bug Bounty Platform — Spec

**Status**: Living draft (shipped features: see [features.md](features.md))
**Scope**: Single-org self-hosted MVP, `org_id`-ready for future SaaS layer

---

## 1. Overview

Self-hosted, invite-only bug bounty platform supporting multiple concurrent programs under one organization. Open source (AGPLv3), positioned as a self-hosted alternative to HackerOne/Bugcrowd/Intigriti for orgs that want to run their own bounty program without SaaS lock-in.

**Non-goals (explicitly out of scope for MVP and near-term)**:
- Multi-org SaaS tenancy (deferred — see §7)
- Real-time chat/video
- Built-in vulnerability scanner / automated testing
- CTF/challenge hosting
- Researcher-to-researcher social features

---

## 2. Architecture

- **Backend**: FastAPI + SQLAlchemy 2.0 (async) + Alembic (migrations)
- **Auth**: `fastapi-users` base, extended with custom `Invite` / `ProgramRole` tables. Invite-token → account activation → JWT/cookie session.
- **Frontend**: Next.js (App Router) + TypeScript + Tailwind (shadcn-style components, hand-rolled)
- **DB**: Postgres
- **Background jobs**: APScheduler (in-process) — invite expiry (digest notifications: not built). No Celery/Redis unless volume demands it.
- **Notifications**: Telegram bot and SMTP email (platform-wide with per-program override), template-driven, behind one notification service so other backends (Slack/Discord) can be added.
- **Storage**: AWS S3 for report attachments, configured via access/secret keys (+ region), no bundled object store in docker-compose. Any S3-compatible service (MinIO, R2, Spaces) works by setting `S3_ENDPOINT`. App talks to storage via S3 API only, never local disk — keeps self-host and future SaaS paths identical. With no keys configured, attachments are disabled and the rest of the platform runs normally.
- **Deploy**: docker-compose (`backend`, `postgres`, `frontend`); TLS and routing (`/api` → backend, rest → frontend) via the operator's own reverse proxy (Dokploy/Traefik, Caddy, …). Target: `docker-compose up` → working instance in under 5 minutes (seed/demo data included) — this is the onboarding story for OSS adopters.

**Core architectural decision**: two intake paths (direct invite by staff, public application form) converge into the same triage → invite → membership pipeline. No duplicate logic between paths.

---

## 3. Data Model

All tables carry `org_id` (nullable/defaulted to a single org row for MVP) — cheap to add now, expensive to retrofit for future SaaS phase. No cross-org logic implemented in MVP; this is purely a forward-compatibility placeholder.

| Table | Key fields |
|---|---|
| `orgs` | *(MVP: single row)* name, slug — placeholder for future multi-tenancy |
| `programs` | org_id, name, slug, description, scope/rules (markdown), status (draft/active/paused/closed), visibility (public/private), public_reporting |
| `program_scope` | program_id, target, description, in_scope, severity_guide |
| `staff_users` | org_id, email, name, global_role |
| `researchers` | email, name, portfolio links, global status (applicant/active/banned) |
| `applications` | researcher email, optional program_id, message/portfolio, status (pending/approved/rejected) |
| `invites` | program_id, email, token (random, single-use), expires_at, accepted_at |
| `program_memberships` | researcher_id, program_id — grants access to a program's scope + submission form |
| `program_roles` | staff_id, program_id, role (owner/triager/viewer) |
| `reports` | program_id, researcher_id (null for public-form reports), submitter_email, title, description, severity, cvss, cwe_id/cwe_name, repro_steps, attachments (S3 object keys, not blobs), affected_asset, status (new/triaging/duplicate/informative/accepted/resolved), assigned staff |
| `report_comments` | report_id, author_staff_id / author_researcher_id, body, internal_only (bool — staff-only notes), attachments |
| `platform_settings`, `platform_email_settings`, `program_email_settings`, `email_templates` | platform flags, SMTP configuration (platform + per-program override), notification templates |
| `payouts` *(phase 2)* | report_id, amount, status (pending/approved/paid), method |
| `audit_log` *(phase 3)* | actor_id, action, target, timestamp, diff |

**Key structural properties**:
- A researcher can hold memberships in multiple programs.
- A program only exposes its scope/submission form to members — invite-only enforced structurally, not by special-case checks.
- Approving an `application` auto-creates an `invite` for the chosen program — same downstream flow as a direct staff-created invite.

---

## 4. Roles & Permissions (RBAC)

### Company-wide roles (on `staff_users`, applies across all programs)

| Role | Can do |
|---|---|
| `super_admin` | Everything, including managing other staff and global settings |
| `org_admin` | Create/close programs, manage all staff assignments, view everything |
| `staff` (default) | No access until given a program role |
| `finance` | View/approve payouts across all programs, nothing else |
| `auditor` | Read-only across all programs (compliance/leadership) |

### Program-scoped roles (`program_roles`: staff_id + program_id + role)

| Role | Can do (within that program only) |
|---|---|
| `owner` | Edit scope/rules, manage invites, triage, close/pause the program |
| `triager` | View + update reports, message researchers — no scope/invite access |
| `viewer` | Read-only |

**Resolution rule** (default-deny, first match wins):
1. `super_admin` → allow
2. Global role grants action org-wide (e.g. `finance` + payout action) → allow
3. `program_roles` row for person+program grants action → allow
4. No match → deny

**Implementation**: explicit, small permission-action list (`manage_scope`, `manage_invites`, `triage_reports`, `approve_payout`, `view_reports`) rather than free-text roles — keeps the matrix testable. FastAPI dependency:

```python
def require_program_permission(action: str):
    async def checker(program_id: UUID, user: StaffUser = Depends(get_current_staff)):
        if not has_program_perm(user, program_id, action):
            raise HTTPException(403)
    return checker
```

Pattern extends cleanly to researcher-side scoped roles later (e.g. a "mentor" role) — same table shape, not a redesign.

### Researcher permissions (via `program_memberships`, not `program_roles`)

Researcher access is membership-gated, not role-varied — binary member/not-member per program, fixed permission set (no owner/triager/viewer split on the researcher side for MVP):

| Action | Scope |
|---|---|
| `view_program_scope` | Full scope/rules markdown for programs they're a member of |
| `submit_report` | Any program they're a member of |
| `update_own_report` | Own reports only, before staff moves status past `triaging` (locked once triage begins to prevent tampering with staff-reviewed content) |
| `comment_on_own_report` | Own reports only — never `internal_only` comments, those stay staff-side |

No cross-researcher visibility (can't see other researchers' reports/comments on a shared program). If a future "mentor" researcher role is added (per architecture note above), it'd extend this table the same way `program_roles` extends staff — separate table, same shape, not a merge into staff's role enum.

---

## 5. Features

### MVP

- Program CRUD, scope/rules (markdown), status, visibility
- Invite-only access: direct invite + public application → approve → auto-invite
- Program membership (scoped access to program scope + submit form)
- Report submission: title, description, severity, CVSS, repro steps, attachments, affected asset
- Report lifecycle with staff assignment
- Report comments/thread, internal-only staff notes
- RBAC (global + program roles)
- Telegram notifications: new application, new report, status change, new comment
- Researcher profile (email, name, portfolio, global status)
- Invite-token auth flow

### MVP-adjacent (staff UX)

- Kanban board per program (drag status columns)
- Filterable/sortable report list (severity, status, assignee, date)
- Program dashboard (open reports, avg triage time, pending applications)
- Duplicate-detection helper (search existing reports before creating new)

### Phase 2 — Payouts

- Bounty table per severity tier per program (configurable)
- Payout record + status
- Finance-role approval flow, separate from triage approval
- Payment integration: bKash/Nagad/UddoktaPay, or manual/off-platform toggle

### Phase 2 — Researcher-side

- Leaderboard (global + per-program), opt-in/out
- Researcher stats (submitted/accepted/payout total/avg severity)
- Public hall-of-fame page per program

### Phase 2 — Public-facing

- Public program listing page (open programs)
- Public "apply to join" form (unauth) — shipped, with per-IP rate limiting
- Optional public disclosure page for resolved+disclosed reports (staff toggle per report)

### Phase 3 — Ops/Compliance

- Audit log (role changes, status changes, payout approvals — gives `auditor` role teeth)
- SLA tracking (time-to-first-response, time-to-resolution, configurable per-program targets)
- CSV/JSON export (reports, payouts)

---

## 6. Open Decisions

- **CVSS handling**: resolved — staff/submitters set severity manually, with a client-side CVSS v3.1 calculator (vector builder + base score + one-click severity suggestion) in both submission forms. CVSS stays a reference field; the score never overrides the chosen severity automatically.
- **License**: AGPLv3 leaning (prevents unmodified SaaS-wrapping without contributing back) — final call pending.
- **Name/positioning**: working name is **Reportr** (repo: github.com/rafidalhaque/reportr); final name TBD. Positioning recommendation unchanged: frame around "self-hosted HackerOne/Bugcrowd alternative" for discoverability (GitHub search, HN launch).

---

## 7. Future: SaaS Layer (deferred)

Not built now. When pursued, requires:
- `org_id` enforced (not just nullable) across all tables, with strict scoping (middleware or Postgres RLS)
- Org-level role layer above program roles
- Billing/subscription (Stripe or UddoktaPay recurring), plan tiers, seat/program limits
- Org onboarding flow (signup, first-admin, invite-teammates-to-org — distinct from invite-researcher-to-program)
- Per-org branding/subdomain on public program listing pages

Rationale for deferring: MVP scope roughly doubles if built now; risks over-engineering before the single-org flow is proven. Matches existing build-order principle — ship core first, SaaS-ify later.
