from pydantic import BaseModel
from datetime import datetime


class DashboardSummary(BaseModel):
    """
    Datos agregados para el dashboard principal.

    Semantica v1 de actividad:
    - `active_users_now`: usuarios con `last_seen_at` dentro de los ultimos 15 minutos UTC.
    - `active_users_today`: usuarios con `last_seen_at` desde las 00:00 UTC del dia actual.
    """

    tenants_activos: int
    usuarios_activos: int
    active_users_now: int
    active_users_today: int
    herramientas_activas: int
    horas_hoy: float
    horas_ultima_semana: float
    tickets_abiertos: int
    tickets_en_progreso: int
    tickets_resueltos_hoy: int
    tickets_cerrados_ultima_semana: int


class RecentActiveUserItem(BaseModel):
    id: int
    full_name: str
    email: str
    tenant_id: int | None
    tenant_name: str | None
    last_seen_at: datetime


class RecentActiveUsersResponse(BaseModel):
    items: list[RecentActiveUserItem]
