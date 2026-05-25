import { apiClient } from "@shared/api/client";
import { extractApiError } from "@shared/api/errors";

export interface ProjectBudgetLinePayload {
  concept: string;
  hito1_budget: number;
  justified_hito1: number;
  hito2_budget: number;
  justified_hito2: number;
  approved_budget: number;
  percent_spent: number;
  forecasted_spent: number;
}

export interface ProjectBudgetMilestone {
  id: number;
  project_id: number;
  name: string;
  order_index: number;
  created_at: string;
}

export interface BudgetLineMilestone {
  id: number;
  milestone_id: number;
  amount: number;
  justified: number;
  created_at: string;
}

export interface ProjectBudgetLine extends ProjectBudgetLinePayload {
  id: number;
  project_id: number;
  created_at: string;
  milestones?: BudgetLineMilestone[];
}

const buildTenantHeaders = (tenantId?: number) =>
  tenantId
    ? {
        headers: {
          "X-Tenant-Id": tenantId.toString(),
        },
      }
    : undefined;

export async function fetchProjectBudgets(projectId: number, tenantId?: number) {
  try {
    const response = await apiClient.get<ProjectBudgetLine[]>(
      `/api/v1/erp/projects/${projectId}/budgets`,
      buildTenantHeaders(tenantId),
    );
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return [];
    }
    throw error;
  }
}

export async function createProjectBudgetLine(
  projectId: number,
  payload: ProjectBudgetLinePayload,
  tenantId?: number,
) {
  const response = await apiClient.post<ProjectBudgetLine>(
    `/api/v1/erp/projects/${projectId}/budgets`,
    payload,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export type ProjectBudgetLineUpdatePayload = Partial<
  ProjectBudgetLinePayload & {
    milestones: Array<{
      milestone_id: number;
      amount?: number | null;
      justified?: number | null;
    }>;
  }
>;

export async function updateProjectBudgetLine(
  projectId: number,
  budgetId: number,
  payload: ProjectBudgetLineUpdatePayload,
  tenantId?: number,
) {
  try {
    const response = await apiClient.patch<ProjectBudgetLine>(
      `/api/v1/erp/projects/${projectId}/budgets/${budgetId}`,
      payload,
      buildTenantHeaders(tenantId),
    );
    return response.data;
  } catch (error: unknown) {
    if (import.meta.env.DEV) {
      const detail = extractApiError(error, "Error desconocido");
      console.error("[erpBudgets.updateProjectBudgetLine] failed", {
        projectId,
        budgetId,
        payload,
        detail,
      });
    }
    throw error;
  }
}

export async function deleteProjectBudgetLine(
  projectId: number,
  budgetId: number,
  tenantId?: number,
) {
  await apiClient.delete(
    `/api/v1/erp/projects/${projectId}/budgets/${budgetId}`,
    buildTenantHeaders(tenantId),
  );
}

export async function fetchBudgetMilestones(
  projectId: number,
  tenantId?: number,
) {
  const response = await apiClient.get<ProjectBudgetMilestone[]>(
    `/api/v1/erp/projects/${projectId}/budget-milestones`,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function createBudgetMilestone(
  projectId: number,
  payload: { name: string; order_index?: number },
  tenantId?: number,
) {
  const response = await apiClient.post<ProjectBudgetMilestone>(
    `/api/v1/erp/projects/${projectId}/budget-milestones`,
    payload,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function deleteBudgetMilestone(
  projectId: number,
  milestoneId: number,
  tenantId?: number,
) {
  await apiClient.delete(
    `/api/v1/erp/projects/${projectId}/budget-milestones/${milestoneId}`,
    buildTenantHeaders(tenantId),
  );
}

export async function updateBudgetMilestone(
  projectId: number,
  milestoneId: number,
  payload: { name?: string; order_index?: number },
  tenantId?: number,
) {
  const response = await apiClient.patch<ProjectBudgetMilestone>(
    `/api/v1/erp/projects/${projectId}/budget-milestones/${milestoneId}`,
    payload,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

