import { makeTenantKeys } from "@shared/routing/tenantKeys";

const baseKeys = makeTenantKeys("contracts");

export const contractKeys = {
  ...baseKeys,
  list: (tenantId?: number, filters?: unknown) =>
    [...baseKeys.base(tenantId), "list", filters ?? {}] as const,
  detail: (tenantId: number | undefined, contractId: number) =>
    [...baseKeys.base(tenantId), "detail", contractId] as const,
  documents: (tenantId: number | undefined, contractId: number) =>
    [...baseKeys.base(tenantId), "documents", contractId] as const,
  documentsCenter: (tenantId: number | undefined, contractId: number) =>
    [...contractKeys.documents(tenantId, contractId), "center"] as const,
  comparativeOffers: (tenantId: number | undefined, contractId: number) =>
    [...contractKeys.detail(tenantId, contractId), "comparative-offers"] as const,
  workflow: (tenantId?: number) =>
    [...baseKeys.base(tenantId), "workflow"] as const,
  workflowTimeline: (tenantId?: number) =>
    [...contractKeys.workflow(tenantId), "timeline"] as const,
  workflowApprovals: (tenantId: number | undefined, contractId: number) =>
    [...contractKeys.workflow(tenantId), "approvals", contractId] as const,
  comparativeApprovals: (tenantId: number | undefined, contractId: number) =>
    [...contractKeys.workflow(tenantId), "comparative-approvals", contractId] as const,
};
