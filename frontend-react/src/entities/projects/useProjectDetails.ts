import { useCallback, useEffect, useMemo, useState } from "react";

import type { ErpActivity, ErpMilestone, ErpSubActivity } from "@api/erpStructure";
import type { ErpProject as ErpProjectApi } from "@api/erpReports";
import type { ErpTask as ErpTaskApi } from "@api/erpTimeTracking";
import { createId, toDateInput } from "@shared/utils/erp";

type UseProjectDetailsArgs = {
  activities: ErpActivity[];
  subactivities: ErpSubActivity[];
  milestones: ErpMilestone[];
  rawTasks: ErpTaskApi[];
};

const extractWeightAndDescription = (value?: string | null) => {
  const source = (value ?? "").trim();
  const match = source.match(/^peso:\s*([0-9]+(?:[.,][0-9]+)?)%\s*\.?\s*/i);
  if (!match) {
    return { weight: 0, description: source };
  }
  const numericWeight = Number(match[1].replace(",", "."));
  return {
    weight: Number.isFinite(numericWeight) ? numericWeight : 0,
    description: source.slice(match[0].length).trim(),
  };
};

const sortByCreatedAtThenId = <T extends { id: number; created_at?: string | null }>(
  a: T,
  b: T,
) => {
  const createdAtA = Date.parse(a.created_at ?? "");
  const createdAtB = Date.parse(b.created_at ?? "");
  const hasValidA = !Number.isNaN(createdAtA);
  const hasValidB = !Number.isNaN(createdAtB);

  if (hasValidA && hasValidB && createdAtA !== createdAtB) {
    return createdAtA - createdAtB;
  }
  if (hasValidA !== hasValidB) {
    return hasValidA ? -1 : 1;
  }
  return a.id - b.id;
};

export const useProjectDetails = ({
  activities,
  subactivities,
  milestones,
  rawTasks,
}: UseProjectDetailsArgs) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ErpProjectApi | null>(
    null,
  );
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editProjectType, setEditProjectType] = useState<
    "regional" | "nacional" | "internacional"
  >("regional");
  const [editDepartmentId, setEditDepartmentId] = useState<number | "">("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editLoanPercent, setEditLoanPercent] = useState("100");
  const [editSubsidyPercent, setEditSubsidyPercent] = useState("0");

  const [activityEdits, setActivityEdits] = useState<
    Record<number, { name: string; start: string; end: string; description: string }>
  >({});
  const [subactivityEdits, setSubactivityEdits] = useState<
    Record<number, { name: string; start: string; end: string; description: string; weight: number }>
  >({});
  const [milestoneEdits, setMilestoneEdits] = useState<
    Record<number, { title: string; due: string; description: string }>
  >({});
  const [newActivityDrafts, setNewActivityDrafts] = useState<
    Array<{ id: string; name: string; start: string; end: string; description: string }>
  >([]);
  const [newSubactivityDrafts, setNewSubactivityDrafts] = useState<
    Record<number, Array<{ id: string; name: string; start: string; end: string; description: string; weight: number }>>
  >({});
  const [newMilestoneDrafts, setNewMilestoneDrafts] = useState<
    Array<{ id: string; title: string; due: string; description: string }>
  >([]);

  const openProjectDetails = useCallback((project: ErpProjectApi) => {
    setSelectedProject(project);
    setDetailsOpen(true);
  }, []);

  const closeProjectDetails = useCallback(() => {
    setDetailsOpen(false);
  }, []);

  const selectedProjectActivities = useMemo(
    () =>
      selectedProject
        ? activities
            .filter((act) => act.project_id === selectedProject.id)
            .sort(sortByCreatedAtThenId)
        : [],
    [selectedProject, activities],
  );

  const selectedProjectMilestones = useMemo(
    () =>
      selectedProject
        ? milestones.filter((mil) => mil.project_id === selectedProject.id)
        : [],
    [selectedProject, milestones],
  );

  const selectedProjectTasks = useMemo(
    () =>
      selectedProject
        ? rawTasks.filter((task) => task.project_id === selectedProject.id)
        : [],
    [selectedProject, rawTasks],
  );

  const selectedProjectSubactivities = useMemo(() => {
    if (!selectedProject) return [];
    const activityIds = new Set(selectedProjectActivities.map((a) => a.id));
    const activityOrder = new Map<number, number>();
    selectedProjectActivities.forEach((activity, index) => {
      activityOrder.set(activity.id, index);
    });

    return subactivities
      .filter((sub) => activityIds.has(sub.activity_id))
      .sort((a, b) => {
        const activityIndexA = activityOrder.get(a.activity_id) ?? Number.MAX_SAFE_INTEGER;
        const activityIndexB = activityOrder.get(b.activity_id) ?? Number.MAX_SAFE_INTEGER;
        if (activityIndexA !== activityIndexB) return activityIndexA - activityIndexB;
        return sortByCreatedAtThenId(a, b);
      });
  }, [selectedProject, selectedProjectActivities, subactivities]);

  useEffect(() => {
    if (!selectedProject) return;
    setEditName(selectedProject.name ?? "");
    setEditDescription(selectedProject.description ?? "");
    setEditProjectType(
      (selectedProject.project_type as
        | "regional"
        | "nacional"
        | "internacional"
        | null) ?? "regional",
    );
    setEditDepartmentId(
      selectedProject.department_id != null ? selectedProject.department_id : "",
    );
    setEditStart(toDateInput(selectedProject.start_date));
    setEditEnd(toDateInput(selectedProject.end_date));
    setEditActive(selectedProject.is_active ?? true);
    setEditLoanPercent(
      selectedProject.loan_percent != null
        ? String(selectedProject.loan_percent)
        : "100",
    );
    setEditSubsidyPercent(
      selectedProject.subsidy_percent != null
        ? String(selectedProject.subsidy_percent)
        : "0",
    );
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject) return;

    const nextActivities: Record<
      number,
      { name: string; start: string; end: string; description: string }
    > = {};
    selectedProjectActivities.forEach((act) => {
      nextActivities[act.id] = {
        name: act.name ?? "",
        start: toDateInput(act.start_date),
        end: toDateInput(act.end_date),
        description: act.description ?? "",
      };
    });
    setActivityEdits(nextActivities);

    const nextSubactivities: Record<
      number,
      { name: string; start: string; end: string; description: string; weight: number }
    > = {};
    selectedProjectSubactivities.forEach((sub) => {
      const parsed = extractWeightAndDescription(sub.description);
      nextSubactivities[sub.id] = {
        name: sub.name ?? "",
        start: toDateInput(sub.start_date),
        end: toDateInput(sub.end_date),
        description: parsed.description,
        weight: parsed.weight,
      };
    });
    setSubactivityEdits(nextSubactivities);

    const nextMilestones: Record<
      number,
      { title: string; due: string; description: string }
    > = {};
    selectedProjectMilestones.forEach((mil) => {
      nextMilestones[mil.id] = {
        title: mil.title ?? "",
        due: toDateInput(mil.due_date),
        description: mil.description ?? "",
      };
    });
    setMilestoneEdits(nextMilestones);
    setNewActivityDrafts([]);
    setNewSubactivityDrafts({});
    setNewMilestoneDrafts([]);
  }, [
    selectedProject,
    selectedProjectActivities,
    selectedProjectSubactivities,
    selectedProjectMilestones,
  ]);

  const addNewActivityDraft = useCallback(() => {
    setNewActivityDrafts((prev) => [
      ...prev,
      { id: createId(), name: "", start: "", end: "", description: "" },
    ]);
  }, []);

  const addNewSubactivityDraft = useCallback((activityId: number) => {
    setNewSubactivityDrafts((prev) => ({
      ...prev,
      [activityId]: [
        ...(prev[activityId] ?? []),
        { id: createId(), name: "", start: "", end: "", description: "", weight: 0 },
      ],
    }));
  }, []);

  const addNewMilestoneDraft = useCallback(() => {
    setNewMilestoneDrafts((prev) => [
      ...prev,
      { id: createId(), title: "", due: "", description: "" },
    ]);
  }, []);

  return {
    detailsOpen,
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
    editActive,
    setEditActive,
    editLoanPercent,
    setEditLoanPercent,
    editSubsidyPercent,
    setEditSubsidyPercent,
    activityEdits,
    setActivityEdits,
    subactivityEdits,
    setSubactivityEdits,
    milestoneEdits,
    setMilestoneEdits,
    newActivityDrafts,
    setNewActivityDrafts,
    newSubactivityDrafts,
    setNewSubactivityDrafts,
    newMilestoneDrafts,
    setNewMilestoneDrafts,
    addNewActivityDraft,
    addNewSubactivityDraft,
    addNewMilestoneDraft,
    selectedProjectActivities,
    selectedProjectSubactivities,
    selectedProjectMilestones,
    selectedProjectTasks,
  };
};
