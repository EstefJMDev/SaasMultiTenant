import React from "react";

import {
  Box,
  Button,
  Editable,
  EditableInput,
  EditablePreview,
  Flex,
  Heading,
  HStack,
  Input,
  InputGroup,
  InputRightAddon,
  Select,
  Stack,
  Table,
  TableCaption,
  Tbody,
  Td,
  Text,
  Tfoot,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";

import type { ErpProject as ErpProjectApi } from "@api/erpReports";
import type {
  ProjectBudgetMilestone,
  ProjectBudgetLine,
  ProjectBudgetLineUpdatePayload,
} from "@api/erpBudgets";
import type { ExternalCollaboration } from "@api/externalCollaborations";
import type { BudgetModalMode } from "@shared/utils/erp";
import {
  CATEGORY_COLOR_MAP,
  DEFAULT_GENERAL_EXPENSES_PERCENT,
  EXTERNAL_COLLAB_LABEL,
  GENERAL_EXPENSES_LABEL,
  formatEuroValue,
  formatGeneralExpensesConcept,
  formatPercent,
  formatPercentLabelValue,
  getBudgetParentKey,
  normalizeConceptKey,
  isAllCapsConcept,
  isExternalCollaborationConcept,
  isGeneralExpensesConcept,
  parseExternalCollaborationDetails,
  parsePercentFromConcept,
} from "@shared/utils/erp";
import { BudgetNumberCell, EuroCell } from "./BudgetCell";
import { BudgetProjectSelectControl } from "./components/BudgetProjectSelectControl";
import { BudgetProjectSummary } from "./components/BudgetProjectSummary";
import { BudgetSectionActions } from "./components/BudgetSectionActions";
import { BudgetSectionStatus } from "./components/BudgetSectionStatus";
import { BudgetTableHeader } from "./components/BudgetTableHeader";

interface BudgetTotals {
  hito1: number;
  hito2: number;
  approved: number;
  justificados?: number[];
  gasto: number;
}

interface BudgetSectionProps {
  projects: ErpProjectApi[];
  budgetProjectFilter: string;
  onBudgetProjectChange: (value: string) => void;
  selectedBudgetProjectId: number | null;
  budgetMilestonesCount: number;
  budgetMilestones: ProjectBudgetMilestone[];
  onAddBudgetMilestone: () => void;
  onRemoveBudgetMilestone: (milestoneId: number) => void;
  budgetsEditMode: boolean;
  onToggleEditMode: () => void;
  canEditBudgets: boolean;
  onSaveTable: () => void;
  hasBudgetDrafts: boolean;
  savingBudgets: boolean;
  hasRealBudgets: boolean;
  onSeedTemplate: () => void;
  seedingTemplate: boolean;
  budgetsQueryState: {
    isFetching: boolean;
    isError: boolean;
  };
  displayBudgetRows: ProjectBudgetLine[];
  groupedBudgetRows: ProjectBudgetLine[];
  budgetDrafts: Record<number, ProjectBudgetLineUpdatePayload>;
  generalExpensesMode: Record<number, "percent" | "amount">;
  onGeneralExpensesModeChange: (
    budgetId: number,
    mode: "percent" | "amount",
  ) => void;
  onGeneralExpensesPercent: (budgetId: number, value: string) => void;
  onGeneralExpensesAmount: (budgetId: number, value: string) => void;
  externalCollaborations: ExternalCollaboration[];
  isExternalCollaborationsLoading: boolean;
  externalCollabSelections: Record<number, string>;
  onExternalCollabSelectionChange: (budgetId: number, value: string) => void;
  onAddExternalCollaborationRow: (budgetId: number) => void;
  onBudgetCellSave: (
    budgetId: number,
    field: keyof ProjectBudgetLineUpdatePayload,
    value: string,
  ) => void;
  onBudgetMilestoneChange: (
    budget: ProjectBudgetLine,
    milestoneId: number,
    field: "amount" | "justified",
    value: string,
  ) => void;
  onOpenBudgetModal: (mode: BudgetModalMode, budget?: ProjectBudgetLine) => void;
  onRemoveExternalCollaborationRow: (budget: ProjectBudgetLine) => void;
  budgetParentMap: Record<string, string[]>;
  budgetParentTotals: Map<string, { j1: number; j2: number }>;
  budgetsTabTotals: BudgetTotals;
  personalJustifiedByConceptAndMilestoneKey: Record<string, Record<string, number>>;
  personnelYears: number[];
  personnelRows: Array<{
    employeeId: number;
    firstName: string;
    lastName: string;
    hourlyRate: number;
    byYear: Record<number, { hours: number; amount: number; hourlyRate: number }>;
    totalHours: number;
    totalAmount: number;
  }>;
  subtleText: string;
  externalCollabSelectPlaceholder: string;
}

export const BudgetSection: React.FC<BudgetSectionProps> = ({
  projects,
  budgetProjectFilter,
  onBudgetProjectChange,
  selectedBudgetProjectId,
  budgetMilestonesCount,
  budgetMilestones,
  onAddBudgetMilestone,
  onRemoveBudgetMilestone,
  budgetsEditMode,
  onToggleEditMode,
  canEditBudgets,
  onSaveTable,
  hasBudgetDrafts,
  savingBudgets,
  hasRealBudgets,
  onSeedTemplate,
  seedingTemplate,
  budgetsQueryState,
  displayBudgetRows,
  groupedBudgetRows,
  budgetDrafts,
  generalExpensesMode,
  onGeneralExpensesModeChange,
  onGeneralExpensesPercent,
  onGeneralExpensesAmount,
  externalCollaborations,
  isExternalCollaborationsLoading,
  externalCollabSelections,
  onExternalCollabSelectionChange,
  onAddExternalCollaborationRow,
  onBudgetCellSave,
  onBudgetMilestoneChange,
  onOpenBudgetModal,
  onRemoveExternalCollaborationRow,
  budgetParentMap,
  budgetParentTotals,
  budgetsTabTotals,
  personalJustifiedByConceptAndMilestoneKey = {},
  personnelYears = [],
  personnelRows = [],
  subtleText,
  externalCollabSelectPlaceholder,
}) => {
  const selectedProject =
    selectedBudgetProjectId != null
      ? projects.find((project) => project.id === selectedBudgetProjectId) ?? null
      : null;
  const [selectedYear, setSelectedYear] = React.useState<number | null>(null);
  const [collapsedParents, setCollapsedParents] = React.useState<Set<string>>(
    () => new Set(),
  );
  const approvedColumnBg = "green.100";
  const justifiedColumnBg = "green.50";
  const approvedBudgetColumnBg = "orange.100";
  const approvedHeaderBg = "green.700";
  const justifiedHeaderBg = "green.600";
  const approvedBudgetHeaderBg = "orange.500";

  const resolveActiveMonthsInYear = (
    start: Date,
    end: Date,
    year: number,
  ) => {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
    const effectiveStart = start > yearStart ? start : yearStart;
    const effectiveEnd = end < yearEnd ? end : yearEnd;
    if (effectiveEnd < effectiveStart) return 0;
    return (
      (effectiveEnd.getFullYear() - effectiveStart.getFullYear()) * 12 +
      (effectiveEnd.getMonth() - effectiveStart.getMonth()) +
      1
    );
  };
  const fallbackDurationMonths = (() => {
    if (!selectedProject?.start_date || !selectedProject?.end_date) return null;
    const start = new Date(selectedProject.start_date);
    const end = new Date(selectedProject.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    if (end < start) return null;
    const totalDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    return Math.max(1, Math.ceil(totalDays / 30));
  })();
  const durationMonths =
    selectedProject?.duration_months ?? fallbackDurationMonths ?? null;
  const subsidyPercent = selectedProject?.subsidy_percent ?? 0;
  const durationLabel =
    durationMonths != null ? `${durationMonths} meses` : "Sin fechas";
  const projectDateRange = React.useMemo(() => {
    if (!selectedProject?.start_date || !selectedProject?.end_date) return null;
    const start = new Date(selectedProject.start_date);
    const end = new Date(selectedProject.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    if (end < start) return null;
    return { start, end };
  }, [selectedProject?.start_date, selectedProject?.end_date]);
  const yearOptions = React.useMemo(() => {
    if (!projectDateRange) return [];
    const startYear = projectDateRange.start.getFullYear();
    const endYear = projectDateRange.end.getFullYear();
    const options = [];
    for (let year = startYear; year <= endYear; year += 1) {
      options.push(year);
    }
    return options;
  }, [projectDateRange]);
  const resolvedSelectedYear = React.useMemo(() => {
    if (!yearOptions.length) return null;
    if (selectedYear && yearOptions.includes(selectedYear)) return selectedYear;
    const currentYear = new Date().getFullYear();
    if (yearOptions.includes(currentYear)) return currentYear;
    return yearOptions[0];
  }, [selectedYear, yearOptions]);
  const baseTotalsApproved = Number(budgetsTabTotals.approved ?? 0);
  const baseTotalsForecasted = Number(budgetsTabTotals.gasto ?? 0);

  const milestonesToRender =
    budgetMilestones.length > 0
      ? [...budgetMilestones].sort((a, b) => a.order_index - b.order_index)
      : [
          { id: -1, name: "HITO 1", order_index: 1 } as ProjectBudgetMilestone,
          { id: -2, name: "HITO 2", order_index: 2 } as ProjectBudgetMilestone,
        ];
  const normalizeMilestoneKey = (value?: string | null) =>
    (value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, "");
  const personalConceptKey = normalizeConceptKey("PERSONAL");
  const unassignedMilestoneKey = "__unassigned__";
  const autoJustifiedForConcept = React.useCallback(
    (conceptKey: string) => {
      const milestoneMap =
        personalJustifiedByConceptAndMilestoneKey[conceptKey] ?? {};
      const values = milestonesToRender.map((milestone) =>
        Number(milestoneMap[normalizeMilestoneKey(milestone.name)] ?? 0),
      );
      if (values.length > 0) {
        values[0] += Number(milestoneMap[unassignedMilestoneKey] ?? 0);
      }
      return values;
    },
    [milestonesToRender, personalJustifiedByConceptAndMilestoneKey],
  );
  const milestoneColumnsCount = milestonesToRender.length;
  const hasDynamicMilestones = budgetMilestones.length > 0;
  const resolveMilestoneValue = (
    budget: ProjectBudgetLine,
    milestoneId: number,
    index: number,
    field: "amount" | "justified",
    fallback: { h1: number; h2: number; j1: number; j2: number },
  ) => {
    const draft = budgetDrafts[budget.id]?.milestones?.find(
      (m) => m.milestone_id === milestoneId,
    );
    if (draft) {
      return field === "amount"
        ? Number(draft.amount ?? 0)
        : Number(draft.justified ?? 0);
    }
    // Los campos planos (hito1_budget/hito2_budget) siempre están actualizados
    // después de un PATCH. Los registros BudgetLineMilestone pueden estar desactualizados
    // porque el PATCH usa campos planos y no actualiza esos registros.
    // Prioridad: campos planos → milestone records (solo si planos son 0).
    if (index === 0) {
      const flat = field === "amount" ? fallback.h1 : fallback.j1;
      if (flat !== 0) return flat;
    }
    if (index === 1) {
      const flat = field === "amount" ? fallback.h2 : fallback.j2;
      if (flat !== 0) return flat;
    }
    const stored = budget.milestones?.find(
      (m) => m.milestone_id === milestoneId,
    );
    if (stored) {
      return field === "amount"
        ? Number(stored.amount ?? 0)
        : Number(stored.justified ?? 0);
    }
    if (index === 0) {
      return field === "amount" ? fallback.h1 : fallback.j1;
    }
    if (index === 1) {
      return field === "amount" ? fallback.h2 : fallback.j2;
    }
    return 0;
  };
  const childToParentKey = Object.entries(budgetParentMap).reduce(
    (acc, [parentKey, children]) => {
      children.forEach((child) => {
        acc[child] = parentKey;
      });
      return acc;
    },
    {} as Record<string, string>,
  );
  const parentMilestoneTotals: Record<
    string,
    { amount: number[]; justified: number[]; forecast: number }
  > = {};
  groupedBudgetRows.forEach((row) => {
    const rowKey = normalizeConceptKey(row.concept);
    const parentKey = childToParentKey[rowKey];
    if (!parentKey) return;
    if (!parentMilestoneTotals[parentKey]) {
      parentMilestoneTotals[parentKey] = {
        amount: Array(milestoneColumnsCount).fill(0),
        justified: Array(milestoneColumnsCount).fill(0),
        forecast: 0,
      };
    }
    const h1 = Number(row.hito1_budget ?? 0);
    const h2 = Number(row.hito2_budget ?? 0);
    const j1 = Number(row.justified_hito1 ?? 0);
    const j2 = Number(row.justified_hito2 ?? 0);
    const fallback = { h1, h2, j1, j2 };
    milestonesToRender.forEach((milestone, idx) => {
      const amountValue = resolveMilestoneValue(
        row,
        milestone.id,
        idx,
        "amount",
        fallback,
      );
      const justifiedValue = resolveMilestoneValue(
        row,
        milestone.id,
        idx,
        "justified",
        fallback,
      );
      parentMilestoneTotals[parentKey].amount[idx] += Number(amountValue || 0);
      parentMilestoneTotals[parentKey].justified[idx] += Number(
        justifiedValue || 0,
      );
    });
    parentMilestoneTotals[parentKey].forecast += Number(row.forecasted_spent ?? 0);
  });
  const parentKeys = new Set(Object.keys(budgetParentMap));
  // Usar una clave estable (string de keys ordenados) para evitar que el efecto
  // se dispare en cada edición de celda (budgetParentMap cambia de referencia
  // aunque su contenido sea el mismo, porque mergedBudgetRows se recalcula).
  const parentKeysString = Array.from(parentKeys).sort().join(",");
  React.useEffect(() => {
    setCollapsedParents(new Set(Object.keys(budgetParentMap)));
  }, [parentKeysString]);
  const totalsByMilestone = Array.from({ length: milestoneColumnsCount }, () => ({
    amount: 0,
    justified: 0,
  }));
  let totalApproved = 0;
  let totalForecasted = 0;
  groupedBudgetRows.forEach((row) => {
    const rowKey = normalizeConceptKey(row.concept);
    const isParentRow = parentKeys.has(rowKey);
    const isPersonalParent = isParentRow && rowKey === personalConceptKey;
    const isPersonalCostRow =
      rowKey === personalConceptKey ||
      rowKey === normalizeConceptKey("Doctores") ||
      rowKey === normalizeConceptKey("Titulados universitarios") ||
      rowKey === normalizeConceptKey("No titulado");
    const autoJustifiedValues = isPersonalCostRow
      ? autoJustifiedForConcept(rowKey)
      : null;
    const isGeneralExpenses = isGeneralExpensesConcept(row.concept);
    if (!isParentRow && !isGeneralExpenses) return;
    const h1 = Number(row.hito1_budget ?? 0);
    const h2 = Number(row.hito2_budget ?? 0);
    const j1 = Number(row.justified_hito1 ?? 0);
    const j2 = Number(row.justified_hito2 ?? 0);
    const fallback = { h1, h2, j1, j2 };
    let rowApproved = 0;
    const useParentTotals = isParentRow && hasDynamicMilestones && !isGeneralExpenses;
    milestonesToRender.forEach((milestone, idx) => {
      const amountValue =
        useParentTotals
          ? parentMilestoneTotals[rowKey]?.amount[idx] ?? 0
          : resolveMilestoneValue(row, milestone.id, idx, "amount", fallback);
      const justifiedValue =
        autoJustifiedValues
          ? autoJustifiedValues[idx] ?? 0
          : useParentTotals
          ? parentMilestoneTotals[rowKey]?.justified[idx] ?? 0
          : resolveMilestoneValue(row, milestone.id, idx, "justified", fallback);
      totalsByMilestone[idx].amount += Number(amountValue || 0);
      totalsByMilestone[idx].justified += Number(justifiedValue || 0);
      rowApproved += Number(amountValue || 0);
    });
    totalApproved += rowApproved;
    totalForecasted += useParentTotals
      ? Number(parentMilestoneTotals[rowKey]?.forecast ?? 0)
      : Number(row.forecasted_spent ?? 0);
  });
  const totalJustified = totalsByMilestone.reduce(
    (sum, item) => sum + item.justified,
    0,
  );
  const effectiveTotalApproved = hasDynamicMilestones
    ? totalApproved
    : baseTotalsApproved;
  const effectiveTotalForecasted = hasDynamicMilestones
    ? totalForecasted
    : baseTotalsForecasted;
  const baseResult =
    (effectiveTotalApproved * subsidyPercent) / 100 - effectiveTotalForecasted;


  const monthsActivePerYear =
    projectDateRange && resolvedSelectedYear != null
      ? resolveActiveMonthsInYear(
          projectDateRange.start,
          projectDateRange.end,
          resolvedSelectedYear,
        )
      : 0;
  const annualizedResult =
    durationMonths != null && durationMonths > 0
      ? (baseResult / durationMonths) * monthsActivePerYear
      : 0;


  const [milestoneToRemove, setMilestoneToRemove] = React.useState("");
  const sortedBudgetMilestones = React.useMemo(
    () =>
      [...budgetMilestones].sort(
        (a, b) => a.order_index - b.order_index || a.id - b.id,
      ),
    [budgetMilestones],
  );
  const hasRealBudgetMilestones = budgetMilestones.some((m) => m.id > 0);
  const removableMilestones = sortedBudgetMilestones.filter((m) => m.id > 0);
  const personnelYearBlockStyles = [
    { headerBg: "blue.100", bodyBg: "blue.50", borderColor: "blue.200" },
    { headerBg: "green.100", bodyBg: "green.50", borderColor: "green.200" },
    { headerBg: "orange.100", bodyBg: "orange.50", borderColor: "orange.200" },
    { headerBg: "purple.100", bodyBg: "purple.50", borderColor: "purple.200" },
  ] as const;
  const getPersonnelYearBlockStyle = (yearIndex: number) =>
    personnelYearBlockStyles[yearIndex % personnelYearBlockStyles.length];
  const personnelTotals = React.useMemo(() => {
    const byYear = personnelYears.reduce<
      Record<number, { hours: number; amount: number }>
    >((acc, year) => {
      acc[year] = { hours: 0, amount: 0 };
      return acc;
    }, {});

    let totalHours = 0;
    let totalAmount = 0;

    personnelRows.forEach((row) => {
      totalHours += row.totalHours;
      totalAmount += row.totalAmount;
      personnelYears.forEach((year) => {
        const data = row.byYear[year];
        if (!data) return;
        byYear[year].hours += data.hours;
        byYear[year].amount += data.amount;
      });
    });

    return { byYear, totalHours, totalAmount };
  }, [personnelRows, personnelYears]);

  return (
    <Stack spacing={6}>
    <Heading size="md">Presupuestos</Heading>

    <Flex justify="space-between" align="flex-end" wrap="wrap" gap={4}>
      <BudgetProjectSelectControl
        projects={projects}
        budgetProjectFilter={budgetProjectFilter}
        onBudgetProjectChange={onBudgetProjectChange}
      />
      <BudgetProjectSummary
        baseResult={baseResult}
        subtleText={subtleText}
        durationLabel={durationLabel}
        resolvedSelectedYear={resolvedSelectedYear}
        setSelectedYear={setSelectedYear}
        yearOptions={yearOptions}
        monthsActivePerYear={monthsActivePerYear}
      />
      <BudgetSectionActions
        onAddBudgetMilestone={onAddBudgetMilestone}
        selectedBudgetProjectId={selectedBudgetProjectId}
        milestoneToRemove={milestoneToRemove}
        setMilestoneToRemove={setMilestoneToRemove}
        budgetMilestonesCount={budgetMilestonesCount}
        hasRealBudgetMilestones={hasRealBudgetMilestones}
        removableMilestones={removableMilestones}
        onRemoveBudgetMilestone={onRemoveBudgetMilestone}
        budgetsEditMode={budgetsEditMode}
        onToggleEditMode={onToggleEditMode}
        canEditBudgets={canEditBudgets}
        onSaveTable={onSaveTable}
        hasBudgetDrafts={hasBudgetDrafts}
        savingBudgets={savingBudgets}
        hasRealBudgets={hasRealBudgets}
        onSeedTemplate={onSeedTemplate}
        seedingTemplate={seedingTemplate}
      />
    </Flex>

    {!selectedBudgetProjectId ? (
      <BudgetSectionStatus
        selectedBudgetProjectId={selectedBudgetProjectId}
        isFetching={budgetsQueryState.isFetching}
        isError={budgetsQueryState.isError}
        subtleText={subtleText}
      />
    ) : budgetsQueryState.isFetching ? (
      <BudgetSectionStatus
        selectedBudgetProjectId={selectedBudgetProjectId}
        isFetching={budgetsQueryState.isFetching}
        isError={budgetsQueryState.isError}
        subtleText={subtleText}
      />
    ) : budgetsQueryState.isError ? (
      <BudgetSectionStatus
        selectedBudgetProjectId={selectedBudgetProjectId}
        isFetching={budgetsQueryState.isFetching}
        isError={budgetsQueryState.isError}
        subtleText={subtleText}
      />
    ) : (
      <Box borderWidth="1px" borderRadius="xl" overflow="hidden">
        <BudgetTableHeader
          selectedProjectName={selectedProject?.name}
          resolvedSelectedYear={resolvedSelectedYear}
          subtleText={subtleText}
        />
        <Box overflowX="auto">
          <Table size="sm" variant="simple" minW="960px">
            <TableCaption placement="top" textAlign="left" py={2} fontWeight="bold" color="gray.700">
              Tabla de presupuesto
            </TableCaption>
            <Thead
              position="sticky"
              top={0}
              zIndex={1}
              sx={{
                th: { color: "white", bg: "#0a3d2a", textAlign: "center" },
                "tr:nth-of-type(2) th": { bg: "#0f5d3f" },
              }}
            >
              <Tr bg="#0a3d2a">
                <Th
                  rowSpan={2}
                  className="text-sm"
                  bg="#0a3d2a"
                  color="white"
                  fontWeight="bold"
                >
                  CONCEPTO
                </Th>
                {milestonesToRender.map((milestone, idx) => (
                  <Th
                    key={`milestone-${milestone.id}`}
                    colSpan={2}
                    className="text-sm"
                    textAlign="center"
                    bg="#0a3d2a"
                    color="white"
                    fontWeight="bold"
                  >
                    {milestone.name?.trim() || `HITO ${idx + 1}`}
                  </Th>
                ))}
                <Th
                  rowSpan={2}
                  className="text-sm"
                  bg={approvedBudgetHeaderBg}
                  color="black"
                  fontWeight="bold"
                >
                  PRES. APROBADO (€)
                </Th>
                <Th
                  rowSpan={2}
                  className="text-sm"
                  bg="#0a3d2a"
                  color="white"
                  fontWeight="bold"
                >
                  % GASTO
                </Th>
                <Th
                  rowSpan={2}
                  className="text-sm"
                  bg="#0a3d2a"
                  color="white"
                  fontWeight="bold"
                >
                  GASTO PREVISTO
                </Th>
                <Th
                  rowSpan={2}
                  className="text-sm"
                  bg="#0a3d2a"
                  color="white"
                  fontWeight="bold"
                >
                  ACCIONES
                </Th>
              </Tr>
              <Tr bg="#0f5d3f">
                {milestonesToRender.map((milestone) => (
                  <React.Fragment key={`milestone-head-${milestone.id}`}>
                    <Th className="text-sm" bg={approvedHeaderBg} color="white" fontWeight="semibold">
                      APROBADO (€)
                    </Th>
                    <Th className="text-sm" bg={justifiedHeaderBg} color="white" fontWeight="semibold">
                      JUSTIFICADO (€)
                    </Th>
                  </React.Fragment>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {displayBudgetRows.length === 0 ? (
                <Tr>
                    <Td
                      colSpan={milestoneColumnsCount * 2 + 5}
                      textAlign="center"
                      py={10}
                      color="gray.500"
                    >
                    Aún no hay presupuestos guardados para este proyecto.
                  </Td>
                </Tr>
              ) : (
                groupedBudgetRows.map((budget) => {
                  const rowKey = normalizeConceptKey(budget.concept);
                  const parentKeyForRow = childToParentKey[rowKey];
                  if (
                    parentKeyForRow &&
                    collapsedParents.has(parentKeyForRow)
                  ) {
                    return null;
                  }
                  const h1 = Number(budget.hito1_budget ?? 0);
                  const h2 = Number(budget.hito2_budget ?? 0);
                  const j1 = Number(budget.justified_hito1 ?? 0);
                  const j2 = Number(budget.justified_hito2 ?? 0);
                  const draftConcept =
                    (budgetDrafts[budget.id]?.concept as string) ??
                    budget.concept ??
                    "";
                  const isGeneralExpenses =
                    isGeneralExpensesConcept(draftConcept);
                  const isExternalCollab =
                    isExternalCollaborationConcept(draftConcept);
                  const generalPercent =
                    parsePercentFromConcept(draftConcept) ??
                    DEFAULT_GENERAL_EXPENSES_PERCENT;
                  const externalCollabDetails =
                    parseExternalCollaborationDetails(draftConcept);
                  const externalCollabName = externalCollabDetails?.name ?? "";
                  const externalCollabType = externalCollabDetails?.type ?? "";
                  const resolvedExternalType =
                    externalCollabType ||
                    (externalCollabName
                      ? externalCollaborations.find(
                          (item) => item.name === externalCollabName,
                        )?.collaboration_type ?? ""
                      : "");
                  const generalMode =
                    generalExpensesMode[budget.id] ??
                    (draftConcept.toLowerCase().includes("(importe)")
                      ? "amount"
                      : "percent");
                  const canEditRow = hasRealBudgets && budgetsEditMode;
                  const baseKey = getBudgetParentKey(budget.concept || "");
                  let rowBg = CATEGORY_COLOR_MAP[baseKey] ?? undefined;
                  if (!rowBg && parentKeyForRow) {
                    rowBg = CATEGORY_COLOR_MAP[parentKeyForRow] ?? undefined;
                  }
                  const isParentRow =
                    isAllCapsConcept(budget.concept) &&
                    budgetParentMap[baseKey] !== undefined &&
                    !(isExternalCollab && externalCollabName);
                  const isExpandableParent =
                    isParentRow && (budgetParentMap[baseKey]?.length ?? 0) > 0;
                  const isParentCollapsed =
                    isExpandableParent && collapsedParents.has(baseKey);
                  const toggleParentRow = () => {
                    if (!isExpandableParent) return;
                    setCollapsedParents((prev) => {
                      const next = new Set(prev);
                      if (next.has(baseKey)) {
                        next.delete(baseKey);
                      } else {
                        next.add(baseKey);
                      }
                      return next;
                    });
                  };
                  const parentTotalsForRow = isParentRow
                    ? budgetParentTotals.get(baseKey)
                    : undefined;
                  const fallbackValues = {
                    h1,
                    h2,
                    j1: parentTotalsForRow?.j1 ?? j1,
                    j2: parentTotalsForRow?.j2 ?? j2,
                  };
                  const milestoneAmounts = milestonesToRender.map(
                    (milestone, idx) => {
                      // Para filas padre normales usamos los totales agregados
                      // de los hijos. En GASTOS GENERALES queremos permitir
                      // que el usuario introduzca los hitos manualmente, así
                      // que ignoramos parentMilestoneTotals.
                      if (isParentRow && hasDynamicMilestones && !isGeneralExpenses) {
                        return (
                          parentMilestoneTotals[baseKey]?.amount[idx] ?? 0
                        );
                      }
                      return resolveMilestoneValue(
                        budget,
                        milestone.id,
                        idx,
                        "amount",
                        fallbackValues,
                      );
                    },
                  );
                  const isPersonalCostRow =
                    rowKey === personalConceptKey ||
                    rowKey === normalizeConceptKey("Doctores") ||
                    rowKey === normalizeConceptKey("Titulados universitarios") ||
                    rowKey === normalizeConceptKey("No titulado");
                  const autoJustifiedValues = isPersonalCostRow
                    ? autoJustifiedForConcept(rowKey)
                    : null;
                  const milestoneJustified = milestonesToRender.map(
                    (milestone, idx) => {
                      if (autoJustifiedValues) {
                        return autoJustifiedValues[idx] ?? 0;
                      }
                      if (isParentRow && hasDynamicMilestones && !isGeneralExpenses) {
                        return (
                          parentMilestoneTotals[baseKey]?.justified[idx] ?? 0
                        );
                      }
                      return resolveMilestoneValue(
                        budget,
                        milestone.id,
                        idx,
                        "justified",
                        fallbackValues,
                      );
                    },
                  );
                  const approvedFromMilestones = milestoneAmounts.reduce(
                    (sum, value) => sum + Number(value || 0),
                    0,
                  );
                  // PRES. APROBADO se calcula automáticamente como suma de hitos.
                  // Si no hay hitos definidos, se usa el valor guardado.
                  const approved = milestonesToRender.length > 0
                    ? approvedFromMilestones
                    : Number(budget.approved_budget ?? 0);
                  const forecastedValue =
                    isParentRow && hasDynamicMilestones && !isGeneralExpenses
                      ? Number(parentMilestoneTotals[baseKey]?.forecast ?? 0)
                      : Number(
                          budgetDrafts[budget.id]?.forecasted_spent ??
                            budget.forecasted_spent ??
                            0,
                        );
                  const totalJustified = milestoneJustified.reduce(
                    (sum, value) => sum + Number(value || 0),
                    0,
                  );
                  const percentSpent =
                    approved > 0
                      ? isGeneralExpenses
                        ? generalPercent
                        : (totalJustified / approved) * 100
                      : 0;
                  const isExternalParent =
                    isExternalCollab && isParentRow && !externalCollabName;
                  const isExternalChild = isExternalCollab && !isExternalParent;
                  if (isParentRow && !rowBg) {
                    rowBg = "#e6f7e6";
                  }
                  const stableRowBg = rowBg ?? "transparent";
                  return (
                    <Tr
                      key={budget.id}
                      bg={stableRowBg}
                      _hover={{ bg: stableRowBg }}
                      _active={{ bg: stableRowBg }}
                    >
                      <Td>
                        {isGeneralExpenses ? (
                          canEditRow ? (
                            <HStack spacing={2} align="center">
                              {isExpandableParent && (
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  _hover={{ bg: "transparent" }}
                                  _active={{ bg: "transparent" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleParentRow();
                                  }}
                                >
                                  {isParentCollapsed ? "▸" : "▾"}
                                </Button>
                              )}
                              <Text fontWeight="semibold">
                                {GENERAL_EXPENSES_LABEL}
                              </Text>
                              <Select
                                size="sm"
                                maxW="120px"
                                bg="transparent"
                                _hover={{ bg: "transparent" }}
                                _focus={{ bg: "transparent" }}
                                value={generalMode}
                                onChange={(e) =>
                                  onGeneralExpensesModeChange(
                                    budget.id,
                                    e.target.value as "percent" | "amount",
                                  )
                                }
                              >
                                <option value="percent">%</option>
                                <option value="amount">Importe</option>
                              </Select>
                              {generalMode === "percent" ? (
                                <InputGroup size="sm" maxW="120px">
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    pattern="[0-9.,]*"
                                    defaultValue={formatPercentLabelValue(
                                      generalPercent,
                                    )}
                                    onBlur={(e) =>
                                      onGeneralExpensesPercent(
                                        budget.id,
                                        e.target.value,
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const target =
                                          e.target as HTMLInputElement;
                                        onGeneralExpensesPercent(
                                          budget.id,
                                          target.value,
                                        );
                                      }
                                    }}
                                  />
                                  <InputRightAddon>%</InputRightAddon>
                                </InputGroup>
                              ) : (
                                <InputGroup size="sm" maxW="140px">
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    pattern="[0-9.,]*"
                                    defaultValue={formatEuroValue(
                                      budgetDrafts[budget.id]
                                        ?.approved_budget ?? approved,
                                    )}
                                    onBlur={(e) =>
                                      onGeneralExpensesAmount(
                                        budget.id,
                                        e.target.value,
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const target =
                                          e.target as HTMLInputElement;
                                        onGeneralExpensesAmount(
                                          budget.id,
                                          target.value,
                                        );
                                      }
                                    }}
                                  />
                                  <InputRightAddon>€</InputRightAddon>
                                </InputGroup>
                              )}
                            </HStack>
                          ) : (
                            <HStack spacing={2} align="center">
                              {isExpandableParent && (
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  _hover={{ bg: "transparent" }}
                                  _active={{ bg: "transparent" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleParentRow();
                                  }}
                                >
                                  {isParentCollapsed ? "▸" : "▾"}
                                </Button>
                              )}
                              <Text fontWeight="semibold">
                                {formatGeneralExpensesConcept(generalPercent)}
                              </Text>
                            </HStack>
                          )
                        ) : isExternalCollab ? (
                          canEditRow ? (
                            isExternalParent ? (
                              <HStack spacing={2} align="center">
                                {isExpandableParent && (
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    _hover={{ bg: "transparent" }}
                                    _active={{ bg: "transparent" }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleParentRow();
                                    }}
                                  >
                                    {isParentCollapsed ? "▸" : "▾"}
                                  </Button>
                                )}
                                <Text fontWeight="semibold">
                                  {EXTERNAL_COLLAB_LABEL}
                                </Text>
                                <>
                                  <Select
                                    size="sm"
                                    maxW="240px"
                                    bg="transparent"
                                    _hover={{ bg: "transparent" }}
                                    _focus={{ bg: "transparent" }}
                                    value={externalCollabSelections[budget.id] ?? ""}
                                    onChange={(e) =>
                                      onExternalCollabSelectionChange(
                                        budget.id,
                                        e.target.value,
                                      )
                                    }
                                    isDisabled={isExternalCollaborationsLoading}
                                  >
                                    <option value="">
                                      {externalCollabSelectPlaceholder}
                                    </option>
                                    {externalCollaborations.map((item) => (
                                      <option
                                        key={item.id}
                                        value={`${item.collaboration_type}::${item.name}`}
                                      >
                                        {`${item.collaboration_type} - ${item.name}`}
                                      </option>
                                    ))}
                                  </Select>
                                  <Button
                                    size="xs"
                                    colorScheme="brand"
                                    onClick={() =>
                                      onAddExternalCollaborationRow(budget.id)
                                    }
                                    isDisabled={
                                      !externalCollabSelections[budget.id]
                                    }
                                  >
                                    +
                                  </Button>
                                </>
                              </HStack>
                            ) : (
                              <HStack spacing={2} align="center">
                                {isExpandableParent && (
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    _hover={{ bg: "transparent" }}
                                    _active={{ bg: "transparent" }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleParentRow();
                                    }}
                                  >
                                    {isParentCollapsed ? "▸" : "▾"}
                                  </Button>
                                )}
                                <Text fontWeight="semibold">
                                  {resolvedExternalType
                                    ? `${resolvedExternalType} - ${externalCollabName}`
                                    : externalCollabName || draftConcept}
                                </Text>
                              </HStack>
                            )
                          ) : (
                            <HStack spacing={2} align="center">
                              {isExpandableParent && (
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  _hover={{ bg: "transparent" }}
                                  _active={{ bg: "transparent" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleParentRow();
                                  }}
                                >
                                  {isParentCollapsed ? "▸" : "▾"}
                                </Button>
                              )}
                              <Text fontWeight="semibold">
                                {resolvedExternalType
                                  ? `${resolvedExternalType} - ${externalCollabName}`
                                  : externalCollabName ||
                                    draftConcept ||
                                    EXTERNAL_COLLAB_LABEL}
                              </Text>
                            </HStack>
                          )
                        ) : (
                          <HStack spacing={2} align="center">
                            {isExpandableParent && (
                              <Button
                                size="xs"
                                variant="ghost"
                                _hover={{ bg: "transparent" }}
                                _active={{ bg: "transparent" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleParentRow();
                                }}
                              >
                                {isParentCollapsed ? "▸" : "▾"}
                              </Button>
                            )}
                            <Editable
                              submitOnBlur
                              selectAllOnFocus
                              key={`concept-${budget.id}-${draftConcept}`}
                              defaultValue={draftConcept}
                              isDisabled={!budgetsEditMode}
                              onSubmit={(value) =>
                                onBudgetCellSave(budget.id, "concept", value)
                              }
                            >
                              <EditablePreview fontWeight="semibold" />
                              <EditableInput />
                            </Editable>
                          </HStack>
                        )}
                      </Td>
                      {milestonesToRender.map((milestone, idx) => {
                        const amountValue = milestoneAmounts[idx] ?? 0;
                        const justifiedValue = milestoneJustified[idx] ?? 0;
                        const canEditMilestone =
                          canEditRow &&
                          // Permitimos editar hitos en filas normales y,
                          // de forma especial, en GASTOS GENERALES aunque
                          // se consideren filas padre.
                          (!isParentRow || isGeneralExpenses || milestone.id <= 0);
                        return (
                          <React.Fragment key={`milestone-cell-${budget.id}-${milestone.id}`}>
                            <Td textAlign="center" bg={approvedColumnBg}>
                              <BudgetNumberCell
                                value={amountValue}
                                isEditing={canEditMilestone}
                                onSubmit={(value) => {
                                  if (milestone.id > 0) {
                                    onBudgetMilestoneChange(
                                      budget,
                                      milestone.id,
                                      "amount",
                                      value,
                                    );
                                    return;
                                  }
                                  const field = idx === 0 ? "hito1_budget" : "hito2_budget";
                                  onBudgetCellSave(budget.id, field, value);
                                }}
                              />
                            </Td>
                            <Td textAlign="center" bg={justifiedColumnBg}>
                              <BudgetNumberCell
                                value={justifiedValue}
                                isEditing={
                                  canEditMilestone &&
                                  !isPersonalCostRow &&
                                  (!isParentRow || isGeneralExpenses)
                                }
                                onSubmit={(value) => {
                                  if (milestone.id > 0) {
                                    onBudgetMilestoneChange(
                                      budget,
                                      milestone.id,
                                      "justified",
                                      value,
                                    );
                                    return;
                                  }
                                  const field =
                                    idx === 0 ? "justified_hito1" : "justified_hito2";
                                  onBudgetCellSave(budget.id, field, value);
                                }}
                              />
                            </Td>
                          </React.Fragment>
                        );
                      })}
                      <Td textAlign="center" bg={approvedBudgetColumnBg}>
                        <BudgetNumberCell
                          value={approved}
                          isEditing={false}
                          onSubmit={() => {}}
                        />
                      </Td>
                      <Td textAlign="center">
                        <Text fontFamily="mono">
                          {formatPercent(percentSpent)}
                        </Text>
                      </Td>
                      <Td textAlign="center">
                        <BudgetNumberCell
                          value={forecastedValue}
                          isEditing={canEditRow}
                          onSubmit={(value) =>
                            onBudgetCellSave(budget.id, "forecasted_spent", value)
                          }
                        />
                      </Td>
                      <Td>
                        {hasRealBudgets ? (
                          <Flex gap={2} flexWrap="wrap">
                            <Button
                              size="xs"
                              variant="outline"
                              isDisabled={!budgetsEditMode}
                              onClick={() => onOpenBudgetModal("edit", budget)}
                            >
                              Editar
                            </Button>
                            {isExternalChild && (
                              <Button
                                size="xs"
                                colorScheme="red"
                                variant="outline"
                                isDisabled={!budgetsEditMode}
                                onClick={() =>
                                  onRemoveExternalCollaborationRow(budget)
                                }
                              >
                                Eliminar
                              </Button>
                            )}
                          </Flex>
                        ) : (
                          <Text fontSize="xs" color="gray.500">
                            Añade presupuestos para editarlos aquí.
                          </Text>
                        )}
                      </Td>
                    </Tr>
                  );
                })
              )}
            </Tbody>
            <Tfoot>
              <Tr bg="rgba(196,116,255,0.15)" fontWeight="semibold">
                <Td textAlign="center">Total</Td>
                {totalsByMilestone.map((item, idx) => (
                  <React.Fragment key={`total-ms-${idx}`}>
                    <Td textAlign="center">
                      <EuroCell value={item.amount} />
                    </Td>
                    <Td textAlign="center">
                      <EuroCell value={item.justified} />
                    </Td>
                  </React.Fragment>
                ))}
                <Td textAlign="center">
                  <EuroCell value={totalApproved} />
                </Td>
                <Td />
                <Td textAlign="center">
                  <EuroCell value={totalForecasted} />
                </Td>
                <Td />
              </Tr>
              <Tr bg="rgba(196,116,255,0.2)" fontWeight="semibold">
                <Td textAlign="center">Diferencia (por justificar)</Td>
                {totalsByMilestone.map((item, idx) => (
                  <React.Fragment key={`diff-ms-${idx}`}>
                    <Td textAlign="center">
                      <EuroCell value={item.amount - item.justified} />
                    </Td>
                    <Td />
                  </React.Fragment>
                ))}
                <Td textAlign="center">
                  <EuroCell value={totalApproved - totalJustified} />
                </Td>
                <Td />
                <Td textAlign="center">
                  <EuroCell value={totalForecasted} />
                </Td>
                <Td />
              </Tr>
            </Tfoot>
          </Table>
        </Box>
      </Box>
    )}
    {selectedBudgetProjectId &&
      !budgetsQueryState.isFetching &&
      !budgetsQueryState.isError && (
        <Box borderWidth="1px" borderRadius="xl" overflow="hidden" bg="white">
          <Box px={4} py={3} borderBottomWidth="1px" borderColor="gray.200">
            <Heading size="sm">Detalle de personal del proyecto</Heading>
          </Box>
          {personnelRows.length === 0 ? (
            <Box p={4}>
              <Text color={subtleText} fontSize="sm">
                No hay imputaciones de personal para este proyecto.
              </Text>
            </Box>
          ) : (
            <Box overflowX="auto">
              <Table size="sm" minW="980px">
                <Thead bg="gray.100">
                  <Tr>
                    <Th color="black">Apellidos</Th>
                    <Th color="black">Nombre</Th>
                    {personnelYears.map((year, yearIndex) => {
                      const blockStyle = getPersonnelYearBlockStyle(yearIndex);
                      return (
                        <React.Fragment key={`personal-head-${year}`}>
                          <Th
                            color="black"
                            textAlign="right"
                            bg={blockStyle.headerBg}
                            borderLeftWidth="3px"
                            borderLeftColor={blockStyle.borderColor}
                          >
                            €/h {year}
                          </Th>
                          <Th color="black" textAlign="right" bg={blockStyle.headerBg}>
                            {year} (h)
                          </Th>
                          <Th color="black" textAlign="right" bg={blockStyle.headerBg}>
                            {year} (€)
                          </Th>
                        </React.Fragment>
                      );
                    })}
                    <Th color="black" textAlign="right">
                      Total (h)
                    </Th>
                    <Th color="black" textAlign="right">
                      Total (€)
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {personnelRows.map((row) => (
                    <Tr key={`personal-row-${row.employeeId}`}>
                      <Td>{row.lastName}</Td>
                      <Td>{row.firstName}</Td>
                      {personnelYears.map((year, yearIndex) => {
                        const blockStyle = getPersonnelYearBlockStyle(yearIndex);
                        const data = row.byYear[year] ?? {
                          hours: 0,
                          amount: 0,
                          hourlyRate: row.hourlyRate,
                        };
                        return (
                          <React.Fragment key={`personal-cell-${row.employeeId}-${year}`}>
                            <Td
                              textAlign="right"
                              bg={blockStyle.bodyBg}
                              borderLeftWidth="3px"
                              borderLeftColor={blockStyle.borderColor}
                            >
                              {formatEuroValue(data.hourlyRate)}
                            </Td>
                            <Td textAlign="right" bg={blockStyle.bodyBg}>
                              {data.hours.toFixed(0)} h
                            </Td>
                            <Td textAlign="right" bg={blockStyle.bodyBg}>
                              {formatEuroValue(data.amount)}
                            </Td>
                          </React.Fragment>
                        );
                      })}
                      <Td textAlign="right">{row.totalHours.toFixed(0)} h</Td>
                      <Td textAlign="right">{formatEuroValue(row.totalAmount)}</Td>
                    </Tr>
                  ))}
                </Tbody>
                <Tfoot>
                  <Tr bg="gray.100">
                    <Td colSpan={2} fontWeight="semibold">
                      Totales
                    </Td>
                    {personnelYears.map((year, yearIndex) => {
                      const blockStyle = getPersonnelYearBlockStyle(yearIndex);
                      const yearTotals = personnelTotals.byYear[year] ?? {
                        hours: 0,
                        amount: 0,
                      };
                      return (
                        <React.Fragment key={`personal-total-${year}`}>
                          <Td
                            textAlign="right"
                            bg={blockStyle.headerBg}
                            borderLeftWidth="3px"
                            borderLeftColor={blockStyle.borderColor}
                          >
                            —
                          </Td>
                          <Td textAlign="right" bg={blockStyle.headerBg}>
                            {yearTotals.hours.toFixed(0)} h
                          </Td>
                          <Td textAlign="right" bg={blockStyle.headerBg}>
                            {formatEuroValue(yearTotals.amount)}
                          </Td>
                        </React.Fragment>
                      );
                    })}
                    <Td textAlign="right" fontWeight="semibold">
                      {personnelTotals.totalHours.toFixed(0)} h
                    </Td>
                    <Td textAlign="right" fontWeight="semibold">
                      {formatEuroValue(personnelTotals.totalAmount)}
                    </Td>
                  </Tr>
                </Tfoot>
              </Table>
            </Box>
          )}
        </Box>
      )}
    </Stack>
  );
};






