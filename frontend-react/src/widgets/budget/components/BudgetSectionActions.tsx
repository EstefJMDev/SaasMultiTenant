import React from "react";

import { Button, HStack, Select } from "@chakra-ui/react";

import type { ProjectBudgetMilestone } from "@api/erpBudgets";

interface BudgetSectionActionsProps {
  onAddBudgetMilestone: () => void;
  selectedBudgetProjectId: number | null;
  milestoneToRemove: string;
  setMilestoneToRemove: (value: string) => void;
  budgetMilestonesCount: number;
  hasRealBudgetMilestones: boolean;
  removableMilestones: ProjectBudgetMilestone[];
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
}

export const BudgetSectionActions: React.FC<BudgetSectionActionsProps> = ({
  onAddBudgetMilestone,
  selectedBudgetProjectId,
  milestoneToRemove,
  setMilestoneToRemove,
  budgetMilestonesCount,
  hasRealBudgetMilestones,
  removableMilestones,
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
}) => {
  return (
    <HStack spacing={2}>
      <Button
        size="sm"
        colorScheme="brand"
        onClick={onAddBudgetMilestone}
        isDisabled={!selectedBudgetProjectId}
      >
        + Hito
      </Button>
      <Select
        size="sm"
        minW="160px"
        maxW="220px"
        value={milestoneToRemove}
        onChange={(e) => setMilestoneToRemove(e.target.value)}
        isDisabled={
          !selectedBudgetProjectId ||
          budgetMilestonesCount === 0 ||
          !hasRealBudgetMilestones
        }
      >
        <option value="">Selecciona hito</option>
        {removableMilestones.map((milestone) => (
          <option key={milestone.id} value={String(milestone.id)}>
            {milestone.name?.trim() || `Hito ${milestone.order_index}`}
          </option>
        ))}
      </Select>
      <Button
        size="sm"
        variant="outline"
        colorScheme="red"
        onClick={() => {
          const id = Number(milestoneToRemove);
          if (!Number.isFinite(id) || id <= 0) return;
          onRemoveBudgetMilestone(id);
          setMilestoneToRemove("");
        }}
        isDisabled={
          !selectedBudgetProjectId ||
          budgetMilestonesCount === 0 ||
          !milestoneToRemove ||
          !hasRealBudgetMilestones
        }
      >
        Eliminar hito
      </Button>
      <Button
        size="sm"
        colorScheme={budgetsEditMode ? "orange" : "blue"}
        onClick={onToggleEditMode}
        isDisabled={!selectedBudgetProjectId || !canEditBudgets}
      >
        {budgetsEditMode ? "Cerrar edicion" : "Editar tabla"}
      </Button>
      {budgetsEditMode && (
        <Button
          size="sm"
          colorScheme="brand"
          onMouseDown={() => {
            const activeElement = document.activeElement as HTMLElement | null;
            if (activeElement && typeof activeElement.blur === "function") {
              activeElement.blur();
            }
          }}
          onClick={onSaveTable}
          isDisabled={!hasBudgetDrafts || savingBudgets}
          isLoading={savingBudgets}
        >
          Guardar tabla
        </Button>
      )}
      {!hasRealBudgets && (
        <Button
          size="sm"
          colorScheme="purple"
          onClick={onSeedTemplate}
          isDisabled={!selectedBudgetProjectId || seedingTemplate}
          isLoading={seedingTemplate}
        >
          Crear plantilla en proyecto
        </Button>
      )}
    </HStack>
  );
};
