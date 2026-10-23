"""Custom researcher application-form fields: loading and answer validation."""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApplicationField


async def form_fields(session: AsyncSession) -> list[ApplicationField]:
    return list(
        (await session.scalars(select(ApplicationField).order_by(ApplicationField.position, ApplicationField.created_at))).all()
    )


def validate_answers(fields: list[ApplicationField], answers: dict, enforce_required: bool = True) -> list[dict]:
    """Check answers against the form fields -> snapshot list [{field_id, label, field_type, value}].

    `enforce_required=False` is for editing a profile, where unrelated saves must not fail on unanswered fields."""
    out = []
    for f in fields:
        raw = answers.get(str(f.id))
        if isinstance(raw, str):
            raw = raw.strip()
        empty = raw is None or raw == ""
        if f.field_type == "checkbox":
            value = raw is True
            if enforce_required and f.required and not value:
                raise HTTPException(422, f"{f.label}: must be checked")
        elif empty:
            if enforce_required and f.required:
                raise HTTPException(422, f"{f.label}: this field is required")
            continue
        elif f.field_type == "dropdown":
            if raw not in (f.options or []):
                raise HTTPException(422, f"{f.label}: choose one of the listed options")
            value = raw
        elif f.field_type == "number":
            try:
                value = float(raw)
            except (TypeError, ValueError):
                raise HTTPException(422, f"{f.label}: must be a number")
            value = int(value) if value.is_integer() else value
        elif f.field_type == "url":
            if not isinstance(raw, str) or not raw.lower().startswith(("http://", "https://")) or len(raw) > 500:
                raise HTTPException(422, f"{f.label}: must be an http(s) URL")
            value = raw
        else:  # text / textarea
            if not isinstance(raw, str) or len(raw) > (4000 if f.field_type == "textarea" else 255):
                raise HTTPException(422, f"{f.label}: too long")
            value = raw
        out.append({"field_id": str(f.id), "label": f.label, "field_type": f.field_type, "value": value})
    return out


