from fastapi import APIRouter

from app.domains.invoices.routers import router as legacy_invoices


router = APIRouter()
router.include_router(legacy_invoices.router, prefix="/invoices", tags=["invoices"])
