import type { AxiosError } from "axios";

export const getErrorStatus = (error: unknown): number | undefined => {
  const err = error as AxiosError | undefined;
  return err?.response?.status;
};

export const isAxiosError = (error: unknown): error is AxiosError => {
  return Boolean((error as AxiosError | undefined)?.isAxiosError);
};

/**
 * Extrae el mensaje de error legible desde cualquier respuesta de la API.
 *
 * Cubre los dos formatos usados en este proyecto:
 *   - FastAPI / backend:    { detail: string | { msg: string }[] }
 *   - Agent system:         { error: string }
 *   - Error genérico JS:    error.message
 *
 * @param error    El error capturado en un catch.
 * @param fallback Mensaje a mostrar si no se puede extraer nada útil.
 */
export function extractApiError(error: unknown, fallback: string): string {
  if (!error) return fallback;

  // Axios error con respuesta del servidor
  const axiosErr = error as AxiosError<Record<string, unknown>>;
  const data = axiosErr?.response?.data;

  if (data) {
    // FastAPI: { detail: string }
    if (typeof data.detail === "string" && data.detail.trim()) {
      return data.detail;
    }

    // FastAPI validation error: { detail: [{ msg: string }] }
    if (Array.isArray(data.detail) && data.detail.length > 0) {
      const msgs = (data.detail as Array<{ msg?: string }>)
        .map((d) => d?.msg)
        .filter(Boolean)
        .join(", ");
      if (msgs) return msgs;
    }

    // Agent system: { error: string }
    if (typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }
  }

  // Error JS genérico
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}
