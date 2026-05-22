import { apiClient } from "@shared/api/client";

const buildTenantHeaders = (tenantId?: number) =>
  tenantId
    ? {
        headers: {
          "X-Tenant-Id": tenantId.toString(),
        },
      }
    : undefined;

// Tipos y llamadas para estructura del proyecto (actividades, hitos, entregables).

export interface ErpTaskTemplate {
  id: number;
  title: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ErpTaskTemplateCreate {
  title: string;
  description?: string | null;
  is_active?: boolean;
}

export interface ErpActivity {
  id: number;
  project_id: number;
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
}

export interface ErpActivityCreate {
  project_id: number;
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface ErpActivityUpdate {
  name?: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface ErpSubActivity {
  id: number;
  activity_id: number;
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
}

export interface ErpSubActivityCreate {
  activity_id: number;
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface ErpSubActivityUpdate {
  name?: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface ErpMilestone {
  id: number;
  project_id: number;
  activity_id?: number | null;
  title: string;
  description?: string | null;
  due_date?: string | null;
  allow_late_submission: boolean;
  created_at: string;
}

export interface ErpMilestoneCreate {
  project_id: number;
  activity_id?: number | null;
  title: string;
  description?: string | null;
  due_date?: string | null;
  allow_late_submission?: boolean;
}

export interface ErpMilestoneUpdate {
  title?: string | null;
  description?: string | null;
  due_date?: string | null;
  allow_late_submission?: boolean | null;
}

export interface ErpDeliverable {
  id: number;
  milestone_id: number;
  title: string;
  notes?: string | null;
  link_url?: string | null;
  file_id?: string | null;
  submitted_at?: string | null;
  is_late: boolean;
  created_at: string;
}

export interface ErpDeliverableCreate {
  milestone_id: number;
  title: string;
  notes?: string | null;
  link_url?: string | null;
  file_id?: string | null;
  submitted_at?: string | null;
}

export interface ErpDeliverableUpdate {
  title?: string | null;
  notes?: string | null;
  link_url?: string | null;
  file_id?: string | null;
  submitted_at?: string | null;
}

export async function fetchTaskTemplates(): Promise<ErpTaskTemplate[]> {
  const response = await apiClient.get<ErpTaskTemplate[]>(
    "/api/v1/erp/task-templates",
  );
  return response.data;
}

export async function createTaskTemplate(
  payload: ErpTaskTemplateCreate,
): Promise<ErpTaskTemplate> {
  const response = await apiClient.post<ErpTaskTemplate>(
    "/api/v1/erp/task-templates",
    payload,
  );
  return response.data;
}

export async function fetchActivities(
  projectId?: number | null,
  tenantId?: number,
): Promise<ErpActivity[]> {
  const response = await apiClient.get<ErpActivity[]>("/api/v1/erp/activities", {
    params: projectId ? { project_id: projectId } : undefined,
    ...(buildTenantHeaders(tenantId) ?? {}),
  });
  return response.data;
}

export async function createActivity(
  payload: ErpActivityCreate,
  tenantId?: number,
): Promise<ErpActivity> {
  const response = await apiClient.post<ErpActivity>(
    "/api/v1/erp/activities",
    payload,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function updateActivity(
  activityId: number,
  payload: ErpActivityUpdate,
): Promise<ErpActivity> {
  const response = await apiClient.patch<ErpActivity>(
    `/api/v1/erp/activities/${activityId}`,
    payload,
  );
  return response.data;
}

export async function fetchSubActivities(
  params: { projectId?: number | null; activityId?: number | null } = {},
  tenantId?: number,
): Promise<ErpSubActivity[]> {
  const query: Record<string, number> = {};
  if (params.projectId) query.project_id = params.projectId;
  if (params.activityId) query.activity_id = params.activityId;
  const response = await apiClient.get<ErpSubActivity[]>(
    "/api/v1/erp/subactivities",
    { params: query, ...(buildTenantHeaders(tenantId) ?? {}) },
  );
  return response.data;
}

export async function createSubActivity(
  payload: ErpSubActivityCreate,
  tenantId?: number,
): Promise<ErpSubActivity> {
  const response = await apiClient.post<ErpSubActivity>(
    "/api/v1/erp/subactivities",
    payload,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function updateSubActivity(
  subactivityId: number,
  payload: ErpSubActivityUpdate,
): Promise<ErpSubActivity> {
  const response = await apiClient.patch<ErpSubActivity>(
    `/api/v1/erp/subactivities/${subactivityId}`,
    payload,
  );
  return response.data;
}

export async function fetchMilestones(
  params: { projectId?: number | null; activityId?: number | null } = {},
  tenantId?: number,
): Promise<ErpMilestone[]> {
  const query: Record<string, number> = {};
  if (params.projectId) query.project_id = params.projectId;
  if (params.activityId) query.activity_id = params.activityId;
  const response = await apiClient.get<ErpMilestone[]>(
    "/api/v1/erp/milestones",
    { params: query, ...(buildTenantHeaders(tenantId) ?? {}) },
  );
  return response.data;
}

export async function createMilestone(
  payload: ErpMilestoneCreate,
  tenantId?: number,
): Promise<ErpMilestone> {
  const response = await apiClient.post<ErpMilestone>(
    "/api/v1/erp/milestones",
    payload,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function updateMilestone(
  milestoneId: number,
  payload: ErpMilestoneUpdate,
): Promise<ErpMilestone> {
  const response = await apiClient.patch<ErpMilestone>(
    `/api/v1/erp/milestones/${milestoneId}`,
    payload,
  );
  return response.data;
}

export async function fetchDeliverables(
  milestoneId?: number | null,
): Promise<ErpDeliverable[]> {
  const response = await apiClient.get<ErpDeliverable[]>(
    "/api/v1/erp/deliverables",
    { params: milestoneId ? { milestone_id: milestoneId } : undefined },
  );
  return response.data;
}

export async function createDeliverable(
  payload: ErpDeliverableCreate,
): Promise<ErpDeliverable> {
  const response = await apiClient.post<ErpDeliverable>(
    "/api/v1/erp/deliverables",
    payload,
  );
  return response.data;
}

export async function updateDeliverable(
  deliverableId: number,
  payload: ErpDeliverableUpdate,
): Promise<ErpDeliverable> {
  const response = await apiClient.patch<ErpDeliverable>(
    `/api/v1/erp/deliverables/${deliverableId}`,
    payload,
  );
  return response.data;
}

