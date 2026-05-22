import { describe, expect, it } from "vitest";

import type {
  ProjectBudgetLine,
  ProjectBudgetLineUpdatePayload,
} from "@api/erpBudgets";
import { prepareNormalizedBudgetDrafts } from "@entities/projects/budget-editor/save-service";
import { getGroupedBudgetRows, getMergedBudgetRows } from "@entities/projects/budget-editor/calculations";
import { findBudgetByComposite } from "@entities/projects/budget-editor/helpers";
import { buildBudget404RetryPlan } from "@entities/projects/budget-editor/retry-helpers";
import { prepareBudgetMutationPayload } from "@entities/projects/budget-editor/save-service";
import { isBudgetUpdateNoop } from "@entities/projects/useBudgetEditor";

const createBudgetLine = (
  overrides: Partial<ProjectBudgetLine> = {},
): ProjectBudgetLine => ({
  id: 28,
  project_id: 1,
  concept: "COLABORACIONES EXTERNAS - Centros tecnologicos - CETIM",
  hito1_budget: 35815,
  justified_hito1: 26861,
  hito2_budget: 24185,
  justified_hito2: 0,
  approved_budget: 60000,
  percent_spent: 100,
  forecasted_spent: 60000,
  created_at: "2026-03-24T00:00:00.000Z",
  ...overrides,
});

describe("budget editor save flow", () => {
  it("builds a minimal PATCH payload when only forecast changes", () => {
    const base = createBudgetLine();
    const payload = prepareBudgetMutationPayload({
      entry: {
        targetId: base.id,
        numericId: base.id,
        hasExisting: true,
        conceptValue: base.concept,
        draftPayload: { forecasted_spent: 45000 },
      },
      latestBudgets: [base],
      mergedBudgetRows: [base],
      groupedBudgetRows: [base],
      defaultBudgetTemplate: [],
      budgetParentTotals: new Map(),
    });

    expect(payload).not.toBeNull();
    expect(payload?.payloadForUpdate).toEqual({
      forecasted_spent: 45000,
      percent_spent: 75,
    });
  });

  it("detects no-op PATCH payloads and skips redundant updates", () => {
    const base = createBudgetLine();
    const payloadForUpdate: ProjectBudgetLineUpdatePayload = {
      forecasted_spent: 60000,
      percent_spent: 100,
    };

    expect(isBudgetUpdateNoop(payloadForUpdate, base)).toBe(true);
  });

  it("can reconcile a 400 after refresh when the row is already persisted", () => {
    const persisted = createBudgetLine({ forecasted_spent: 45000, percent_spent: 75 });

    const matched = findBudgetByComposite([persisted], {
      concept: persisted.concept,
      hito1_budget: persisted.hito1_budget,
      justified_hito1: persisted.justified_hito1,
      hito2_budget: persisted.hito2_budget,
      justified_hito2: persisted.justified_hito2,
      approved_budget: persisted.approved_budget,
      forecasted_spent: persisted.forecasted_spent,
    });

    expect(matched?.id).toBe(persisted.id);
  });

  it("does not treat a percent-only difference as a no-op", () => {
    const base = createBudgetLine({ forecasted_spent: 45000, percent_spent: 74.99 });
    const payloadForUpdate: ProjectBudgetLineUpdatePayload = {
      forecasted_spent: 45000,
      percent_spent: 75,
    };

    expect(isBudgetUpdateNoop(payloadForUpdate, base)).toBe(false);
  });

  it("does not collapse null-like milestone values into persisted zeros", () => {
    const base = createBudgetLine({
      milestones: [{ id: 1, milestone_id: 10, amount: 0, justified: 0, created_at: "" }],
    });
    const payloadForUpdate: ProjectBudgetLineUpdatePayload = {
      milestones: [{ milestone_id: 10, amount: null, justified: 0 }],
    };

    expect(isBudgetUpdateNoop(payloadForUpdate, base)).toBe(false);
  });

  it("does not retry a 404 against another row with the same composite", () => {
    const targetId = 28;
    const duplicate = createBudgetLine({ id: 31 });

    const plan = buildBudget404RetryPlan({
      refreshedBudgets: [duplicate],
      targetId,
      createPayload: {
        concept: duplicate.concept,
        hito1_budget: duplicate.hito1_budget,
        justified_hito1: duplicate.justified_hito1,
        hito2_budget: duplicate.hito2_budget,
        justified_hito2: duplicate.justified_hito2,
        approved_budget: duplicate.approved_budget,
        forecasted_spent: duplicate.forecasted_spent,
        percent_spent: duplicate.percent_spent,
      },
    });

    expect(plan).toEqual({
      retryTargetId: targetId,
      alreadyExists: false,
    });
  });

  it("only marks 404 as already existing when the same target id is present", () => {
    const persisted = createBudgetLine({ id: 28 });

    const plan = buildBudget404RetryPlan({
      refreshedBudgets: [persisted],
      targetId: 28,
      createPayload: {
        concept: persisted.concept,
        hito1_budget: persisted.hito1_budget,
        justified_hito1: persisted.justified_hito1,
        hito2_budget: persisted.hito2_budget,
        justified_hito2: persisted.justified_hito2,
        approved_budget: persisted.approved_budget,
        forecasted_spent: persisted.forecasted_spent,
        percent_spent: persisted.percent_spent,
      },
    });

    expect(plan).toEqual({
      retryTargetId: 28,
      alreadyExists: true,
    });
  });

  it("does not hijack a temporary duplicate collaboration row into PATCHing an existing line", () => {
    const persisted = createBudgetLine({ id: 28 });
    const normalized = prepareNormalizedBudgetDrafts({
      budgetDrafts: {
        [-2000]: {
          concept: persisted.concept,
          hito1_budget: 35815,
          hito2_budget: 0,
          justified_hito1: 0,
          justified_hito2: 0,
          approved_budget: 0,
          forecasted_spent: 0,
          percent_spent: 0,
        },
      },
      latestBudgets: [persisted],
      mergedBudgetRows: [],
      groupedBudgetRows: [],
      defaultBudgetTemplate: [
        createBudgetLine({
          id: -2000,
          approved_budget: 0,
          hito1_budget: 0,
          hito2_budget: 0,
          justified_hito1: 0,
          justified_hito2: 0,
          forecasted_spent: 0,
          percent_spent: 0,
        }),
      ],
    });

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      numericId: -2000,
      targetId: -1,
      hasExisting: false,
    });
  });

  it("infers approved budget for a new row instead of preserving seeded zero", () => {
    const concept = "COLABORACIONES EXTERNAS - Centros tecnologicos - CETIM";
    const prepared = prepareBudgetMutationPayload({
      entry: {
        targetId: -1,
        numericId: -2000,
        hasExisting: false,
        conceptValue: concept,
        draftPayload: {
          concept,
          hito1_budget: 35815,
          hito2_budget: 0,
          justified_hito1: 0,
          justified_hito2: 0,
          approved_budget: 0,
          forecasted_spent: 0,
          percent_spent: 0,
        },
      },
      latestBudgets: [],
      mergedBudgetRows: [],
      groupedBudgetRows: [],
      defaultBudgetTemplate: [
        createBudgetLine({
          id: -2000,
          concept,
          approved_budget: 0,
          hito1_budget: 0,
          hito2_budget: 0,
          justified_hito1: 0,
          justified_hito2: 0,
          forecasted_spent: 0,
          percent_spent: 0,
        }),
      ],
      budgetParentTotals: new Map(),
    });

    expect(prepared?.createPayload).toMatchObject({
      concept,
      hito1_budget: 35815,
      hito2_budget: 0,
      approved_budget: 35815,
    });
  });

  it("keeps persisted rows on the normal PATCH path", () => {
    const persisted = createBudgetLine({ id: 28 });
    const normalized = prepareNormalizedBudgetDrafts({
      budgetDrafts: {
        [persisted.id]: {
          forecasted_spent: 45000,
        },
      },
      latestBudgets: [persisted],
      mergedBudgetRows: [persisted],
      groupedBudgetRows: [persisted],
      defaultBudgetTemplate: [],
    });

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      numericId: 28,
      targetId: 28,
      hasExisting: true,
    });
  });

  it("resolves the grouped CETIM row to persisted id 28 when duplicates exist", () => {
    const duplicateOlder = createBudgetLine({ id: 19 });
    const duplicateLowerApproved = createBudgetLine({
      id: 23,
      hito2_budget: 0,
      approved_budget: 35815,
    });
    const persisted = createBudgetLine({ id: 28 });

    const merged = getMergedBudgetRows({
      filteredBudgetRows: [duplicateOlder, duplicateLowerApproved, persisted],
      budgetDrafts: {},
      extraBudgetRows: [],
      hasRealBudgets: true,
    });
    const grouped = getGroupedBudgetRows({
      mergedBudgetRows: merged,
      defaultBudgetTemplate: [],
    });
    const cetim = grouped.find((row) => row.concept === persisted.concept);

    expect(cetim?.id).toBe(28);

    const normalized = prepareNormalizedBudgetDrafts({
      budgetDrafts: {
        28: { forecasted_spent: 45000 },
      },
      latestBudgets: [duplicateOlder, duplicateLowerApproved, persisted],
      mergedBudgetRows: merged,
      groupedBudgetRows: grouped,
      defaultBudgetTemplate: [],
    });

    expect(normalized[0]).toMatchObject({
      numericId: 28,
      targetId: 28,
      hasExisting: true,
    });
  });

  it("blocks invalid grouped CETIM edits before PATCH when milestones exceed approved", () => {
    const persisted = createBudgetLine({ id: 28 });

    expect(() =>
      prepareBudgetMutationPayload({
        entry: {
          targetId: 28,
          numericId: 28,
          hasExisting: true,
          conceptValue: persisted.concept,
          draftPayload: {
            hito1_budget: 35815,
            hito2_budget: 24185,
            approved_budget: 35815,
          },
        },
        latestBudgets: [persisted],
        mergedBudgetRows: [persisted],
        groupedBudgetRows: [persisted],
        defaultBudgetTemplate: [],
        budgetParentTotals: new Map(),
      }),
    ).toThrow(
      'No se puede guardar "COLABORACIONES EXTERNAS - Centros tecnologicos - CETIM": la suma de los hitos supera el presupuesto aprobado.',
    );
  });

  it("blocks PATCH when payload omits milestones but persisted CETIM totals are already invalid", () => {
    const persistedInvalid = createBudgetLine({
      id: 28,
      hito1_budget: 35815,
      hito2_budget: 24185,
      approved_budget: 35815,
    });

    expect(() =>
      prepareBudgetMutationPayload({
        entry: {
          targetId: 28,
          numericId: 28,
          hasExisting: true,
          conceptValue: persistedInvalid.concept,
          draftPayload: {
            forecasted_spent: 45000,
          },
        },
        latestBudgets: [persistedInvalid],
        mergedBudgetRows: [persistedInvalid],
        groupedBudgetRows: [persistedInvalid],
        defaultBudgetTemplate: [],
        budgetParentTotals: new Map(),
      }),
    ).toThrow(
      'No se puede guardar "COLABORACIONES EXTERNAS - Centros tecnologicos - CETIM": la suma de los hitos supera el presupuesto aprobado.',
    );
  });

  it("blocks PATCH milestones when justified total exceeds approved", () => {
    const persisted = createBudgetLine({ id: 28 });

    expect(() =>
      prepareBudgetMutationPayload({
        entry: {
          targetId: 28,
          numericId: 28,
          hasExisting: true,
          conceptValue: persisted.concept,
          draftPayload: {
            milestones: [
              { milestone_id: 1, amount: 0, justified: 30000 },
              { milestone_id: 5, amount: 0, justified: 0 },
            ],
          },
        },
        latestBudgets: [persisted],
        mergedBudgetRows: [persisted],
        groupedBudgetRows: [persisted],
        defaultBudgetTemplate: [],
        budgetParentTotals: new Map(),
      }),
    ).toThrow(
      'No se puede guardar "COLABORACIONES EXTERNAS - Centros tecnologicos - CETIM": el justificado total supera el presupuesto aprobado.',
    );
  });

  it("does not send milestones in PATCH payload even when draft edits milestones", () => {
    const persisted = createBudgetLine({ id: 19 });
    const prepared = prepareBudgetMutationPayload({
      entry: {
        targetId: 19,
        numericId: 19,
        hasExisting: true,
        conceptValue: persisted.concept,
        draftPayload: {
          milestones: [{ milestone_id: 1, amount: 35544, justified: 26861 }],
        },
      },
      latestBudgets: [persisted],
      mergedBudgetRows: [persisted],
      groupedBudgetRows: [persisted],
      defaultBudgetTemplate: [],
      budgetParentTotals: new Map(),
    });

    expect(prepared).not.toBeNull();
    expect(prepared?.payloadForUpdate.milestones).toBeUndefined();
    expect(prepared?.payloadForUpdate).toMatchObject({
      hito1_budget: 35544,
      justified_hito1: 26861,
      hito2_budget: 0,
      justified_hito2: 0,
      approved_budget: 35544,
      percent_spent: 168.8,
    });
  });
});
