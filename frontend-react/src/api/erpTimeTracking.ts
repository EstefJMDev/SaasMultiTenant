import { apiClient } from "@shared/api/client";

export interface TimeSession {
  id: number;
  task_id: number | null;
  user_id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  is_active: boolean;
  created_at: string;
}

export interface ErpTask {
  id: number;
  project_id: number | null;
  subactivity_id?: number | null;
  task_template_id?: number | null;
  title: string;
  description?: string | null;
  assigned_to_id?: number | null;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  is_completed: boolean;
  created_at: string;
}

const buildTenantHeaders = (tenantId?: number) =>
  tenantId
    ? {
        headers: {
          "X-Tenant-Id": tenantId.toString(),
        },
      }
    : undefined;

export async function fetchErpTasks(tenantId?: number): Promise<ErpTask[]> {
  const response = await apiClient.get<ErpTask[]>(
    "/api/v1/erp/tasks",
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function getActiveTimeSession(
  tenantId?: number,
): Promise<TimeSession | null> {
  try {
    const response = await apiClient.get<TimeSession>(
      "/api/v1/erp/time-tracking/active",
      buildTenantHeaders(tenantId),
    );
    return response.data;
  } catch (error: any) {
    // En caso de no encontrar sesión activa o errores de autenticación,
    // consideramos que no hay sesión en marcha y no mostramos errores en UI.
    if (
      error?.response?.status === 404 ||
      error?.response?.status === 401 ||
      error?.response?.status === 403
    ) {
      return null;
    }
    return null;
  }
}

export async function startTimeSession(
  taskId?: number | null,
  tenantId?: number,
): Promise<TimeSession> {
  const payload: { task_id?: number; tenant_id?: number } = {};
  if (taskId !== undefined && taskId !== null) {
    payload.task_id = taskId;
  }
  if (tenantId !== undefined) {
    payload.tenant_id = tenantId;
  }

  const response = await apiClient.post<TimeSession>(
    "/api/v1/erp/time-tracking/start",
    payload,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function stopTimeSession(tenantId?: number): Promise<TimeSession> {
  const response = await apiClient.put<TimeSession>(
    "/api/v1/erp/time-tracking/stop",
    undefined,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

