from fastapi import APIRouter

from app.platform.notifications import internal as legacy_internal
from app.platform.notifications import router as legacy_notifications


router = APIRouter()
router.include_router(
    legacy_notifications.router,
    prefix="/notifications",
    tags=["notifications"],
)
router.include_router(
    legacy_internal.router,
    prefix="/internal",
    tags=["internal"],
)
