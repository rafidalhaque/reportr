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
- [ ] **15. Show details & scope on the public report form when the program is public** —
  the form pre-check endpoint (`GET /api/public/programs/{slug}/report-form`) already returns
  name/description; extend it to include scope (markdown today, structured entries after #4)
  and render it on `/report/[slug]` before the form.
- [ ] **6. CVE / CVSS calculator in the submission form** — client-side CVSS v3.1 vector
  builder (AV/AC/PR/UI/S/C/I/A picker → vector string + base score), shown in the public form
  and researcher submission form; optionally auto-suggest severity from the score (resolves
  the open CVSS question in spec §6).
- [ ] **16. "Type of bug" dropdown (CWE) in the submission form** — bug-type selector backed
  by the MITRE CWE list (https://cwe.mitre.org/data/index.html). Store a `cwe_id`/`cwe_name`
  on the report (small migration + API fields), render in the public form and researcher
  submission form, and show it in staff views next to severity. Bundle the CWE list as a
  static JSON snapshot (ship in repo, refreshable) rather than hitting MITRE at runtime.

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

- [ ] **11. Night / day theme** — dark + light theme (Tailwind `darkMode` class strategy),
  toggle in the header, persisted per browser; design tokens for badges/cards so severity
  and status colors work in both themes.
- [ ] **12. Sidebar instead of top nav** — replace the top header nav with a collapsible
  sidebar (role-aware: Dashboard/Staff/Settings for staff, workspace for researchers).
- [ ] **13. Own profile** — profile page for every account: view/edit own name, portfolio
  (researchers), see role/memberships; entry point in the sidebar from #12.
- [ ] **14. Attachments in comments** — allow attaching files when commenting (staff and
  researcher sides; reuses the existing upload endpoint + attachment picker). Anonymous
  public-form reporters stay without attachments.

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
