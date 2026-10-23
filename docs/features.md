# Features

Complete inventory of shipped features. Anything not listed here is either intentionally
out of scope (see `docs/spec.md` §1 non-goals) or tracked as a numbered item in
[`todo.md`](todo.md).

Legend: ✅ shipped · 🔜 planned (todo.md item number in parentheses).

---

## Accounts & authentication

- ✅ **Two account kinds** — staff (org side) and researchers (hunters), fully separate
  account tables, login endpoints, and HttpOnly JWT cookie sessions (8 h expiry).
- ✅ **Invite-token activation** — researchers activate via a single-use, expiring invite
  link (`/invite/{token}`): sets a password, activates the account, grants program
  membership, and signs them in automatically.
- ✅ **Public application flow** — unauthenticated visitors apply to join (`/apply`);
  approving an application auto-creates an invite for that email — the same activation
  pipeline as a direct staff invite.
- ✅ **Change password** (`PATCH /api/me/password`) — re-authenticates with the current
  password; minimum length 8. Available on the profile page for both account kinds.
- ✅ **Change email** (`POST /api/me/email` + `/me/email/verify`) — a 1-hour verification
  link is emailed to the **new** address; the address swaps only after confirmation.
  Duplicate-email guards, idempotent re-verification.
- ✅ **Forgot / reset password** — kind-aware reset links (valid 1 h, invalidated if the
  password changes again) emailed via platform SMTP; no account enumeration (202 for known
  and unknown emails alike); rate-limited 5/h per IP. Pages: `/forgot-password`,
  `/reset-password`.
- ✅ **Own profile** (`/profile`, both kinds) — edit display name (and portfolio URL for
  researchers), see role/status and all program memberships with roles and join dates.
- ✅ **First super admin via seed** — `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, idempotent
  across restarts.

- ✅ **Invite existing researchers** — the program Invites tab searches accounts already on
  the platform (`GET /api/programs/{id}/researchers/search`, excludes members and banned) and
  invites with one click. Already-members get a 409.
- ✅ **Researcher inbox** — inviting (or approving an application for) an existing account
  drops an in-app notification (plus an email when platform SMTP is on). Researchers see an
  unread badge, and accept/decline from `/researcher/notifications`
  (`GET /api/me/notifications`, `POST /api/me/invites/{id}/accept|decline`). Decline revokes.
- ✅ **Invite emails to the invitee** — every invite (direct or from an approved application) is
  emailed to the invited address when platform SMTP is on: an activation link for people without
  an account, a pointer to the inbox for existing ones. Both are editable templates
  (`invite_new`, `invite_existing`, with `{{link}}`, `{{program}}`, `{{expires}}`). SMTP port 465
  uses implicit TLS.

## Platform directory (super admin)

- ✅ **Researchers & applications page** (`/platform`) — every researcher with status,
  program/report counts and whether they already have a staff login
  (`GET /api/admin/researchers`, searchable), plus all applications across programs with
  approve/reject (pick a program for ones that applied without one).
- ✅ **Promote researcher** (`POST /api/admin/researchers/{id}/promote`) — creates a staff
  login with the same email and password hash as `staff` or as `triager` of a chosen program
  (never downgrades an existing owner). The researcher account stays; the two sign-ins remain
  separate. Applicants without an account and banned researchers cannot be promoted.
- ✅ **Manage any researcher's programs** — per researcher, a **Manage** panel lists their
  memberships (`GET /api/admin/researchers/{id}/memberships`) and lets a super admin remove them
  (`DELETE …/memberships/{program_id}`), add them to any non-suspended program directly
  (`POST …/memberships`, the researcher is told in their inbox) or send a normal invite, so
  someone removed from one program can be placed in another. Also ban / reinstate
  (`PATCH /api/admin/researchers/{id}`).

## Roles & permissions (RBAC)

- ✅ **Global roles** — `super_admin` (everything), `org_admin` (programs, staff
  assignments, org-wide view), `staff` (no access without a program role), `finance`
  (payouts only, reserved), `auditor` (read-only org-wide).
- ✅ **Program-scoped roles** — `owner` / `triager` / `viewer` per staff member per
  program, managed by org admins on the Roles tab (upsert semantics).
- ✅ **Default-deny resolution** — super admin → global role → program role → deny; backed
  by a `require_program_perm(action)` dependency over an explicit action list
  (`manage_scope`, `manage_invites`, `triage_reports`, `view_reports`, `approve_payout`).
- ✅ **Researcher permissions are membership-gated** — binary per program: view scope,
  submit reports, edit own reports (until triage lock), comment on own reports; no
  cross-researcher visibility.

## Programs

- ✅ **Program CRUD** — create (org admin+), edit (manage-scope permission), auto-generated
  unique slugs, description, status lifecycle (draft / active / paused / closed, plus super-admin `suspended`), visibility
  (public / internal / private).
- ✅ **Public report form toggle** — per program, on the Settings tab with a copyable form
  link; the form only accepts submissions while the program is active.
- ✅ **Program dashboard stats** — total reports, breakdown by status, pending
  applications, member count.
- ✅ **Role-filtered program listing** — org-level roles see all programs; ordinary staff
  see only programs they hold a role on; researchers see their memberships.
- ✅ **Internal visibility** — `internal` programs are readable (details + scope) by any
  logged-in researcher or staff member, never listed publicly; reports, invites and
  stats stay role-gated and submission still needs membership.
- ✅ **Public API documentation tab** — per-program view of the public endpoints with live
  URLs, copy-ready `curl` examples, response samples, rate-limit and error-contract notes.
- ✅ **`org_id` forward compatibility** — every domain table carries the column for the
  future multi-org/SaaS layer (no multi-org logic yet).

- ✅ **Suspend / unsuspend** (super admin) — `POST /api/programs/{id}/suspend|unsuspend`.
  A suspended program rejects new reports, applications and invites, drops off public pages,
  and can only be edited by a super admin. Unsuspending returns it as `paused`.
- ✅ **Delete program** (super admin) — `DELETE /api/programs/{id}?confirm_slug=<slug>`
  permanently removes the program with its reports, comments, invites, members, roles, scope,
  applications and SMTP override (attachments remain in object storage). Both actions live in a
  "Danger zone" card on the program Settings tab.

## Scope management

- ✅ **Structured scope entries** — dedicated table per program: target, description,
  in-scope/out-of-scope flag, severity guide; own program tab with add/edit/delete.
- ✅ **CSV bulk import** — header aliases (`target`/`asset`/`host`/`url`/`domain`), flexible
  in/out parsing (yes/no, in/out, true/false), blank-target rows skipped, case-insensitive
  dedupe on re-import, created/skipped result feedback.
- ✅ **Researcher-facing scope** — structured entries render as a table on the researcher
  submission page, above the free-form overview markdown.
- ✅ **Overview markdown** — free-form program overview/rules (markdown with live preview
  and GFM tables), edited in Settings, rendered for researchers and (for public programs)
  on the public report form.

## Reports & triage

- ✅ **Member submission** — authenticated researchers submit to programs they belong to
  (active programs only): title, severity, description, reproduction steps, affected asset,
  CVSS vector, CWE bug type, file attachments.
- ✅ **Public/anonymous submission** — shareable per-program form (`/report/{slug}`)
  requiring no account: fully anonymous or email-only contact; returns a reference code for
  correspondence. Attachments intentionally disabled on this path.
- ✅ **Report lifecycle** — `new → triaging → duplicate / informative / accepted / resolved`
  with staff assignment; status changes are notified.
- ✅ **Researcher edit lock** — reporters can edit their own reports (including CWE type;
  optional fields can be cleared) only while the status is `new`/`triaging`; locked afterwards.
- ✅ **Reference codes** — every report carries a short code (first 8 hex of its id) shown
  on the public confirmation, the staff reports table (with search by ref/title/researcher),
  and the report detail header.
- ✅ **Comment threads** — staff and the report owner converse per report; staff can mark
  comments **internal-only** (never visible to researchers); comments support file
  attachments (up to 10, download links presigned when storage is configured).
- ✅ **CWE bug type** — dropdown backed by a bundled CWE catalog snapshot
  (`cwe_list.json`, mirrored backend/frontend, sync-tested); server-side validation; shown
  in staff views.
- ✅ **CVSS v3.1 calculator** — collapsible builder in both submission forms: eight-metric
  picker, canonical vector string, spec-exact base score (including the 1.08 changed-scope
  multiplier and v3.1 roundup), one-click severity suggestion (score never auto-overrides
  the chosen severity).
- ✅ **File attachments on reports** — uploaded to S3-compatible storage, key-referenced
  (never local disk), served via time-limited presigned URLs; 5 MB cap and extension
  allowlist.
- ✅ **Staff report workspace** — detail page with description/repro/attachments, triage
  card (status + assignee from the staff directory), details panel (reporter, asset, CVSS,
  CWE, timestamps), and the comment thread.

## Public / unauthenticated surface

- ✅ **Public landing page** — open programs with descriptions (rendered markdown),
  "Report a bug" shortcuts for programs with public reporting, links to both logins and the
  application form.
- ✅ **Public program listing API** — active + public programs only.
- ✅ **Public report form availability API** — availability, reason when unavailable, and
  (for public programs) the full scope: structured entries + overview markdown. Private
  programs keep their scope hidden even when their report link is shared.
- ✅ **Public report submission API** — returns the reference code; anonymous or email-only.
- ✅ **Rate limiting** — in-process fixed-window limiter (no Redis): 10/h per IP per program
  for report submissions, 3/h per IP for applications (both configurable); `429` responses
  carry `Retry-After`; client IPs honor `X-Forwarded-For` only when
  `TRUST_PROXY_HEADERS=true`.
- ✅ **Application form gating** — the researcher application form can be disabled
  platform-wide (closed notice + API-level 403).

## Notifications

- ✅ **Telegram** — platform bot delivers all notification events when configured.
- ✅ **Platform SMTP email** — DB-stored, super-admin managed (host, port, credentials,
  STARTTLS, from, triage inbox); enabled/disabled per environment.
- ✅ **Program SMTP override** — a program can send its own notifications through its own
  server (resolution: program → platform).
- ✅ **Editable email templates** — one template per event (new report, status change, new
  comment, new application, application approved, invite created, plus the two invitee emails) with `{{placeholder}}`
  rendering; super admins edit, preview with sample context, reset to defaults, and
  test-send. Templates drive both emails and Telegram texts.
- ✅ **Transactional account emails** — password reset and email-change verification links
  via the same SMTP configuration.
- ✅ **Graceful degradation** — no channels configured ⇒ notifications are skipped and API
  requests always succeed; SMTP/Telegram failures never break the triggering request.
- ✅ **Background job** — APScheduler sweeps expired invites hourly.

## Super-admin platform settings

- ✅ Researcher application form on/off (see above).
- ✅ Platform SMTP configuration (see above).
- ✅ Email template management (see above).

## Developer experience & infrastructure

- ✅ **FastAPI + SQLAlchemy 2.0 (async) + Alembic** — 8 ordered, up/down-verified
  migrations; Postgres in production, in-memory SQLite for the test suite.
- ✅ **uv dependency management** — `pyproject.toml` + committed `uv.lock`;
  `uv sync` / `uv run`; Docker installs from the lockfile (`--frozen --no-dev`).
- ✅ **Next.js 16 App Router frontend** — TypeScript, Tailwind, hand-rolled shadcn-style
  components (no radix), standalone output for Docker.
- ✅ **docker-compose deployment** — postgres + backend (migrate → seed → serve) + frontend;
  put your own reverse proxy (Dokploy/Traefik, Caddy, …) in front, routing `/api` to the
  backend and everything else to the frontend.
- ✅ **Idempotent seed** — default org, super admin, demo program with example scope,
  platform settings, email templates.
- ✅ **Test suite** — 41 tests on in-memory SQLite: end-to-end API flows (invites, reports,
  triage, RBAC, public forms, applications), email-stack tests with captured delivery, the
  CWE catalog sync check, and a static AST guard against Python 3.12/3.14 annotation-order
  drift.
- ✅ **Documentation set** — `docs/spec.md` (spec), `docs/public-api.md` (external API
  contract), `todo.md` (roadmap), this file.
- ✅ **OpenAPI** — interactive docs at `/api/docs`.

## Leaderboard & researcher stats

- ✅ **Leaderboard** (`GET /api/leaderboard`, optional `program_id`) — ranks opted-in,
  non-banned researchers by points from accepted/resolved reports (info 1, low 2, medium 4,
  high 8, critical 16; ties share a rank). Program rankings are limited to members and
  staff with view access. UI: `/leaderboard`, in the sidebar for every logged-in user (stat tiles for researchers).
- ✅ **Researcher stats** (`GET /api/me/stats`) — submitted, accepted, points, average
  severity, global rank.
- ✅ **Opt-in/out** — `leaderboard_opt_in` toggle on the profile page (default on).
- ✅ **Public hall of fame** (`/hall-of-fame/{slug}`, `GET /api/public/programs/{slug}/hall-of-fame`)
  — per public program; private and draft programs return 404.

## Theme & UI

- ✅ **Dark / light theme** — class-based Tailwind dark mode, pre-paint initialization
  (localStorage `bb-theme`, system-preference fallback), toggle in the sidebar and public
  header, dark variants across all primitives, badges, alerts and markdown.
- ✅ **Role-aware sidebar shell** — fixed sidebar on desktop, slide-over drawer + top bar on
  mobile; active-link highlighting; identity, theme toggle and sign-out in the footer.
- ✅ **Markdown with GFM** — tables, strikethrough, autolinks, task lists (used for program
  descriptions, overview and scope previews).

---

## Not shipped yet (see `todo.md`)

Track submission by reference code (#1) · payouts & balances (#9) · per-program API keys ·
researcher-facing status emails (invites already notify existing accounts) · audit log, SLA tracking, CSV/JSON export, duplicate-
detection helper, custom domains, per-program branding (all deferred in the spec).
