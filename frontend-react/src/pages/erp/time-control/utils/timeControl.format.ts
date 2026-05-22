export const HOURS = Array.from({ length: 24 }, (_, idx) => idx);
export const HOUR_HEIGHT = 48;
export const MIN_SESSION_MINUTES = 1;
export const MINUTES_STEP_OPTIONS = [5, 15, 30, 60];

export const formatSeconds = (total: number): string => {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds]
    .map((v) => v.toString().padStart(2, "0"))
    .join(":");
};

export const formatDayLabel = (date: Date, locale: string): string =>
  new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric" }).format(
    date,
  );

const padTimePart = (value: number): string => String(value).padStart(2, "0");

export const formatDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = padTimePart(date.getMonth() + 1);
  const day = padTimePart(date.getDate());
  const hours = padTimePart(date.getHours());
  const minutes = padTimePart(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export const formatMinutesLabel = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")}`;
};

export const formatApiError = (error: any, fallback: string): string => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.type || String(item))
      .join(", ");
  }
  if (detail && typeof detail === "object") {
    return detail.msg || detail.detail || JSON.stringify(detail);
  }
  return fallback;
};
