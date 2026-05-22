export type SummaryYearlyData = {
  projectJustify: Record<number, number>;
  projectJustified: Record<number, number>;
  summaryMilestones: Record<number, Array<{ label: string; hours: number }>>;
};

export type SummaryStorage = Record<number, SummaryYearlyData>;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type ViewMode = "week" | "month";

export type Status = "on-time" | "at-risk" | "overdue" | "planned";

export interface ErpTaskLocal {
  id: number;
  project_id: number | null;
  name: string;
  start_date: string;
  end_date: string;
  status: "pending" | "in_progress" | "completed";
  progress?: number;
}

export interface GanttTask {
  id: string;
  name: string;
  start: Date;
  end: Date;
  progress: number;
  type: "task" | "milestone" | "project";
  status: Status;
  project?: string;
  projectId?: number;
  activityId?: number;
  hasMilestones?: boolean;
  milestoneDates?: Date[];
}

export type BudgetModalMode = "create" | "edit";

export type ProjectActivityForm = {
  id: string;
  name: string;
  weight: number;
  start: string;
  end: string;
  subactivities: Array<{
    id: string;
    name: string;
    weight: number;
    start: string;
    end: string;
  }>;
};

export type ProjectMilestoneForm = {
  id: string;
  name: string;
  start: string;
  end: string;
};
