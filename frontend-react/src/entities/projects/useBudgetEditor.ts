import { useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@chakra-ui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { ErpMilestone } from "@api/erpStructure";
import { fetchErpProject } from "@api/erpReports";
import { fetchEmployeeAllocations, fetchEmployees } from "@api/hr";
import {
  createProjectBudgetLine,
  fetchProjectBudgets,
  updateProjectBudgetLine,
  type ProjectBudgetLine,
  type ProjectBudgetLinePayload,
  type ProjectBudgetLineUpdatePayload,
} from "@api/erpBudgets";
import {
  DEFAULT_BUDGET_PAYLOAD,
  EXTERNAL_COLLAB_LABEL,
  GENERAL_EXPENSES_AMOUNT_LABEL,
  buildParentChildMap,
  calculateBudgetTotals,
  calculateParentTotals,
  formatExternalCollaborationConcept,
  formatGeneralExpensesConcept,
  getBudgetGroupKey,
  getBudgetMatchKey,
  getBudgetParentKey,
  getDefaultBudgetTemplate,
  groupBudgetsByConcept,
  isAllCapsConcept,
  isExternalCollaborationConcept,
  isGeneralExpensesConcept,
  normalizeConceptKey,
  parseExternalCollaborationDetails,
} from "@shared/utils/erp";
import { useExternalCollaborations } from "@hooks/useExternalCollaborations";
import { useBudgetData } from "./useBudgetData";
import { projectKeys } from "./keys";

type UseBudgetEditorArgs = {
  projectId: number | null;
  projectMilestones: ErpMilestone[];
};

const toFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isBudgetUpdateNoop = (
  payloadForUpdate: ProjectBudgetLineUpdatePayload,
  base: ProjectBudgetLine,
): boolean => {
  const payloadEntries = Object.entries(payloadForUpdate) as Array<
    [keyof ProjectBudgetLineUpdatePayload, unknown]
  >;

  for (const [key, payloadValue] of payloadEntries) {
    if (payloadValue === undefined) continue;

    if (key === "milestones") {
      const payloadMilestones = Array.isArray(payloadValue) ? payloadValue : [];
      const baseMilestones = Array.isArray(base.milestones) ? base.milestones : [];
      if (payloadMilestones.length !== baseMilestones.length) return false;

      for (const payloadMilestone of payloadMilestones) {
        const baseMilestone = baseMilestones.find(
          (item) => item.milestone_id === payloadMilestone.milestone_id,
        );
        if (!baseMilestone) return false;

        if (payloadMilestone.amount === null || payloadMilestone.justified === null) {
          return false;
        }

        const payloadAmount = toFiniteNumber(payloadMilestone.amount);
        const baseAmount = toFiniteNumber(baseMilestone.amount);
        if (payloadAmount !== baseAmount) return false;

        const payloadJustified = toFiniteNumber(payloadMilestone.justified);
        const baseJustified = toFiniteNumber(baseMilestone.justified);
        if (payloadJustified !== baseJustified) return false;
      }
      continue;
    }

    const baseValue = base[key as keyof ProjectBudgetLine];
    const payloadNumeric = toFiniteNumber(payloadValue);
    const baseNumeric = toFiniteNumber(baseValue);
    if (payloadNumeric !== null || baseNumeric !== null) {
      if (payloadNumeric !== baseNumeric) return false;
      continue;
    }

    if (payloadValue !== baseValue) return false;
  }

  return true;
};

export const useBudgetEditor = ({
  projectId,
  projectMilestones,
  tenantId,
}: UseBudgetEditorArgs & { tenantId?: number }) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const projectsBaseKey = tenantId
    ? projectKeys.base(tenantId)
    : (["projects"] as const);

  const {
    budgetsQuery,
    budgetMilestonesQuery,
    createBudgetMutation,
    updateBudgetMutation,
    deleteBudgetMutation,
    createBudgetMilestoneMutation,
    deleteBudgetMilestoneMutation,
    updateBudgetMilestoneMutation,
  } = useBudgetData(projectId, tenantId);

  const budgetRows = budgetsQuery.data ?? [];
  const budgetMilestones = budgetMilestonesQuery.data ?? [];
  const hasRealBudgets = budgetRows.length > 0;

  const [budgetsEditMode, setBudgetsEditMode] = useState(false);
  const [budgetDrafts, setBudgetDrafts] = useState<
    Record<number, ProjectBudgetLineUpdatePayload>
  >({});
  const [generalExpensesMode, setGeneralExpensesMode] = useState<
    Record<number, "percent" | "amount">
  >({});
  const [savingBudgets, setSavingBudgets] = useState(false);
  const [seedingTemplate, setSeedingTemplate] = useState(false);
  const syncingBudgetMilestonesRef = useRef(false);
  const resolvedTenantIdRef = useRef<number | undefined>(undefined);

  const externalCollaborationsQuery = useExternalCollaborations(tenantId);
  const [extraBudgetRows, setExtraBudgetRows] = useState<ProjectBudgetLine[]>(
    [],
  );
  const [externalCollabSelections, setExternalCollabSelections] = useState<
    Record<number, string>
  >({});
  const tempBudgetIdRef = useRef(-2000);

  const defaultBudgetTemplate = useMemo(() => getDefaultBudgetTemplate(), []);
  const currentYear = new Date().getFullYear();

  const normalizeMilestoneKey = (value?: string | null) =>
    (value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, "");
  const unassignedMilestoneKey = "__unassigned__";

  const resolveWriteTenantId = async () => {
    if (tenantId) return tenantId;
    if (resolvedTenantIdRef.current) return resolvedTenantIdRef.current;
    if (!projectId) return undefined;
    try {
      const project = await fetchErpProject(projectId);
      const resolved = project?.tenant_id ?? undefined;
      resolvedTenantIdRef.current = resolved;
      return resolved;
    } catch {
      return undefined;
    }
  };

  const displayBudgetRows = hasRealBudgets ? budgetRows : defaultBudgetTemplate;

  const employeesQuery = useQuery({
    queryKey: ["hr", "employees", tenantId ?? "all"],
    queryFn: () => fetchEmployees(tenantId, null),
    enabled: projectId !== null,
  });

  const employeeAllocationsQuery = useQuery({
    queryKey: ["hr", "allocations", tenantId ?? "all", projectId ?? "none"],
    queryFn: () =>
      fetchEmployeeAllocations({
        tenantId,
        projectId: projectId ?? undefined,
      }),
    enabled: projectId !== null,
  });

  const employeeProfileById = useMemo(() => {
    const map = new Map<number, Awaited<ReturnType<typeof fetchEmployees>>[number]>();
    (employeesQuery.data ?? []).forEach((employee) => {
      map.set(employee.id, employee);
    });
    return map;
  }, [employeesQuery.data]);

  const personnelYears = useMemo(() => {
    const yearSet = new Set<number>();
    (employeeAllocationsQuery.data ?? []).forEach((allocation) => {
      if (allocation.project_id !== projectId) return;
      if (typeof allocation.year === "number") yearSet.add(allocation.year);
    });
    if (yearSet.size === 0) yearSet.add(currentYear);
    return Array.from(yearSet).sort((a, b) => a - b);
  }, [currentYear, employeeAllocationsQuery.data, projectId]);

  const personnelRows = useMemo(() => {
    const rowMap = new Map<
      number,
      {
        employeeId: number;
        firstName: string;
        lastName: string;
        hourlyRate: number;
        byYear: Record<number, { hours: number; amount: number; hourlyRate: number }>;
        totalHours: number;
        totalAmount: number;
      }
    >();

    (employeeAllocationsQuery.data ?? []).forEach((allocation) => {
      if (allocation.project_id !== projectId) return;
      if (allocation.employee_id == null) return;
      if (allocation.allocated_hours == null) return;
      const hours = Number(allocation.allocated_hours);
      if (!Number.isFinite(hours) || hours <= 0) return;

      const employee = employeeProfileById.get(allocation.employee_id);
      const fullName =
        employee?.full_name?.trim() ||
        [employee?.first_name, employee?.last_name].filter(Boolean).join(" ").trim() ||
        `Empleado ${allocation.employee_id}`;
      const firstName =
        employee?.first_name?.trim() ||
        fullName.split(" ").filter(Boolean)[0] ||
        "Empleado";
      const derivedLastName = fullName
        .split(" ")
        .filter(Boolean)
        .slice(1)
        .join(" ")
        .trim();
      const lastName = employee?.last_name?.trim() || derivedLastName || "-";
      const hourlyRate =
        employee?.hourly_rate != null && Number.isFinite(Number(employee.hourly_rate))
          ? Number(employee.hourly_rate)
          : 0;
      const year =
        typeof allocation.year === "number" && Number.isFinite(allocation.year)
          ? allocation.year
          : currentYear;
      const amount = Number((hours * hourlyRate).toFixed(2));

      const row = rowMap.get(allocation.employee_id) ?? {
        employeeId: allocation.employee_id,
        firstName,
        lastName,
        hourlyRate,
        byYear: {},
        totalHours: 0,
        totalAmount: 0,
      };

      const existingYear = row.byYear[year] ?? { hours: 0, amount: 0, hourlyRate };
      row.byYear[year] = {
        hours: existingYear.hours + hours,
        amount: Number((existingYear.amount + amount).toFixed(2)),
        hourlyRate,
      };
      row.totalHours += hours;
      row.totalAmount = Number((row.totalAmount + amount).toFixed(2));
      rowMap.set(allocation.employee_id, row);
    });

    return Array.from(rowMap.values()).sort((a, b) => {
      const lastCmp = a.lastName.localeCompare(b.lastName, "es");
      if (lastCmp !== 0) return lastCmp;
      return a.firstName.localeCompare(b.firstName, "es");
    });
  }, [currentYear, employeeAllocationsQuery.data, employeeProfileById, projectId]);

  const personalJustifiedByConceptAndMilestoneKey = useMemo(() => {
    const personalKey = normalizeConceptKey("PERSONAL");
    const milestoneMap: Record<string, number> = {};
    (employeeAllocationsQuery.data ?? []).forEach((allocation) => {
      if (allocation.project_id !== projectId) return;
      if (allocation.allocated_hours == null || allocation.employee_id == null) return;
      const hours = Number(allocation.allocated_hours);
      if (!Number.isFinite(hours) || hours <= 0) return;
      const employee = employeeProfileById.get(allocation.employee_id);
      const hourlyRate =
        employee?.hourly_rate != null && Number.isFinite(Number(employee.hourly_rate))
          ? Number(employee.hourly_rate)
          : 0;
      const amount = Number((hours * hourlyRate).toFixed(2));
      const milestoneKey =
        normalizeMilestoneKey(allocation.milestone) || unassignedMilestoneKey;
      milestoneMap[milestoneKey] = Number(
        ((milestoneMap[milestoneKey] ?? 0) + amount).toFixed(2),
      );
    });

    return {
      [personalKey]: milestoneMap,
    };
  }, [employeeAllocationsQuery.data, employeeProfileById, projectId]);

  const isSummaryRow = (concept?: string) => {
    const key = normalizeConceptKey(concept ?? "");
    return (
      key === normalizeConceptKey("Total") ||
      key === normalizeConceptKey("Diferencia por justificar")
    );
  };

  const filteredBudgetRows = useMemo(
    () =>
      displayBudgetRows.filter((row) => {
        const concept = row.concept ?? "";
        if (isSummaryRow(concept)) return false;
        // Solo ocultamos filas de resumen (Total / Diferencia).
        // Las colaboraciones externas (incluyendo CETIM) deben mostrarse siempre.
        return true;
      }),
    [displayBudgetRows],
  );

  const mergedBudgetRows = useMemo(() => {
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
  }, [filteredBudgetRows, budgetDrafts, extraBudgetRows, hasRealBudgets]);

  const groupedBudgetRows = useMemo(() => {
    const baseRows = mergedBudgetRows.filter((row) => !isSummaryRow(row.concept));
    defaultBudgetTemplate.forEach((tpl) => {
      if (isSummaryRow(tpl.concept)) return;
      const tplKey = getBudgetGroupKey(tpl.concept);
      if (!baseRows.some((r) => getBudgetGroupKey(r.concept) === tplKey)) {
        baseRows.push(tpl);
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
  }, [mergedBudgetRows, defaultBudgetTemplate]);

  const budgetParentMap = useMemo(() => {
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
  }, [defaultBudgetTemplate, mergedBudgetRows]);

  const budgetParentTotals = useMemo(() => {
    // Usamos las filas agrupadas (visibles) para que los totales
    // de las filas padre coincidan con lo que ve el usuario en la tabla.
    return calculateParentTotals(groupedBudgetRows, budgetParentMap);
  }, [groupedBudgetRows, budgetParentMap]);

  const generalExpensesBaseTotals = useMemo(() => {
    // En tu Excel, GASTOS GENERALES (19%) se calcula sobre PERSONAL.
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

    // Fallback anterior si no existe PERSONAL.
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
  }, [mergedBudgetRows, budgetParentMap]);

  const canEditBudgets = groupedBudgetRows.length > 0;

  const budgetsTabTotals = useMemo(() => {
    return calculateBudgetTotals(groupedBudgetRows, budgetParentMap);
  }, [groupedBudgetRows, budgetParentMap]);

  const budgetsDiffH1 =
    Number(budgetsTabTotals.hito1 || 0) -
    Number(budgetsTabTotals.justificados?.[0] || 0);
  const budgetsDiffH2 =
    Number(budgetsTabTotals.hito2 || 0) -
    Number(budgetsTabTotals.justificados?.[1] || 0);

  useEffect(() => {
    if (!budgetsEditMode) {
      setBudgetDrafts({});
      setExtraBudgetRows([]);
    }
  }, [budgetsEditMode]);

  const seedTemplateBudgetLines = async () => {
    if (!projectId || hasRealBudgets || seedingTemplate) return;
    setSeedingTemplate(true);
    try {
      let currentMilestones = budgetMilestones;
      if (!currentMilestones || currentMilestones.length === 0) {
        const m1 = await createBudgetMilestoneMutation.mutateAsync({
          name: "HITO 1",
          order_index: 1,
        });
        const m2 = await createBudgetMilestoneMutation.mutateAsync({
          name: "HITO 2",
          order_index: 2,
        });
        currentMilestones = [m1, m2];
      }

      for (const row of defaultBudgetTemplate) {
        await createBudgetMutation.mutateAsync({
          concept: row.concept,
          hito1_budget: row.hito1_budget ?? 0,
          justified_hito1: row.justified_hito1 ?? 0,
          hito2_budget: row.hito2_budget ?? 0,
          justified_hito2: row.justified_hito2 ?? 0,
          approved_budget: (row.hito1_budget ?? 0) + (row.hito2_budget ?? 0),
          percent_spent: 0,
          forecasted_spent: 0,
        });
      }
      await queryClient.invalidateQueries({
        queryKey: projectsBaseKey,
      });
      await queryClient.invalidateQueries({
        queryKey: projectsBaseKey,
      });
      toast({ title: "Plantilla creada en el proyecto", status: "success" });
    } catch (err: any) {
      toast({
        title: "No se pudo crear la plantilla",
        description: err?.response?.data?.detail ?? "Revisa el backend.",
        status: "error",
      });
    } finally {
      setSeedingTemplate(false);
    }
  };

  useEffect(() => {
    const syncBudgetMilestones = async () => {
      if (
        !projectId ||
        syncingBudgetMilestonesRef.current ||
        budgetMilestonesQuery.isFetching
      ) {
        return;
      }
      if (projectMilestones.length === 0) return;
      syncingBudgetMilestonesRef.current = true;
      try {
        const orderedProjectMilestones = [...projectMilestones].sort((a, b) => {
          if (a.due_date && b.due_date) {
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
          }
          return (a.id ?? 0) - (b.id ?? 0);
        });
        const budgetByOrder = new Map(
          budgetMilestones.map((m) => [m.order_index, m]),
        );

        for (let idx = 0; idx < orderedProjectMilestones.length; idx += 1) {
          const projectMilestone = orderedProjectMilestones[idx];
          const orderIndex = idx + 1;
          const desiredName = projectMilestone.title || `Hito ${orderIndex}`;
          const existing = budgetByOrder.get(orderIndex);
          if (!existing) {
            await createBudgetMilestoneMutation.mutateAsync({
              name: desiredName,
              order_index: orderIndex,
            });
            continue;
          }
          const normalizedExisting = (existing.name || "").trim();
          const normalizedDesired = desiredName.trim();
          if (normalizedExisting !== normalizedDesired) {
            await updateBudgetMilestoneMutation.mutateAsync({
              milestoneId: existing.id,
              payload: { name: desiredName, order_index: orderIndex },
            });
          } else if (existing.order_index !== orderIndex) {
            await updateBudgetMilestoneMutation.mutateAsync({
              milestoneId: existing.id,
              payload: { order_index: orderIndex },
            });
          }
        }

        await queryClient.invalidateQueries({
          queryKey: projectsBaseKey,
        });
      } catch (err: any) {
        toast({
          title: "Error al sincronizar hitos",
          description:
            err?.response?.data?.detail ??
            "No se pudieron sincronizar los hitos del proyecto.",
          status: "error",
        });
      } finally {
        syncingBudgetMilestonesRef.current = false;
      }
    };
    syncBudgetMilestones();
  }, [
    projectId,
    projectMilestones,
    budgetMilestones,
    budgetMilestonesQuery.isFetching,
    createBudgetMilestoneMutation,
    updateBudgetMilestoneMutation,
    deleteBudgetMilestoneMutation,
    queryClient,
    toast,
  ]);

  const handleGeneralExpensesPercent = (budgetId: number, rawValue: string) => {
    if (!projectId) return;
    const normalized = rawValue.trim().replace(/\./g, "").replace(",", ".");
    const numericValue = Number(normalized);
    if (!Number.isFinite(numericValue)) return;
    const percent = Math.max(0, numericValue);
    const h1 = Number(
      ((generalExpensesBaseTotals.h1 * percent) / 100).toFixed(2),
    );
    const h2 = Number(
      ((generalExpensesBaseTotals.h2 * percent) / 100).toFixed(2),
    );
    setBudgetDrafts((prev) => ({
      ...prev,
      [budgetId]: {
        ...(prev[budgetId] ?? {}),
        concept: formatGeneralExpensesConcept(percent),
        hito1_budget: h1,
        hito2_budget: h2,
        approved_budget: h1 + h2,
      },
    }));
  };

  const handleGeneralExpensesAmount = (budgetId: number, rawValue: string) => {
    if (!projectId) return;
    const normalized = rawValue.trim().replace(/\./g, "").replace(",", ".");
    const numericValue = Number(normalized);
    if (!Number.isFinite(numericValue)) return;
    const amount = Math.max(0, numericValue);
    const totalBase = generalExpensesBaseTotals.h1 + generalExpensesBaseTotals.h2;
    let h1 = 0;
    let h2 = 0;
    if (totalBase > 0) {
      h1 = Number(((amount * generalExpensesBaseTotals.h1) / totalBase).toFixed(2));
      h2 = Number(((amount * generalExpensesBaseTotals.h2) / totalBase).toFixed(2));
    } else {
      h1 = Number(amount.toFixed(2));
      h2 = 0;
    }
    setBudgetDrafts((prev) => ({
      ...prev,
      [budgetId]: {
        ...(prev[budgetId] ?? {}),
        concept: GENERAL_EXPENSES_AMOUNT_LABEL,
        hito1_budget: h1,
        hito2_budget: h2,
        approved_budget: h1 + h2,
      },
    }));
  };

  const handleAddExternalCollaborationRow = (budgetId: number) => {
    if (!projectId) return;
    const selection = (externalCollabSelections[budgetId] ?? "").trim();
    if (!selection) return;
    const [type, name] = selection.split("::");
    if (!type || !name) return;
    const tempId = tempBudgetIdRef.current;
    tempBudgetIdRef.current -= 1;
    const concept = formatExternalCollaborationConcept(type.trim(), name.trim());
    const newRow: ProjectBudgetLine = {
      id: tempId,
      project_id: projectId,
      concept,
      hito1_budget: 0,
      justified_hito1: 0,
      hito2_budget: 0,
      justified_hito2: 0,
      approved_budget: 0,
      percent_spent: 0,
      forecasted_spent: 0,
      created_at: new Date().toISOString(),
    };
    setExtraBudgetRows((prev) => [newRow, ...prev]);
    setBudgetDrafts((prev) => ({
      ...prev,
      [tempId]: {
        concept,
        hito1_budget: 0,
        justified_hito1: 0,
        hito2_budget: 0,
        justified_hito2: 0,
        approved_budget: 0,
        forecasted_spent: 0,
        percent_spent: 0,
      },
    }));
    setExternalCollabSelections((prev) => ({
      ...prev,
      [budgetId]: "",
    }));
  };

  const handleRemoveExternalCollaborationRow = (row: ProjectBudgetLine) => {
    if (!projectId) return;
    if (row.id < 0) {
      setExtraBudgetRows((prev) => prev.filter((item) => item.id !== row.id));
      setBudgetDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      return;
    }
    deleteBudgetMutation.mutate(row.id);
  };

  const handleBudgetCellSave = (
    budgetId: number,
    field: keyof ProjectBudgetLineUpdatePayload,
    value: string,
  ) => {
    if (!projectId) return;

    if (field === "concept") {
      const trimmed = value.trim();
      if (!trimmed) return;
      setBudgetDrafts((prev) => ({
        ...prev,
        [budgetId]: {
          ...(prev[budgetId] ?? {}),
          concept: trimmed,
        },
      }));
      return;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;

    const currentRow =
      budgetRows.find((b) => b.id === budgetId) ??
      groupedBudgetRows.find((b) => b.id === budgetId) ??
      defaultBudgetTemplate.find((b) => b.id === budgetId);
    if (!currentRow) return;

    const draft = budgetDrafts[budgetId] ?? {};
    const currentH1 = draft.hito1_budget ?? Number(currentRow.hito1_budget ?? 0);
    const currentH2 = draft.hito2_budget ?? Number(currentRow.hito2_budget ?? 0);

    if (field === "hito1_budget" || field === "hito2_budget") {
      const hito1 = field === "hito1_budget" ? numericValue : currentH1;
      const hito2 = field === "hito2_budget" ? numericValue : currentH2;
      const approvedBudget =
        draft.approved_budget ??
        (Number(
          budgetDrafts[budgetId]?.approved_budget ?? currentRow.approved_budget ?? 0,
        ) ||
          hito1 + hito2);

      setBudgetDrafts((prev) => ({
        ...prev,
        [budgetId]: {
          ...(prev[budgetId] ?? {}),
          hito1_budget: hito1,
          hito2_budget: hito2,
          approved_budget: approvedBudget,
        },
      }));
      return;
    }

    if (field === "approved_budget") {
      setBudgetDrafts((prev) => ({
        ...prev,
        [budgetId]: {
          ...(prev[budgetId] ?? {}),
          approved_budget: numericValue,
        },
      }));
      return;
    }

    setBudgetDrafts((prev) => ({
      ...prev,
      [budgetId]: {
        ...(prev[budgetId] ?? {}),
        [field]: numericValue,
      },
    }));
  };

  const handleBudgetMilestoneChange = (
    budget: ProjectBudgetLine,
    milestoneId: number,
    field: "amount" | "justified",
    value: string,
  ) => {
    if (!projectId || !budgetsEditMode || !budget || budget.id <= 0) return;
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    const current = budgetDrafts[budget.id]?.milestones ?? budget.milestones ?? [];
    const updated = current.map((m) =>
      m.milestone_id === milestoneId ? { ...m, [field]: num } : m,
    );
    if (!current.find((m) => m.milestone_id === milestoneId)) {
      updated.push({
        id: -1,
        milestone_id: milestoneId,
        amount: field === "amount" ? num : 0,
        justified: field === "justified" ? num : 0,
        created_at: new Date().toISOString(),
      } as any);
    }
    setBudgetDrafts((prev) => ({
      ...prev,
      [budget.id]: {
        ...(prev[budget.id] ?? {}),
        milestones: updated.map((m) => ({
          milestone_id: m.milestone_id,
          amount: m.amount,
          justified: m.justified,
        })) as any,
      },
    }));
  };

  const hasBudgetDrafts = Object.keys(budgetDrafts).length > 0;

  const handleBudgetSaveAll = async () => {
    if (!projectId || !hasBudgetDrafts) return false;
    try {
      setSavingBudgets(true);
      const writeTenantId = await resolveWriteTenantId();
      if (!writeTenantId) {
        throw new Error("Tenant requerido para guardar presupuestos.");
      }
      let latestBudgets = await fetchProjectBudgets(projectId, writeTenantId);
      const refreshBudgets = async (): Promise<ProjectBudgetLine[]> => {
        latestBudgets = await fetchProjectBudgets(projectId, writeTenantId);
        return latestBudgets;
      };
      const safeNumber = (value: unknown, fallback = 0) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
      };
      const findBudgetByComposite = (
        budgets: ProjectBudgetLine[],
        payload: Pick<
          ProjectBudgetLinePayload,
          | "concept"
          | "hito1_budget"
          | "hito2_budget"
          | "justified_hito1"
          | "justified_hito2"
          | "approved_budget"
          | "forecasted_spent"
        >,
      ) => {
        const key = getBudgetMatchKey(payload.concept);
        return budgets.find((r) => {
          if (getBudgetMatchKey(r.concept ?? "") !== key) return false;
          const h1 = safeNumber(r.hito1_budget ?? 0);
          const h2 = safeNumber(r.hito2_budget ?? 0);
          const j1 = safeNumber(r.justified_hito1 ?? 0);
          const j2 = safeNumber(r.justified_hito2 ?? 0);
          const approved = safeNumber(r.approved_budget ?? 0);
          const forecast = safeNumber(r.forecasted_spent ?? 0);
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

      const findBudgetByConcept = (concept: string): ProjectBudgetLine | undefined => {
        const matchKey = getBudgetMatchKey(concept);
        return latestBudgets.find((r) => getBudgetMatchKey(r.concept ?? "") === matchKey);
      };

      const deriveMilestoneValues = (
        draftPayload: ProjectBudgetLineUpdatePayload,
        fallback: ProjectBudgetLine | undefined,
      ) => {
        const milestones = draftPayload.milestones ?? [];
        if (milestones.length === 0) {
          const h1 = safeNumber(draftPayload.hito1_budget ?? fallback?.hito1_budget ?? 0);
          const h2 = safeNumber(draftPayload.hito2_budget ?? fallback?.hito2_budget ?? 0);
          const j1 = safeNumber(draftPayload.justified_hito1 ?? fallback?.justified_hito1 ?? 0);
          const j2 = safeNumber(draftPayload.justified_hito2 ?? fallback?.justified_hito2 ?? 0);
          const approved = safeNumber(
            draftPayload.approved_budget ?? fallback?.approved_budget ?? h1 + h2,
          );
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

        const amounts = milestones.map((m) => safeNumber(m.amount ?? 0));
        const justifications = milestones.map((m) => safeNumber(m.justified ?? 0));
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

      for (const [idStr, draftPayload] of Object.entries(budgetDrafts)) {
        const id = Number(idStr);
        const base =
          latestBudgets.find((r) => r.id === id) ??
          mergedBudgetRows.find((r) => r.id === id) ??
          groupedBudgetRows.find((r) => r.id === id) ??
          defaultBudgetTemplate.find((r) => r.id === id);
        if (!base) continue;
        if (!base.concept) {
          throw new Error("Concepto requerido en todas las filas.");
        }
        const baseKey = getBudgetParentKey(base.concept);
        const isParentRow = isAllCapsConcept(base.concept);
        const parentTotals = isParentRow ? budgetParentTotals.get(baseKey) : undefined;
        const milestoneValues = deriveMilestoneValues(draftPayload, base);
        const h1 = milestoneValues.h1;
        const h2 = milestoneValues.h2;
        // Mantener coherencia básica en frontend: el chequeo estricto de que
        // el justificado total no supere el presupuesto aprobado se delega
        // al backend. Aquí solo derivamos valores para enviar.
        const approved = milestoneValues.approved;
        const j1 = parentTotals ? parentTotals.j1 : milestoneValues.j1;
        const j2 = parentTotals ? parentTotals.j2 : milestoneValues.j2;
      }

      const normalizedDrafts = Object.entries(budgetDrafts).map(
        ([id, draftPayload]) => {
          const numericId = Number(id);
          const conceptValue =
            (
              draftPayload.concept ??
              mergedBudgetRows.find((r) => r.id === numericId)?.concept ??
              ""
            )?.trim() ?? "";

          // Si ya existe una línea con este ID en backend, usamos siempre ese ID
          // para actualizar y evitamos crear duplicados por concepto.
          const existingById =
            numericId > 0
              ? latestBudgets.find((r) => r.id === numericId)
              : undefined;

          const matchedByConcept =
            !existingById && conceptValue
              ? findBudgetByConcept(conceptValue)
              : undefined;

          const targetId =
            existingById?.id ?? matchedByConcept?.id ?? -1;

          return {
            targetId,
            draftPayload,
            conceptValue,
            numericId,
            hasExisting: Boolean(existingById || matchedByConcept),
          };
        },
      );

      const saveResults = await Promise.all(
        normalizedDrafts.map(async ({
          targetId,
          draftPayload,
          conceptValue,
          numericId,
          hasExisting,
        }) => {
            const baseExisting =
              targetId > 0 ? latestBudgets.find((r) => r.id === targetId) : null;
            const base =
              baseExisting ??
              mergedBudgetRows.find((r) => r.id === numericId) ??
              groupedBudgetRows.find((r) => r.id === numericId) ??
              defaultBudgetTemplate.find((r) => r.id === numericId);
            if (!base) return { ok: true };
            if (!conceptValue) return { ok: true };
            const milestoneValues = deriveMilestoneValues(draftPayload, base);
            const h1 = milestoneValues.h1;
            const h2 = milestoneValues.h2;
            const approved = milestoneValues.approved;
            const baseKey = getBudgetParentKey(base.concept ?? "");
            const isParentRow = isAllCapsConcept(base.concept);
            const parentTotals = isParentRow ? budgetParentTotals.get(baseKey) : undefined;
            const j1 = parentTotals
              ? parentTotals.j1
              : milestoneValues.j1;
            const j2 = parentTotals
              ? parentTotals.j2
              : milestoneValues.j2;
            const forecast = safeNumber(
              draftPayload.forecasted_spent ?? base.forecasted_spent ?? 0,
            );
            const percent =
              approved > 0 ? safeNumber(((forecast / approved) * 100).toFixed(2), 0) : 0;

            const createPayload: ProjectBudgetLinePayload = {
              concept: conceptValue,
              hito1_budget: h1,
              justified_hito1: j1,
              hito2_budget: h2,
              justified_hito2: j2,
              approved_budget: approved,
              forecasted_spent: forecast,
              percent_spent: percent,
            };

            // Si no existe en backend, creamos directamente y evitamos PATCH (404).
            if (!hasExisting || targetId <= 0 || !baseExisting) {
              await createProjectBudgetLine(projectId, createPayload, writeTenantId);
              return { ok: true };
            }

            const { milestones: _ignoredMilestones, ...draftPayloadWithoutMilestones } =
              draftPayload;
            const payloadForUpdate: ProjectBudgetLineUpdatePayload = {
              ...draftPayloadWithoutMilestones,
              concept: draftPayload.concept ?? base.concept,
              hito1_budget: h1,
              justified_hito1: j1,
              hito2_budget: h2,
              justified_hito2: j2,
              approved_budget: approved,
              forecasted_spent: forecast,
              percent_spent: percent,
            };

            try {
              await updateProjectBudgetLine(
                projectId,
                targetId,
                payloadForUpdate,
                writeTenantId,
              );
              return { ok: true };
            } catch (err: any) {
              if (err?.response?.status === 404) {
                // Refresh and retry update once (avoid duplicates if it exists).
                console.debug("[budget-save] update 404, refreshing", {
                  projectId,
                  targetId,
                  concept: conceptValue,
                });
                const refreshedBudgets = await refreshBudgets();
                const refreshedById = refreshedBudgets.find(
                  (r) => r.id === targetId,
                );
                const refreshedByComposite = findBudgetByComposite(
                  refreshedBudgets,
                  createPayload,
                );
                const retryTargetId =
                  refreshedById?.id ??
                  refreshedByComposite?.id ??
                  targetId;
                try {
                  await updateProjectBudgetLine(
                    projectId,
                    retryTargetId,
                    payloadForUpdate,
                    writeTenantId,
                  );
                  return { ok: true };
                } catch (retryErr: any) {
                  if (retryErr?.response?.status !== 404) {
                    return { ok: false, error: retryErr };
                  }
                }
                // Still 404 -> create (after ensuring it's not already there).
                console.debug("[budget-save] update 404 after retry, creating", {
                  projectId,
                  targetId: retryTargetId,
                  concept: conceptValue,
                });
                const existsAfterRefresh = findBudgetByComposite(
                  refreshedBudgets,
                  createPayload,
                );
                if (existsAfterRefresh) {
                  return { ok: true };
                }
                try {
                  await createProjectBudgetLine(
                    projectId,
                    createPayload,
                    writeTenantId,
                  );
                  return { ok: true };
                } catch (createErr: any) {
                  return { ok: false, error: createErr };
                }
              }
              return { ok: false, error: err };
            }
          },
        ),
      );
      const firstError = saveResults.find((r) => !r.ok) as
        | { ok: false; error?: any }
        | undefined;
      if (firstError) {
        throw firstError.error ?? new Error("No se pudieron guardar los cambios.");
      }
      setBudgetDrafts({});
      setExtraBudgetRows([]);
      await queryClient.invalidateQueries({
        queryKey: projectsBaseKey,
      });
      toast({ title: "Presupuestos guardados", status: "success" });
      return true;
    } catch (error: any) {
      toast({
        title: "Error al guardar presupuestos",
        description:
          error?.response?.data?.detail ??
          error?.message ??
          "No se pudieron guardar los cambios de la tabla.",
        status: "error",
      });
      return false;
    } finally {
      setSavingBudgets(false);
    }
  };

  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [budgetModalMode, setBudgetModalMode] =
    useState<"create" | "edit">("create");
  const [budgetModalInitial, setBudgetModalInitial] =
    useState<ProjectBudgetLinePayload>(DEFAULT_BUDGET_PAYLOAD);
  const [activeBudgetLine, setActiveBudgetLine] =
    useState<ProjectBudgetLine | null>(null);

  const openBudgetModal = (mode: "create" | "edit", line?: ProjectBudgetLine) => {
    setBudgetModalMode(mode);
    if (line) {
      setBudgetModalInitial({
        concept: line.concept,
        hito1_budget: line.hito1_budget,
        justified_hito1: line.justified_hito1,
        hito2_budget: line.hito2_budget,
        justified_hito2: line.justified_hito2,
        approved_budget: line.approved_budget,
        percent_spent: line.percent_spent,
        forecasted_spent: line.forecasted_spent,
      });
      setActiveBudgetLine(line);
    } else {
      setBudgetModalInitial(DEFAULT_BUDGET_PAYLOAD);
      setActiveBudgetLine(null);
    }
    setBudgetModalOpen(true);
  };

  const closeBudgetModal = () => {
    setBudgetModalOpen(false);
  };

  const handleBudgetSave = (payload: ProjectBudgetLinePayload) => {
    if (!payload.concept.trim()) {
      toast({ title: "Concepto requerido", status: "warning" });
      return;
    }
    if (projectId === null) {
      toast({ title: "Selecciona un proyecto", status: "warning" });
      return;
    }
    if (budgetModalMode === "edit" && activeBudgetLine) {
      updateBudgetMutation.mutate(
        {
          budgetId: activeBudgetLine.id,
          payload,
        },
        {
          onSuccess: () => {
            // Cerramos el modal y limpiamos el borrador local
            // para que la tabla muestre los datos recargados
            // desde el backend.
            setBudgetModalOpen(false);
            setBudgetDrafts((prev) => {
              const next = { ...prev };
              delete next[activeBudgetLine.id];
              return next;
            });
          },
        },
      );
      return;
    }
    createBudgetMutation.mutate(payload, {
      onSuccess: () => setBudgetModalOpen(false),
    });
  };

  const ensureBaseBudgetMilestones = async () => {
    if (!projectId) return [] as typeof budgetMilestones;
    if (budgetMilestones.length > 0) return budgetMilestones;
    const created = [];
    const m1 = await createBudgetMilestoneMutation.mutateAsync({
      name: "HITO 1",
      order_index: 1,
    });
    created.push(m1);
    const m2 = await createBudgetMilestoneMutation.mutateAsync({
      name: "HITO 2",
      order_index: 2,
    });
    created.push(m2);
    return created;
  };

  const addBudgetMilestone = async () => {
    if (!projectId) return;
    try {
      const current = await ensureBaseBudgetMilestones();
      const maxIndex = current.reduce(
        (max, milestone) => Math.max(max, milestone.order_index || 0),
        0,
      );
      const nextIndex = maxIndex + 1;
      createBudgetMilestoneMutation.mutate({
        name: `Hito ${nextIndex}`,
        order_index: nextIndex,
      });
    } catch (error: any) {
      toast({
        title: "Error al crear hito",
        description:
          error?.response?.data?.detail ?? "No se pudo crear el hito.",
        status: "error",
      });
    }
  };

  const removeBudgetMilestone = (milestoneId: number) => {
    if (!projectId || !milestoneId) return;
    deleteBudgetMilestoneMutation.mutate(milestoneId, {
      onSuccess: () => {
        setBudgetDrafts((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((key) => {
            const draft = next[Number(key)];
            if (!draft?.milestones) return;
            const filtered = draft.milestones.filter(
              (m) => m.milestone_id !== milestoneId,
            );
            next[Number(key)] = { ...draft, milestones: filtered };
          });
          return next;
        });
      },
    });
  };

  return {
    budgetsEditMode,
    setBudgetsEditMode,
    budgetDrafts,
    generalExpensesMode,
    setGeneralExpensesMode,
    savingBudgets,
    seedingTemplate,
    externalCollaborations: externalCollaborationsQuery.listQuery.data ?? [],
    isExternalCollaborationsLoading: externalCollaborationsQuery.listQuery.isLoading,
    externalCollabSelections,
    setExternalCollabSelections,
    displayBudgetRows,
    groupedBudgetRows,
    budgetParentMap,
    budgetParentTotals,
    budgetsTabTotals,
    personalJustifiedByConceptAndMilestoneKey,
    personnelYears,
    personnelRows,
    budgetsDiffH1,
    budgetsDiffH2,
    canEditBudgets,
    hasRealBudgets,
    hasBudgetDrafts,
    budgetMilestonesCount: budgetMilestones.length,
    budgetMilestones,
    budgetsQueryState: {
      isFetching: budgetsQuery.isFetching && !budgetsQuery.data,
      isError: budgetsQuery.isError,
    },
    seedTemplateBudgetLines,
    addBudgetMilestone,
    removeBudgetMilestone,
    handleGeneralExpensesPercent,
    handleGeneralExpensesAmount,
    handleAddExternalCollaborationRow,
    handleRemoveExternalCollaborationRow,
    handleBudgetCellSave,
    handleBudgetMilestoneChange,
    handleBudgetSaveAll,
    handleBudgetSave,
    openBudgetModal,
    budgetModalOpen,
    closeBudgetModal,
    budgetModalInitial,
    budgetModalMode,
    isBudgetModalSaving:
      budgetModalMode === "edit"
        ? updateBudgetMutation.isPending
        : createBudgetMutation.isPending,
  };
};
