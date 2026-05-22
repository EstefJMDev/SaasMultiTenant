import React, { useMemo } from "react";
import { Box, Button, Text, useColorModeValue } from "@chakra-ui/react";
import { useParams, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@widgets/app-shell/AppShell";
import { BudgetModal } from "@widgets/budget/BudgetModal";
import { BudgetSection } from "@widgets/budget/BudgetSection";
import { ProjectHero } from "@widgets/projects";
import { fetchErpProject, type ErpProject } from "@api/erpReports";
import { fetchMilestones, type ErpMilestone } from "@api/erpStructure";
import type { ProjectBudgetMilestone } from "@api/erpBudgets";
import { useBudgetEditor } from "@entities/projects";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { getParentPath } from "@shared/routing/parentPath";

export const ErpProjectBudgetPage: React.FC = () => {
  const { projectId } = useParams({ strict: false }) as { projectId?: string };
  const router = useRouter();
  const subtleText = useColorModeValue("gray.600", "gray.300");

  const numericProjectId = projectId ? Number(projectId) : NaN;
  const isValidProject = Number.isFinite(numericProjectId);

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = currentUser?.is_super_admin === true;
  const tenantId = currentUser?.tenant_id ?? null;
  const effectiveTenantId = isSuperAdmin ? undefined : tenantId ?? undefined;

  const projectQuery = useQuery<ErpProject>({
    queryKey: ["erp-project", numericProjectId, effectiveTenantId ?? "all"],
    queryFn: () => fetchErpProject(numericProjectId, effectiveTenantId),
    enabled: isValidProject,
  });

  const milestonesQuery = useQuery<ErpMilestone[]>({
    queryKey: [
      "erp-project-milestones",
      numericProjectId,
      effectiveTenantId ?? "all",
    ],
    queryFn: () => fetchMilestones({ projectId: numericProjectId }, effectiveTenantId),
    enabled: isValidProject,
  });

  const projectMilestones = milestonesQuery.data ?? [];
  const budgetTenantId =
    isSuperAdmin ? projectQuery.data?.tenant_id ?? undefined : tenantId ?? undefined;
  const budgetEditor = useBudgetEditor({
    projectId: isValidProject ? numericProjectId : null,
    projectMilestones,
    tenantId: budgetTenantId,
  });
  const budgetMilestonesForView: ProjectBudgetMilestone[] = useMemo(() => {
    if (budgetEditor.budgetMilestones.length > 0) {
      return budgetEditor.budgetMilestones;
    }
    if (!isValidProject || projectMilestones.length === 0) {
      return [];
    }
    return projectMilestones.map((milestone, idx) => ({
      id: -(idx + 1),
      project_id: numericProjectId,
      name: milestone.title || `Hito ${idx + 1}`,
      order_index: idx + 1,
      created_at: new Date().toISOString(),
    }));
  }, [
    budgetEditor.budgetMilestones,
    isValidProject,
    numericProjectId,
    projectMilestones,
  ]);

  const selectedProject: ErpProject | null = useMemo(() => {
    if (!projectQuery.data) return null;
    return projectQuery.data;
  }, [projectQuery.data]);

  return (
    <AppShell>
      <ProjectHero
        items={[]}
        title="Presupuesto del proyecto"
        subtitle={selectedProject?.name ?? "Gestiona el presupuesto del proyecto."}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const parent = getParentPath(router.state.location.pathname) ?? "/works";
              router.history.push(parent);
            }}
          >
            Volver
          </Button>
        }
      />

      {!isValidProject && (
        <Text color="red.500">Proyecto no válido.</Text>
      )}

      {isValidProject && (
        <BudgetSection
          projects={selectedProject ? [selectedProject] : []}
          budgetProjectFilter={String(numericProjectId)}
          onBudgetProjectChange={() => undefined}
          selectedBudgetProjectId={numericProjectId}
          budgetMilestonesCount={budgetMilestonesForView.length}
          budgetMilestones={budgetMilestonesForView}
          onAddBudgetMilestone={budgetEditor.addBudgetMilestone}
          onRemoveBudgetMilestone={budgetEditor.removeBudgetMilestone}
          budgetsEditMode={budgetEditor.budgetsEditMode}
          onToggleEditMode={async () => {
            if (budgetEditor.budgetsEditMode) {
              if (budgetEditor.hasBudgetDrafts) {
                const saved = await budgetEditor.handleBudgetSaveAll();
                if (!saved) return;
              }
              budgetEditor.setBudgetsEditMode(false);
              return;
            }
            budgetEditor.setBudgetsEditMode(true);
          }}
          canEditBudgets={budgetEditor.canEditBudgets}
          onSaveTable={budgetEditor.handleBudgetSaveAll}
          hasBudgetDrafts={budgetEditor.hasBudgetDrafts}
          savingBudgets={budgetEditor.savingBudgets}
          hasRealBudgets={budgetEditor.hasRealBudgets}
          onSeedTemplate={budgetEditor.seedTemplateBudgetLines}
          seedingTemplate={budgetEditor.seedingTemplate}
          budgetsQueryState={budgetEditor.budgetsQueryState}
          displayBudgetRows={budgetEditor.displayBudgetRows}
          groupedBudgetRows={budgetEditor.groupedBudgetRows}
          budgetDrafts={budgetEditor.budgetDrafts}
          generalExpensesMode={budgetEditor.generalExpensesMode}
          onGeneralExpensesModeChange={(budgetId, mode) =>
            budgetEditor.setGeneralExpensesMode((prev) => ({
              ...prev,
              [budgetId]: mode,
            }))
          }
          onGeneralExpensesPercent={budgetEditor.handleGeneralExpensesPercent}
          onGeneralExpensesAmount={budgetEditor.handleGeneralExpensesAmount}
          externalCollaborations={budgetEditor.externalCollaborations}
          isExternalCollaborationsLoading={
            budgetEditor.isExternalCollaborationsLoading
          }
          externalCollabSelections={budgetEditor.externalCollabSelections}
          onExternalCollabSelectionChange={(budgetId, value) =>
            budgetEditor.setExternalCollabSelections((prev) => ({
              ...prev,
              [budgetId]: value,
            }))
          }
          onAddExternalCollaborationRow={
            budgetEditor.handleAddExternalCollaborationRow
          }
          onBudgetCellSave={budgetEditor.handleBudgetCellSave}
          onBudgetMilestoneChange={budgetEditor.handleBudgetMilestoneChange}
          onOpenBudgetModal={budgetEditor.openBudgetModal}
          onRemoveExternalCollaborationRow={
            budgetEditor.handleRemoveExternalCollaborationRow
          }
          budgetParentMap={budgetEditor.budgetParentMap}
          budgetParentTotals={budgetEditor.budgetParentTotals}
          budgetsTabTotals={budgetEditor.budgetsTabTotals}
          personalJustifiedByConceptAndMilestoneKey={
            budgetEditor.personalJustifiedByConceptAndMilestoneKey ?? {}
          }
          personnelYears={budgetEditor.personnelYears ?? []}
          personnelRows={budgetEditor.personnelRows ?? []}
          subtleText={subtleText}
          externalCollabSelectPlaceholder="Selecciona colaborador"
        />
      )}

      <BudgetModal
        isOpen={budgetEditor.budgetModalOpen}
        onClose={budgetEditor.closeBudgetModal}
        onSave={budgetEditor.handleBudgetSave}
        initialValues={budgetEditor.budgetModalInitial}
        title={
          budgetEditor.budgetModalMode === "edit"
            ? "Editar presupuesto"
            : "Agregar presupuesto"
        }
        submitLabel={
          budgetEditor.budgetModalMode === "edit" ? "Actualizar" : "Guardar"
        }
        isSaving={budgetEditor.isBudgetModalSaving}
      />
    </AppShell>
  );
};

export default ErpProjectBudgetPage;
