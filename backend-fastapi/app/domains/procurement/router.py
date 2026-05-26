from fastapi import APIRouter, Depends

from app.domains.procurement.contratos_v2.router import router as contratos_v2_router
from app.domains.procurement.contracts.routers.router import router as contracts_router
from app.domains.procurement.deps import mark_legacy_contracts_alias, require_procurement_access

router = APIRouter()

canonical_dependencies = [Depends(require_procurement_access)]
legacy_dependencies = [
    Depends(require_procurement_access),
    Depends(mark_legacy_contracts_alias),
]

router.include_router(
    contratos_v2_router,
    prefix="/contratos",
    tags=["procurement"],
    dependencies=canonical_dependencies,
)
router.include_router(
    contracts_router,
    prefix="/procurement/contracts",
    tags=["procurement"],
    dependencies=canonical_dependencies,
)
router.include_router(
    contracts_router,
    prefix="/contracts",
    tags=["procurement"],
    deprecated=True,
    dependencies=legacy_dependencies,
)
