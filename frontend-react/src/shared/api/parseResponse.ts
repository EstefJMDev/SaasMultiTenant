/**
 * Utilidad de validación de respuestas API con Zod.
 *
 * Estrategia:
 * - En desarrollo: lanza error en la consola con detalle completo (fail-loud).
 * - En producción: loguea warning y devuelve los datos tal cual (fail-safe).
 *
 * Esto garantiza que los contratos de API se detecten durante desarrollo
 * sin romper producción por cambios menores de contrato.
 */

import { z } from "zod";

export function parseApiResponse<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context?: string,
): T {
  const result = schema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  const label = context ? `[API: ${context}]` : "[API]";
  const issues = result.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");

  if (import.meta.env.DEV) {
    console.error(
      `${label} Respuesta inesperada del servidor:\n${issues}\n`,
      "Datos recibidos:",
      data,
    );
  } else {
    console.warn(`${label} Contrato de API roto:\n${issues}`);
  }

  // En producción devolvemos los datos sin validar para no romper la UI.
  return data as T;
}
