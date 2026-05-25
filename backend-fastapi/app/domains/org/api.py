from fastapi import APIRouter, Depends

from app.domains.org.api_allocations import router as allocations_router
from app.domains.org.api_departments import router as departments_router
from app.domains.org.api_people_availability import router as people_availability_router
from app.domains.org.api_people import router as people_router
from app.domains.org.api_positions import router as positions_router
from app.domains.org.deps import mark_legacy_hr_alias, require_org_tool


router = APIRouter(dependencies=[Depends(require_org_tool)])
legacy_dependencies = [Depends(mark_legacy_hr_alias)]

# Canonical org endpoints.
router.include_router(
    departments_router,
    prefix="/org",
    tags=["org"],
)

# Canonical people endpoints.
router.include_router(
    people_router,
    prefix="/people",
    tags=["people"],
)
router.include_router(
    people_availability_router,
    prefix="/people",
    tags=["people"],
)
router.include_router(
    allocations_router,
    prefix="/people/allocations",
    tags=["people"],
)

# Canonical positions endpoints.
router.include_router(
    positions_router,
    prefix="/org",
    tags=["positions"],
)

# Legacy HR aliases.
router.include_router(
    departments_router,
    prefix="/hr",
    tags=["hr"],
    deprecated=True,
    dependencies=legacy_dependencies,
)
router.include_router(
    people_router,
    prefix="/hr/employees",
    tags=["hr"],
    deprecated=True,
    dependencies=legacy_dependencies,
)
router.include_router(
    people_availability_router,
    prefix="/hr/employees",
    tags=["hr"],
    deprecated=True,
    dependencies=legacy_dependencies,
)
router.include_router(
    allocations_router,
    prefix="/hr/allocations",
    tags=["hr"],
    deprecated=True,
    dependencies=legacy_dependencies,
)
