const TENANT_SCOPE_ALLOWLIST = [
  "/",
  "/mfa",
  "/accept-invitation",
  "/supplier-onboarding",
  "/supplier/complete",
  "/public",
  "/user-settings",
  "/tenants",
];

const TENANT_REQUEST_ALLOWLIST = [
  "/api/v1/auth",
  "/api/v1/users/me",
  "/api/v1/tenants",
  "/api/v1/tools/catalog",
  "/api/v1/invitations/validate",
];

export const isTenantScopedRoute = (pathname: string): boolean => {
  if (!pathname.startsWith("/")) return false;
  return !TENANT_SCOPE_ALLOWLIST.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
};

export const isTenantRequiredForRequest = (pathname?: string): boolean => {
  if (!pathname) return false;
  if (!pathname.startsWith("/api/v1/")) return false;
  return !TENANT_REQUEST_ALLOWLIST.some((prefix) => pathname.startsWith(prefix));
};

const TENANT_SCOPED_QUERY_PREFIXES = [
  "hr-",
  "erp-",
  "contracts",
  "contract-",
  "projects",
  "project-",
  "invoices",
  "tickets",
  "ticket-",
  "tenant-",
  "support",
  "dashboard-",
  "users",
];

const isTenantHintKey = (key: string): boolean =>
  key === "tenantId" || key === "tenant_id" || key === "tenant";

const hasTenantHint = (value: unknown): boolean => {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some(hasTenantHint);
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => isTenantHintKey(key) || hasTenantHint(nested),
    );
  }
  return false;
};

export const isTenantScopedQueryKey = (queryKey: unknown): boolean => {
  if (!Array.isArray(queryKey)) return false;
  return queryKey.some((part) => {
    if (typeof part === "string") {
      return TENANT_SCOPED_QUERY_PREFIXES.some((prefix) =>
        part.startsWith(prefix),
      );
    }
    if (typeof part === "object") {
      return hasTenantHint(part);
    }
    return false;
  });
};
