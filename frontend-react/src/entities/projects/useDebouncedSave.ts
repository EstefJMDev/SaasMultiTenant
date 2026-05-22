import { useEffect, useRef } from "react";
import type { SaveStatus } from "@shared/utils/erp/types";

/**
 * Hook para guardar datos con debounce (retraso).
 * Evita múltiples llamadas al backend mientras el usuario escribe.
 */
export function useDebouncedSave<T>(
  // Función async que guarda el valor (API, PATCH, etc.)
  fn: (value: T) => Promise<void>,

  // Tiempo de espera antes de guardar (ms)
  delay = 600,

  // Callback opcional para informar del estado del guardado
  onStatus?: (status: SaveStatus) => void,
  // Callback opcional para exponer el error de guardado
  onError?: (error: unknown) => void,
) {
  // Referencia al timeout actual (no provoca re-render)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Cleanup: cuando el componente se desmonta
   * limpia el timeout pendiente para evitar leaks
   */
  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  /**
   * Función que se llama cuando cambia el valor
   * (por ejemplo, al escribir en un input)
   */
  const trigger = (value: T) => {
    // Cancelamos cualquier guardado pendiente
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Indicamos que estamos guardando
    onStatus?.("saving");

    // Creamos un nuevo timeout
    timeoutRef.current = setTimeout(async () => {
      try {
        // Ejecutamos la función de guardado real
        await fn(value);

        // Guardado correcto
        onStatus?.("saved");

        // Volvemos a estado idle tras un pequeño delay
        setTimeout(() => onStatus?.("idle"), 800);
      } catch (err) {
        // Si falla el guardado
        console.error(err);
        onError?.(err);
        onStatus?.("error");
      }
    }, delay);
  };

  // Devolvemos la función que dispara el autosave
  return trigger;
}
