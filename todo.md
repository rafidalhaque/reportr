# TODO — next up

Backlog for the platform. Complements `docs/spec.md` (MVP spec). Items keep their original
numbers so they can be referenced individually. Numbers were renumbered once to fix a
duplicate (14/15) — nothing was dropped.

## Reporter & public

- [ ] **1. Track submission** — public page where a reporter enters their reference code
  (e.g. `487C893F`) and sees report status + non-internal comments, read-only. Reference is
  derived from the report id (`id.hex[:8]`); unauthenticated lookup treats the code as the
  secret. Builds on: public report form + comments (`internal_only` already stays staff-side).
- [x] **5. Public program API to receive submissions** — DONE: unauthenticated
  `POST /api/public/programs/{slug}/reports` accepts anonymous/email-only submissions and
  returns a reference number; documented as a stable contract in `docs/public-api.md`,
  with per-IP fixed-window rate limits (`RATE_LIMIT_REPORTS`, `RATE_LIMIT_APPLICATIONS`)
  and correct client-IP handling behind the proxy (`TRUST_PROXY_HEADERS`).
  Decision: per-program API keys for partners are **deferred** — revisit only if a partner
  needs programmatic submission with guaranteed identity/quota.
- [x] **15. Show details & scope on the public report form when the program is public** —
  DONE: `GET /api/public/programs/{slug}/report-form` returns `scope_markdown` and the
  structured `scope_entries` when the program's visibility is `public` (hidden for private
  programs, even when their report link is shared); `/report/[slug]` renders both above the
  submission form.
- [x] **6. CVE / CVSS calculator in the submission form** — DONE: collapsible CVSS v3.1
  calculator (`components/cvss-calculator.tsx`) in both submission forms — eight-metric
  picker, canonical vector string, spec-exact base score (incl. the 1.08 changed-scope
  multiplier and v3.1 roundup, verified against reference vectors), severity suggestion
  applied with one click. CWE dropdown shipped alongside (#16).
- [x] **16. "Type of bug" dropdown (CWE) in the submission form** — DONE: CWE catalog
  snapshot (`backend/app/data/cwe_list.json`, mirrored at `frontend/lib/cwe_list.json`, sync
  enforced by a test) feeds a dropdown in both submission forms; `reports.cwe_id`/`cwe_name`
  (migration 0005) are validated server-side (unknown ids → 422) and shown on the staff
  report detail. Refresh the JSON to update the catalog.

## Email & notifications

- [ ] **2. Platform-wide SMTP** — add an SMTP backend next to the Telegram notifier behind
  the existing `Notifier` interface (`app/services/notifications.py`), plus config (host,
  port, user, pass, from-address) and per-event email routing (verify mails, invitations,
  application decisions, report status changes, comments).
- [ ] **3. Program-wide SMTP override** — per-program email settings (host/credentials or
  at least from-address/endpoint) that override the platform SMTP for that program's
  notifications. Needs a program settings extension + resolution order (program → platform).
- [ ] **8. Email templates managed by super admin** — DB-backed templates with placeholders
  ({{reporter}}, {{program}}, {{reference}}, {{status}}…), CRUD UI on the super-admin
  Settings page, preview + test-send. Applies to SMTP mails and Telegram texts.

## Programs & triage

- [x] **4. Structured scope (separate tab, DB table, form + CSV import)** — DONE:
  `program_scope` table (migration 0003) with target / description / in-scope flag /
  severity guide; program **Scope** tab for CRUD; CSV import with header aliases
  (target/asset/host/url/domain), flexible in/out parsing, missing-target skip and
  case-insensitive dedupe on re-import. Members read scope via
  `GET /api/programs/{id}/scope`; researchers see the table on their submission page.
  `scope_markdown` kept as free-form overview, rendered alongside the table.
- [ ] **9. Balance & payouts** — the phase-2 payout flow from spec §5: per-program bounty
  tiers, payout records (`payouts` table already exists, model-only), finance-role approval,
  reporter balance tracking, and payment method integration (bKash/Nagad/UddoktaPay or
  manual/off-platform).
- [x] **10. Markdown description with preview** — DONE: program description is markdown
  with live preview in the program Settings tab (description + scope preview stacked), and
  the public landing page renders program descriptions as markdown.

## Platform & UX

- [x] **11. Night / day theme** — DONE: `darkMode: "class"` with a pre-paint init script
  (localStorage `bb-theme`, falls back to system preference), toggle in the sidebar and
  public header; dark variants across all UI primitives, badges, alerts, markdown, and the
  shell; headings themed globally in `globals.css`.
- [x] **12. Sidebar instead of top nav** — DONE: `AppShell` replaces the top header on all
  authenticated pages — fixed role-aware sidebar on desktop (Dashboard/Profile, Staff +
  Platform settings for super admins; workspace for researchers), slide-over drawer behind
  a top bar on mobile, with theme toggle and sign-out in the sidebar footer.
- [x] **13. Own profile** — DONE: `/profile` for both account kinds — edit display name
  (and portfolio URL for researchers) via `GET/PATCH /api/me[/profile]`, plus the program
  list (staff program roles, researcher memberships). Entry point in the sidebar.
  Email/password changes remain with #14b.
- [x] **14. Attachments in comments** — DONE: comments accept up to 10 uploaded files
  (JSON `attachments` column, migration 0004); both composers have the attachment picker
  and comment attachments render as download links (presigned when storage is configured).
  Internal-only comments keep their attachments staff-side automatically. Anonymous
  public-form reporters stay without attachments, as intended.

## Accounts

- [ ] **14b. Password & email change for everyone** — change-password (re-auth with current
  password) and change-email (confirm via verification link) for staff and researchers.
  fastapi-users ships the underlying routes (forgot/reset password, verify email) that are
  currently not mounted; needs SMTP (#2) for the email-verification half.

## Suggested order (dependency-driven)

1. #1 + #15 (finish the public reporter story), then #5 hardening
2. #2 → #8 → #3 (email stack in dependency order)
3. #4 → #6 / #16 (scope structure before the CVSS/severity pairing; CWE dropdown is an
   independent form addition that can land anytime)
4. #11 + #12 + #13 (one UI pass: theme + sidebar + profile entry points)
5. #10, #14b anywhere; #9 is the big standalone milestone
