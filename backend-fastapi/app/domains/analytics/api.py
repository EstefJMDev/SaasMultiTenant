from fastapi import APIRouter

from app.domains.analytics.routers import dashboard as legacy_dashboard
from app.domains.analytics.routers import simulations as legacy_simulations
from app.domains.analytics.routers import summary as legacy_summary


router = APIRouter()
router.include_router(legacy_dashboard.router, prefix="/dashboard", tags=["dashboard"])
router.include_router(legacy_summary.router, prefix="/erp", tags=["erp"])
router.include_router(legacy_simulations.router, prefix="/erp", tags=["erp"])
