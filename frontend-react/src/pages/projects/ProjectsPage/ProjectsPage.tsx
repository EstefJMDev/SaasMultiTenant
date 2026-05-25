import React, { useMemo, useState } from "react";
import { Stack } from "@chakra-ui/react";

import { EmptyState } from "@shared/ui/EmptyState";
import { ErrorBanner } from "@shared/ui/ErrorBanner";
import { SkeletonTable } from "@shared/ui/SkeletonTable";
import { ProjectsHero } from "./components/ProjectsHero";
import { ProjectsTabs, ProjectStatusFilter } from "./components/ProjectsTabs";
import { ProjectsFilters } from "./components/ProjectsFilters";
import { ProjectsTable } from "./components/ProjectsTable";
import { useProjectsView } from "./hooks/useProjectsView";

export const ProjectsPage: React.FC = () => {
  const { rows, departments, isLoading, isError, refetchAll } =
    useProjectsView();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<ProjectStatusFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return rows.filter((project) => {
      const matchesSearch =
        !normalizedSearch ||
        project.name.toLowerCase().includes(normalizedSearch) ||
        (project.description ?? "").toLowerCase().includes(normalizedSearch) ||
        String(project.id).includes(normalizedSearch);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && project.is_active) ||
        (statusFilter === "inactive" && !project.is_active);

      const matchesDepartment =
        departmentFilter === "all" ||
        String(project.department_id) === departmentFilter;

      return matchesSearch && matchesStatus && matchesDepartment;
    });
  }, [rows, search, statusFilter, departmentFilter]);

  const activeCount = useMemo(
    () => rows.filter((project) => project.is_active).length,
    [rows],
  );
  const inactiveCount = useMemo(
    () => rows.filter((project) => !project.is_active).length,
    [rows],
  );

  return (
    <Stack spacing={6}>
      <ProjectsHero />
      <ProjectsTabs
        activeFilter={statusFilter}
        total={rows.length}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        onChange={setStatusFilter}
      />
      <ProjectsFilters
        search={search}
        departmentId={departmentFilter}
        departments={departments}
        onSearchChange={setSearch}
        onDepartmentChange={setDepartmentFilter}
      />

      {isLoading && <SkeletonTable rows={8} cols={6} />}

      {!isLoading && isError && (
        <ErrorBanner
          title="No se pudieron cargar los proyectos"
          description="Revisa tu conexion o reintenta."
          onRetry={refetchAll}
        />
      )}

      {!isLoading && !isError && filteredRows.length === 0 && (
        <EmptyState
          title="No hay proyectos disponibles"
          description="Ajusta los filtros o espera a que se carguen nuevos proyectos."
        />
      )}

      {!isLoading && !isError && filteredRows.length > 0 && (
        <ProjectsTable rows={filteredRows} />
      )}
    </Stack>
  );
};
