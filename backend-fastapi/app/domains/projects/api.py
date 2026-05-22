from fastapi import APIRouter, Depends

from app.domains.projects.api_budgets import router as budgets_router
from app.domains.projects.api_documents import router as documents_router
from app.domains.projects.api_projects import router as projects_router
from app.domains.projects.deps import mark_legacy_projects_alias, require_projects_access


router = APIRouter()

canonical_dependencies = [Depends(require_projects_access)]
legacy_dependencies = [
    Depends(require_projects_access),
    Depends(mark_legacy_projects_alias),
]

router.include_router(
    projects_router,
    prefix="/projects",
    tags=["projects"],
    dependencies=canonical_dependencies,
)
router.include_router(
    documents_router,
    prefix="/projects",
    tags=["projects"],
    dependencies=canonical_dependencies,
)
router.include_router(
    budgets_router,
    prefix="/projects",
    tags=["projects"],
    dependencies=canonical_dependencies,
)

router.include_router(
    projects_router,
    prefix="/erp/projects",
    tags=["erp"],
    deprecated=True,
    dependencies=legacy_dependencies,
)
router.include_router(
    documents_router,
    prefix="/erp/projects",
    tags=["erp"],
    deprecated=True,
    dependencies=legacy_dependencies,
)
router.include_router(
    budgets_router,
    prefix="/erp/projects",
    tags=["erp"],
    deprecated=True,
    dependencies=legacy_dependencies,
)
