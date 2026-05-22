import type {
  ProjectBudgetLine,
  ProjectBudgetLineUpdatePayload,
} from "@api/erpBudgets";
import {
  EXTERNAL_COLLAB_LABEL,
  buildParentChildMap,
  getBudgetGroupKey,
  groupBudgetsByConcept,
  isAllCapsConcept,
  isExternalCollaborationConcept,
  isGeneralExpensesConcept,
  normalizeConceptKey,
  parseExternalCollaborationDetails,
} from "@shared/utils/erp";

import { isSummaryRow } from "./helpers";

export const getFilteredBudgetRows = (displayBudgetRows: ProjectBudgetLine[]) =>
  displayBudgetRows.filter((row) => {
    const concept = row.concept ?? "";
    if (isSummaryRow(concept)) return false;
    return true;
  });

export const getMergedBudgetRows = ({
  filteredBudgetRows,
  budgetDrafts,
  extraBudgetRows,
  hasRealBudgets,
}: {
  filteredBudgetRows: ProjectBudgetLine[];
  budgetDrafts: Record<number, ProjectBudgetLineUpdatePayload>;
  extraBudgetRows: ProjectBudgetLine[];
  hasRealBudgets: boolean;
}) => {
  const allRows = hasRealBudgets
    ? [...filteredBudgetRows, ...extraBudgetRows]
    : filteredBudgetRows;

  return allRows.map((row) => {
    const draft = budgetDrafts[row.id];
    const h1 = draft?.hito1_budget ?? Number(row.hito1_budget ?? 0);
    const h2 = draft?.hito2_budget ?? Number(row.hito2_budget ?? 0);
    const approved_budget =
      draft?.approved_budget ?? Number(row.approved_budget ?? h1 + h2);
    const justified_hito1 =
      draft?.justified_hito1 ?? Number(row.justified_hito1 ?? 0);
    const justified_hito2 =
      draft?.justified_hito2 ?? Number(row.justified_hito2 ?? 0);
    const forecasted_spent =
      draft?.forecasted_spent ?? Number(row.forecasted_spent ?? 0);
    const percent_spent =
      approved_budget > 0
        ? Number(((forecasted_spent / approved_budget) * 100).toFixed(2))
        : 0;

    return {
      ...row,
      ...draft,
      hito1_budget: h1,
      hito2_budget: h2,
      approved_budget,
      justified_hito1,
      justified_hito2,
      forecasted_spent,
      percent_spent,
      milestones: draft?.milestones ?? row.milestones,
    } as ProjectBudgetLine;
  });
};

export const getGroupedBudgetRows = ({
  mergedBudgetRows,
  defaultBudgetTemplate,
}: {
  mergedBudgetRows: ProjectBudgetLine[];
  defaultBudgetTemplate: ProjectBudgetLine[];
}) => {
  const baseRows = mergedBudgetRows.filter((row) => !isSummaryRow(row.concept));

  defaultBudgetTemplate.forEach((templateRow) => {
    if (isSummaryRow(templateRow.concept)) return;
    const templateKey = getBudgetGroupKey(templateRow.concept);
    if (!baseRows.some((row) => getBudgetGroupKey(row.concept) === templateKey)) {
      baseRows.push(templateRow);
    }
  });

  const hasGeneralExpenses = baseRows.some((row) =>
    isGeneralExpensesConcept(row.concept),
  );
  if (!hasGeneralExpenses) {
    const generalRow = defaultBudgetTemplate.find((row) =>
      isGeneralExpensesConcept(row.concept),
    );
    if (generalRow) baseRows.push(generalRow);
  }

  const hasExternalParent = baseRows.some(
    (row) =>
      isExternalCollaborationConcept(row.concept) &&
      isAllCapsConcept(row.concept),
  );
  if (!hasExternalParent) {
    const externalParent = defaultBudgetTemplate.find(
      (row) =>
        isExternalCollaborationConcept(row.concept) &&
        isAllCapsConcept(row.concept),
    );
    if (externalParent) baseRows.push(externalParent);
  }

  return groupBudgetsByConcept(baseRows);
};

export const getBudgetParentMap = (
  defaultBudgetTemplate: ProjectBudgetLine[],
  mergedBudgetRows: ProjectBudgetLine[],
) => {
  const base = buildParentChildMap(defaultBudgetTemplate);
  const parentKey = normalizeConceptKey(EXTERNAL_COLLAB_LABEL);
  const externalChildren = base[parentKey] ?? [];

  const extras = mergedBudgetRows
    .map((row) => ({
      concept: row.concept ?? "",
      details: parseExternalCollaborationDetails(row.concept ?? ""),
    }))
    .filter((row) => row.details);

  extras.forEach((row) => {
    const childKey = normalizeConceptKey(row.concept);
    if (!externalChildren.includes(childKey)) {
      externalChildren.push(childKey);
    }
  });

  base[parentKey] = externalChildren;
  return base;
};

export const getGeneralExpensesBaseTotals = (
  mergedBudgetRows: ProjectBudgetLine[],
  budgetParentMap: Record<string, string[]>,
) => {
  const personalKey = normalizeConceptKey("PERSONAL");
  const personalRow = mergedBudgetRows.find(
    (row) => normalizeConceptKey(row.concept) === personalKey,
  );
  if (personalRow) {
    return {
      h1: Number(personalRow.hito1_budget ?? 0),
      h2: Number(personalRow.hito2_budget ?? 0),
    };
  }

  const totalKey = normalizeConceptKey("Total");
  const diffKey = normalizeConceptKey("Diferencia");
  let h1 = 0;
  let h2 = 0;

  mergedBudgetRows.forEach((row) => {
    const key = getBudgetGroupKey(row.concept);
    if (!key || key === totalKey || key === diffKey) return;
    if (isGeneralExpensesConcept(row.concept)) return;
    const isParentRow = budgetParentMap[key] !== undefined;
    const hasChildren = (budgetParentMap[key] ?? []).length > 0;
    if (isParentRow && hasChildren) return;
    h1 += Number(row.hito1_budget ?? 0);
    h2 += Number(row.hito2_budget ?? 0);
  });

  return { h1, h2 };
};
