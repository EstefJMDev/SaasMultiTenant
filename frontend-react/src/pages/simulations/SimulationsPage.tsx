import React from "react";

import {
  Box,
  Grid,
  GridItem,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useTranslation } from "react-i18next";

import { AppShell } from "@widgets/app-shell/AppShell";
import { ProjectHero } from "@widgets/projects";
import { SimulationPanel, SimulationsList } from "@widgets/simulations";
import { useEffectiveTenantId } from "@hooks/useEffectiveTenantId";
import { useSimulations } from "@entities/simulations";

export const ErpSimulationsPage: React.FC = () => {
  const { t } = useTranslation();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;
  const { tenantId, isSuperAdmin } = useEffectiveTenantId();

  const effectiveTenantId = tenantId ?? undefined;

  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    addProject,
    removeProject,
    addExpense,
    updateExpense,
    removeExpense,
    setProjectBudget,
    setProjectSubsidyPercent,
    setProjectThresholdPercent,
    setExpenseAmount,
    isLoading,
  } = useSimulations(effectiveTenantId);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  return (
    <AppShell>
      <ProjectHero
        items={[]}
        title={t("simulations.header.title")}
        subtitle={t("simulations.header.subtitle")}
        breadcrumb="Gestion de proyectos"
        animation={`${fadeUp} 0.6s ease-out`}
      />

      {isSuperAdmin && (
        <Box mb={6} bg={cardBg} borderWidth="1px" borderRadius="xl" p={4}>
          <Text fontSize="sm" color={subtleText}>
            {tenantId
              ? `Tenant activo: ${tenantId}.`
              : "No hay tenant seleccionado."}{" "}
            Cambia el tenant desde el selector superior.
          </Text>
        </Box>
      )}

      <Grid templateColumns={{ base: "1fr", lg: "320px 1fr" }} gap={6}>
        <GridItem>
          <Box bg={cardBg} borderWidth="1px" borderRadius="xl" p={4}>
            <SimulationsList
              projects={projects}
              selectedProjectId={selectedProjectId}
              onSelect={setSelectedProjectId}
              onAddProject={addProject}
              onRemoveProject={removeProject}
            />
          </Box>
        </GridItem>

        <GridItem>
          {isLoading ? (
            <Box bg={cardBg} borderWidth="1px" borderRadius="xl" p={6}>
              <Text color={subtleText}>Cargando simulaciones...</Text>
            </Box>
          ) : selectedProject ? (
            <SimulationPanel
              project={selectedProject}
              onBudgetChange={(value) => setProjectBudget(selectedProject.id, value)}
              onPercentChange={(value) =>
                setProjectSubsidyPercent(selectedProject.id, value)
              }
              onThresholdChange={(value) =>
                setProjectThresholdPercent(selectedProject.id, value)
              }
              onAddExpense={() => addExpense(selectedProject.id)}
              onExpenseConceptChange={(expenseId, value) =>
                updateExpense(selectedProject.id, expenseId, { concept: value })
              }
              onExpenseAmountChange={(expenseId, value) =>
                setExpenseAmount(selectedProject.id, expenseId, value)
              }
              onRemoveExpense={(expenseId) =>
                removeExpense(selectedProject.id, expenseId)
              }
            />
          ) : (
            <Box bg={cardBg} borderWidth="1px" borderRadius="xl" p={6}>
              <Text color={subtleText}>
                Selecciona un proyecto o crea una simulacion nueva.
              </Text>
            </Box>
          )}
        </GridItem>
      </Grid>
    </AppShell>
  );
};

export default ErpSimulationsPage;
