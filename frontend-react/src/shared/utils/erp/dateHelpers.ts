export const toDateSafe = (value?: string | null): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const toDateInput = (value?: string | null) =>
  value ? value.split("T")[0] : "";

export const computeProgress = (start: Date, end: Date) => {
  const now = new Date();
  const durationMs = end.getTime() - start.getTime();
  if (durationMs <= 0) return 0;
  const elapsedMs = now.getTime() - start.getTime();
  const ratio = Math.min(Math.max(elapsedMs / durationMs, 0), 1);
  return Math.round(ratio * 100);
};

export const createId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/** Convierte segundos a formato "HH:mm:ss". */
export const formatSeconds = (total: number): string => {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds]
    .map((v) => v.toString().padStart(2, "0"))
    .join(":");
};

/** Calcula el inicio de semana (lunes) para una fecha dada. */
export const startOfWeek = (date: Date): Date => {
  const day = date.getDay();
  const diff = (day + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

/** Formatea el encabezado corto de día usando el locale recibido. */
export const formatDayLabel = (date: Date, locale: string): string =>
  new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric" }).format(date);

/** Devuelve fecha en formato "YYYY-MM-DD" para inputs tipo date. */
export const formatDateYmd = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/** Suma días a una fecha sin mutar el original. */
export const addDays = (date: Date, days: number): Date => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

/** Formatea un ISO string como "dd/mm/yyyy" en locale es-ES. Devuelve "—" si inválido. */
export const formatIsoDisplay = (iso?: string | null): string => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

/** Formatea un ISO string como "dd/mm/yyyy hh:mm" en locale es-ES. Devuelve "" si inválido. */
export const formatDateTimeDisplay = (iso?: string | null): string => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
