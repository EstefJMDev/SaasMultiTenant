import React from "react";

import {
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  HStack,
  Select,
  Text,
} from "@chakra-ui/react";

import { keyframes } from "@emotion/react";

import { AppShell } from "@widgets/app-shell/AppShell";
import {
  CreateProjectSection,
  GanttSection,
  ProjectDetailsModal,
  ProjectHero,
  SummarySection,
} from "@widgets/projects";
import { DataTable } from "@widgets/data-table";
import { EmptyState, ErrorBanner } from "@shared/ui";
import { useErpProjectsData } from "./hooks/useErpProjectsData";
import { useErpProjectsFilters } from "./hooks/useErpProjectsFilters";

// Pagina principal de proyectos: resumen, listado, Gantt, creacion y edicion detallada.

export const ErpProjectsPage: React.FC = () => {
  // Tokens de estilo y animaci+n para la cabecera hero.
  const subtleText = "text.muted";
  const cardBg = "bg.surface";

  const fadeUp = keyframes`

    from { opacity: 0; transform: translateY(12px); }

    to { opacity: 1; transform: translateY(0); }

  `;

  // Estado de navegacion, filtros y utilidades.

  const {
    activeTab,
    setActiveTab,
    selectedProjectId,
    setSelectedProjectId,
    projectSearch,
    setProjectSearch,
    projectStatusFilter,
    setProjectStatusFilter,
  } = useErpProjectsFilters();

  const {
    tenantId,
    tenantIdString,
    isSuperAdmin,
    projectsBaseKey,
    queryClient,
    projectCreation,
    isLoadingProjects,
    isErrorProjects,
    departments,
    visibleProjects,
    filteredProjects,
    ganttTasks,
    ganttProjects,
    projectColumns,
    projectTableColumns,
    detailsOpen,
    closeProjectDetails,
    selectedProject,
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
    selectedProjectActivities,
    selectedProjectSubactivities,
    selectedProjectMilestones,
    selectedProjectTasks,
    isAddModalOpen,
    onCloseAddModal,
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
    employeesError,
    employeesErrorMsg,
    employeesLoading,
    departmentsError,
    departmentsErrorMsg,
    departmentsLoading,
    hrTenantId,
    updateActivityMutation,
    createActivityMutation,
    updateSubActivityMutation,
    createSubActivityMutation,
    updateMilestoneMutation,
    createMilestoneMutation,
    createTaskMutation,
    deleteProjectMutation,
    updateProjectMutation,
    handleUpdateProject,
    handleDeleteProject,
    handleUpdateActivity,
    handleCreateActivity,
    handleUpdateSubactivity,
    handleCreateSubactivity,
    handleUpdateMilestone,
    handleCreateMilestone,
    handleCreateTask,
  } = useErpProjectsData({
    selectedProjectId,
    projectSearch,
    projectStatusFilter,
  });

  const summaryYearOptions = React.useMemo(() => {
    const currentYear = new Date().getFullYear();
    const extractYear = (value?: string | null): number | null => {
      if (!value) return null;
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.getFullYear();
      const match = value.match(/^(\d{4})/);
      if (!match) return null;
      const year = Number(match[1]);
      return Number.isFinite(year) ? year : null;
    };

    const years = new Set<number>();
    for (let year = currentYear - 5; year <= currentYear + 5; year += 1) {
      years.add(year);
    }
    for (const project of visibleProjects) {
      const startYear = extractYear(project.start_date);
      const endYear = extractYear(project.end_date);
      if (startYear != null && endYear != null) {
        const from = Math.min(startYear, endYear);
        const to = Math.max(startYear, endYear);
        for (let year = from; year <= to; year += 1) {
          years.add(year);
        }
      } else if (startYear != null) {
        years.add(startYear);
      } else if (endYear != null) {
        years.add(endYear);
      }
    }

    return Array.from(years).sort((a, b) => a - b);
  }, [visibleProjects]);

  const {
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
  } = projectCreation;

  //////////////////////////////////////Render principal./////////////////////////////////////////////////////////////////////////////

  return (
    <AppShell>
      <ProjectHero
        items={[]}
        title="Gestión de proyectos"
        subtitle="Control y visualización de proyectos y tareas"
        animation={`${fadeUp} 0.6s ease-out`}
      />

      {/* Navegacion por pestanas: resumen, tarjetas, Gantt y creacion */}

      <Tabs isLazy index={activeTab} onChange={setActiveTab} variant="unstyled">
        <TabList
          bg="white"
          borderRadius="12px"
          p="6px"
          boxShadow="0 1px 10px rgba(0,0,0,0.08)"
          border="1px solid"
          borderColor="gray.100"
          gap={1}
          flexWrap="wrap"
          w="fit-content"
        >
          <Tab
            px={4}
            py={2}
            borderRadius="10px"
            fontSize="sm"
            fontWeight={600}
            _selected={{
              bg: "brand.600",
              color: "white",
              _hover: { bg: "brand.600", color: "white" },
            }}
            _hover={{ bg: "gray.50" }}
          >
            Proyectos
          </Tab>

          <Tab
            px={4}
            py={2}
            borderRadius="10px"
            fontSize="sm"
            fontWeight={500}
            _selected={{
              bg: "brand.600",
              color: "white",
              fontWeight: 600,
              _hover: { bg: "brand.600", color: "white", fontWeight: 600 },
            }}
            _hover={{ bg: "gray.50" }}
          >
            Diagrama de Gantt
          </Tab>

          <Tab
            px={4}
            py={2}
            borderRadius="10px"
            fontSize="sm"
            fontWeight={500}
            _selected={{
              bg: "brand.600",
              color: "white",
              fontWeight: 600,
              _hover: { bg: "brand.600", color: "white", fontWeight: 600 },
            }}
            _hover={{ bg: "gray.50" }}
          >
            Justificacion
          </Tab>

          <Tab
            px={4}
            py={2}
            borderRadius="10px"
            fontSize="sm"
            fontWeight={500}
            _selected={{
              bg: "brand.600",
              color: "white",
              fontWeight: 600,
              _hover: { bg: "brand.600", color: "white", fontWeight: 600 },
            }}
            _hover={{ bg: "gray.50" }}
          >
            Crear
          </Tab>
        </TabList>

        <TabPanels mt={4}>
          {/* Listado detallado por proyecto con boton de edicion */}
          <TabPanel px={0}>
            {isErrorProjects && (
              <ErrorBanner
                title="No se pudieron cargar los proyectos"
                description="Inténtalo de nuevo en unos segundos."
                onRetry={() =>
                  queryClient.invalidateQueries({
                    queryKey: projectsBaseKey,
                  })
                }
              />
            )}

            <DataTable
              data={filteredProjects}
              columns={projectTableColumns}
              isLoading={isLoadingProjects}
              toolbar={
                <HStack spacing={3} align="center">
                  <Text fontSize="sm">Estado</Text>
                  <Select
                    size="sm"
                    value={projectStatusFilter}
                    onChange={(event) =>
                      setProjectStatusFilter(
                        event.target.value as typeof projectStatusFilter,
                      )
                    }
                  >
                    <option value="all">Todos</option>
                    <option value="active">Activos</option>
                    <option value="inactive">Inactivos</option>
                  </Select>
                </HStack>
              }
              emptyText="No hay proyectos para mostrar."
              emptyState={
                <EmptyState
                  title="No hay proyectos para mostrar."
                  description="Crea tu primer proyecto para empezar."
                  actionLabel="Crear proyecto"
                  onAction={() => setActiveTab(3)}
                />
              }
              showSearch
              globalFilter={projectSearch}
              onGlobalFilterChange={setProjectSearch}
            />
          </TabPanel>

          {/* Diagrama Gantt filtrable y con selector de vista */}
          <TabPanel px={0}>
            <GanttSection
              ganttProjects={ganttProjects}
              selectedProjectId={selectedProjectId}
              onSelectedProjectChange={setSelectedProjectId}
              ganttTasks={ganttTasks}
              subtleText={subtleText}
            />
          </TabPanel>

          {/* Resumen editable tipo Excel: horas por empleado y proyecto */}
          <TabPanel px={0} minW="0" overflowX="hidden">
            <SummarySection
              summaryYear={summaryYear}
              subtleText={subtleText}
              loadingSummaryYear={loadingSummaryYear}
              saveStatusLabel={saveStatusLabel}
              saveErrorMessage={saveErrorMessage}
              summarySearch={summarySearch}
              onSummarySearchChange={setSummarySearch}
              departmentFilter={departmentFilter}
              onDepartmentFilterChange={setDepartmentFilter}
              hrDepartments={hrDepartments}
              yearOptions={summaryYearOptions}
              onSummaryYearChange={setSummaryYear}
              onRefreshAllocations={() =>
                queryClient.invalidateQueries({
                  queryKey: ["hr-allocations", summaryYear, hrTenantId],
                })
              }
              summaryEditMode={summaryEditMode}
              onToggleSummaryEdit={() => setSummaryEditMode((v) => !v)}
              departmentColorMap={departmentColorMap}
              projectColumns={projectColumns}
              summaryMilestones={summaryMilestones}
              onAddSummaryMilestone={addMilestoneRow}
              onRemoveSummaryMilestone={(projectId, index) =>
                setSummaryMilestones((prev) => {
                  const list = prev[projectId] ?? [];
                  const next = list.filter((_, mIdx) => mIdx !== index);
                  return { ...prev, [projectId]: next };
                })
              }
              projectJustify={projectJustify}
              onProjectJustifyChange={(projectId, value) =>
                setProjectJustify((prev) => ({
                  ...prev,
                  [projectId]: value,
                }))
              }
              projectJustified={projectJustified}
              filteredSummaryEmployees={filteredSummaryEmployees}
              employeeAvailability={employeeAvailability}
              departmentMap={departmentMap}
              departmentAllocationPercentMap={departmentAllocationPercentMap}
              employeeDepartmentPercentages={employeeDepartmentPercentages}
              allocationKey={allocationKey}
              allocationIndex={allocationIndex}
              allocationDraftsState={allocationDraftsState}
              onAllocationDraftChange={handleAllocationDraftChange}
              onAllocationBlur={handleAllocationBlur}
              isAddModalOpen={isAddModalOpen}
              onCloseAddModal={onCloseAddModal}
              hrTenantId={hrTenantId ?? null}
              hrEmployees={hrEmployees}
              selectedEmployeeIds={selectedEmployeeIds}
              employeesLoading={employeesLoading}
              departmentsLoading={departmentsLoading}
              employeesError={employeesError}
              departmentsError={departmentsError}
              employeesErrorMsg={employeesErrorMsg}
              departmentsErrorMsg={departmentsErrorMsg}
              onRetryEmployeesDepartments={() => {
                queryClient.invalidateQueries({
                  queryKey: ["hr-employees", hrTenantId, summaryYear],
                });
                queryClient.invalidateQueries({
                  queryKey: ["hr-departments", hrTenantId],
                });
              }}
              addDrawerDeptFilter={addDrawerDeptFilter}
              onAddDrawerDeptFilterChange={setAddDrawerDeptFilter}
              addDrawerSearch={addDrawerSearch}
              onAddDrawerSearchChange={setAddDrawerSearch}
              employeesAvailableToAdd={employeesAvailableToAdd}
              onAddEmployee={handleAddEmployee}
              pendingAllocationOverride={pendingAllocationOverride}
              onConfirmAllocationOverride={handleConfirmAllocationOverride}
              onCancelAllocationOverride={handleCancelAllocationOverride}
            />
          </TabPanel>

          {/* Alta de proyecto con actividades, subactividades e hitos locales */}
          <TabPanel px={0}>
            <CreateProjectSection
              isSuperAdmin={isSuperAdmin}
              selectedTenantId={tenantIdString ?? ""}
              projectName={projectName}
              onProjectNameChange={setProjectName}
              projectDescription={projectDescription}
              onProjectDescriptionChange={setProjectDescription}
              projectType={projectType}
              onProjectTypeChange={setProjectType}
              departments={
                isSuperAdmin && tenantId
                  ? departments.filter((dept) => dept.tenant_id === tenantId)
                  : isSuperAdmin
                    ? []
                    : departments
              }
              projectDepartmentId={projectDepartmentId}
              onProjectDepartmentChange={setProjectDepartmentId}
              projectStart={projectStart}
              onProjectStartChange={setProjectStart}
              projectEnd={projectEnd}
              onProjectEndChange={setProjectEnd}
              projectLoanPercent={projectLoanPercent}
              onProjectLoanPercentChange={setProjectLoanPercent}
              projectSubsidyPercent={projectSubsidyPercent}
              onProjectSubsidyPercentChange={setProjectSubsidyPercent}
              projectActivities={projectActivities}
              setProjectActivities={setProjectActivities}
              onAddActivity={handleAddActivity}
              onAddSubactivity={handleAddSubactivity}
              projectMilestones={projectMilestones}
              setProjectMilestones={setProjectMilestones}
              onAddMilestone={handleAddMilestone}
              onSaveProject={handleSaveProject}
              isSaving={createProjectMutation.isPending}
              subtleText={subtleText}
              cardBg={cardBg}
            />
          </TabPanel>
        </TabPanels></Tabs>

      {/* Popup centrado de detalle/edicion del proyecto seleccionado */}

      <ProjectDetailsModal
        isOpen={detailsOpen}
        onClose={closeProjectDetails}
        selectedProject={selectedProject}
        subtleText={subtleText}
        selectedProjectActivities={selectedProjectActivities}
        selectedProjectSubactivities={selectedProjectSubactivities}
        selectedProjectMilestones={selectedProjectMilestones}
        selectedProjectTasks={selectedProjectTasks}
        editName={editName}
        setEditName={setEditName}
        editActive={editActive}
        setEditActive={setEditActive}
        editDescription={editDescription}
        setEditDescription={setEditDescription}
        editProjectType={editProjectType}
        setEditProjectType={setEditProjectType}
        departments={
          selectedProject?.tenant_id != null
            ? departments.filter(
                (dept) => dept.tenant_id === selectedProject.tenant_id,
              )
            : departments
        }
        editDepartmentId={editDepartmentId}
        setEditDepartmentId={setEditDepartmentId}
        editStart={editStart}
        setEditStart={setEditStart}
        editEnd={editEnd}
        setEditEnd={setEditEnd}
        editLoanPercent={editLoanPercent}
        setEditLoanPercent={setEditLoanPercent}
        editSubsidyPercent={editSubsidyPercent}
        setEditSubsidyPercent={setEditSubsidyPercent}
        activityEdits={activityEdits}
        setActivityEdits={setActivityEdits}
        subactivityEdits={subactivityEdits}
        setSubactivityEdits={setSubactivityEdits}
        milestoneEdits={milestoneEdits}
        setMilestoneEdits={setMilestoneEdits}
        newActivityDrafts={newActivityDrafts}
        setNewActivityDrafts={setNewActivityDrafts}
        newSubactivityDrafts={newSubactivityDrafts}
        setNewSubactivityDrafts={setNewSubactivityDrafts}
        newMilestoneDrafts={newMilestoneDrafts}
        setNewMilestoneDrafts={setNewMilestoneDrafts}
        newTaskDrafts={newTaskDrafts}
        setNewTaskDrafts={setNewTaskDrafts}
        onAddActivityDraft={addNewActivityDraft}
        onAddSubactivityDraft={addNewSubactivityDraft}
        onAddMilestoneDraft={addNewMilestoneDraft}
        onAddTaskDraft={addNewTaskDraft}
        onUpdateActivity={handleUpdateActivity}
        onCreateActivity={handleCreateActivity}
        onUpdateSubactivity={handleUpdateSubactivity}
        onCreateSubactivity={handleCreateSubactivity}
        onUpdateMilestone={handleUpdateMilestone}
        onCreateMilestone={handleCreateMilestone}
        onCreateTask={handleCreateTask}
        updateActivityPending={updateActivityMutation.isPending}
        createActivityPending={createActivityMutation.isPending}
        updateSubActivityPending={updateSubActivityMutation.isPending}
        createSubActivityPending={createSubActivityMutation.isPending}
        updateMilestonePending={updateMilestoneMutation.isPending}
        createMilestonePending={createMilestoneMutation.isPending}
        createTaskPending={createTaskMutation.isPending}
        onDeleteProject={handleDeleteProject}
        deleteProjectPending={deleteProjectMutation.isPending}
        onUpdateProject={handleUpdateProject}
        updateProjectPending={updateProjectMutation.isPending}
      />
    </AppShell>
  );
};

export default ErpProjectsPage;



