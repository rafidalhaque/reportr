# Bug Bounty Platform (working title)

Self-hosted, invite-only bug bounty platform — multiple concurrent programs under one organization.
Open source (AGPLv3, final call pending) and positioned as a self-hosted alternative to
HackerOne/Bugcrowd/Intigriti, without SaaS lock-in.

**Status**: MVP under active development. See [docs/spec.md](docs/spec.md) for the full spec.

## Quickstart (Docker)

```bash
cp .env.example .env        # defaults are fine for local evaluation
docker compose up --build
```

~5 minutes later you have:

| Service | Where |
|---|---|
| Web app | http://localhost:8080 |
| API docs (OpenAPI) | http://localhost:8080/api/docs |
| MinIO console (attachments) | not exposed by default (API on `:9000`) |
| Postgres | internal, volume-backed |

The first boot migrates the database and seeds:

- **super_admin** — `admin@example.com` / `admin1234` (override via `SEED_ADMIN_*` in `.env`)
- **"Demo Program"** — active + public, with example scope markdown

Try the core flow: log in as admin → create an invite for your email → open
`http://localhost:8080/invite/<token>` to activate a researcher account → submit a report →
triage it from the staff side.

## Stack

- **Backend** — FastAPI + SQLAlchemy 2.0 (async) + Alembic; `fastapi-users` for auth
  (staff and researchers are separate accounts/tables, per spec), JWT in HttpOnly cookies
- **Frontend** — Next.js (App Router) + TypeScript + Tailwind
- **DB** — Postgres 16
- **Storage** — S3-compatible object storage for report attachments; MinIO bundled in compose,
  swappable to S3/R2/Spaces via config. The app talks S3 API only, never local disk.
- **Background jobs** — APScheduler (in-process): invite expiry
- **Notifications** — Telegram bot behind a small `Notifier` interface (Slack/Discord/email are
  drop-in replacements); a Null notifier logs when Telegram is unconfigured

## Two intake paths, one pipeline

1. **Direct invite** — staff invite a researcher to a program by email → the researcher
   activates at `/invite/<token>` (sets password) → membership granted.
2. **Public application** — anyone applies from the public program page → staff approve →
   an invite is auto-created for that email → same activation flow as (1).

Both converge on the same invite → membership → submission pipeline.

## RBAC (summary)

Global roles: `super_admin`, `org_admin`, `staff` (default, no access without a program role),
`finance` (payouts only), `auditor` (read-only org-wide).
Program roles: `owner`, `triager`, `viewer`.
Resolution is default-deny, first match wins (spec §4). Researchers are membership-gated
(binary per program) with a fixed permission set; internal comments stay staff-side and
reports lock for editing once triage moves past `triaging`.

## Development

Backend (Python 3.12+):

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt   # POSIX: .venv/bin/pip
.venv/Scripts/pytest                                # tests run on in-memory SQLite
.venv/Scripts/uvicorn app.main:app --reload         # needs DATABASE_URL (Postgres) for real runs
```

Frontend (Node 20+):

```bash
cd frontend
npm install
npm run dev            # expects the API on http://localhost:8000
```

Migrations: `cd backend && alembic upgrade head` (the Docker image runs this automatically).

## Configuration

Everything is env-driven — see [.env.example](.env.example). Highlights:

- `SECRET` — auth signing key (change in prod)
- `CORS_ORIGINS` — browser origins allowed to send credentials
- `S3_*` — leave `S3_ENDPOINT` empty to disable attachments entirely
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — optional notifications for new applications,
  new reports, status changes, and comments

## Roadmap

Shipped in this MVP: program CRUD, invite-only access with both intake paths, memberships,
report lifecycle with assignment, comment threads with internal-only notes, RBAC, Telegram
notifications, uploads to S3/MinIO, invite expiry job, seed onboarding.

Next up (spec §5): staff Kanban board, program dashboard stats UI, duplicate-detection helper;
then payouts (Phase 2), leaderboards/hall-of-fame, public disclosure pages, audit log, SLAs.

The `org_id` column already exists on all tables as a forward-compatibility placeholder for the
deferred SaaS layer (spec §7) — no multi-org logic is implemented.

## License

AGPLv3-leaning (prevents unmodified SaaS-wrapping without contributing back) — final decision
tracked in `docs/spec.md` §6.
