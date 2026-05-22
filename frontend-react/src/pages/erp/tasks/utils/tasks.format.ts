import type { TFunction } from "i18next";

const padDatePart = (value: number) => String(value).padStart(2, "0");

export const toDateTimeInput = (value?: string | null) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${padDatePart(parsed.getMonth() + 1)}-${padDatePart(
    parsed.getDate(),
  )}T${padDatePart(parsed.getHours())}:${padDatePart(parsed.getMinutes())}`;
};

export const formatTaskDateTime = (
  value: string | null | undefined,
  t: TFunction,
  locale: string,
) => {
  if (!value) return t("erp.tasks.drawer.noDate");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};
