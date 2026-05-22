import { apiClient } from "@shared/api/client";

export type SimulationExpense = {
  id: number;
  concept: string;
  amount: number;
};

export type SimulationProject = {
  id: number;
  name: string;
  budget: number;
  subsidyPercent: number;
  thresholdPercent: number;
  expenses: SimulationExpense[];
};

type ApiSimulationExpense = {
  id: number;
  project_id: number;
  concept: string;
  amount: number;
};

type ApiSimulationProject = {
  id: number;
  tenant_id: number | null;
  name: string;
  budget: number;
  subsidy_percent: number;
  threshold_percent: number;
  expenses: ApiSimulationExpense[];
};

export type SimulationProjectCreate = {
  name: string;
  budget?: number;
  subsidyPercent?: number;
  thresholdPercent?: number;
};

export type SimulationProjectUpdate = Partial<SimulationProjectCreate>;

export type SimulationExpenseCreate = {
  concept: string;
  amount?: number;
};

export type SimulationExpenseUpdate = Partial<SimulationExpenseCreate>;

const buildTenantHeaders = (tenantId?: number) =>
  tenantId
    ? {
        headers: {
          "X-Tenant-Id": tenantId.toString(),
        },
      }
    : undefined;

const mapExpense = (expense: ApiSimulationExpense): SimulationExpense => ({
  id: expense.id,
  concept: expense.concept,
  amount: Number(expense.amount ?? 0),
});

const mapProject = (project: ApiSimulationProject): SimulationProject => ({
  id: project.id,
  name: project.name,
  budget: Number(project.budget ?? 0),
  subsidyPercent: Number(project.subsidy_percent ?? 0),
  thresholdPercent: Number(project.threshold_percent ?? 50),
  expenses: project.expenses?.map(mapExpense) ?? [],
});

const serializeProjectPatch = (payload: SimulationProjectUpdate) => ({
  name: payload.name,
  budget: payload.budget,
  subsidy_percent: payload.subsidyPercent,
  threshold_percent: payload.thresholdPercent,
});

export async function fetchSimulations(tenantId?: number) {
  const response = await apiClient.get<ApiSimulationProject[]>(
    "/api/v1/erp/simulations",
    buildTenantHeaders(tenantId),
  );
  return response.data.map(mapProject);
}

export async function createSimulationProject(
  payload: SimulationProjectCreate,
  tenantId?: number,
) {
  const response = await apiClient.post<ApiSimulationProject>(
    "/api/v1/erp/simulations",
    {
      name: payload.name,
      budget: payload.budget ?? 0,
      subsidy_percent: payload.subsidyPercent ?? 0,
      threshold_percent: payload.thresholdPercent ?? 50,
    },
    buildTenantHeaders(tenantId),
  );
  return mapProject(response.data);
}

export async function updateSimulationProject(
  projectId: number,
  payload: SimulationProjectUpdate,
  tenantId?: number,
) {
  const response = await apiClient.patch<ApiSimulationProject>(
    `/api/v1/erp/simulations/${projectId}`,
    serializeProjectPatch(payload),
    buildTenantHeaders(tenantId),
  );
  return mapProject(response.data);
}

export async function deleteSimulationProject(
  projectId: number,
  tenantId?: number,
) {
  await apiClient.delete(
    `/api/v1/erp/simulations/${projectId}`,
    buildTenantHeaders(tenantId),
  );
}

export async function createSimulationExpense(
  projectId: number,
  payload: SimulationExpenseCreate,
  tenantId?: number,
) {
  const response = await apiClient.post<ApiSimulationExpense>(
    `/api/v1/erp/simulations/${projectId}/expenses`,
    {
      concept: payload.concept,
      amount: payload.amount ?? 0,
    },
    buildTenantHeaders(tenantId),
  );
  return mapExpense(response.data);
}

export async function updateSimulationExpense(
  projectId: number,
  expenseId: number,
  payload: SimulationExpenseUpdate,
  tenantId?: number,
) {
  const response = await apiClient.patch<ApiSimulationExpense>(
    `/api/v1/erp/simulations/${projectId}/expenses/${expenseId}`,
    payload,
    buildTenantHeaders(tenantId),
  );
  return mapExpense(response.data);
}

export async function deleteSimulationExpense(
  projectId: number,
  expenseId: number,
  tenantId?: number,
) {
  await apiClient.delete(
    `/api/v1/erp/simulations/${projectId}/expenses/${expenseId}`,
    buildTenantHeaders(tenantId),
  );
}

