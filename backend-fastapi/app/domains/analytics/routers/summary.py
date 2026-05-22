from fastapi import APIRouter, Depends, Header
from sqlmodel import Session

from app.api.deps import require_any_permissions, require_permissions
from app.core.tenancy import tenant_required_for_superadmin
from app.core.permissions import TIME_READ, TIME_TRACK, WORK_WRITE
from app.db.session import get_session
from app.schemas.summary import SummaryYearlyData
from app.services.summary_service import (
    get_summary_by_year,
    upsert_summary_by_year,
)

router = APIRouter()


@router.get("/summary/{year}", response_model=SummaryYearlyData)
def read_summary(
    year: int,
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user=Depends(require_any_permissions([TIME_READ, TIME_TRACK])),
) -> SummaryYearlyData:
    tenant_required_for_superadmin(current_user, x_tenant_id)
    return get_summary_by_year(session=session, year=year)


@router.put("/summary/{year}", response_model=SummaryYearlyData)
def update_summary(
    year: int,
    payload: SummaryYearlyData,
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user=Depends(require_permissions([WORK_WRITE])),
) -> SummaryYearlyData:
    tenant_required_for_superadmin(current_user, x_tenant_id)
    return upsert_summary_by_year(session=session, year=year, payload=payload)
