import type { UseToastOptions } from "@chakra-ui/react";
import { getApiErrorDetailFull } from "./api";

type ToastFn = (options: UseToastOptions) => void;
type ToastStatus = "error" | "warning" | "info";

/**
 * Factory que devuelve un handler `onError` tipado para useMutation.
 *
 * Elimina el patrón repetido `(error: any) => toast({ ... error?.response?.data?.detail ... })`
 * y extrae el detalle de error de FastAPI (string, array 422, objeto) con fallback.
 *
 * @example
 * onError: onMutationError(toast, "Error al guardar", "No se pudo guardar.")
 */
export function onMutationError(
  toast: ToastFn,
  title: string,
  fallback: string,
  status: ToastStatus = "error",
): (error: unknown) => void {
  return (error: unknown) => {
    toast({
      title,
      description: getApiErrorDetailFull(error, fallback),
      status,
    });
  };
}
