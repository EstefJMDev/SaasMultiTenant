import { useState } from "react";
import type { ErpTask } from "@api/erpTimeTracking";
import { toDateTimeInput } from "../utils/tasks.format";
import { getTaskStatus, type KanbanStatus } from "../utils/tasks.mapper";

export const useErpTasksModals = () => {
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskProjectId, setTaskProjectId] = useState<string>("");
  const [taskSubactivityId, setTaskSubactivityId] = useState<string>("");
  const [taskAssigneeId, setTaskAssigneeId] = useState<string>("");
  const [taskStartDate, setTaskStartDate] = useState("");
  const [taskEndDate, setTaskEndDate] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddStatus, setQuickAddStatus] = useState<KanbanStatus>("pending");
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddDescription, setQuickAddDescription] = useState("");
  const [quickAddProjectId, setQuickAddProjectId] = useState<string>("");
  const [quickAddSubactivityId, setQuickAddSubactivityId] =
    useState<string>("");
  const [quickAddAssigneeId, setQuickAddAssigneeId] = useState<string>("");
  const [quickAddStartDate, setQuickAddStartDate] = useState("");
  const [quickAddEndDate, setQuickAddEndDate] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editTaskId, setEditTaskId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editProjectId, setEditProjectId] = useState<string>("");
  const [editAssigneeId, setEditAssigneeId] = useState<string>("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editSubactivityId, setEditSubactivityId] = useState<string>("");
  const [editStatus, setEditStatus] = useState<KanbanStatus>("pending");
  const [selectedTask, setSelectedTask] = useState<ErpTask | null>(null);
  const [viewTask, setViewTask] = useState<ErpTask | null>(null);

  const closeCreateModal = () => {
    setCreateModalOpen(false);
  };

  const openQuickAdd = (status: KanbanStatus) => {
    setQuickAddStatus(status);
    setQuickAddOpen(true);
  };

  const openEditTask = (task: ErpTask) => {
    setEditTaskId(task.id);
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditProjectId(task.project_id ? String(task.project_id) : "");
    setEditSubactivityId(task.subactivity_id ? String(task.subactivity_id) : "");
    setEditAssigneeId(task.assigned_to_id ? String(task.assigned_to_id) : "");
    setEditStartDate(toDateTimeInput(task.start_date));
    setEditEndDate(toDateTimeInput(task.end_date));
    setEditStatus(getTaskStatus(task));
    setEditOpen(true);
  };

  return {
    taskTitle,
    setTaskTitle,
    taskDescription,
    setTaskDescription,
    taskProjectId,
    setTaskProjectId,
    taskSubactivityId,
    setTaskSubactivityId,
    taskAssigneeId,
    setTaskAssigneeId,
    taskStartDate,
    setTaskStartDate,
    taskEndDate,
    setTaskEndDate,
    createModalOpen,
    setCreateModalOpen,
    quickAddOpen,
    setQuickAddOpen,
    quickAddStatus,
    setQuickAddStatus,
    quickAddTitle,
    setQuickAddTitle,
    quickAddDescription,
    setQuickAddDescription,
    quickAddProjectId,
    setQuickAddProjectId,
    quickAddSubactivityId,
    setQuickAddSubactivityId,
    quickAddAssigneeId,
    setQuickAddAssigneeId,
    quickAddStartDate,
    setQuickAddStartDate,
    quickAddEndDate,
    setQuickAddEndDate,
    editOpen,
    setEditOpen,
    editTaskId,
    setEditTaskId,
    editTitle,
    setEditTitle,
    editDescription,
    setEditDescription,
    editProjectId,
    setEditProjectId,
    editAssigneeId,
    setEditAssigneeId,
    editStartDate,
    setEditStartDate,
    editEndDate,
    setEditEndDate,
    editSubactivityId,
    setEditSubactivityId,
    editStatus,
    setEditStatus,
    selectedTask,
    setSelectedTask,
    viewTask,
    setViewTask,
    closeCreateModal,
    openQuickAdd,
    openEditTask,
  };
};
