import { describe, expect, it, beforeEach } from "vitest";

import { apiClient } from "@shared/api/client";
import { TENANT_STORAGE_KEY } from "@shared/api/tenant";

const getRequestInterceptor = () => {
  const handler = (apiClient as any).interceptors.request.handlers[0];
  return handler?.fulfilled as (config: any) => any;
};

const getResponseRejectedInterceptor = () => {
  const handler = (apiClient as any).interceptors.response.handlers[0];
  return handler?.rejected as (error: any) => Promise<never>;
};

describe("apiClient tenant guard", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("adds X-Tenant-Id from tenant UI preference when available", async () => {
    localStorage.setItem(TENANT_STORAGE_KEY, "7");
    const interceptor = getRequestInterceptor();
    const config = { url: "/api/v1/hr/departments", headers: {} };

    const next = await interceptor(config);
    expect(next.headers["X-Tenant-Id"]).toBe("7");
  });

  it("allows non-tenant requests without tenant", async () => {
    const interceptor = getRequestInterceptor();
    const config = { url: "/api/v1/users/me", headers: {} };

    const next = await interceptor(config);
    expect(next).toBe(config);
  });

  it("normalizes duplicated /api prefix in request url", async () => {
    const interceptor = getRequestInterceptor();
    const config = { url: "/api/api/v1/users/me", headers: {} };

    const next = await interceptor(config);
    expect(next.url).toBe("/api/v1/users/me");
  });

  it("strips /api from url when baseURL already ends with /api", async () => {
    const interceptor = getRequestInterceptor();
    const config = { baseURL: "/api", url: "/api/v1/users/me", headers: {} };

    const next = await interceptor(config);
    expect(next.baseURL).toBe("/api");
    expect(next.url).toBe("/v1/users/me");
  });

  it("normalizes backend-fastapi absolute urls to proxied /api path", async () => {
    const interceptor = getRequestInterceptor();
    const config = {
      url: "http://backend-fastapi:8000/api/v1/contracts",
      headers: {},
    };

    const next = await interceptor(config);
    expect(next.url).toBe("/api/v1/contracts");
  });

  it("redirects hash private routes to login on 401", async () => {
    window.history.replaceState({}, "", "/dashboard");
    Object.defineProperty(window, "location", {
      value: {
        ...window.location,
        pathname: "/dashboard",
        href: "/dashboard",
      },
      writable: true,
      configurable: true,
    });
    localStorage.setItem("access_token", "token");
    sessionStorage.setItem("mfa_username", "user");

    const interceptor = getResponseRejectedInterceptor();

    await expect(
      interceptor({ response: { status: 401 } }),
    ).rejects.toMatchObject({ response: { status: 401 } });
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(sessionStorage.getItem("mfa_username")).toBeNull();
    expect(window.location.href).toBe("/");
  });
});
