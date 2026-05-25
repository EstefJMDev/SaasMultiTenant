from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.api.deps import get_current_active_user, get_current_super_admin
from app.db.session import get_session
from app.models.user import User
from app.schemas.dashboard import DashboardSummary, RecentActiveUsersResponse
from app.services.dashboard_service import get_dashboard_summary, get_recent_active_users


router = APIRouter()


@router.get(
    "/summary",
    response_model=DashboardSummary,
    summary="Resumen de métricas para el dashboard",
)
def dashboard_summary(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> DashboardSummary:
    """
    Devuelve las métricas principales para el dashboard.
    """

    return get_dashboard_summary(session=session, current_user=current_user)


@router.get(
    "/recent-active-users",
    response_model=RecentActiveUsersResponse,
    summary="Ultimos accesos recientes para Super Admin",
)
def recent_active_users(
    limit: int = Query(default=5, ge=1, le=10),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_super_admin),
) -> RecentActiveUsersResponse:
    return get_recent_active_users(
        session=session,
        current_user_id=current_user.id,
        limit=limit,
    )


