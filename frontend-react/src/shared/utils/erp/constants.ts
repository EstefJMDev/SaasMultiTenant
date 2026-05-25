const normalizeKey = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "");

export const SUMMARY_STORAGE_KEY = "erp-summary-table-by-year";

export const GENERAL_EXPENSES_LABEL = "GASTOS GENERALES";
export const EXTERNAL_COLLAB_LABEL = "COLABORACIONES EXTERNAS";
export const DEFAULT_GENERAL_EXPENSES_PERCENT = 19;
export const GENERAL_EXPENSES_AMOUNT_LABEL = `${GENERAL_EXPENSES_LABEL} (importe)`;

export const YEAR_FILTER_OPTIONS = [2024, 2025, 2026, 2027];

export const DEPARTMENT_COLOR_SCHEMES = [
  "teal",
  "cyan",
  "brand",
  "orange",
  "purple",
  "pink",
  "blue",
  "red",
  "yellow",
  "gray",
];

export const CATEGORY_COLOR_MAP: Record<string, string | undefined> = {
  [normalizeKey("Total")]: "#d9c2f0",
  [normalizeKey("Diferencia")]: "#e7c4f7",
};

export const BUDGET_ORDER = [
  normalizeKey("EQUIPOS (Amortizacion)"),
  normalizeKey("PERSONAL"),
  normalizeKey("Doctores"),
  normalizeKey("Titulados universitarios"),
  normalizeKey("No titulado"),
  normalizeKey("MATERIAL FUNGIBLE"),
  normalizeKey("Materiales para pruebas y ensayos"),
  normalizeKey("COLABORACIONES EXTERNAS"),
  normalizeKey(GENERAL_EXPENSES_LABEL),
  normalizeKey("OTROS GASTOS"),
  normalizeKey("Auditoria"),
  normalizeKey("Dictamen acreditado ENAC de informe DNSH"),
];

