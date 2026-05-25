import { useMemo, useState } from "react";
import { useToast } from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction, i18n as I18n } from "i18next";

import { fetchErpProjects, type ErpProject } from "@api/erpReports";
import {
  createErpTask,
  deleteErpTask,
  updateErpTask,
  type ErpTaskCreate,
} from "@api/erpManagement";
import { fetchErpTasks, type ErpTask } from "@api/erpTimeTracking";
import { fetchUsersByTenant, type TenantUserSummary } from "@api/users";
import {
  fetchActivities,
  fetchSubActivities,
  type ErpActivity,
  type ErpSubActivity,
} from "@api/erpStructure";
import { projectKeys } from "@entities/projects";
import { formatTaskDateTime as formatTaskDateTimeBase } from "../utils/tasks.format";
import { getTaskStatus, type KanbanStatus } from "../utils/tasks.mapper";

interface UseErpTasksDataParams {
  t: TFunction;
  i18n: I18n;
  tenantId?: number;
  effectiveTenantId?: number;
  currentUserId: number | null;
  taskTitle: string;
  taskDescription: string;
  taskProjectId: string;
  taskSubactivityId: string;
  taskAssigneeId: string;
  taskStartDate: string;
  taskEndDate: string;
  setTaskTitle: (value: string) => void;
  setTaskDescription: (value: string) => void;
  setTaskProjectId: (value: string) => void;
  setTaskSubactivityId: (value: string) => void;
  setTaskAssigneeId: (value: string) => void;
  setTaskStartDate: (value: string) => void;
  setTaskEndDate: (value: string) => void;
  setCreateModalOpen: (value: boolean) => void;
  quickAddTitle: string;
  quickAddDescription: string;
  quickAddProjectId: string;
  quickAddSubactivityId: string;
  quickAddAssigneeId: string;
  quickAddStartDate: string;
  quickAddEndDate: string;
  quickAddStatus: KanbanStatus;
  setQuickAddTitle: (value: string) => void;
  setQuickAddDescription: (value: string) => void;
  setQuickAddProjectId: (value: string) => void;
  setQuickAddSubactivityId: (value: string) => void;
  setQuickAddAssigneeId: (value: string) => void;
  setQuickAddStartDate: (value: string) => void;
  setQuickAddEndDate: (value: string) => void;
  setQuickAddOpen: (value: boolean) => void;
  editTaskId: number | null;
  editTitle: string;
  editDescription: string;
  editProjectId: string;
  editSubactivityId: string;
  editAssigneeId: string;
  editStartDate: string;
  editEndDate: string;
  editStatus: KanbanStatus;
  setEditOpen: (value: boolean) => void;
  setSelectedTask: (value: ErpTask | null) => void;
  setViewTask: (value: ErpTask | null) => void;
}

export const useErpTasksData = ({
  t,
  i18n,
  tenantId,
  effectiveTenantId,
  currentUserId,
  taskTitle,
  taskDescription,
  taskProjectId,
  taskSubactivityId,
  taskAssigneeId,
  taskStartDate,
  taskEndDate,
  setTaskTitle,
  setTaskDescription,
  setTaskProjectId,
  setTaskSubactivityId,
  setTaskAssigneeId,
  setTaskStartDate,
  setTaskEndDate,
  setCreateModalOpen,
  quickAddTitle,
  quickAddDescription,
  quickAddProjectId,
  quickAddSubactivityId,
  quickAddAssigneeId,
  quickAddStartDate,
  quickAddEndDate,
  quickAddStatus,
  setQuickAddTitle,
  setQuickAddDescription,
  setQuickAddProjectId,
  setQuickAddSubactivityId,
  setQuickAddAssigneeId,
  setQuickAddStartDate,
  setQuickAddEndDate,
  setQuickAddOpen,
  editTaskId,
  editTitle,
  editDescription,
  editProjectId,
  editSubactivityId,
  editAssigneeId,
  editStartDate,
  editEndDate,
  editStatus,
  setEditOpen,
  setSelectedTask,
  setViewTask,
}: UseErpTasksDataParams) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [deletedTaskIds, setDeletedTaskIds] = useState<number[]>([]);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<
    Record<number, KanbanStatus>
  >({});

  const projectsBaseKey = effectiveTenantId
    ? projectKeys.base(effectiveTenantId)
    : (["projects"] as const);
  const tasksKey = projectKeys.tasks(effectiveTenantId, "all");

  const { data: projects } = useQuery<ErpProject[]>({
    queryKey: projectKeys.list(effectiveTenantId),
    queryFn: () => fetchErpProjects(effectiveTenantId),
  });

  const { data: activities = [] } = useQuery<ErpActivity[]>({
    queryKey: projectKeys.activities(effectiveTenantId, "all"),
    queryFn: () => fetchActivities(undefined, effectiveTenantId),
  });

  const { data: tasks } = useQuery<ErpTask[]>({
    queryKey: projectKeys.tasks(effectiveTenantId, "all"),
    queryFn: () => fetchErpTasks(effectiveTenantId),
  });

  const { data: subactivities = [] } = useQuery<ErpSubActivity[]>({
    queryKey: projectKeys.subactivities(effectiveTenantId, "all"),
    queryFn: () => fetchSubActivities({}, effectiveTenantId),
  });

  const { data: users } = useQuery<TenantUserSummary[]>({
    queryKey: ["tenant-users", tenantId],
    queryFn: () => fetchUsersByTenant(tenantId ?? 0),
    enabled: tenantId !== undefined,
  });

  const allTasks = useMemo(
    () =>
      (tasks ?? []).filter(
        (t) =>
          t.status?.toLowerCase() !== "deleted" &&
          !deletedTaskIds.includes(t.id),
      ),
    [tasks, deletedTaskIds],
  );

  const userMap = useMemo(() => {
    const map = new Map<number, string>();
    (users ?? []).forEach((user) => {
      map.set(user.id, user.full_name || user.email);
    });
    return map;
  }, [users]);

  const projectMap = useMemo(() => {
    const map = new Map<number, string>();
    (projects ?? []).forEach((project) => {
      map.set(project.id, project.name);
    });
    return map;
  }, [projects]);

  const subactivitiesByProject = useMemo(() => {
    const map = new Map<number, ErpSubActivity[]>();
    subactivities.forEach((sub) => {
      const parentActivity = activities.find((act) => act.id === sub.activity_id);
      if (!parentActivity) return;
      const key = parentActivity.project_id;
      const arr = map.get(key) ?? [];
      arr.push(sub);
      map.set(key, arr);
    });
    return map;
  }, [subactivities, activities]);

  const assignedTasks = useMemo(() => {
    if (!currentUserId) return [];
    return allTasks.filter((task) => task.assigned_to_id === currentUserId);
  }, [allTasks, currentUserId]);

  const taskCount = allTasks.length;
  const assignedCount = assignedTasks.length;

  const createTaskMutation = useMutation({
    mutationFn: (payload: ErpTaskCreate) =>
      createErpTask(payload, effectiveTenantId),
    onSuccess: async () => {
      setTaskTitle("");
      setTaskDescription("");
      setTaskProjectId("");
      setTaskAssigneeId("");
      setTaskStartDate("");
      setTaskEndDate("");
      setTaskSubactivityId("");
      setCreateModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: projectsBaseKey });
      toast({
        title: t("erp.tasks.messages.createSuccess"),
        status: "success",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("erp.tasks.messages.createErrorTitle"),
        description:
          error?.response?.data?.detail ??
          t("erp.tasks.messages.createErrorFallback"),
        status: "error",
      });
    },
  });

  const quickCreateTaskMutation = useMutation({
    mutationFn: (payload: ErpTaskCreate) =>
      createErpTask(payload, effectiveTenantId),
    onSuccess: async () => {
      setQuickAddTitle("");
      setQuickAddDescription("");
      setQuickAddProjectId("");
      setQuickAddAssigneeId("");
      setQuickAddStartDate("");
      setQuickAddEndDate("");
      setQuickAddOpen(false);
      await queryClient.invalidateQueries({ queryKey: projectsBaseKey });
      toast({
        title: t("erp.tasks.messages.createSuccess"),
        status: "success",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("erp.tasks.messages.createErrorTitle"),
        description:
          error?.response?.data?.detail ??
          t("erp.tasks.messages.createErrorFallback"),
        status: "error",
      });
    },
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: async (payload: { taskId: number; status: KanbanStatus }) => {
      await updateErpTask(
        payload.taskId,
        { status: payload.status },
        effectiveTenantId,
      );
    },
    onError: (error: any, variables) => {
      setOptimisticStatus((prev) => {
        const next = { ...prev };
        delete next[variables.taskId];
        return next;
      });
      toast({
        title: t("erp.tasks.messages.moveErrorTitle"),
        description:
          error?.response?.data?.detail ??
          t("erp.tasks.messages.moveErrorFallback"),
        status: "error",
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsBaseKey });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async () => {
      if (!editTaskId) return;
      await updateErpTask(
        editTaskId,
        {
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          project_id: editProjectId ? Number(editProjectId) : null,
          subactivity_id: editSubactivityId ? Number(editSubactivityId) : null,
          assigned_to_id: editAssigneeId ? Number(editAssigneeId) : null,
          start_date: editStartDate || null,
          end_date: editEndDate || null,
          status: editStatus,
        },
        effectiveTenantId,
      );
    },
    onSuccess: async () => {
      setEditOpen(false);
      await queryClient.invalidateQueries({ queryKey: projectsBaseKey });
      toast({
        title: t("erp.tasks.messages.updateSuccess"),
        status: "success",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("erp.tasks.messages.updateErrorTitle"),
        description:
          error?.response?.data?.detail ??
          t("erp.tasks.messages.updateErrorFallback"),
        status: "error",
      });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: number) => deleteErpTask(taskId),
    onSuccess: async (_data, taskId) => {
      setSelectedTask(null);
      setViewTask(null);
      setEditOpen(false);
      setDeletedTaskIds((prev) => [...prev, taskId]);
      queryClient.setQueryData<ErpTask[]>(tasksKey, (prev) =>
        prev ? prev.filter((task) => task.id !== taskId) : prev,
      );
      await queryClient.invalidateQueries({ queryKey: projectsBaseKey });
      const deleteOk = t("erp.tasks.messages.deleteSuccess");
      toast({
        title:
          deleteOk && deleteOk !== "erp.tasks.messages.deleteSuccess"
            ? deleteOk
            : "Tarea eliminada",
        status: "success",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("erp.tasks.messages.deleteError") || "Error al eliminar tarea",
        description:
          error?.response?.data?.detail ??
          t("erp.tasks.messages.deleteErrorFallback") ??
          "No se pudo eliminar la tarea.",
        status: "error",
      });
    },
  });

  const handleCreateTask = () => {
    if (!taskTitle.trim()) {
      toast({
        title: t("erp.tasks.messages.titleRequired"),
        status: "warning",
      });
      return;
    }

    const payload: ErpTaskCreate = {
      title: taskTitle.trim(),
      description: taskDescription.trim() || null,
      project_id: taskProjectId ? Number(taskProjectId) : null,
      subactivity_id: taskSubactivityId ? Number(taskSubactivityId) : null,
      assigned_to_id: taskAssigneeId ? Number(taskAssigneeId) : null,
      start_date: taskStartDate || null,
      end_date: taskEndDate || null,
    };

    createTaskMutation.mutate(payload);
  };

  const handleQuickAdd = () => {
    if (!quickAddTitle.trim()) {
      toast({
        title: t("erp.tasks.messages.titleRequired"),
        status: "warning",
      });
      return;
    }

    const payload: ErpTaskCreate = {
      title: quickAddTitle.trim(),
      description: quickAddDescription.trim() || null,
      project_id: quickAddProjectId ? Number(quickAddProjectId) : null,
      subactivity_id: quickAddSubactivityId
        ? Number(quickAddSubactivityId)
        : null,
      assigned_to_id: quickAddAssigneeId ? Number(quickAddAssigneeId) : null,
      start_date: quickAddStartDate || null,
      end_date: quickAddEndDate || null,
      status: quickAddStatus,
    };

    quickCreateTaskMutation.mutate(payload);
  };

  const tasksByStatus = useMemo(() => {
    const groups: Record<KanbanStatus, ErpTask[]> = {
      pending: [],
      in_progress: [],
      done: [],
    };
    allTasks.forEach((task) => {
      const status = optimisticStatus[task.id] ?? getTaskStatus(task);
      groups[status].push(task);
    });
    return groups;
  }, [allTasks, optimisticStatus]);

  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    taskId: number,
  ) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(taskId));
    setDraggedTaskId(taskId);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverStatus(null);
  };

  const handleDragOver =
    (status: KanbanStatus) => (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOverStatus(status);
    };

  const handleDrop =
    (status: KanbanStatus) => (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const rawId = event.dataTransfer.getData("text/plain");
      const taskId = Number(rawId);
      if (!taskId) return;
      const task = (tasks ?? []).find((item) => item.id === taskId);
      if (!task) return;
      const currentStatus = optimisticStatus[taskId] ?? getTaskStatus(task);
      if (currentStatus === status) return;
      setOptimisticStatus((prev) => ({ ...prev, [taskId]: status }));
      updateTaskStatusMutation.mutate({ taskId, status });
      setDragOverStatus(null);
    };

  const kanbanColumns: { id: KanbanStatus; label: string; color: string }[] =
    useMemo(
      () => [
        { id: "pending", label: t("erp.tasks.status.pending"), color: "gray" },
        {
          id: "in_progress",
          label: t("erp.tasks.status.inProgress"),
          color: "orange",
        },
        { id: "done", label: t("erp.tasks.status.done"), color: "brand" },
      ],
      [t],
    );

  const statusLabels: Record<KanbanStatus, string> = useMemo(
    () => ({
      pending: t("erp.tasks.status.pending"),
      in_progress: t("erp.tasks.status.inProgressShort"),
      done: t("erp.tasks.status.doneShort"),
    }),
    [t],
  );

  const formatTaskDateTime = (value?: string | null) =>
    formatTaskDateTimeBase(value, t, i18n.language);

  return {
    projects,
    activities,
    tasks,
    subactivities,
    users,
    allTasks,
    userMap,
    projectMap,
    subactivitiesByProject,
    assignedTasks,
    taskCount,
    assignedCount,
    createTaskMutation,
    quickCreateTaskMutation,
    updateTaskStatusMutation,
    updateTaskMutation,
    deleteTaskMutation,
    handleCreateTask,
    handleQuickAdd,
    tasksByStatus,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    draggedTaskId,
    dragOverStatus,
    setDragOverStatus,
    kanbanColumns,
    statusLabels,
    formatTaskDateTime,
    getTaskStatus,
    projectsBaseKey,
    tasksKey,
  };
};

