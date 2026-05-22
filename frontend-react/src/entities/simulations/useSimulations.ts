import { useEffect, useMemo, useState } from "react";

import { useToast } from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createSimulationExpense,
  createSimulationProject,
  deleteSimulationExpense,
  deleteSimulationProject,
  fetchSimulations,
  updateSimulationExpense,
  updateSimulationProject,
  type SimulationExpense,
  type SimulationProject,
  type SimulationProjectUpdate,
} from "@api/simulations";
import { useDebouncedSave } from "../projects/useDebouncedSave";
import { onMutationError } from "@shared/utils/mutationError";

// Normaliza entrada numerica (admite "." y ",") y evita NaN.
const safeNumber = (value: string | number) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

type ProjectUpdateArgs = {
  projectId: number;
  payload: SimulationProjectUpdate;
};

type ExpenseUpdateArgs = {
  projectId: number;
  expenseId: number;
  payload: { concept?: string; amount?: number };
};

export const useSimulations = (tenantId?: number) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  // Cache por tenant para mantener aislamiento.
  const queryKey = useMemo(
    () => ["erp-simulations", tenantId ?? "all"],
    [tenantId],
  );

  // Carga inicial de simulaciones.
  const simulationsQuery = useQuery({
    queryKey,
    queryFn: () => fetchSimulations(tenantId),
  });

  const projects = simulationsQuery.data ?? [];
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  // Mantiene una seleccion valida al recargar lista.
  useEffect(() => {
    if (projects.length === 0) {
      setSelectedProjectId(null);
      return;
    }
    setSelectedProjectId((prev) => {
      if (prev && projects.some((project) => project.id === prev)) {
        return prev;
      }
      return projects[0]?.id ?? null;
    });
  }, [projects]);

  // Helper para actualizar cache local sin esperar refetch.
  const setProjectsCache = (
    updater: (prev: SimulationProject[]) => SimulationProject[],
  ) => {
    queryClient.setQueryData<SimulationProject[]>(queryKey, (prev = []) =>
      updater(prev),
    );
  };

  // Crear proyecto (persistencia en backend).
  const createProjectMutation = useMutation({
    mutationFn: (name: string) => createSimulationProject({ name }, tenantId),
    onSuccess: (project) => {
      setProjectsCache((prev) => [project, ...prev]);
      setSelectedProjectId(project.id);
    },
    onError: onMutationError(toast, "No se pudo crear la simulacion", "Intentalo de nuevo."),
  });

  // Eliminar proyecto.
  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: number) =>
      deleteSimulationProject(projectId, tenantId),
    onSuccess: (_, projectId) => {
      setProjectsCache((prev) => prev.filter((p) => p.id !== projectId));
    },
    onError: onMutationError(toast, "No se pudo eliminar la simulacion", "Intentalo de nuevo."),
  });

  // Actualizar proyecto (name, budget, subsidy).
  const updateProjectMutation = useMutation({
    mutationFn: ({ projectId, payload }: ProjectUpdateArgs) =>
      updateSimulationProject(projectId, payload, tenantId),
    onSuccess: (updated) => {
      setProjectsCache((prev) =>
        prev.map((project) => (project.id === updated.id ? updated : project)),
      );
    },
    onError: onMutationError(toast, "No se pudo guardar la simulacion", "Intentalo de nuevo."),
  });

  // Debounce para evitar demasiadas llamadas mientras se escribe.
  const updateProjectDebounced = useDebouncedSave<ProjectUpdateArgs>(
    async (payload) => {
      await updateProjectMutation.mutateAsync(payload);
    },
    700,
  );

  // Crear gasto.
  const createExpenseMutation = useMutation({
    mutationFn: ({ projectId }: { projectId: number }) =>
      createSimulationExpense(projectId, { concept: "Nuevo gasto", amount: 0 }, tenantId),
    onSuccess: (expense, variables) => {
      setProjectsCache((prev) =>
        prev.map((project) =>
          project.id === variables.projectId
            ? { ...project, expenses: [...project.expenses, expense] }
            : project,
        ),
      );
    },
    onError: onMutationError(toast, "No se pudo añadir el gasto", "Intentalo de nuevo."),
  });

  // Eliminar gasto.
  const deleteExpenseMutation = useMutation({
    mutationFn: ({
      projectId,
      expenseId,
    }: {
      projectId: number;
      expenseId: number;
    }) => deleteSimulationExpense(projectId, expenseId, tenantId),
    onSuccess: (_, variables) => {
      setProjectsCache((prev) =>
        prev.map((project) =>
          project.id === variables.projectId
            ? {
                ...project,
                expenses: project.expenses.filter(
                  (expense) => expense.id !== variables.expenseId,
                ),
              }
            : project,
        ),
      );
    },
    onError: onMutationError(toast, "No se pudo eliminar el gasto", "Intentalo de nuevo."),
  });

  // Actualizar gasto (concepto/importe).
  const updateExpenseMutation = useMutation({
    mutationFn: ({ projectId, expenseId, payload }: ExpenseUpdateArgs) =>
      updateSimulationExpense(projectId, expenseId, payload, tenantId),
    onSuccess: (expense, variables) => {
      setProjectsCache((prev) =>
        prev.map((project) =>
          project.id === variables.projectId
            ? {
                ...project,
                expenses: project.expenses.map((item) =>
                  item.id === expense.id ? expense : item,
                ),
              }
            : project,
        ),
      );
    },
    onError: onMutationError(toast, "No se pudo guardar el gasto", "Intentalo de nuevo."),
  });

  // Debounce para cambios de gastos.
  const updateExpenseDebounced = useDebouncedSave<ExpenseUpdateArgs>(
    async (payload) => {
      await updateExpenseMutation.mutateAsync(payload);
    },
    700,
  );

  // Para superadmin: obliga a seleccionar tenant antes de escribir.
  const ensureTenant = () => {
    if (tenantId) return true;
    toast({
      title: "Selecciona un tenant para guardar",
      status: "warning",
    });
    return false;
  };

  const addProject = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!ensureTenant()) return;
    createProjectMutation.mutate(trimmed);
  };

  const removeProject = (projectId: number) => {
    if (!ensureTenant()) return;
    deleteProjectMutation.mutate(projectId);
  };

  const updateProject = (projectId: number, patch: SimulationProjectUpdate) => {
    if (!ensureTenant()) return;
    // Optimista en cache y luego persistencia con debounce.
    setProjectsCache((prev) =>
      prev.map((project) =>
        project.id === projectId ? { ...project, ...patch } : project,
      ),
    );
    updateProjectDebounced({ projectId, payload: patch });
  };

  const addExpense = (projectId: number) => {
    if (!ensureTenant()) return;
    createExpenseMutation.mutate({ projectId });
  };

  const updateExpense = (
    projectId: number,
    expenseId: number,
    patch: Partial<SimulationExpense>,
  ) => {
    if (!ensureTenant()) return;
    // Optimista en cache y luego persistencia con debounce.
    setProjectsCache((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? {
              ...project,
              expenses: project.expenses.map((expense) =>
                expense.id === expenseId ? { ...expense, ...patch } : expense,
              ),
            }
          : project,
      ),
    );
    updateExpenseDebounced({
      projectId,
      expenseId,
      payload: {
        concept: patch.concept,
        amount: patch.amount,
      },
    });
  };

  const removeExpense = (projectId: number, expenseId: number) => {
    if (!ensureTenant()) return;
    deleteExpenseMutation.mutate({ projectId, expenseId });
  };

  const setProjectBudget = (projectId: number, value: string | number) => {
    const budget = Math.max(0, safeNumber(value));
    updateProject(projectId, { budget });
  };

  const setProjectSubsidyPercent = (
    projectId: number,
    value: string | number,
  ) => {
    const subsidyPercent = Math.max(0, Math.min(100, safeNumber(value)));
    updateProject(projectId, { subsidyPercent });
  };

  const setProjectThresholdPercent = (
    projectId: number,
    value: string | number,
  ) => {
    const thresholdPercent = Math.max(0, Math.min(100, safeNumber(value)));
    updateProject(projectId, { thresholdPercent });
  };

  const setExpenseAmount = (
    projectId: number,
    expenseId: number,
    value: string | number,
  ) => {
    const amount = Math.max(0, safeNumber(value));
    updateExpense(projectId, expenseId, { amount });
  };

  return {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    addProject,
    removeProject,
    updateProject,
    addExpense,
    updateExpense,
    removeExpense,
    setProjectBudget,
    setProjectSubsidyPercent,
    setProjectThresholdPercent,
    setExpenseAmount,
    isLoading: simulationsQuery.isLoading,
  };
};

export type { SimulationProject, SimulationExpense };
