# Public API

Stable, unauthenticated endpoints under `/api/public/` that power the public website and let
external tools submit vulnerability reports. No account, cookie, or key is required for any
of them — abuse is handled with per-IP rate limiting (see below).

**Stability**: these endpoints are intended for external consumption. Fields are additive
only; removals or breaking changes will be called out in release notes. Errors always use
the standard `{"detail": …}` shape with an appropriate HTTP status (`detail` is a string,
except for `422` validation errors where it is a list).

---

## Endpoints

### `GET /api/public/platform`

Platform-level flags the public site needs before rendering forms.

```json
{ "researcher_applications_enabled": true }
```

### `GET /api/public/programs`

Active + publicly listed programs.

```json
[
  {
    "id": "a9cf074d-…",
    "name": "Demo Program",
    "slug": "demo-program",
    "description": "Example program…",
    "public_reporting": true
  }
]
```

### `GET /api/public/programs/{slug}/report-form`

Pre-check for the public report form: is it available, and what should the page display?

```json
{
  "available": true,
  "reason": null,
  "program_name": "Demo Program",
  "program_slug": "demo-program",
  "description": "Example program…",
  "scope_markdown": "## Scope\n…",
  "scope_entries": [
    { "id": "…", "target": "*.demo.example.com", "description": "", "in_scope": true, "severity_guide": "up to critical", "created_at": "…" }
  ]
}
```

`scope_markdown` / `scope_entries` are populated only when the program's visibility is
`public`; private programs keep their scope hidden even when their report link is shared.

`available` is `false` (with a human-readable `reason`) when public reporting is disabled
for the program or the program isn't active. `404` if the slug doesn't exist.

### `POST /api/public/programs/{slug}/reports` — submit a report

The core submission endpoint. Accepts **anonymous** submissions (no `email`) or
**email-only** submissions (`email` provided, no account). Responds `201` with a reference
number the reporter can quote in correspondence.

Request:

```json
{
  "title": "Reflected XSS in search results",
  "severity": "high",
  "description": "The q parameter is reflected without encoding.",
  "repro_steps": "1. Open /search\n2. Enter <script> payload\n3. Observe execution",
  "affected_asset": "https://demo.example.com/search",
  "cvss": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N",
  "cwe_id": "CWE-79",
  "email": "reporter@example.com"
}
```

| Field | Required | Notes |
|---|---|---|
| `title` | yes | max 200 chars |
| `severity` | no | `info` / `low` / `medium` / `high` / `critical` (default `medium`) |
| `description`, `repro_steps` | no | free text |
| `affected_asset` | no | URL or asset identifier |
| `cvss` | no | vector string, stored as reference (severity is not auto-derived) |
| `cwe_id` | no | bug type from the bundled CWE catalog (e.g. `CWE-79`); unknown ids are rejected with 422 |
| `email` | no | omit for a fully anonymous submission |

Response `201`:

```json
{
  "id": "487c893f-b5c1-44cc-b5c0-01cdb1718e59",
  "reference": "487C893F",
  "email": "reporter@example.com"
}
```

`reference` is the first 8 hex characters of the report id (uppercase). Staff views display
it, so it can be used to correlate follow-up correspondence. Note: there is currently **no
self-service lookup** by reference — planned as todo item #1 (track submission).

Errors: `404` unknown slug · `403` public reporting disabled · `400` program not active ·
`422` validation failure · `429` rate limited.

### `POST /api/public/applications` — apply to join

Application to become a researcher. Requires `email`; optionally `name`, `message`,
`portfolio_url`, `program_id` (must be a public, active program). Returns the created
application (`201`). Rejected with `403` when the super admin has disabled the
researcher application form platform-wide, or when the email is banned, and with `400` when
`program_id` is not a public, active program.

---

## Rate limiting

Fixed-window limits per client IP, enforced in-process:

| Scope | Default | Key |
|---|---|---|
| `POST …/reports` | 10 / hour | IP + program slug |
| `POST /applications` | 3 / hour | IP |

Exceeding the limit returns `429` with a `Retry-After` header (seconds). Limits are
configurable via `RATE_LIMIT_REPORTS` / `RATE_LIMIT_APPLICATIONS` (`"<count>/<second|minute|hour|day>"`
or `"<count>/<seconds>"`).

Client IPs come from `X-Forwarded-For` only when `TRUST_PROXY_HEADERS=true` — set it when
the API runs behind your reverse proxy (docker-compose default); leave it off when the API is
directly reachable, so clients can't spoof IPs to rotate the limit.

## Authentication & keys

Deliberately **no authentication and no API keys** for this tier: submissions are meant to
be as frictionless as possible, rate limiting bounds abuse, and staff-side triage absorbs
noise. Per-program API keys for partner integrations are **deferred** — revisit if a partner
needs programmatic submission with a guaranteed identity/quota (would add a key table,
per-key limits, and audit attribution).
