from fastapi import APIRouter

from app.platform.audit.api import router as audit_router
from app.platform.auth.api import router as auth_router
from app.platform.branding.api import router as branding_router
from app.platform.health.api import router as health_router
from app.platform.iam.api import router as iam_router
from app.platform.notifications.api import router as notifications_router
from app.platform.telegram.api import router as telegram_router
from app.platform.tenants.api import router as tenants_router
from app.platform.tools.api import router as tools_router


router = APIRouter()
router.include_router(health_router)
router.include_router(auth_router)
router.include_router(branding_router)
router.include_router(tenants_router)
router.include_router(iam_router)
router.include_router(tools_router)
router.include_router(audit_router)
router.include_router(notifications_router)
router.include_router(telegram_router)
