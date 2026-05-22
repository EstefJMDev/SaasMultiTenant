import type { ProjectBudgetLine, ProjectBudgetLinePayload } from "@api/erpBudgets";
import { getBudgetMatchKey } from "@shared/utils/erp";

import { safeNumber } from "./helpers";

export interface RetryPlanInput {
  refreshedBudgets: ProjectBudgetLine[];
  targetId: number;
  createPayload: ProjectBudgetLinePayload;
}

export interface RetryPlan {
  retryTargetId: number;
  alreadyExists: boolean;
}

export const buildBudget404RetryPlan = ({
  refreshedBudgets,
  targetId,
  createPayload,
}: RetryPlanInput): RetryPlan => {
  const refreshedById = refreshedBudgets.find((row) => row.id === targetId);
  const hasUniqueCompositeMatch =
    refreshedBudgets.filter((row) => {
      if (getBudgetMatchKey(row.concept ?? "") !== getBudgetMatchKey(createPayload.concept)) {
        return false;
      }
      return (
        safeNumber(row.hito1_budget) === safeNumber(createPayload.hito1_budget) &&
        safeNumber(row.justified_hito1) ===
          safeNumber(createPayload.justified_hito1) &&
        safeNumber(row.hito2_budget) === safeNumber(createPayload.hito2_budget) &&
        safeNumber(row.justified_hito2) ===
          safeNumber(createPayload.justified_hito2) &&
        safeNumber(row.approved_budget) === safeNumber(createPayload.approved_budget) &&
        safeNumber(row.forecasted_spent) ===
          safeNumber(createPayload.forecasted_spent)
      );
    }).length === 1;

  return {
    retryTargetId: refreshedById?.id ?? targetId,
    alreadyExists: Boolean(refreshedById) && hasUniqueCompositeMatch,
  };
};
