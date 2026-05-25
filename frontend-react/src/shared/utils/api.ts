import type { AxiosError } from "axios";

/** Extrae el campo `detail` de una respuesta de error de FastAPI.
 *  Si no está disponible, devuelve el fallback recibido. */
export const getApiErrorDetail = (
  error: unknown,
  fallback: string,
): string => {
  const axiosErr = error as AxiosError<{ detail?: string }>;
  const detail = axiosErr?.response?.data?.detail;
  return detail || fallback;
};

type ValidationErrorItem = { msg?: string; type?: string };
type FastAPIDetail = string | ValidationErrorItem[] | Record<string, unknown>;

/** Versión robusta que maneja `detail` como string, array de errores de validación
 *  (FastAPI 422) u objeto arbitrario. */
export const getApiErrorDetailFull = (error: unknown, fallback: string): string => {
  const axiosErr = error as AxiosError<{ detail?: FastAPIDetail }>;
  const detail = axiosErr?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return (detail as ValidationErrorItem[])
      .map((item) => item?.msg || item?.type || String(item))
      .join(", ");
  }
  if (detail && typeof detail === "object") {
    const obj = detail as Record<string, unknown>;
    return (typeof obj.msg === "string" ? obj.msg : undefined)
      ?? (typeof obj.detail === "string" ? obj.detail : undefined)
      ?? JSON.stringify(detail);
  }
  return fallback;
};
