"""
Router agregador de contratos para mantener compatibilidad de imports.
"""

from fastapi import APIRouter
from fastapi.routing import APIRoute

from app.domains.procurement.contracts.routers.comparatives_router import router as comparatives_router
from app.domains.procurement.contracts.routers.contracts_router import router as contracts_router
from app.domains.procurement.contracts.routers.sync_router import router as sync_router
from app.domains.procurement.contracts.routers.templates_router import router as templates_router
from app.domains.procurement.contracts.routers.workflow_router import router as workflow_router


router: APIRouter = contracts_router
router.include_router(sync_router)
router.include_router(comparatives_router)
router.include_router(templates_router)
router.include_router(workflow_router)


def _route_priority(route: APIRoute) -> tuple[int, int]:
    path = route.path_format
    dynamic_segments = path.count("{")
    return (dynamic_segments, -len(path))


router.routes.sort(
    key=lambda route: _route_priority(route) if isinstance(route, APIRoute) else (99, 0)
)
