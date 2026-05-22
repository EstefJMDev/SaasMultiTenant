import type {
  ProjectBudgetLinePayload,
  ProjectBudgetLineUpdatePayload,
} from "@api/erpBudgets";

export type BudgetCompositePayload = Pick<
  ProjectBudgetLinePayload,
  | "concept"
  | "hito1_budget"
  | "hito2_budget"
  | "justified_hito1"
  | "justified_hito2"
  | "approved_budget"
  | "forecasted_spent"
>;

export interface DerivedMilestoneValues {
  hasMilestones: boolean;
  h1: number;
  h2: number;
  j1: number;
  j2: number;
  approved: number;
  milestones: NonNullable<ProjectBudgetLineUpdatePayload["milestones"]>;
}
