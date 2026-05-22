import axios, { type AxiosRequestConfig, type AxiosRequestHeaders } from "axios";
import { parseTenantId, readTenantId } from "./tenant";
import { isTenantRequiredForRequest } from "../routing/tenantScope";

/**
 * Cliente HTTP centralizado usando Axios.
 *
 * Aqui se maneja:
 * - Base URL de la API.
 * - Inclusion automatica del token JWT.
 * - Interceptores para errores globales.
 */

const envBaseUrl = import.meta.env.VITE_API_URL || "";
const rawBaseUrl = envBaseUrl || "/api";
const browserSafeBaseUrl =
  typeof window !== "undefined" && rawBaseUrl.includes("backend-fastapi")
    ? "/api"
    : rawBaseUrl;
const normalizedBaseUrl = browserSafeBaseUrl.endsWith("/")
  ? browserSafeBaseUrl.slice(0, -1)
  : browserSafeBaseUrl;
// Avoid double "/api" when callers already use "/api/v1/..."
const API_BASE_URL = normalizedBaseUrl.endsWith("/api")
  ? normalizedBaseUrl.slice(0, -4)
  : normalizedBaseUrl;

const readCookie = (name: string): string | null => {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));
  if (!cookie) return null;
  return decodeURIComponent(cookie.split("=").slice(1).join("="));
};

const readLocalStorage = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const isSuperAdmin = (): boolean => readLocalStorage("is_super_admin") === "true";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

export const withTenant = (
  tenantId?: number | string | null,
): AxiosRequestConfig | undefined => {
  if (tenantId === undefined || tenantId === null) return undefined;
  return { headers: { "X-Tenant-Id": String(tenantId) } as unknown as AxiosRequestHeaders };
};

export const buildTenantHeaders = (
  tenantId?: number | string | null,
): { headers: Record<string, string> } | undefined => {
  if (tenantId === undefined || tenantId === null) return undefined;
  return { headers: { "X-Tenant-Id": String(tenantId) } };
};

// Inyecta cabeceras comunes. Se evita depender de localStorage.
apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    if (config.baseURL?.includes("backend-fastapi")) {
      config.baseURL = "/api";
    }
    if (typeof config.url === "string" && config.url.includes("backend-fastapi")) {
      config.url = config.url.replace(/^https?:\/\/backend-fastapi:8000/, "/api");
    }
  }
  if (config.url?.includes("/api/api/")) {
    config.url = config.url.replace(/\/api\/api\//g, "/api/");
  }
  if (config.baseURL && config.url?.startsWith("/api/")) {
    const base = config.baseURL.endsWith("/")
      ? config.baseURL.slice(0, -1)
      : config.baseURL;
    if (base.endsWith("/api")) {
      config.url = config.url.replace(/^\/api/, "");
    }
  }
  if (config.baseURL?.endsWith("/api") && config.url?.startsWith("/api/")) {
    config.url = config.url.replace(/^\/api/, "");
  }
  const existingTenantHeader =
    config.headers &&
    (config.headers["X-Tenant-Id"] ?? (config.headers as any)["x-tenant-id"]);
  const existingAuthHeader =
    config.headers &&
    (config.headers["Authorization"] ?? (config.headers as any)["authorization"]);
  const storedTenantId = parseTenantId(readTenantId());
  const storedAccessToken = readLocalStorage("access_token");
  if (
    isSuperAdmin() &&
    !storedTenantId &&
    !existingTenantHeader &&
    isTenantRequiredForRequest(config.url)
  ) {
    return Promise.reject(
      new Error("Selecciona un tenant antes de realizar esta accion."),
    );
  }
  config.headers = {
    ...config.headers,
    ...(existingTenantHeader
      ? {}
      : storedTenantId
        ? { "X-Tenant-Id": storedTenantId }
        : {}),
    ...(existingAuthHeader
      ? {}
      : storedAccessToken
        ? { Authorization: `Bearer ${storedAccessToken}` }
        : {}),
    "X-Source": "web",
  } as unknown as AxiosRequestHeaders;
  const method = String(config.method || "get").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrfToken = readCookie("csrf_token");
    if (csrfToken) {
      (config.headers as Record<string, string>)["X-CSRF-Token"] = csrfToken;
    }
  }
  return config;
});

// Las credenciales se envian via cookie httpOnly configurada en el backend.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("access_token");
      sessionStorage.removeItem("mfa_username");
      if (window.location.pathname !== "/") {
        window.location.href = "/";
      }
    }
    return Promise.reject(error);
  },
);

