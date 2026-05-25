from fastapi import APIRouter

from app.domains.analytics.api import router as analytics_router
from app.domains.imports.router import router as imports_router
from app.domains.invoices.api import router as invoices_router
from app.domains.org.api import router as org_router
from app.domains.procurement.router import router as procurement_router
from app.domains.projects.api import router as projects_router
from app.domains.signatures.api import router as signatures_router
from app.domains.tickets.api import router as tickets_router
from app.domains.time.api import router as time_router
from app.domains.work.api import router as work_router


router = APIRouter()
router.include_router(org_router)
router.include_router(projects_router)
router.include_router(work_router)
router.include_router(time_router)
router.include_router(procurement_router)
router.include_router(invoices_router)
router.include_router(signatures_router)
router.include_router(tickets_router)
router.include_router(analytics_router)
router.include_router(imports_router)
