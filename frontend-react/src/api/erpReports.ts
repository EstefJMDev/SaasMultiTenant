import { apiClient } from "@shared/api/client";

export interface ErpProject {
  id: number;
  name: string;
  description?: string | null;
  project_type?: "regional" | "nacional" | "internacional" | null;
  department_id?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  duration_months?: number | null;
  loan_percent?: number | null;
  subsidy_percent?: number | null;
  is_active?: boolean;
  created_at?: string;
  tenant_id?: number | null;
}

export interface TimeReportRow {
  project_id: number;
  project_name: string;
  task_id: number;
  task_title: string;
  user_id: number | null;
  username: string | null;
  total_hours: string;
  hourly_rate: string | null;
}

export interface TimeReportDepartmentRow {
  department_id: number;
  department_name: string | null;
  user_id: number | null;
  username: string | null;
  total_hours: string;
}

export interface TimeReportFilters {
  projectId?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  userIds?: number[] | null;
}

export interface ProjectBudgetMilestone {
  id: number;
  tenant_id?: number | null;
  project_id: number;
  name: string;
  order_index: number;
  created_at?: string;
}

const buildTenantHeaders = (tenantId?: number) =>
  tenantId
    ? {
        headers: {
          "X-Tenant-Id": tenantId.toString(),
        },
      }
    : undefined;

export async function fetchErpProjects(tenantId?: number): Promise<ErpProject[]> {
  const response = await apiClient.get<ErpProject[]>(
    "/api/v1/erp/projects",
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function fetchErpProject(
  projectId: number,
  tenantId?: number,
): Promise<ErpProject> {
  const response = await apiClient.get<ErpProject>(
    `/api/v1/erp/projects/${projectId}`,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function fetchProjectBudgetMilestones(
  projectId: number,
  tenantId?: number,
): Promise<ProjectBudgetMilestone[]> {
  const response = await apiClient.get<ProjectBudgetMilestone[]>(
    `/api/v1/erp/projects/${projectId}/budget-milestones`,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function fetchTimeReport(
  filters: TimeReportFilters,
  tenantId?: number,
): Promise<TimeReportRow[]> {
  const params: Record<string, string> = {};

  if (filters.projectId) {
    params.project = String(filters.projectId);
  }
  if (filters.dateFrom) {
    params.date_from = filters.dateFrom;
  }
  if (filters.dateTo) {
    params.date_to = filters.dateTo;
  }
  if (filters.userIds && filters.userIds.length > 0) {
    params.user_ids = filters.userIds.join(",");
  }

  const response = await apiClient.get<TimeReportRow[]>(
    "/api/v1/erp/reports/time",
    {
      params,
      ...(buildTenantHeaders(tenantId) ?? {}),
    },
  );
  return response.data;
}

export async function fetchTimeReportByDepartment(
  filters: TimeReportFilters,
  tenantId?: number,
): Promise<TimeReportDepartmentRow[]> {
  const params: Record<string, string> = {};

  if (filters.projectId) {
    params.project_id = String(filters.projectId);
  }
  if (filters.dateFrom) {
    params.date_from = filters.dateFrom;
  }
  if (filters.dateTo) {
    params.date_to = filters.dateTo;
  }
  if (filters.userIds && filters.userIds.length > 0) {
    // El endpoint actual acepta un solo user_id; dejamos el filtrado multiusuario en cliente.
    params.user_id = String(filters.userIds[0]);
  }

  const response = await apiClient.get<TimeReportDepartmentRow[]>(
    "/api/v1/erp/reports/time-by-department",
    {
      params,
      ...(buildTenantHeaders(tenantId) ?? {}),
    },
  );
  return response.data;
}

