from fastapi import APIRouter

from app.platform.audit import router as legacy_audit


router = APIRouter(prefix="/audit", tags=["audit"])
router.include_router(legacy_audit.router)
