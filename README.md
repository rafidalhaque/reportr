# Reportr

Self-hosted, invite-only bug bounty platform — multiple concurrent programs under one organization.
Open source (AGPLv3, final call pending) and positioned as a self-hosted alternative to
HackerOne/Bugcrowd/Intigriti, without SaaS lock-in.

**Status**: MVP under active development. See [docs/spec.md](docs/spec.md) for the full spec, [docs/features.md](docs/features.md) for the shipped-feature inventory, and [todo.md](todo.md) for what's next.

## Quickstart (Docker)

```bash
cp .env.example .env        # defaults are fine for local evaluation
docker compose up --build
```

There is no bundled reverse proxy: put your own (Dokploy/Traefik, Caddy, ...) in front, routing `/api` to the backend and everything else to the frontend, on one origin. You get:

| Service | Where |
|---|---|
| Web app | `frontend:3000` (route `/` here) |
| API + docs (OpenAPI) | `backend:8000` (route `/api` here, docs at `/api/docs`) |
| Postgres | internal, volume-backed |

Attachments live in **AWS S3** (via `S3_ACCESS_KEY` / `S3_SECRET_KEY`) — set the `S3_*`
vars in `.env` before `docker compose up`; with the keys unset, attachment
uploads/downloads are disabled and everything else works.

The first boot migrates the database and seeds:

- **super_admin** — `admin@example.com` / `admin1234` (override via `SEED_ADMIN_*` in `.env`)
- **"Demo Program"** — active + public, with example scope markdown

Try the core flow: log in as admin → create an invite for your email → open
`<your-web-url>/invite/<token>` (set `FRONTEND_URL` to that origin) to activate a researcher account → submit a report →
triage it from the staff side. Password resets and email changes work from the profile page
and login screens once platform SMTP is configured (Settings → Email notifications).

## Stack

- **Backend** — FastAPI + SQLAlchemy 2.0 (async) + Alembic; `fastapi-users` for auth
  (staff and researchers are separate accounts/tables, per spec), JWT in HttpOnly cookies
- **Frontend** — Next.js (App Router) + TypeScript + Tailwind
- **DB** — Postgres 16
- **Storage** — AWS S3 for report attachments, configured with `S3_ACCESS_KEY` /
  `S3_SECRET_KEY` (+ bucket and region). Any S3-compatible service (MinIO, Cloudflare R2,
  DigitalOcean Spaces) works by pointing `S3_ENDPOINT` at it. The app talks S3 API only,
  never local disk.
- **Background jobs** — APScheduler (in-process): invite expiry
- **Notifications** — template-driven (super-admin editable, with preview/test-send),
  delivered via Telegram and/or SMTP email. Platform SMTP is configured on the Settings
  page; individual programs can override it with their own SMTP server

## Two intake paths, one pipeline

1. **Direct invite** — staff invite a researcher to a program by email → the researcher
   activates at `/invite/<token>` (sets password) → membership granted.
2. **Public application** — anyone applies from the public program page → staff approve →
   an invite is auto-created for that email → same activation flow as (1).

Both converge on the same invite → membership → submission pipeline.

## Public submission API

Anyone can submit a report to a program with public reporting enabled — anonymously or with
just a contact email — and receive a reference number for correspondence. This endpoint is
documented as a stable external contract in [docs/public-api.md](docs/public-api.md),
including rate limits and the error contract.

## RBAC (summary)

Global roles: `super_admin`, `org_admin`, `staff` (default, no access without a program role),
`finance` (payouts only), `auditor` (read-only org-wide).
Program roles: `owner`, `triager`, `viewer`.
Resolution is default-deny, first match wins (spec §4). Researchers are membership-gated
(binary per program) with a fixed permission set; internal comments stay staff-side and
reports lock for editing once triage moves past `triaging`.

## Development

Backend (Python 3.12+, dependencies managed with [uv](https://docs.astral.sh/uv/)):

```bash
cd backend
uv sync                                    # creates .venv from pyproject.toml + uv.lock
uv run pytest                              # tests run on in-memory SQLite
uv run uvicorn app.main:app --reload       # needs DATABASE_URL (Postgres); tests use SQLite
```

Frontend (Node 20+):

```bash
cd frontend
npm install
API_PROXY_TARGET=http://localhost:8000 npm run dev   # proxies same-origin /api to the backend
```

Migrations: `cd backend && alembic upgrade head` (the Docker image runs this automatically).

## Configuration

Everything is env-driven — see [.env.example](.env.example). Highlights:

- `SECRET` — auth signing key (change in prod)
- `CORS_ORIGINS` — browser origins allowed to send credentials
- `FRONTEND_URL` — **set this to your public web URL** (e.g. `https://reportr.example.com`). It is used in
  password-reset, email-change and invite emails; left at the default, those links point at `localhost`
- `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` / `S3_REGION` — AWS credentials for attachment storage (unset them to disable attachments)
- `S3_ENDPOINT` — optional; point at MinIO/R2/Spaces instead of real AWS S3
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — optional notifications for new applications,
  new reports, status changes, and comments

## Roadmap

Shipped: see [docs/features.md](docs/features.md) for the full inventory (programs, both intake
paths, RBAC, reports/triage, structured scope, CWE + CVSS, public report form, SMTP + Telegram
notifications with editable templates, account flows, dark mode).

Next up: see [todo.md](todo.md) — track-submission page, then payouts (Phase 2). Later (spec §5):
staff Kanban board, duplicate-detection helper, public disclosure pages, audit log, SLAs.

The `org_id` column already exists on all tables as a forward-compatibility placeholder for the
deferred SaaS layer (spec §7) — no multi-org logic is implemented.

## License

AGPLv3-leaning (prevents unmodified SaaS-wrapping without contributing back) — final decision
tracked in `docs/spec.md` §6.
