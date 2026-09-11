from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.guards import require_global
from app.database import get_session
from app.models import PlatformSettings, StaffUser
from app.schemas import PlatformSettingsRead, PlatformSettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


async def get_or_create_settings(session: AsyncSession) -> PlatformSettings:
    """Singleton row (id=1); self-heals if the seed hasn't run."""
    settings = await session.get(PlatformSettings, 1)
    if settings is None:
        settings = PlatformSettings(id=1)
        session.add(settings)
        await session.commit()
        await session.refresh(settings)
    return settings


@router.get("", response_model=PlatformSettingsRead)
async def read_platform_settings(
    _admin: StaffUser = Depends(require_global()),  # super_admin only
    session: AsyncSession = Depends(get_session),
):
    settings = await get_or_create_settings(session)
    return PlatformSettingsRead(researcher_applications_enabled=settings.researcher_applications_enabled)


@router.patch("", response_model=PlatformSettingsRead)
async def update_platform_settings(
    payload: PlatformSettingsUpdate,
    _admin: StaffUser = Depends(require_global()),  # super_admin only
    session: AsyncSession = Depends(get_session),
):
    if payload.researcher_applications_enabled is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "researcher_applications_enabled (bool) is required")
    settings = await get_or_create_settings(session)
    settings.researcher_applications_enabled = payload.researcher_applications_enabled
    await session.commit()
    await session.refresh(settings)
    return PlatformSettingsRead(researcher_applications_enabled=settings.researcher_applications_enabled)
