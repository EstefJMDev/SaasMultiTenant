import type { ProjectBudgetLine } from "@api/erpBudgets";
import { CATEGORY_COLOR_MAP } from "./constants";
import {
  getBudgetGroupKey,
  getBudgetSortRank,
  isAllCapsConcept,
  isGeneralExpensesConcept,
  normalizeConceptKey,
} from "./budgetNormalization";

export const calculateBudgetTotals = (
  rows: ProjectBudgetLine[],
  parentMap: Record<string, string[]>,
) => {
  const totalsByMilestone: Record<number, { amount: number; justified: number }> = {
    1: { amount: 0, justified: 0 },
    2: { amount: 0, justified: 0 },
  };
  let approved = 0;
  let forecasted = 0;
  const parentKeys = new Set(Object.keys(parentMap));
  const parentTotals = calculateParentTotals(rows, parentMap);
  const parentAmountTotals = new Map<string, { h1: number; h2: number; forecast: number }>();

  Object.entries(parentMap).forEach(([parentKey, children]) => {
    let h1 = 0;
    let h2 = 0;
    let forecast = 0;
    rows.forEach((row) => {
      const rowKey = normalizeConceptKey(row.concept);
      if (!children.includes(rowKey)) return;
      h1 += Number(row.hito1_budget ?? 0);
      h2 += Number(row.hito2_budget ?? 0);
      forecast += Number(row.forecasted_spent ?? 0);
    });
    parentAmountTotals.set(parentKey, { h1, h2, forecast });
  });

  rows.forEach((row) => {
    const rowKey = normalizeConceptKey(row.concept);
    const isParentRow = isAllCapsConcept(row.concept) && parentKeys.has(rowKey);
    const isGeneralExpenses = isGeneralExpensesConcept(row.concept);
    if (!isParentRow && !isGeneralExpenses) {
      return;
    }
    const parentAmounts = parentAmountTotals.get(rowKey);
    const useParentAmounts = isParentRow && parentAmounts && !isGeneralExpenses;
    const h1 = useParentAmounts ? parentAmounts.h1 : Number(row.hito1_budget ?? 0);
    const h2 = useParentAmounts ? parentAmounts.h2 : Number(row.hito2_budget ?? 0);
    const parentJustified = parentTotals.get(rowKey);
    // Para GASTOS GENERALES queremos usar siempre los valores
    // introducidos en la propia fila (no los agregados de hijas).
    const useParentTotals = parentJustified && !isGeneralExpenses;
    const j1 = useParentTotals ? parentJustified.j1 : Number(row.justified_hito1 ?? 0);
    const j2 = useParentTotals ? parentJustified.j2 : Number(row.justified_hito2 ?? 0);
    const rowForecast = useParentAmounts
      ? parentAmounts.forecast
      : Number(row.forecasted_spent ?? 0);
    approved += h1 + h2;
    forecasted += rowForecast;
    totalsByMilestone[1].amount += h1;
    totalsByMilestone[2].amount += h2;
    totalsByMilestone[1].justified += j1;
    totalsByMilestone[2].justified += j2;
  });
  const hito1 = totalsByMilestone[1].amount;
  const hito2 = totalsByMilestone[2].amount;
  const justificados: number[] = [
    totalsByMilestone[1].justified,
    totalsByMilestone[2].justified,
  ];
  const gasto = forecasted;
  return {
    totalsByMilestone,
    approved,
    forecasted,
    hito1,
    hito2,
    justificados,
    gasto,
  };
};

export const calculateParentTotals = (
  rows: ProjectBudgetLine[],
  parentMap: Record<string, string[]>,
) => {
  const totals = new Map<string, { j1: number; j2: number }>();
  Object.entries(parentMap).forEach(([parentKey, children]) => {
    let j1 = 0;
    let j2 = 0;
    rows.forEach((row) => {
      const rowKey = normalizeConceptKey(row.concept);
      if (!children.includes(rowKey)) return;
      j1 += Number(row.justified_hito1 ?? 0);
      j2 += Number(row.justified_hito2 ?? 0);
    });
    totals.set(parentKey, { j1, j2 });
  });
  return totals;
};

export const groupBudgetsByConcept = (rows: ProjectBudgetLine[]) => {
  const map = new Map<string, ProjectBudgetLine>();
  rows.forEach((row) => {
    const key = getBudgetGroupKey(row.concept || `row-${row.id}`);
    const current = map.get(key);
    if (!current) {
      // Primera aparición de este concepto: usamos la línea tal cual.
      map.set(key, { ...row });
      return;
    }
    // Si ya existe una línea para este concepto, elegimos la "mejor" sin sumar:
    // - Preferimos la que tenga mayor presupuesto aprobado (la más reciente
    //   o la que refleja el valor final que el usuario ha fijado).
    const currentApproved = Number(current.approved_budget ?? 0);
    const newApproved = Number(row.approved_budget ?? 0);
    if (newApproved >= currentApproved) {
      map.set(key, { ...row });
    }
  });
  const ordered = Array.from(map.values());
  ordered.sort((a, b) => {
    const aRank = getBudgetSortRank(a.concept);
    const bRank = getBudgetSortRank(b.concept);
    if (aRank !== bRank) return aRank - bRank;
    const aKey = normalizeConceptKey(a.concept);
    const bKey = normalizeConceptKey(b.concept);
    return aKey.localeCompare(bKey);
  });
  return ordered;
};

export const getBudgetRowColor = (conceptKey: string) =>
  CATEGORY_COLOR_MAP[conceptKey] ?? undefined;
