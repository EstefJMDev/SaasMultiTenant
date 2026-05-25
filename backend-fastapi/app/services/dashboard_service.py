from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlmodel import Session, select

from app.models.tenant import Tenant
from app.models.tenant_tool import TenantTool
from app.models.ticket import Ticket, TicketStatus
from app.models.user import User
from app.schemas.dashboard import (
    DashboardSummary,
    RecentActiveUserItem,
    RecentActiveUsersResponse,
)


def get_dashboard_summary(session: Session, *, current_user: User) -> DashboardSummary:
    """
    Calcula métricas básicas para el dashboard.

    - Tenants activos (solo visible para super admin).
    - Usuarios activos (del sistema o del tenant).
    - Herramientas activas para el tenant actual.
    - Horas registradas hoy y en la última semana (placeholder: 0.0 de momento).
    """

    # Tenants activos
    if current_user.is_super_admin:
        tenants_activos = session.exec(
            select(func.count()).select_from(Tenant).where(Tenant.is_active.is_(True)),
        ).one()
    else:
        tenants_activos = 1 if current_user.tenant_id else 0

    # Usuarios activos
    if current_user.is_super_admin:
        usuarios_activos = session.exec(
            select(func.count()).select_from(User).where(User.is_active.is_(True)),
        ).one()
        now_utc = datetime.now(timezone.utc)
        today_start_utc = datetime(now_utc.year, now_utc.month, now_utc.day, tzinfo=timezone.utc)
        active_now_cutoff = now_utc - timedelta(minutes=15)
        active_users_now = session.exec(
            select(func.count())
            .select_from(User)
            .where(
                User.is_active.is_(True),
                User.last_seen_at.is_not(None),
                User.last_seen_at >= active_now_cutoff,
            ),
        ).one()
        active_users_today = session.exec(
            select(func.count())
            .select_from(User)
            .where(
                User.is_active.is_(True),
                User.last_seen_at.is_not(None),
                User.last_seen_at >= today_start_utc,
            ),
        ).one()
    else:
        usuarios_activos = session.exec(
            select(func.count())
            .select_from(User)
            .where(
                User.is_active.is_(True),
                User.tenant_id == current_user.tenant_id,
            ),
        ).one()
        active_users_now = 0
        active_users_today = 0

    # Herramientas activas para el tenant actual
    if current_user.tenant_id:
        herramientas_activas = session.exec(
            select(func.count())
            .select_from(TenantTool)
            .where(
                TenantTool.tenant_id == current_user.tenant_id,
                TenantTool.is_enabled.is_(True),
            ),
        ).one()
    else:
        herramientas_activas = 0

    # Horas desde ERP: por simplicidad, lo dejamos a 0.0 de momento.
    horas_hoy = 0.0
    horas_ultima_semana = 0.0

    # Métricas básicas de soporte (tickets)
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    week_start = today_start - timedelta(days=7)

    ticket_scope = select(Ticket)
    if not current_user.is_super_admin and current_user.tenant_id:
        ticket_scope = ticket_scope.where(Ticket.tenant_id == current_user.tenant_id)

    base_query = ticket_scope.subquery()

    tickets_abiertos = session.exec(
        select(func.count())
        .select_from(Ticket)
        .where(Ticket.status == TicketStatus.OPEN)
        .where(Ticket.id.in_(select(base_query.c.id)))
    ).one()

    tickets_en_progreso = session.exec(
        select(func.count())
        .select_from(Ticket)
        .where(Ticket.status == TicketStatus.IN_PROGRESS)
        .where(Ticket.id.in_(select(base_query.c.id)))
    ).one()

    tickets_resueltos_hoy = session.exec(
        select(func.count())
        .select_from(Ticket)
        .where(Ticket.resolved_at.is_not(None))
        .where(Ticket.resolved_at >= today_start)
        .where(Ticket.id.in_(select(base_query.c.id)))
    ).one()

    tickets_cerrados_ultima_semana = session.exec(
        select(func.count())
        .select_from(Ticket)
        .where(Ticket.closed_at.is_not(None))
        .where(Ticket.closed_at >= week_start)
        .where(Ticket.id.in_(select(base_query.c.id)))
    ).one()

    return DashboardSummary(
        tenants_activos=int(tenants_activos or 0),
        usuarios_activos=int(usuarios_activos or 0),
        active_users_now=int(active_users_now or 0),
        active_users_today=int(active_users_today or 0),
        herramientas_activas=int(herramientas_activas or 0),
        horas_hoy=float(horas_hoy),
        horas_ultima_semana=float(horas_ultima_semana),
        tickets_abiertos=int(tickets_abiertos or 0),
        tickets_en_progreso=int(tickets_en_progreso or 0),
        tickets_resueltos_hoy=int(tickets_resueltos_hoy or 0),
        tickets_cerrados_ultima_semana=int(tickets_cerrados_ultima_semana or 0),
    )


def get_recent_active_users(
    session: Session,
    *,
    current_user_id: int | None = None,
    limit: int = 5,
) -> RecentActiveUsersResponse:
    safe_limit = max(1, min(int(limit), 10))
    filters = [
        User.is_active.is_(True),
        User.last_seen_at.is_not(None),
    ]
    if current_user_id is not None:
        filters.append(User.id != current_user_id)
    rows = session.exec(
        select(User, Tenant.name)
        .select_from(User)
        .join(Tenant, Tenant.id == User.tenant_id, isouter=True)
        .where(*filters)
        .order_by(User.last_seen_at.desc(), User.id.desc())
        .limit(safe_limit)
    ).all()

    items = [
        RecentActiveUserItem(
            id=user.id or 0,
            full_name=user.full_name,
            email=user.email,
            tenant_id=user.tenant_id,
            tenant_name=tenant_name,
            last_seen_at=user.last_seen_at,
        )
        for user, tenant_name in rows
        if user.last_seen_at is not None
    ]

    return RecentActiveUsersResponse(items=items)
