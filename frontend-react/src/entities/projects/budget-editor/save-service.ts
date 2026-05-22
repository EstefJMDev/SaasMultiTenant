import type {
  ProjectBudgetLine,
  ProjectBudgetLinePayload,
  ProjectBudgetLineUpdatePayload,
} from "@api/erpBudgets";
import {
  getBudgetMatchKey,
  getBudgetParentKey,
  isAllCapsConcept,
} from "@shared/utils/erp";

import { deriveMilestoneValues, safeNumber } from "./helpers";

type BudgetParentTotals = Map<string, { j1: number; j2: number }>;

interface BudgetRowSources {
  latestBudgets: ProjectBudgetLine[];
  mergedBudgetRows: ProjectBudgetLine[];
  groupedBudgetRows: ProjectBudgetLine[];
  defaultBudgetTemplate: ProjectBudgetLine[];
}

export interface NormalizedBudgetDraftEntry {
  targetId: number;
  draftPayload: ProjectBudgetLineUpdatePayload;
  conceptValue: string;
  numericId: number;
  hasExisting: boolean;
}

export interface PreparedBudgetMutationPayload {
  targetId: number;
  hasExisting: boolean;
  createPayload: ProjectBudgetLinePayload;
  payloadForUpdate: ProjectBudgetLineUpdatePayload;
}

export const validateBudgetTotalsBeforeSave = ({
  concept,
  hito1Budget,
  hito2Budget,
  approvedBudget,
  justifiedTotal,
  validateJustifiedTotal = false,
}: {
  concept: string;
  hito1Budget: number;
  hito2Budget: number;
  approvedBudget: number;
  justifiedTotal?: number;
  validateJustifiedTotal?: boolean;
}) => {
  if (hito1Budget + hito2Budget > approvedBudget) {
    throw new Error(
      `No se puede guardar "${concept}": la suma de los hitos supera el presupuesto aprobado.`,
    );
  }
  if (validateJustifiedTotal && (justifiedTotal ?? 0) > approvedBudget) {
    throw new Error(
      `No se puede guardar "${concept}": el justificado total supera el presupuesto aprobado.`,
    );
  }
};

export const resolveEffectiveBudgetTotalsForPatch = ({
  payloadForUpdate,
  baseExisting,
}: {
  payloadForUpdate: ProjectBudgetLineUpdatePayload;
  baseExisting: ProjectBudgetLine;
}) => {
  if (payloadForUpdate.milestones !== undefined) {
    const amounts = payloadForUpdate.milestones.map((m) =>
      safeNumber(m.amount ?? 0, 0),
    );
    const justifications = payloadForUpdate.milestones.map((m) =>
      safeNumber(m.justified ?? 0, 0),
    );
    return {
      hito1Budget: amounts[0] ?? 0,
      hito2Budget: amounts[1] ?? 0,
      approvedBudget:
        payloadForUpdate.approved_budget !== undefined
          ? safeNumber(payloadForUpdate.approved_budget, 0)
          : amounts.reduce((sum, value) => sum + value, 0),
      justifiedTotal: justifications.reduce((sum, value) => sum + value, 0),
      validateJustifiedTotal: true,
    };
  }
  return {
    hito1Budget:
      payloadForUpdate.hito1_budget !== undefined
        ? safeNumber(payloadForUpdate.hito1_budget, 0)
        : safeNumber(baseExisting.hito1_budget, 0),
    hito2Budget:
      payloadForUpdate.hito2_budget !== undefined
        ? safeNumber(payloadForUpdate.hito2_budget, 0)
        : safeNumber(baseExisting.hito2_budget, 0),
    approvedBudget:
      payloadForUpdate.approved_budget !== undefined
        ? safeNumber(payloadForUpdate.approved_budget, 0)
        : safeNumber(baseExisting.approved_budget, 0),
    justifiedTotal:
      (payloadForUpdate.justified_hito1 !== undefined
        ? safeNumber(payloadForUpdate.justified_hito1, 0)
        : safeNumber(baseExisting.justified_hito1, 0)) +
      (payloadForUpdate.justified_hito2 !== undefined
        ? safeNumber(payloadForUpdate.justified_hito2, 0)
        : safeNumber(baseExisting.justified_hito2, 0)),
    // El backend (_validate_budget_totals) no valida justified > approved en campos planos.
    // Esta validación frontend generaba falsos positivos para filas con coste personal
    // auto-calculado (justified puede superar approved legítimamente).
    validateJustifiedTotal: false,
  };
};

export const findBudgetByConcept = (
  budgets: ProjectBudgetLine[],
  conceptValue: string,
) => {
  const matchKey = getBudgetMatchKey(conceptValue);
  return budgets.find(
    (row) => getBudgetMatchKey((row.concept ?? "").trim()) === matchKey,
  );
};

const resolveBudgetBase = (
  sources: BudgetRowSources,
  numericId: number,
  targetId?: number,
) =>
  (targetId && targetId > 0
    ? sources.latestBudgets.find((row) => row.id === targetId)
    : undefined) ??
  sources.latestBudgets.find((row) => row.id === numericId) ??
  sources.mergedBudgetRows.find((row) => row.id === numericId) ??
  sources.groupedBudgetRows.find((row) => row.id === numericId) ??
  sources.defaultBudgetTemplate.find((row) => row.id === numericId);

export const prepareNormalizedBudgetDrafts = ({
  budgetDrafts,
  latestBudgets,
  mergedBudgetRows,
  groupedBudgetRows,
  defaultBudgetTemplate,
}: {
  budgetDrafts: Record<number, ProjectBudgetLineUpdatePayload>;
} & BudgetRowSources): NormalizedBudgetDraftEntry[] => {
  const sources: BudgetRowSources = {
    latestBudgets,
    mergedBudgetRows,
    groupedBudgetRows,
    defaultBudgetTemplate,
  };

  for (const [idStr] of Object.entries(budgetDrafts)) {
    const numericId = Number(idStr);
    const base = resolveBudgetBase(sources, numericId);
    if (!base) continue;
    if (!base.concept) {
      throw new Error("Concepto requerido en todas las filas.");
    }
  }

  return Object.entries(budgetDrafts).map(([id, draftPayload]) => {
    const numericId = Number(id);
    const conceptValue =
      (
        draftPayload.concept ??
        mergedBudgetRows.find((row) => row.id === numericId)?.concept ??
        ""
      )?.trim() ?? "";

    const existingById =
      numericId > 0 ? latestBudgets.find((row) => row.id === numericId) : undefined;
    const matchedByConcept =
      numericId > 0 && !existingById && conceptValue
        ? findBudgetByConcept(latestBudgets, conceptValue)
        : undefined;

    return {
      targetId: existingById?.id ?? matchedByConcept?.id ?? -1,
      draftPayload,
      conceptValue,
      numericId,
      hasExisting: Boolean(existingById || matchedByConcept),
    };
  });
};

export const prepareBudgetMutationPayload = ({
  entry,
  latestBudgets,
  mergedBudgetRows,
  groupedBudgetRows,
  defaultBudgetTemplate,
  budgetParentTotals,
}: {
  entry: NormalizedBudgetDraftEntry;
  budgetParentTotals: BudgetParentTotals;
} & BudgetRowSources): PreparedBudgetMutationPayload | null => {
  const base = resolveBudgetBase(
    {
      latestBudgets,
      mergedBudgetRows,
      groupedBudgetRows,
      defaultBudgetTemplate,
    },
    entry.numericId,
    entry.targetId,
  );

  if (!base || !entry.conceptValue) {
    return null;
  }

  const milestoneValues = deriveMilestoneValues(entry.draftPayload, base);
  const approved =
    !entry.hasExisting &&
    entry.numericId < 0 &&
    entry.draftPayload.approved_budget !== undefined &&
    safeNumber(entry.draftPayload.approved_budget, 0) === 0 &&
    milestoneValues.h1 + milestoneValues.h2 > 0
      ? milestoneValues.h1 + milestoneValues.h2
      : milestoneValues.approved;
  const baseKey = getBudgetParentKey(base.concept ?? "");
  const isParentRow = isAllCapsConcept(base.concept);
  const parentTotals = isParentRow ? budgetParentTotals.get(baseKey) : undefined;
  const j1 = parentTotals ? parentTotals.j1 : milestoneValues.j1;
  const j2 = parentTotals ? parentTotals.j2 : milestoneValues.j2;
  const forecast = safeNumber(
    entry.draftPayload.forecasted_spent ?? base.forecasted_spent ?? 0,
  );
  const percent =
    approved > 0 ? safeNumber(((forecast / approved) * 100).toFixed(2), 0) : 0;

  const createPayload: ProjectBudgetLinePayload = {
    concept: entry.conceptValue,
    hito1_budget: milestoneValues.h1,
    justified_hito1: j1,
    hito2_budget: milestoneValues.h2,
    justified_hito2: j2,
    approved_budget: approved,
    forecasted_spent: forecast,
    percent_spent: percent,
  };

  const payloadForUpdate: ProjectBudgetLineUpdatePayload = {};

  if (entry.draftPayload.concept !== undefined) {
    payloadForUpdate.concept = entry.draftPayload.concept ?? base.concept;
  }
  if (entry.draftPayload.forecasted_spent !== undefined) {
    payloadForUpdate.forecasted_spent = forecast;
    payloadForUpdate.percent_spent = percent;
  }
  if (entry.draftPayload.justified_hito1 !== undefined) {
    payloadForUpdate.justified_hito1 = j1;
  }
  if (entry.draftPayload.justified_hito2 !== undefined) {
    payloadForUpdate.justified_hito2 = j2;
  }

  const touchesClassicAmounts =
    entry.draftPayload.hito1_budget !== undefined ||
    entry.draftPayload.hito2_budget !== undefined;

  if (touchesClassicAmounts) {
    payloadForUpdate.hito1_budget = milestoneValues.h1;
    payloadForUpdate.hito2_budget = milestoneValues.h2;
    payloadForUpdate.approved_budget =
      entry.draftPayload.approved_budget !== undefined
        ? approved
        : Math.max(
            approved,
            safeNumber(base.approved_budget ?? 0),
            milestoneValues.h1 + milestoneValues.h2,
          );
  } else if (entry.draftPayload.approved_budget !== undefined) {
    payloadForUpdate.approved_budget = approved;
  }

  if (entry.draftPayload.milestones !== undefined) {
    // El modelo ProjectBudgetLine (SQLModel) no tiene campo `milestones`,
    // así que no se puede usar en PATCH. Se envían los campos planos derivados.
    payloadForUpdate.hito1_budget = milestoneValues.h1;
    payloadForUpdate.justified_hito1 = j1;
    payloadForUpdate.hito2_budget = milestoneValues.h2;
    payloadForUpdate.justified_hito2 = j2;
    payloadForUpdate.approved_budget = approved;
    payloadForUpdate.percent_spent = percent;
    // Validar justificado total contra el presupuesto derivado de los hitos
    validateBudgetTotalsBeforeSave({
      concept: entry.conceptValue,
      hito1Budget: milestoneValues.h1,
      hito2Budget: milestoneValues.h2,
      approvedBudget: approved,
      justifiedTotal: j1 + j2,
      validateJustifiedTotal: true,
    });
  }

  if (entry.hasExisting && entry.targetId > 0) {
    const effectiveTotals = resolveEffectiveBudgetTotalsForPatch({
      payloadForUpdate,
      baseExisting: base,
    });
    validateBudgetTotalsBeforeSave({
      concept: entry.conceptValue,
      ...effectiveTotals,
    });
  } else {
    validateBudgetTotalsBeforeSave({
      concept: entry.conceptValue,
      hito1Budget: safeNumber(createPayload.hito1_budget, 0),
      hito2Budget: safeNumber(createPayload.hito2_budget, 0),
      approvedBudget: safeNumber(createPayload.approved_budget, 0),
      justifiedTotal:
        safeNumber(createPayload.justified_hito1, 0) +
        safeNumber(createPayload.justified_hito2, 0),
      validateJustifiedTotal: true,
    });
  }

  return {
    targetId: entry.targetId,
    hasExisting: entry.hasExisting,
    createPayload,
    payloadForUpdate,
  };
};
