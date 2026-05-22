from fastapi import APIRouter

from app.platform.branding import router as legacy_branding


router = APIRouter(prefix="/branding", tags=["branding"])
router.include_router(legacy_branding.router)
