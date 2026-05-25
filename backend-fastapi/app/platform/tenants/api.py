from fastapi import APIRouter

from app.platform.tenants import router as legacy_tenants


router = APIRouter(prefix="/tenants", tags=["tenants"])
router.include_router(legacy_tenants.router)
