
import { useState } from "react";

import { useToast } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createActivity, createMilestone, createSubActivity } from "@api/erpStructure";
import { createErpProject } from "@api/erpManagement";
import { createId } from "@shared/utils/erp";
import type { ProjectActivityForm, ProjectMilestoneForm } from "@shared/utils/erp";
import { onMutationError } from "@shared/utils/mutationError";
import { projectKeys } from "./keys";

export const useProjectCreation = ({
  isSuperAdmin,
  tenantId,
  selectedTenantId,
}: {
  isSuperAdmin: boolean;
  tenantId?: number | null;
  selectedTenantId: string;
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectType, setProjectType] = useState<
    "regional" | "nacional" | "internacional"
  >("regional");
  const [projectDepartmentId, setProjectDepartmentId] = useState<number | "">("");
  const [projectStart, setProjectStart] = useState("");
  const [projectEnd, setProjectEnd] = useState("");
  const [projectLoanPercent, setProjectLoanPercent] = useState("85");
  const [projectSubsidyPercent, setProjectSubsidyPercent] = useState("25");
  const [projectActivities, setProjectActivities] = useState<ProjectActivityForm[]>([]);
  const [projectMilestones, setProjectMilestones] = useState<ProjectMilestoneForm[]>([]);

  const toValidWeight = (value: unknown): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const round2 = (value: number): number =>
    Math.round((value + Number.EPSILON) * 100) / 100;

  const isExactly100 = (value: number): boolean => round2(value) === 100;

  const handleAddActivity = () => {
    setProjectActivities((prev) => [
      ...prev,
      {
        id: createId(),
        name: `Actividad ${prev.length + 1}`,
        weight: 0,
        start: "",
        end: "",
        subactivities: [],
      },
    ]);
  };

  const handleAddSubactivity = (actId: string) => {
    setProjectActivities((prev) =>
      prev.map((act) =>
        act.id === actId
          ? {
              ...act,
              subactivities: [
                ...act.subactivities,
                {
                  id: createId(),
                  name: `Subactividad ${act.subactivities.length + 1}`,
                  weight: 0,
                  start: "",
                  end: "",
                },
              ],
            }
          : act,
      ),
    );
  };

  const handleAddMilestone = () => {
    setProjectMilestones((prev) => [
      ...prev,
      { id: createId(), name: `Hito ${prev.length + 1}`, start: "", end: "" },
    ]);
  };

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const effectiveTenantId = isSuperAdmin
        ? Number(selectedTenantId)
        : tenantId ?? undefined;
      const project = await createErpProject(
        {
          name: projectName.trim(),
          description: projectDescription.trim() || null,
          project_type: projectType,
          department_id: projectDepartmentId === "" ? null : projectDepartmentId,
          start_date: projectStart || null,
          end_date: projectEnd || null,
          loan_percent: projectLoanPercent ? Number(projectLoanPercent) : null,
          subsidy_percent: projectSubsidyPercent ? Number(projectSubsidyPercent) : null,
        },
        effectiveTenantId,
      );

      for (const activity of projectActivities) {
        const activityDescription =
          activity.weight > 0 ? `Peso: ${activity.weight}%` : null;

        const createdActivity = await createActivity(
          {
            project_id: project.id,
            name: activity.name.trim() || "Actividad",
            description: activityDescription,
            start_date: activity.start || null,
            end_date: activity.end || null,
          },
          effectiveTenantId,
        );

        for (const subactivity of activity.subactivities) {
          const subDescription =
            subactivity.weight > 0 ? `Peso: ${subactivity.weight}%` : null;

          await createSubActivity(
            {
              activity_id: createdActivity.id,
              name: subactivity.name.trim() || "Subactividad",
              description: subDescription,
              start_date: subactivity.start || null,
              end_date: subactivity.end || null,
            },
            effectiveTenantId,
          );
        }
      }

      for (const milestone of projectMilestones) {
        const milestoneDescription =
          milestone.start && milestone.end && milestone.start !== milestone.end
            ? `Inicio: ${milestone.start}. Fin: ${milestone.end}.`
            : milestone.start
              ? `Inicio: ${milestone.start}.`
              : milestone.end
                ? `Fin: ${milestone.end}.`
                : null;

        await createMilestone(
          {
            project_id: project.id,
            title: milestone.name.trim() || "Hito",
            due_date: milestone.end || milestone.start || null,
            description: milestoneDescription,
          },
          effectiveTenantId,
        );
      }

      return project;
    },
    onSuccess: async () => {
      setProjectName("");
      setProjectDescription("");
      setProjectType("regional");
      setProjectDepartmentId("");
      setProjectStart("");
      setProjectEnd("");
      setProjectLoanPercent("85");
      setProjectSubsidyPercent("25");
      setProjectActivities([]);
      setProjectMilestones([]);
      const effectiveTenantId = isSuperAdmin
        ? Number(selectedTenantId)
        : tenantId ?? undefined;
      const projectsBaseKey = effectiveTenantId
        ? projectKeys.base(effectiveTenantId)
        : (["projects"] as const);
      await queryClient.invalidateQueries({ queryKey: projectsBaseKey });
      toast({ title: "Proyecto guardado", status: "success" });
    },
    onError: onMutationError(toast, "Error al guardar", "No se pudo guardar el proyecto."),
  });

  const handleSaveProject = () => {
    if (!projectName.trim()) {
      toast({ title: "Nombre requerido", status: "warning" });
      return;
    }
    if (isSuperAdmin && !selectedTenantId) {
      toast({ title: "Selecciona un tenant", status: "warning" });
      return;
    }

    if (projectActivities.length === 0) {
      toast({
        title: "Actividades requeridas",
        description: "Debes definir al menos una actividad con pesos al 100%.",
        status: "warning",
      });
      return;
    }

    const activitiesTotal = projectActivities.reduce(
      (acc, activity) => acc + toValidWeight(activity.weight),
      0,
    );

    if (!isExactly100(activitiesTotal)) {
      toast({
        title: "Suma de actividades invalida",
        description: `La suma de pesos de actividades debe ser 100%. Valor actual: ${round2(activitiesTotal)}%.`,
        status: "warning",
      });
      return;
    }

    for (const activity of projectActivities) {
      if (activity.subactivities.length === 0) {
        continue;
      }
      const subTotal = activity.subactivities.reduce(
        (acc, sub) => acc + toValidWeight(sub.weight),
        0,
      );
      if (!isExactly100(subTotal)) {
        const label = activity.name?.trim() || "Actividad sin nombre";
        toast({
          title: "Suma de subactividades invalida",
          description: `En "${label}" la suma de subactividades debe ser 100%. Valor actual: ${round2(subTotal)}%.`,
          status: "warning",
        });
        return;
      }
    }

    createProjectMutation.mutate();
  };

  return {
    projectName,
    setProjectName,
    projectDescription,
    setProjectDescription,
    projectType,
    setProjectType,
    projectDepartmentId,
    setProjectDepartmentId,
    projectStart,
    setProjectStart,
    projectEnd,
    setProjectEnd,
    projectLoanPercent,
    setProjectLoanPercent,
    projectSubsidyPercent,
    setProjectSubsidyPercent,
    projectActivities,
    setProjectActivities,
    projectMilestones,
    setProjectMilestones,
    handleAddActivity,
    handleAddSubactivity,
    handleAddMilestone,
    handleSaveProject,
    createProjectMutation,
  };
};
