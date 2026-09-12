import csv
import io
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import ACTION_MANAGE_SCOPE, ACTION_VIEW_REPORTS
from app.core.deps import get_actor
from app.core.guards import require_program_perm
from app.core.permissions import has_program_perm
from app.database import get_session
from app.models import Program, ProgramMembership, ScopeEntry
from app.schemas import ScopeEntryCreate, ScopeEntryRead, ScopeEntryUpdate, ScopeImportResult

router = APIRouter(prefix="/programs/{program_id}/scope", tags=["scope"])

MAX_IMPORT_BYTES = 2 * 1024 * 1024

_HEADER_ALIASES = {
    "target": {"target", "asset", "scope item", "scope_item", "host", "url", "domain"},
    "description": {"description", "desc", "notes", "details"},
    "in_scope": {"in_scope", "in scope", "inscope", "scope", "status"},
    "severity_guide": {"severity guide", "severity_guide", "max severity", "max_severity", "severity"},
}

_TRUE_VALUES = {"true", "yes", "y", "1", "in", "in-scope", "inscope", "include", "included"}
_FALSE_VALUES = {"false", "no", "n", "0", "out", "out-of-scope", "outscope", "exclude", "excluded"}


async def _authorized(session: AsyncSession, actor, program_id: UUID) -> None:
    """Staff need view_reports; researchers need membership (mirrors program detail)."""
    if actor.kind == "staff":
        if not await has_program_perm(session, actor.staff, program_id, ACTION_VIEW_REPORTS):
            raise HTTPException(403, "Insufficient permissions for this program")
    else:
        membership = await session.scalar(
            select(ProgramMembership).where(
                ProgramMembership.researcher_id == actor.researcher.id,
                ProgramMembership.program_id == program_id,
            )
        )
        if membership is None:
            raise HTTPException(404, "Program not found")


async def _load_program(session: AsyncSession, program_id: UUID) -> Program:
    program = await session.get(Program, program_id)
    if program is None:
        raise HTTPException(404, "Program not found")
    return program


@router.get("", response_model=list[ScopeEntryRead])
async def list_scope(program_id: UUID, actor=Depends(get_actor), session: AsyncSession = Depends(get_session)):
    await _authorized(session, actor, program_id)
    entries = (
        await session.scalars(
            select(ScopeEntry).where(ScopeEntry.program_id == program_id).order_by(ScopeEntry.created_at)
        )
    ).all()
    return list(entries)


@router.post("", response_model=ScopeEntryRead, status_code=status.HTTP_201_CREATED)
async def create_scope_entry(
    program_id: UUID,
    payload: ScopeEntryCreate,
    _user=Depends(require_program_perm(ACTION_MANAGE_SCOPE)),
    session: AsyncSession = Depends(get_session),
):
    program = await _load_program(session, program_id)
    entry = ScopeEntry(
        org_id=program.org_id,
        program_id=program.id,
        target=payload.target.strip(),
        description=payload.description,
        in_scope=payload.in_scope,
        severity_guide=payload.severity_guide,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


@router.patch("/{entry_id}", response_model=ScopeEntryRead)
async def update_scope_entry(
    program_id: UUID,
    entry_id: UUID,
    payload: ScopeEntryUpdate,
    _user=Depends(require_program_perm(ACTION_MANAGE_SCOPE)),
    session: AsyncSession = Depends(get_session),
):
    entry = await session.get(ScopeEntry, entry_id)
    if entry is None or entry.program_id != program_id:
        raise HTTPException(404, "Scope entry not found")
    data = payload.model_dump(exclude_unset=True)
    for field in ("target", "description", "in_scope", "severity_guide"):
        if field in data and data[field] is not None:
            setattr(entry, field, data[field].strip() if isinstance(data[field], str) and field == "target" else data[field])
    await session.commit()
    await session.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scope_entry(
    program_id: UUID,
    entry_id: UUID,
    _user=Depends(require_program_perm(ACTION_MANAGE_SCOPE)),
    session: AsyncSession = Depends(get_session),
):
    entry = await session.get(ScopeEntry, entry_id)
    if entry is None or entry.program_id != program_id:
        raise HTTPException(404, "Scope entry not found")
    await session.delete(entry)
    await session.commit()


@router.post("/import", response_model=ScopeImportResult)
async def import_scope_csv(
    program_id: UUID,
    _user=Depends(require_program_perm(ACTION_MANAGE_SCOPE)),
    session: AsyncSession = Depends(get_session),
    file: UploadFile = File(...),
):
    """Bulk-import scope entries from CSV (todo #4).

    Expected header row: target (required); description, in_scope, severity_guide optional.
    Rows without a target are skipped; targets already present for the program
    (case-insensitive) are skipped so re-imports don't duplicate.
    """
    program = await _load_program(session, program_id)
    raw = await file.read()
    if len(raw) > MAX_IMPORT_BYTES:
        raise HTTPException(413, "CSV too large (max 2 MB)")
    text = raw.decode("utf-8-sig", errors="replace")
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        raise HTTPException(400, "CSV file is empty")

    header = [cell.strip().lower() for cell in rows[0]]
    column_of: dict[str, int] = {}
    for index, name in enumerate(header):
        for canonical, aliases in _HEADER_ALIASES.items():
            if name in aliases and canonical not in column_of:
                column_of[canonical] = index
    if "target" not in column_of:
        raise HTTPException(400, "CSV must have a 'target' column (aliases: asset, host, url, domain)")

    existing = {
        t.lower()
        for t in (
            await session.scalars(select(ScopeEntry.target).where(ScopeEntry.program_id == program_id))
        ).all()
    }

    created = skipped = 0
    for row in rows[1:]:
        if not row or all(not cell.strip() for cell in row):
            continue  # blank line
        def cell(canonical: str) -> str:
            index = column_of.get(canonical)
            return row[index].strip() if index is not None and index < len(row) else ""

        target = cell("target")[:200]
        if not target:
            skipped += 1
            continue
        if target.lower() in existing:
            skipped += 1
            continue
        in_scope = _parse_in_scope(cell("in_scope"))
        entry = ScopeEntry(
            org_id=program.org_id,
            program_id=program.id,
            target=target,
            description=cell("description"),
            in_scope=True if in_scope is None else in_scope,
            severity_guide=cell("severity_guide")[:32] or None,
        )
        session.add(entry)
        existing.add(target.lower())
        created += 1

    await session.commit()
    return ScopeImportResult(created=created, skipped=skipped)


def _parse_in_scope(value: str) -> bool | None:
    lowered = value.strip().lower()
    if lowered in _TRUE_VALUES:
        return True
    if lowered in _FALSE_VALUES:
        return False
    return None
