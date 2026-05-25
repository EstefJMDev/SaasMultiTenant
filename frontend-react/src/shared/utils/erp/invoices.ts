import type { Invoice } from "@api/invoices";
import { formatCurrency, formatEuroValue } from "./formatters";

const statusColors: Record<string, string> = {
  uploaded: "gray",
  extracting: "purple",
  extracted: "blue",
  suggested: "cyan",
  validated: "brand",
  pending: "orange",
  paid: "brand",
  failed: "red",
};

const paidLabel = (status: Invoice["status"]) =>
  status === "paid" ? "SI" : "NO";

const observationLabel = (invoice: Invoice) => {
  if (invoice.status === "failed") return "Revisar error";
  if (invoice.extraction_error) return "Revisar error";
  if (invoice.status === "pending") return "Revisar pago";
  if (invoice.status === "paid") return "PAGADA";
  return "";
};

const observationColor = (invoice: Invoice) => {
  if (invoice.status === "failed" || invoice.extraction_error) return "red.500";
  if (invoice.status === "pending") return "red.500";
  if (invoice.status === "paid") return "brand.500";
  return "transparent";
};

const statusBadge = (status: Invoice["status"]) =>
  statusColors[status] ?? "gray";

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES");
};

const formatAmount = (
  value?: string | number | null,
  currency?: string | null,
) => {
  if (value == null || value === "") return "-";
  const numberValue = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(numberValue)) return String(value);
  if (currency && currency.toUpperCase() !== "EUR") {
    return `${formatEuroValue(numberValue)} ${currency.toUpperCase()}`;
  }
  return formatCurrency(numberValue);
};

export {
  formatAmount,
  formatDate,
  observationColor,
  observationLabel,
  paidLabel,
  statusBadge,
  statusColors,
};


