import { useMemo, useState } from "react";
import {
  Box,
  HStack,
  IconButton,
  Text,
  Tooltip,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { ColumnDef } from "@tanstack/react-table";

import { fetchErpProjects } from "@api/erpReports";
import {
  createErpTask,
  deleteErpProject,
  updateErpProject,
} from "@api/erpManagement";
import { fetchErpTasks } from "@api/erpTimeTracking";
import {
  fetchActivities,
  fetchMilestones,
  fetchSubActivities,
  updateActivity,
  updateMilestone,
  updateSubActivity,
  createActivity,
  createSubActivity,
  createMilestone,
} from "@api/erpStructure";
import { useHrDepartments } from "@entities/hr";
import {
  useErpSummary,
  useGanttData,
  useProjectCreation,
  projectKeys,
} from "@entities/projects";
import type {
  ErpActivity,
  ErpMilestone,
  ErpProject as ErpProjectApi,
  ErpSubActivity,
  ErpTask as ErpTaskApi,
} from "@entities/projects";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { useErpProjectsModals } from "./useErpProjectsModals";
import { useEffectiveTenantId } from "@hooks/useEffectiveTenantId";
import { formatProjectDates } from "@pages/projects/ProjectsPage/utils/formatProjectDates";
import { normalizeSearch } from "../utils/erpProjects.format";
import {
  buildProjectUpdatePayload,
  resolveTenantIdForUpdate,
} from "../utils/erpProjects.mapper";

interface UseErpProjectsDataParams {
  selectedProjectId: string;
  projectSearch: string;
  projectStatusFilter: "all" | "active" | "inactive";
}

export const useErpProjectsData = ({
  selectedProjectId,
  projectSearch,
  projectStatusFilter,
}: UseErpProjectsDataParams) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: currentUser } = useCurrentUser();
  const { tenantId, tenantIdString, isSuperAdmin } = useEffectiveTenantId();
  const effectiveTenantId = tenantId ?? undefined;
  const tenantReady = Boolean(currentUser && tenantId);

  const projectsBaseKey = effectiveTenantId
    ? projectKeys.base(effectiveTenantId)
    : (["projects"] as const);

  const projectCreation = useProjectCreation({
    isSuperAdmin,
    tenantId: tenantId ?? undefined,
    selectedTenantId: tenantIdString ?? "",
  });

  const {
    data: projects = [],
    isLoading: isLoadingProjects,
    isError: isErrorProjects,
  } = useQuery<ErpProjectApi[]>({
    queryKey: projectKeys.list(effectiveTenantId),
    queryFn: () => fetchErpProjects(effectiveTenantId),
    enabled: tenantReady,
  });

  const departmentsQuery = useHrDepartments(effectiveTenantId, tenantReady);
  const departments = departmentsQuery.data ?? [];

  const visibleProjects = useMemo(() => {
    if (isSuperAdmin) return projects;
    if (!tenantId) return [];
    return projects.filter((project) => project.tenant_id === tenantId);
  }, [projects, isSuperAdmin, tenantId]);

  const departmentById = useMemo(() => {
    const map = new Map<number, string>();
    departments.forEach((dept) => {
      map.set(dept.id, dept.name);
    });
    return map;
  }, [departments]);

  const filteredProjects = useMemo(() => {
    const normalizedSearch = normalizeSearch(projectSearch);
    return visibleProjects.filter((project) => {
      const matchesSearch =
        !normalizedSearch ||
        project.name.toLowerCase().includes(normalizedSearch) ||
        (project.description ?? "").toLowerCase().includes(normalizedSearch) ||
        String(project.id).includes(normalizedSearch);

      const matchesStatus =
        projectStatusFilter === "all" ||
        (projectStatusFilter === "active" && project.is_active !== false) ||
        (projectStatusFilter === "inactive" && project.is_active === false);

      return matchesSearch && matchesStatus;
    });
  }, [projectSearch, projectStatusFilter, visibleProjects]);

  const { data: rawTasks = [] } = useQuery<ErpTaskApi[]>({
    queryKey: projectKeys.tasks(effectiveTenantId, "all"),
    queryFn: () => fetchErpTasks(effectiveTenantId),
    enabled: tenantReady,
  });

  const hrTenantId = effectiveTenantId ?? undefined;

  const { data: activities = [] } = useQuery<ErpActivity[]>({
    queryKey: projectKeys.activities(effectiveTenantId, "all"),
    queryFn: () => fetchActivities(undefined, effectiveTenantId),
    enabled: tenantReady,
  });

  const { data: subactivities = [] } = useQuery<ErpSubActivity[]>({
    queryKey: projectKeys.subactivities(effectiveTenantId, "all"),
    queryFn: () => fetchSubActivities({}, effectiveTenantId),
    enabled: tenantReady,
  });

  const { data: milestones = [] } = useQuery<ErpMilestone[]>({
    queryKey: projectKeys.milestones(effectiveTenantId, "all"),
    queryFn: () => fetchMilestones({}, effectiveTenantId),
    enabled: tenantReady,
  });

  const visibleProjectIds = useMemo(
    () => new Set(visibleProjects.map((project) => project.id)),
    [visibleProjects],
  );

  const visibleActivities = useMemo(
    () => activities.filter((activity) => visibleProjectIds.has(activity.project_id)),
    [activities, visibleProjectIds],
  );

  const visibleMilestones = useMemo(
    () => milestones.filter((milestone) => visibleProjectIds.has(milestone.project_id)),
    [milestones, visibleProjectIds],
  );

  const visibleTasks = useMemo(
    () =>
      rawTasks.filter(
        (task) => task.project_id && visibleProjectIds.has(task.project_id),
      ),
    [rawTasks, visibleProjectIds],
  );

  const visibleActivityIds = useMemo(
    () => new Set(visibleActivities.map((activity) => activity.id)),
    [visibleActivities],
  );

  const visibleSubactivities = useMemo(
    () => subactivities.filter((sub) => visibleActivityIds.has(sub.activity_id)),
    [subactivities, visibleActivityIds],
  );

  const {
    detailsOpen,
    isAddModalOpen,
    onCloseAddModal,
    selectedProject,
    setSelectedProject,
    openProjectDetails,
    closeProjectDetails,
    editName,
    setEditName,
    editDescription,
    setEditDescription,
    editProjectType,
    setEditProjectType,
    editDepartmentId,
    setEditDepartmentId,
    editStart,
    setEditStart,
    editEnd,
    setEditEnd,
    editLoanPercent,
    setEditLoanPercent,
    editSubsidyPercent,
    setEditSubsidyPercent,
    editActive,
    setEditActive,
    activityEdits,
    setActivityEdits,
    subactivityEdits,
    setSubactivityEdits,
    milestoneEdits,
    setMilestoneEdits,
    selectedProjectActivities,
    selectedProjectSubactivities,
    selectedProjectMilestones,
    selectedProjectTasks,
  } = useErpProjectsModals({
    activities: visibleActivities,
    subactivities: visibleSubactivities,
    milestones: visibleMilestones,
    rawTasks: visibleTasks,
    projects,
  });

  // --- Draft state para creación inline de actividades, subactividades e hitos ---
  const [newActivityDrafts, setNewActivityDrafts] = useState<
    Array<{ id: string; name: string; start: string; end: string; description: string }>
  >([]);

  const [newSubactivityDrafts, setNewSubactivityDrafts] = useState<
    Record<number, Array<{ id: string; name: string; start: string; end: string; description: string; weight: number }>>
  >({});

  const [newMilestoneDrafts, setNewMilestoneDrafts] = useState<
    Array<{ id: string; title: string; due: string; description: string }>
  >([]);
  const [newTaskDrafts, setNewTaskDrafts] = useState<
    Array<{
      id: string;
      title: string;
      description: string;
      start: string;
      end: string;
    }>
  >([]);

  const addNewActivityDraft = () => {
    setNewActivityDrafts((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", start: "", end: "", description: "" },
    ]);
  };

  const addNewSubactivityDraft = (activityId: number) => {
    setNewSubactivityDrafts((prev) => ({
      ...prev,
      [activityId]: [
        ...(prev[activityId] ?? []),
        { id: crypto.randomUUID(), name: "", start: "", end: "", description: "", weight: 0 },
      ],
    }));
  };

  const addNewMilestoneDraft = () => {
    setNewMilestoneDrafts((prev) => [
      ...prev,
      { id: crypto.randomUUID(), title: "", due: "", description: "" },
    ]);
  };

  const addNewTaskDraft = () => {
    setNewTaskDrafts((prev) => [
      ...prev,
      { id: crypto.randomUUID(), title: "", description: "", start: "", end: "" },
    ]);
  };

  const {
    summaryYear,
    setSummaryYear,
    allocationDraftsState,
    setAllocationDrafts,
    handleAllocationDraftChange,
    summarySearch,
    setSummarySearch,
    summaryEditMode,
    setSummaryEditMode,
    projectJustify,
    setProjectJustify,
    projectJustified,
    setProjectJustified,
    summaryMilestones,
    setSummaryMilestones,
    selectedEmployeeIds,
    departmentFilter,
    setDepartmentFilter,
    addDrawerDeptFilter,
    setAddDrawerDeptFilter,
    addDrawerSearch,
    setAddDrawerSearch,
    saveStatusLabel,
    saveErrorMessage,
    loadingSummaryYear,
    departmentAllocationPercentMap,
    departmentColorMap,
    departmentMap,
    allocationKey,
    allocationIndex,
    employeeAvailability,
    employeeDepartmentPercentages,
    filteredSummaryEmployees,
    employeesAvailableToAdd,
    handleAddEmployee,
    addMilestoneRow,
    handleAllocationBlur,
    pendingAllocationOverride,
    handleConfirmAllocationOverride,
    handleCancelAllocationOverride,
    hrEmployees,
    hrDepartments,
    allocations,
    employeesError,
    employeesErrorMsg,
    employeesLoading,
    departmentsError,
    departmentsErrorMsg,
    departmentsLoading,
  } = useErpSummary({
    hrTenantId,
    currentUserId: currentUser?.id,
  });

  const { ganttTasks, ganttProjects } = useGanttData({
    projects: visibleProjects,
    activities: visibleActivities,
    subactivities: visibleSubactivities,
    milestones: visibleMilestones,
    rawTasks: visibleTasks,
    selectedProjectId,
  });

  const projectColumns = useMemo(
    () =>
      visibleProjects.map((project) => ({
        id: project.id,
        name: project.name || "Proyecto",
      })),
    [visibleProjects],
  );

  const projectTableColumns = useMemo<ColumnDef<ErpProjectApi>[]>(
    () => [
      {
        header: "Proyecto",
        accessorKey: "name",
        cell: ({ row }) => {
          const description = row.original.description ?? "";
          return (
            <VStack align="start" spacing={0.5}>
              <Text fontWeight={600} noOfLines={1}>
                {row.original.name}
              </Text>
              <Tooltip label={description} isDisabled={!description} hasArrow>
                <Text fontSize="sm" color="gray.500" noOfLines={1} title={description}>
                  {description || "?"}
                </Text>
              </Tooltip>
            </VStack>
          );
        },
      },
      {
        header: "Estado",
        id: "status",
        cell: ({ row }) => {
          const isActive = row.original.is_active !== false;
          return (
            <HStack spacing={2} px={2.5} py={1} borderRadius="full" bg={isActive ? "brand.50" : "red.50"} display="inline-flex">
              <Box w="6px" h="6px" borderRadius="full" bg={isActive ? "brand.500" : "red.500"} />
              <Text fontSize="xs" fontWeight={600} color={isActive ? "brand.700" : "red.700"}>
                {isActive ? "Activo" : "Inactivo"}
              </Text>
            </HStack>
          );
        },
      },
      {
        header: "Departamento",
        id: "department",
        cell: ({ row }) => {
          const departmentName = departmentById.get(row.original.department_id ?? -1) ?? "";
          return (
            <Text fontSize="sm" color={departmentName ? "gray.700" : "gray.400"}>
              {departmentName || "?"}
            </Text>
          );
        },
      },
      {
        header: "Fechas",
        id: "dates",
        cell: ({ row }) => (
          <Text fontSize="sm" color="gray.600">
            {formatProjectDates({
              start_date: row.original.start_date,
              end_date: row.original.end_date,
            })}
          </Text>
        ),
      },
      {
        header: "",
        id: "actions",
        enableSorting: false,
        cell: ({ row }) => (
          <HStack spacing={1} justify="flex-end">
            <Tooltip label="Editar" hasArrow>
              <IconButton
                aria-label="Editar"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                }
                size="sm"
                variant="ghost"
                onClick={() => openProjectDetails(row.original)}
              />
            </Tooltip>
            <Tooltip label="Detalles" hasArrow>
              <IconButton
                aria-label="Detalles"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M9 13h6" />
                    <path d="M9 17h6" />
                    <path d="M9 9h2" />
                  </svg>
                }
                size="sm"
                variant="ghost"
                onClick={() => router.history.push(`/works/${row.original.id}/budget`)}
              />
            </Tooltip>
            <Tooltip label="Documentacion" hasArrow>
              <IconButton
                aria-label="Documentacion"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M16 13H8" />
                    <path d="M16 17H8" />
                  </svg>
                }
                size="sm"
                variant="ghost"
                onClick={() => router.history.push(`/works/${row.original.id}/documents`)}
              />
            </Tooltip>
          </HStack>
        ),
      },
    ],
    [departmentById, openProjectDetails, router.history],
  );

  const updateActivityMutation = useMutation({
    mutationFn: async (input: {
      id: number;
      payload: Parameters<typeof updateActivity>[1];
    }) => updateActivity(input.id, input.payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsBaseKey });
      toast({ title: "Actividad actualizada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al actualizar actividad",
        description:
          error?.response?.data?.detail ??
          "No se pudo actualizar la actividad.",
        status: "error",
      });
    },
  });

  const updateSubActivityMutation = useMutation({
    mutationFn: async (input: {
      id: number;
      payload: Parameters<typeof updateSubActivity>[1];
    }) => updateSubActivity(input.id, input.payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsBaseKey });
      toast({ title: "Subactividad actualizada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al actualizar subactividad",
        description:
          error?.response?.data?.detail ??
          "No se pudo actualizar la subactividad.",
        status: "error",
      });
    },
  });

  const updateMilestoneMutation = useMutation({
    mutationFn: async (input: {
      id: number;
      payload: Parameters<typeof updateMilestone>[1];
    }) => updateMilestone(input.id, input.payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsBaseKey });
      toast({ title: "Hito actualizado", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al actualizar hito",
        description:
          error?.response?.data?.detail ?? "No se pudo actualizar el hito.",
        status: "error",
      });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProject) {
        throw new Error("No hay proyecto seleccionado");
      }
      return deleteErpProject(selectedProject.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: projectsBaseKey,
      });
      setSelectedProject(null);
      closeProjectDetails();
      toast({ title: "Proyecto eliminado", status: "success" });
    },
    onError: async (error: any) => {
      if (error?.response?.status === 405 && selectedProject) {
        try {
          const tenantIdForUpdate =
            selectedProject.tenant_id ??
            projects.find((project) => project.id === selectedProject.id)?.tenant_id ??
            undefined;
          await updateErpProject(
            selectedProject.id,
            { is_active: false },
            tenantIdForUpdate,
          );

          await queryClient.invalidateQueries({
            queryKey: projectsBaseKey,
          });

          toast({
            title: "Proyecto desactivado",
            description:
              "El backend no permite eliminar; se marco como inactivo.",
            status: "info",
          });

          setSelectedProject(null);
          closeProjectDetails();
          return;
        } catch (fallbackError: any) {
          toast({
            title: "Error al desactivar",
            description:
              fallbackError?.response?.data?.detail ??
              "No se pudo desactivar el proyecto despues del 405.",
            status: "error",
          });
          return;
        }
      }

      toast({
        title: "Error al eliminar",
        description:
          error?.response?.data?.detail ?? "No se pudo eliminar el proyecto.",
        status: "error",
      });
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProject) {
        throw new Error("No hay proyecto seleccionado");
      }
      const tenantIdForUpdate = resolveTenantIdForUpdate({
        isSuperAdmin,
        tenantId,
        selectedProject,
        projects,
      });
      const payload = buildProjectUpdatePayload({
        editName,
        editDescription,
        editProjectType,
        editDepartmentId,
        editStart,
        editEnd,
        editLoanPercent,
        editSubsidyPercent,
        editActive,
      });

      try {
        return await updateErpProject(
          selectedProject.id,
          {
            ...payload,
            project_type: payload.project_type as "regional" | "nacional" | "internacional" | null | undefined,
          },
          tenantIdForUpdate,
        );
      } catch (error: any) {
        if (error?.response?.status === 404 && tenantIdForUpdate != null && isSuperAdmin) {
          return updateErpProject(selectedProject.id, {
            ...payload,
            project_type: payload.project_type as "regional" | "nacional" | "internacional" | null | undefined,
          });
        }
        throw error;
      }
    },
    onSuccess: async (project) => {
      setSelectedProject(project);
      await queryClient.invalidateQueries({
        queryKey: projectsBaseKey,
      });
      toast({ title: "Proyecto actualizado", status: "success" });
    },
    onError: async (error: any) => {
      if (error?.response?.status === 404) {
        await queryClient.invalidateQueries({
          queryKey: projectsBaseKey,
        });
        setSelectedProject(null);
        closeProjectDetails();
        toast({
          title: "Proyecto no encontrado",
          description: "El proyecto ya no existe o no tienes acceso.",
          status: "warning",
        });
        return;
      }
      toast({
        title: "Error al actualizar",
        description:
          error?.response?.data?.detail ?? "No se pudo actualizar el proyecto.",
        status: "error",
      });
    },
  });

  const handleUpdateProject = () => {
    if (!selectedProject) {
      toast({ title: "Selecciona un proyecto", status: "warning" });
      return;
    }
    if (!editName.trim()) {
      toast({ title: "Nombre requerido", status: "warning" });
      return;
    }
    updateProjectMutation.mutate();
  };

  const handleDeleteProject = () => {
    if (!selectedProject) {
      toast({ title: "Selecciona un proyecto", status: "warning" });
      return;
    }
    deleteProjectMutation.mutate();
  };

  // --- Mutations de creación ---
  const createActivityMutation = useMutation({
    mutationFn: async (payload: Parameters<typeof createActivity>[0]) =>
      createActivity(payload, effectiveTenantId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsBaseKey });
      toast({ title: "Actividad creada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al crear actividad",
        description: error?.response?.data?.detail ?? "No se pudo crear la actividad.",
        status: "error",
      });
    },
  });

  const createSubActivityMutation = useMutation({
    mutationFn: async (payload: Parameters<typeof createSubActivity>[0]) =>
      createSubActivity(payload, effectiveTenantId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsBaseKey });
      toast({ title: "Subactividad creada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al crear subactividad",
        description: error?.response?.data?.detail ?? "No se pudo crear la subactividad.",
        status: "error",
      });
    },
  });

  const createMilestoneMutation = useMutation({
    mutationFn: async (payload: Parameters<typeof createMilestone>[0]) =>
      createMilestone(payload, effectiveTenantId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsBaseKey });
      toast({ title: "Hito creado", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al crear hito",
        description: error?.response?.data?.detail ?? "No se pudo crear el hito.",
        status: "error",
      });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (payload: Parameters<typeof createErpTask>[0]) =>
      createErpTask(payload, effectiveTenantId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsBaseKey });
      toast({ title: "Tarea creada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al crear tarea",
        description: error?.response?.data?.detail ?? "No se pudo crear la tarea.",
        status: "error",
      });
    },
  });

  const handleCreateActivity = (draftId: string) => {
    if (!selectedProject) return;
    const draft = newActivityDrafts.find((d) => d.id === draftId);
    if (!draft) return;
    createActivityMutation.mutate(
      {
        project_id: selectedProject.id,
        name: draft.name.trim() || "Nueva actividad",
        description: draft.description.trim() || null,
        start_date: draft.start || null,
        end_date: draft.end || null,
      },
      {
        onSuccess: () => {
          setNewActivityDrafts((prev) => prev.filter((d) => d.id !== draftId));
        },
      },
    );
  };

  const handleCreateSubactivity = (activityId: number, draftId: string) => {
    const draft = newSubactivityDrafts[activityId]?.find((d) => d.id === draftId);
    if (!draft) return;
    createSubActivityMutation.mutate(
      {
        activity_id: activityId,
        name: draft.name.trim() || "Nueva subactividad",
        description: draft.description.trim() || null,
        start_date: draft.start || null,
        end_date: draft.end || null,
      },
      {
        onSuccess: () => {
          setNewSubactivityDrafts((prev) => ({
            ...prev,
            [activityId]: (prev[activityId] ?? []).filter((d) => d.id !== draftId),
          }));
        },
      },
    );
  };

  const handleCreateMilestone = (draftId: string) => {
    if (!selectedProject) return;
    const draft = newMilestoneDrafts.find((d) => d.id === draftId);
    if (!draft) return;
    createMilestoneMutation.mutate(
      {
        project_id: selectedProject.id,
        title: draft.title.trim() || "Nuevo hito",
        description: draft.description.trim() || null,
        due_date: draft.due || null,
      },
      {
        onSuccess: () => {
          setNewMilestoneDrafts((prev) => prev.filter((d) => d.id !== draftId));
        },
      },
    );
  };

  const handleCreateTask = (draftId: string) => {
    if (!selectedProject) return;
    const draft = newTaskDrafts.find((d) => d.id === draftId);
    if (!draft) return;

    createTaskMutation.mutate(
      {
        project_id: selectedProject.id,
        title: draft.title.trim() || "Nueva tarea",
        description: draft.description.trim() || null,
        start_date: draft.start || null,
        end_date: draft.end || null,
        status: "pending",
        is_completed: false,
      },
      {
        onSuccess: () => {
          setNewTaskDrafts((prev) => prev.filter((d) => d.id !== draftId));
        },
      },
    );
  };

  const handleUpdateActivity = (id: number) => {
    const form = activityEdits[id];
    if (!form) return;
    updateActivityMutation.mutate({
      id,
      payload: {
        name: form.name.trim() || "Actividad",
        description: form.description.trim() || null,
        start_date: form.start || null,
        end_date: form.end || null,
      },
    });
  };

  const handleUpdateSubactivity = (id: number) => {
    const form = subactivityEdits[id];
    if (!form) return;
    updateSubActivityMutation.mutate({
      id,
      payload: {
        name: form.name.trim() || "Subactividad",
        description: form.description.trim() || null,
        start_date: form.start || null,
        end_date: form.end || null,
      },
    });
  };

  const handleUpdateMilestone = (id: number) => {
    const form = milestoneEdits[id];
    if (!form) return;
    updateMilestoneMutation.mutate({
      id,
      payload: {
        title: form.title.trim() || "Hito",
        description: form.description.trim() || null,
        due_date: form.due || null,
      },
    });
  };

  return {
    currentUser,
    tenantId,
    tenantIdString,
    isSuperAdmin,
    effectiveTenantId,
    tenantReady,
    projectsBaseKey,
    queryClient,
    projectCreation,
    projects,
    isLoadingProjects,
    isErrorProjects,
    departmentsQuery,
    departments,
    visibleProjects,
    departmentById,
    filteredProjects,
    rawTasks,
    activities,
    subactivities,
    milestones,
    visibleActivities,
    visibleSubactivities,
    visibleMilestones,
    visibleTasks,
    hrTenantId,
    summaryYear,
    setSummaryYear,
    allocationDraftsState,
    setAllocationDrafts,
    handleAllocationDraftChange,
    summarySearch,
    setSummarySearch,
    summaryEditMode,
    setSummaryEditMode,
    projectJustify,
    setProjectJustify,
    projectJustified,
    setProjectJustified,
    summaryMilestones,
    setSummaryMilestones,
    selectedEmployeeIds,
    departmentFilter,
    setDepartmentFilter,
    addDrawerDeptFilter,
    setAddDrawerDeptFilter,
    addDrawerSearch,
    setAddDrawerSearch,
    saveStatusLabel,
    saveErrorMessage,
    loadingSummaryYear,
    departmentAllocationPercentMap,
    departmentColorMap,
    departmentMap,
    allocationKey,
    allocationIndex,
    employeeAvailability,
    employeeDepartmentPercentages,
    filteredSummaryEmployees,
    employeesAvailableToAdd,
    handleAddEmployee,
    addMilestoneRow,
    handleAllocationBlur,
    pendingAllocationOverride,
    handleConfirmAllocationOverride,
    handleCancelAllocationOverride,
    hrEmployees,
    hrDepartments,
    allocations,
    employeesError,
    employeesErrorMsg,
    employeesLoading,
    departmentsError,
    departmentsErrorMsg,
    departmentsLoading,
    ganttTasks,
    ganttProjects,
    projectColumns,
    projectTableColumns,
    detailsOpen,
    isAddModalOpen,
    onCloseAddModal,
    selectedProject,
    setSelectedProject,
    openProjectDetails,
    closeProjectDetails,
    editName,
    setEditName,
    editDescription,
    setEditDescription,
    editProjectType,
    setEditProjectType,
    editDepartmentId,
    setEditDepartmentId,
    editStart,
    setEditStart,
    editEnd,
    setEditEnd,
    editLoanPercent,
    setEditLoanPercent,
    editSubsidyPercent,
    setEditSubsidyPercent,
    editActive,
    setEditActive,
    activityEdits,
    setActivityEdits,
    subactivityEdits,
    setSubactivityEdits,
    milestoneEdits,
    setMilestoneEdits,
    selectedProjectActivities,
    selectedProjectSubactivities,
    selectedProjectMilestones,
    selectedProjectTasks,
    updateActivityMutation,
    updateSubActivityMutation,
    updateMilestoneMutation,
    deleteProjectMutation,
    updateProjectMutation,
    createActivityMutation,
    createSubActivityMutation,
    createMilestoneMutation,
    createTaskMutation,
    handleUpdateProject,
    handleDeleteProject,
    handleUpdateActivity,
    handleUpdateSubactivity,
    handleUpdateMilestone,
    handleCreateActivity,
    handleCreateSubactivity,
    handleCreateMilestone,
    handleCreateTask,
    newActivityDrafts,
    setNewActivityDrafts,
    newSubactivityDrafts,
    setNewSubactivityDrafts,
    newMilestoneDrafts,
    setNewMilestoneDrafts,
    newTaskDrafts,
    setNewTaskDrafts,
    addNewActivityDraft,
    addNewSubactivityDraft,
    addNewMilestoneDraft,
    addNewTaskDraft,
  };
};

