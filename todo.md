# TODO — next up

Backlog for the platform. Complements `docs/spec.md` (MVP spec). Items keep their original
numbers so they can be referenced individually. Numbers were renumbered once to fix a
duplicate (14/15) — nothing was dropped.

## Reporter & public

- [ ] **1. Track submission** — public page where a reporter enters their reference code
  (e.g. `487C893F`) and sees report status + non-internal comments, read-only. Reference is
  derived from the report id (`id.hex[:8]`); unauthenticated lookup treats the code as the
  secret. Builds on: public report form + comments (`internal_only` already stays staff-side).
- [ ] **5. Public program API to receive submissions** — largely DONE: unauthenticated
  `POST /api/public/programs/{slug}/reports` accepts anonymous/email-only submissions and
  returns a reference number. Remaining: document it as a stable public API, add rate
  limiting, and decide whether an optional per-program API key is needed for partners.
- [ ] **15. Show details & scope on the public report form when the program is public** —
  the form pre-check endpoint (`GET /api/public/programs/{slug}/report-form`) already returns
  name/description; extend it to include scope (markdown today, structured entries after #4)
  and render it on `/report/[slug]` before the form.
- [ ] **6. CVE / CVSS calculator in the submission form** — client-side CVSS v3.1 vector
  builder (AV/AC/PR/UI/S/C/I/A picker → vector string + base score), shown in the public form
  and researcher submission form; optionally auto-suggest severity from the score (resolves
  the open CVSS question in spec §6).

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

- [ ] **4. Structured scope (separate tab, DB table, form + CSV import)** — new `scope`
  table (program_id, asset/target, description, in/out flag, severity guide, notes) managed
  in a dedicated program tab; add entries via form; bulk import via CSV upload. Keep
  `scope_markdown` as a rendered overview or deprecate gradually.
- [ ] **9. Balance & payouts** — the phase-2 payout flow from spec §5: per-program bounty
  tiers, payout records (`payouts` table already exists, model-only), finance-role approval,
  reporter balance tracking, and payment method integration (bKash/Nagad/UddoktaPay or
  manual/off-platform).
- [ ] **10. Markdown description with preview** — program description becomes markdown with
  live preview, same treatment as scope already has in the program Settings tab
  (`react-markdown` is already in the bundle).

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
3. #4 → #6 (scope structure before the CVSS/severity pairing)
4. #11 + #12 + #13 (one UI pass: theme + sidebar + profile entry points)
5. #10, #14b anywhere; #9 is the big standalone milestone
