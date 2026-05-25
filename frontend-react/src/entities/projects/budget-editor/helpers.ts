import type {
  ProjectBudgetLine,
  ProjectBudgetLineUpdatePayload,
} from "@api/erpBudgets";
import { getBudgetMatchKey, normalizeConceptKey } from "@shared/utils/erp";

import type {
  BudgetCompositePayload,
  DerivedMilestoneValues,
} from "./types";

export const isSummaryRow = (concept?: string) => {
  const key = normalizeConceptKey(concept ?? "");
  return (
    key === normalizeConceptKey("Total") ||
    key === normalizeConceptKey("Diferencia por justificar")
  );
};

export const safeNumber = (value: unknown, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export const findBudgetByComposite = (
  budgets: ProjectBudgetLine[],
  payload: BudgetCompositePayload,
) => {
  const key = getBudgetMatchKey(payload.concept);
  return budgets.find((row) => {
    if (getBudgetMatchKey(row.concept ?? "") !== key) return false;
    const h1 = safeNumber(row.hito1_budget ?? 0);
    const h2 = safeNumber(row.hito2_budget ?? 0);
    const j1 = safeNumber(row.justified_hito1 ?? 0);
    const j2 = safeNumber(row.justified_hito2 ?? 0);
    const approved = safeNumber(row.approved_budget ?? 0);
    const forecast = safeNumber(row.forecasted_spent ?? 0);
    return (
      h1 === safeNumber(payload.hito1_budget) &&
      h2 === safeNumber(payload.hito2_budget) &&
      j1 === safeNumber(payload.justified_hito1) &&
      j2 === safeNumber(payload.justified_hito2) &&
      approved === safeNumber(payload.approved_budget) &&
      forecast === safeNumber(payload.forecasted_spent)
    );
  });
};

export const deriveMilestoneValues = (
  draftPayload: ProjectBudgetLineUpdatePayload,
  fallback: ProjectBudgetLine | undefined,
): DerivedMilestoneValues => {
  const milestones = draftPayload.milestones ?? [];
  if (milestones.length === 0) {
    const h1 = safeNumber(draftPayload.hito1_budget ?? fallback?.hito1_budget ?? 0);
    const h2 = safeNumber(draftPayload.hito2_budget ?? fallback?.hito2_budget ?? 0);
    const j1 = safeNumber(
      draftPayload.justified_hito1 ?? fallback?.justified_hito1 ?? 0,
    );
    const j2 = safeNumber(
      draftPayload.justified_hito2 ?? fallback?.justified_hito2 ?? 0,
    );
    const fallbackApproved = safeNumber(fallback?.approved_budget, 0);
    const approved =
      draftPayload.approved_budget !== undefined
        ? safeNumber(draftPayload.approved_budget, 0)
        : fallbackApproved > 0
          ? fallbackApproved
          : h1 + h2;
    return {
      hasMilestones: false,
      h1,
      h2,
      j1,
      j2,
      approved,
      milestones,
    };
  }

  const amounts = milestones.map((milestone) => safeNumber(milestone.amount ?? 0));
  const justifications = milestones.map((milestone) =>
    safeNumber(milestone.justified ?? 0),
  );
  const approved = amounts.reduce((sum, value) => sum + value, 0);
  return {
    hasMilestones: true,
    h1: amounts[0] ?? 0,
    h2: amounts[1] ?? 0,
    j1: justifications[0] ?? 0,
    j2: justifications[1] ?? 0,
    approved,
    milestones,
  };
};
