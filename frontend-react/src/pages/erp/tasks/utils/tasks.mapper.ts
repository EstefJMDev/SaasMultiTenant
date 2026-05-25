import type { ErpTask } from "@api/erpTimeTracking";

export type KanbanStatus = "pending" | "in_progress" | "done";

export const getTaskStatus = (task: ErpTask): KanbanStatus => {
  const raw = task.status?.toLowerCase();
  if (raw === "pending" || raw === "in_progress" || raw === "done") {
    return raw;
  }
  return task.is_completed ? "done" : "pending";
};
