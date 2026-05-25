import { describe, expect, it } from "vitest";

import {
  isTenantRequiredForRequest,
  isTenantScopedQueryKey,
  isTenantScopedRoute,
} from "@shared/routing/tenantScope";

describe("tenantScope", () => {
  it("treats public/global routes as not tenant-scoped", () => {
    expect(isTenantScopedRoute("/")).toBe(false);
    expect(isTenantScopedRoute("/public/invite")).toBe(false);
    expect(isTenantScopedRoute("/tenants")).toBe(false);
    expect(isTenantScopedRoute("/tenants/new")).toBe(false);
    expect(isTenantScopedRoute("/user-settings")).toBe(false);
  });

  it("treats business routes as tenant-scoped", () => {
    expect(isTenantScopedRoute("/works")).toBe(true);
    expect(isTenantScopedRoute("/hr/employees")).toBe(true);
    expect(isTenantScopedRoute("/contracts")).toBe(true);
    expect(isTenantScopedRoute("/invoices")).toBe(true);
    expect(isTenantScopedRoute("/tickets")).toBe(true);
    expect(isTenantScopedRoute("/signatures")).toBe(true);
    expect(isTenantScopedRoute("/projects")).toBe(true);
    expect(isTenantScopedRoute("/tools")).toBe(true);
  });

  it("determines when API requests require a tenant", () => {
    expect(isTenantRequiredForRequest("/api/v1/users/me")).toBe(false);
    expect(isTenantRequiredForRequest("/api/v1/auth/login")).toBe(false);
    expect(isTenantRequiredForRequest("/api/v1/tools/catalog")).toBe(false);
    expect(isTenantRequiredForRequest("/api/v1/hr/departments")).toBe(true);
    expect(isTenantRequiredForRequest("/api/v1/erp/projects")).toBe(true);
  });

  it("detects tenant-scoped query keys with nested data", () => {
    expect(isTenantScopedQueryKey(["tickets", 1, { status: "open" }])).toBe(true);
    expect(isTenantScopedQueryKey(["hr-employees", { tenantId: 2 }])).toBe(true);
    expect(
      isTenantScopedQueryKey([
        "erp-projects",
        { filters: { tenant_id: 3, status: "active" } },
      ]),
    ).toBe(true);
  });

  it("does not flag global query keys", () => {
    expect(isTenantScopedQueryKey(["current-user"])).toBe(false);
    expect(isTenantScopedQueryKey(["notifications", { onlyUnread: true }])).toBe(false);
    expect(isTenantScopedQueryKey(["tenants"])).toBe(false);
    expect(isTenantScopedQueryKey(["search", { query: "tenant" }])).toBe(false);
  });
});
