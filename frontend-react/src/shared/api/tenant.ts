export const TENANT_STORAGE_KEY = "contracts_selected_tenant";

/**
 * Tenant seleccionado en UI (solo preferencia de navegacion).
 *
 * Seguridad:
 * - Este valor vive en localStorage y es manipulable por el cliente.
 * - Nunca debe tratarse como identidad/autorizacion.
 * - El backend debe validar siempre el tenant contra la sesion/JWT.
 */
export const readTenantId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TENANT_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const writeTenantId = (tenantId: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TENANT_STORAGE_KEY, tenantId);
    window.dispatchEvent(
      new CustomEvent("tenant:changed", { detail: tenantId }),
    );
  } catch {
    // ignore storage failures
  }
};

export const clearTenantId = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TENANT_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("tenant:changed", { detail: null }));
  } catch {
    // ignore storage failures
  }
};

export const parseTenantId = (value: string | null): string | null => {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return String(Math.trunc(numeric));
};
