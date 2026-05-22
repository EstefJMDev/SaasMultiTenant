from fastapi import APIRouter

from app.platform.auth import router as legacy_auth


router = APIRouter(prefix="/auth", tags=["auth"])
router.include_router(legacy_auth.router)
