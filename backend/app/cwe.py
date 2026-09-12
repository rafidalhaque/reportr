"""CWE bug-type catalog (todo #16) — snapshot of the CWE Top-25-style list.

Kept as a static JSON in the repo (refreshable); the frontend ships an identical
copy at frontend/lib/cwe.json — a test asserts the two stay in sync.
"""

import json
from pathlib import Path

_DATA_FILE = Path(__file__).parent / "data" / "cwe_list.json"

with _DATA_FILE.open(encoding="utf-8") as f:
    CWE_OPTIONS: list[dict] = json.load(f)

CWE_BY_ID: dict[str, str] = {entry["id"]: entry["name"] for entry in CWE_OPTIONS}


def cwe_name_for(cwe_id: str) -> str | None:
    return CWE_BY_ID.get(cwe_id)


def resolve_cwe(cwe_id: str | None) -> tuple[str, str] | None:
    """Validate an optional CWE id against the catalog -> (id, name).

    Raises ValueError for unknown ids so callers can map that to a 422.
    """
    if not cwe_id:
        return None
    normalized = cwe_id.strip().upper()
    name = CWE_BY_ID.get(normalized)
    if name is None:
        raise ValueError(f"Unknown CWE id: {cwe_id}")
    return normalized, name
