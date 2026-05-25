from fastapi import APIRouter

from app.platform.health import router as legacy_health


router = APIRouter(prefix="/health", tags=["health"])
router.include_router(legacy_health.router)
