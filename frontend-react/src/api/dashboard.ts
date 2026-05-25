import { apiClient } from "@shared/api/client";

export interface DashboardSummary {
  tenants_activos: number;
  usuarios_activos: number;
  active_users_now: number;
  active_users_today: number;
  herramientas_activas: number;
  horas_hoy: number;
  horas_ultima_semana: number;
  tickets_abiertos: number;
  tickets_en_progreso: number;
  tickets_resueltos_hoy: number;
  tickets_cerrados_ultima_semana: number;
}

export interface RecentActiveUser {
  id: number;
  full_name: string;
  email: string;
  tenant_id: number | null;
  tenant_name: string | null;
  last_seen_at: string;
}

export interface RecentActiveUsersResponse {
  items: RecentActiveUser[];
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const response = await apiClient.get<DashboardSummary>(
    "/api/v1/dashboard/summary",
  );
  return response.data;
}

export async function fetchRecentActiveUsers(
  limit = 5,
): Promise<RecentActiveUsersResponse> {
  const response = await apiClient.get<RecentActiveUsersResponse>(
    "/api/v1/dashboard/recent-active-users",
    {
      params: { limit },
    },
  );
  return response.data;
}

