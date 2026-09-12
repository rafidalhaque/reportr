"""In-process fixed-window rate limiting for unauthenticated public endpoints.

Single-process by design (no Redis per spec §2) — sufficient while the API runs
as one uvicorn worker. Revisit if horizontal scaling lands.
"""

import re
import time

from fastapi import HTTPException, Request

from app.config import get_settings

_PERIODS = {"second": 1, "minute": 60, "hour": 3600, "day": 86400,
            "s": 1, "m": 60, "h": 3600, "d": 86400}
_LIMIT_RE = re.compile(r"^(\d+)\s*/\s*(second|minute|hour|day|s|m|h|d|\d+)$")

# (scope, max_requests, window_seconds) -> {key: (window_start, count)}
_state: dict[tuple[str, int, int], dict[str, tuple[float, int]]] = {}
MAX_TRACKED_KEYS = 10_000


def parse_limit(limit: str) -> tuple[int, int]:
    match = _LIMIT_RE.match(limit.strip().lower())
    if not match:
        raise ValueError(f"Invalid rate limit {limit!r} (expected e.g. '10/hour' or '5/60')")
    period = match.group(2)
    window = int(period) if period.isdigit() else _PERIODS[period]
    return int(match.group(1)), window


def reset_rate_limiters() -> None:
    """Tests start from a clean slate."""
    _state.clear()


def client_ip(request: Request) -> str:
    """Client IP for rate-limit keys; X-Forwarded-For only when behind a trusted proxy."""
    settings = get_settings()
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _allow(
    bucket: dict[str, tuple[float, int]], key: str, max_requests: int, window: int
) -> tuple[bool, int]:
    now = time.monotonic()
    # Opportunistic prune so abandoned keys can't grow the dict unbounded.
    if len(bucket) > MAX_TRACKED_KEYS:
        for stale in [k for k, (start, _) in bucket.items() if now - start >= window]:
            del bucket[stale]
    start, count = bucket.get(key, (now, 0))
    if now - start >= window:
        start, count = now, 0
    if count < max_requests:
        bucket[key] = (start, count + 1)
        return True, 0
    bucket[key] = (start, count)
    return False, max(1, int(start + window - now))


def rate_limit(scope: str, limit: str):
    """Dependency factory: fixed-window limit per client IP within the given scope."""
    max_requests, window = parse_limit(limit)
    bucket_key = (scope, max_requests, window)

    async def checker(request: Request) -> None:
        # Look the bucket up per request so reset_rate_limiters() actually resets.
        bucket = _state.setdefault(bucket_key, {})
        allowed, retry_after = _allow(bucket, client_ip(request), max_requests, window)
        if not allowed:
            raise HTTPException(
                429,
                f"Too many requests — try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )

    return checker
