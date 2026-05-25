import { makeTenantKeys } from "@shared/routing/tenantKeys";

const baseKeys = makeTenantKeys("projects");

export const projectKeys = {
  ...baseKeys,
  list: (tenantId?: number, filters?: unknown) =>
    [...baseKeys.base(tenantId), "list", filters ?? {}] as const,
  detail: (tenantId: number | undefined, projectId: number | "all") =>
    [...baseKeys.base(tenantId), "detail", projectId] as const,
  tasks: (tenantId: number | undefined, projectId: number | "all") =>
    [...projectKeys.detail(tenantId, projectId), "tasks"] as const,
  gantt: (tenantId: number | undefined, projectId: number | "all") =>
    [...projectKeys.detail(tenantId, projectId), "gantt"] as const,
  budget: (tenantId: number | undefined, projectId: number | "all") =>
    [...projectKeys.detail(tenantId, projectId), "budget"] as const,
  timeTracking: (tenantId: number | undefined, projectId: number | "all") =>
    [...projectKeys.detail(tenantId, projectId), "time-tracking"] as const,
  activities: (tenantId: number | undefined, projectId: number | "all") =>
    [...projectKeys.detail(tenantId, projectId), "activities"] as const,
  subactivities: (tenantId: number | undefined, projectId: number | "all") =>
    [...projectKeys.detail(tenantId, projectId), "subactivities"] as const,
  milestones: (tenantId: number | undefined, projectId: number | "all") =>
    [...projectKeys.detail(tenantId, projectId), "milestones"] as const,
};
