export const makeTenantKeys = (domain: string) => {
  const base = (tenantId?: number) => [domain, tenantId ?? "all"] as const;
  const list = (tenantId?: number, filters?: unknown) =>
    [...base(tenantId), "list", filters ?? {}] as const;
  const detail = (tenantId: number | undefined, id: number | string) =>
    [...base(tenantId), "detail", id] as const;

  return { base, list, detail };
};
