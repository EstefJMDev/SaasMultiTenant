import { makeTenantKeys } from "@shared/routing/tenantKeys";

const baseKeys = makeTenantKeys("invoices");

export const invoiceKeys = {
  ...baseKeys,
  list: (tenantId?: number, filters?: unknown) =>
    [...baseKeys.base(tenantId), "list", filters ?? {}] as const,
};
