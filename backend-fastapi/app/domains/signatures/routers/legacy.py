from fastapi import APIRouter, Depends

from app.domains.signatures.api import public_router as domain_public_router
from app.domains.signatures.api import router as domain_router
from app.domains.signatures.deps import mark_legacy_signatures_alias


router = APIRouter(
    deprecated=True,
    dependencies=[Depends(mark_legacy_signatures_alias)],
)
router.include_router(domain_router)

public_router = APIRouter(dependencies=[Depends(mark_legacy_signatures_alias)])
public_router.include_router(domain_public_router)
