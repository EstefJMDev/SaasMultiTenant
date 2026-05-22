import React, { useEffect, useRef } from "react";
import {
  Tabs,
  useColorModeValue,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useTranslation } from "react-i18next";

import { AppShell } from "@widgets/app-shell/AppShell";
import { ProjectHero } from "@widgets/projects";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { useErpTasksData } from "./hooks/useErpTasksData";
import { useErpTasksModals } from "./hooks/useErpTasksModals";
import { TasksFilters } from "./ui/TasksFilters";
import { TasksHeader } from "./ui/TasksHeader";
import { TasksModals } from "./ui/TasksModals";
import { TasksTable } from "./ui/TasksTable";

// Pantalla de tareas: resumen, creacion, Kanban y detalle.
export const ErpTasksPage: React.FC = () => {
  // Utilidades y estilos base.
  const { t, i18n } = useTranslation();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.500", "gray.300");
  const accent = useColorModeValue("brand.500", "brand.300");
  const pendingColumnBg = useColorModeValue("orange.50", "orange.900");
  const pendingHeaderBg = useColorModeValue("orange.500", "orange.400");
  const pendingBadgeBg = useColorModeValue("orange.200", "orange.600");
  const progressColumnBg = useColorModeValue("purple.50", "purple.900");
  const progressHeaderBg = useColorModeValue("purple.500", "purple.400");
  const progressBadgeBg = useColorModeValue("purple.200", "purple.600");
  const doneColumnBg = useColorModeValue("brand.50", "brand.900");
  const doneHeaderBg = useColorModeValue("brand.500", "brand.400");
  const doneBadgeBg = useColorModeValue("brand.200", "brand.600");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const modals = useErpTasksModals();

  // Determina permisos y tenant del usuario actual.
  const { data: currentUser } = useCurrentUser();
  const tenantId = currentUser?.tenant_id ?? undefined;
  const isSuperAdmin = currentUser?.is_super_admin === true;
  const effectiveTenantId = isSuperAdmin
    ? undefined
    : (currentUser?.tenant_id ?? undefined);
  const currentUserId = currentUser?.id ?? null;

  const data = useErpTasksData({
    t,
    i18n,
    tenantId: tenantId ?? undefined,
    effectiveTenantId,
    currentUserId,
    taskTitle: modals.taskTitle,
    taskDescription: modals.taskDescription,
    taskProjectId: modals.taskProjectId,
    taskSubactivityId: modals.taskSubactivityId,
    taskAssigneeId: modals.taskAssigneeId,
    taskStartDate: modals.taskStartDate,
    taskEndDate: modals.taskEndDate,
    setTaskTitle: modals.setTaskTitle,
    setTaskDescription: modals.setTaskDescription,
    setTaskProjectId: modals.setTaskProjectId,
    setTaskSubactivityId: modals.setTaskSubactivityId,
    setTaskAssigneeId: modals.setTaskAssigneeId,
    setTaskStartDate: modals.setTaskStartDate,
    setTaskEndDate: modals.setTaskEndDate,
    setCreateModalOpen: modals.setCreateModalOpen,
    quickAddTitle: modals.quickAddTitle,
    quickAddDescription: modals.quickAddDescription,
    quickAddProjectId: modals.quickAddProjectId,
    quickAddSubactivityId: modals.quickAddSubactivityId,
    quickAddAssigneeId: modals.quickAddAssigneeId,
    quickAddStartDate: modals.quickAddStartDate,
    quickAddEndDate: modals.quickAddEndDate,
    quickAddStatus: modals.quickAddStatus,
    setQuickAddTitle: modals.setQuickAddTitle,
    setQuickAddDescription: modals.setQuickAddDescription,
    setQuickAddProjectId: modals.setQuickAddProjectId,
    setQuickAddSubactivityId: modals.setQuickAddSubactivityId,
    setQuickAddAssigneeId: modals.setQuickAddAssigneeId,
    setQuickAddStartDate: modals.setQuickAddStartDate,
    setQuickAddEndDate: modals.setQuickAddEndDate,
    setQuickAddOpen: modals.setQuickAddOpen,
    editTaskId: modals.editTaskId,
    editTitle: modals.editTitle,
    editDescription: modals.editDescription,
    editProjectId: modals.editProjectId,
    editSubactivityId: modals.editSubactivityId,
    editAssigneeId: modals.editAssigneeId,
    editStartDate: modals.editStartDate,
    editEndDate: modals.editEndDate,
    editStatus: modals.editStatus,
    setEditOpen: modals.setEditOpen,
    setSelectedTask: modals.setSelectedTask,
    setViewTask: modals.setViewTask,
  });

  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    const taskList = data.tasks ?? [];
    if (taskList.length === 0) return;
    const hash = window.location.hash || "";
    const qIndex = hash.indexOf("?");
    if (qIndex === -1) return;
    const params = new URLSearchParams(hash.slice(qIndex + 1));
    const taskIdParam = params.get("taskId");
    if (!taskIdParam) return;
    const taskId = Number(taskIdParam);
    const target = Number.isFinite(taskId)
      ? taskList.find((item) => item.id === taskId)
      : undefined;
    if (target) {
      modals.setViewTask(target);
    }
    deepLinkAppliedRef.current = true;
    params.delete("taskId");
    const remaining = params.toString();
    const newHash = `${hash.slice(0, qIndex)}${remaining ? `?${remaining}` : ""}`;
    if (newHash !== hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${newHash}`);
    }
  }, [data.tasks, modals]);

  const kanbanStyles = {
    pending: {
      columnBg: pendingColumnBg,
      headerBg: pendingHeaderBg,
      badgeBg: pendingBadgeBg,
      accent: "orange",
    },
    in_progress: {
      columnBg: progressColumnBg,
      headerBg: progressHeaderBg,
      badgeBg: progressBadgeBg,
      accent: "purple",
    },
    done: {
      columnBg: doneColumnBg,
      headerBg: doneHeaderBg,
      badgeBg: doneBadgeBg,
      accent: "brand",
    },
  } as const;
  // Render principal de la pagina.
  return (
    <AppShell>
      <ProjectHero
        items={[]}
        title={t("erp.tasks.header.title")}
        subtitle={t("erp.tasks.header.subtitle")}
        breadcrumb="Gestión de proyectos"
        animation={`${fadeUp} 0.6s ease-out`}
      />

      <Tabs variant="unstyled">
        <TasksHeader t={t} />
        <TasksFilters />
        <TasksTable
          t={t}
          cardBg={cardBg}
          subtleText={subtleText}
          accent={accent}
          kanbanStyles={kanbanStyles}
          data={data}
          modals={modals}
        />
      </Tabs>

      <TasksModals
        t={t}
        subtleText={subtleText}
        isSuperAdmin={isSuperAdmin}
        kanbanStyles={kanbanStyles}
        data={data}
        modals={modals}
      />
    </AppShell>
  );
};


