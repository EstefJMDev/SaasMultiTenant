import {
  BUDGET_ORDER,
  EXTERNAL_COLLAB_LABEL,
  GENERAL_EXPENSES_LABEL,
} from "./constants";
import { formatPercentLabelValue } from "./formatters";

export const normalizeConceptKey = (value?: string) =>
  (value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "");

export const isGeneralExpensesConcept = (value?: string) =>
  normalizeConceptKey(value).startsWith(
    normalizeConceptKey(GENERAL_EXPENSES_LABEL),
  );

export const isExternalCollaborationConcept = (value?: string) =>
  normalizeConceptKey(value).startsWith(
    normalizeConceptKey(EXTERNAL_COLLAB_LABEL),
  );

export const parsePercentFromConcept = (value?: string) => {
  const match = value?.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!match) return null;
  const numeric = Number(match[1].replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
};

export const formatGeneralExpensesConcept = (percent: number) =>
  `${GENERAL_EXPENSES_LABEL} (${formatPercentLabelValue(percent)}%)`;

export const formatExternalCollaborationConcept = (type: string, name: string) =>
  `${EXTERNAL_COLLAB_LABEL} - ${type} - ${name}`;

export const parseExternalCollaborationDetails = (value?: string) => {
  if (!value) return null;
  const prefix = `${EXTERNAL_COLLAB_LABEL} - `;
  if (!value.startsWith(prefix)) return null;
  const rest = value.slice(prefix.length).trim();
  const parts = rest.split(" - ");
  if (parts.length === 1) {
    const name = parts[0].trim();
    return name ? { type: "", name } : null;
  }
  const [type, ...nameParts] = parts;
  const name = nameParts.join(" - ").trim();
  if (!type || !name) return null;
  return { type: type.trim(), name };
};

export const isAllCapsConcept = (value?: string) => {
  const text = (value ?? "").trim();
  if (!text) return false;
  return text === text.toUpperCase();
};

export const getBudgetGroupKey = (value?: string) => {
  // Agrupamos siempre por el concepto normalizado salvo para
  // gastos generales, que deben aparecer como una única fila
  // agregada aunque existan varias variantes.
  if (isGeneralExpensesConcept(value)) {
    return normalizeConceptKey(GENERAL_EXPENSES_LABEL);
  }
  // Para colaboraciones externas mantenemos una clave por
  // centro concreto (tipo + nombre) en lugar de agrupar todas
  // bajo "COLABORACIONES EXTERNAS". De lo contrario, al volver
  // a cargar los datos tras "Guardar tabla" los centros
  // individuales se colapsan en una sola fila y "desaparecen".
  return normalizeConceptKey(value);
};

export const getBudgetMatchKey = (value?: string) =>
  isGeneralExpensesConcept(value)
    ? normalizeConceptKey(GENERAL_EXPENSES_LABEL)
    : normalizeConceptKey(value);

export const getBudgetParentKey = (value?: string) => {
  if (isGeneralExpensesConcept(value)) return normalizeConceptKey(GENERAL_EXPENSES_LABEL);
  if (isExternalCollaborationConcept(value)) {
    const details = parseExternalCollaborationDetails(value);
    return details ? normalizeConceptKey(value) : normalizeConceptKey(EXTERNAL_COLLAB_LABEL);
  }
  return normalizeConceptKey(value);
};

export const getBudgetSortRank = (value?: string) => {
  const isExternal = isExternalCollaborationConcept(value);
  const key = isExternal
    ? normalizeConceptKey(EXTERNAL_COLLAB_LABEL)
    : isGeneralExpensesConcept(value)
      ? normalizeConceptKey(GENERAL_EXPENSES_LABEL)
      : normalizeConceptKey(value);
  const baseIndex = BUDGET_ORDER.indexOf(key);
  if (isExternal && value && value !== EXTERNAL_COLLAB_LABEL) {
    const childIndex = BUDGET_ORDER.indexOf(
      normalizeConceptKey("Centros Tecnologicos"),
    );
    return childIndex !== -1 ? childIndex + 0.1 : baseIndex + 0.1;
  }
  return baseIndex !== -1 ? baseIndex : Number.POSITIVE_INFINITY;
};

export const buildParentChildMap = <T extends { concept?: string }>(
  rows: T[],
) => {
  const map: Record<string, string[]> = {};
  let currentParent: string | null = null;
  rows.forEach((row) => {
    const concept = row.concept ?? "";
    const key = getBudgetParentKey(concept);
    if (isAllCapsConcept(concept)) {
      currentParent = key;
      if (!map[currentParent]) map[currentParent] = [];
      return;
    }
    if (currentParent) {
      map[currentParent].push(normalizeConceptKey(concept));
    }
  });
  return map;
};
