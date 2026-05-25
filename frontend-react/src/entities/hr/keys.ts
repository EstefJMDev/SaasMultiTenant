import { makeTenantKeys } from "@shared/routing/tenantKeys";

const baseKeys = makeTenantKeys("hr");

export const hrKeys = {
  ...baseKeys,
  departments: (tenantId?: number) =>
    [...baseKeys.base(tenantId), "departments"] as const,
  employees: (tenantId?: number, year?: number) =>
    [...baseKeys.base(tenantId), "employees", year ?? "all"] as const,
  headcount: (tenantId?: number) =>
    [...baseKeys.base(tenantId), "headcount"] as const,
};
