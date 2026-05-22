import { useMemo } from "react";

import { useProjects } from "@features/projects/queries/useProjects";
import { useDepartments } from "@features/departments/queries/useDepartments";
import type { ProjectRead } from "@features/projects/types";

export type ProjectRow = ProjectRead & {
  departmentName: string;
};

export const useProjectsView = () => {
  const projectsQuery = useProjects();
  const departmentsQuery = useDepartments();

  const departments = departmentsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];

  const deptById = useMemo(() => {
    const map = new Map<number, string>();
    departments.forEach((dept) => {
      map.set(dept.id, dept.name);
    });
    return map;
  }, [departments]);

  const rows = useMemo<ProjectRow[]>(
    () =>
      projects.map((project) => ({
        ...project,
        departmentName: deptById.get(project.department_id) ?? "—",
      })),
    [projects, deptById],
  );

  const isLoading = projectsQuery.isLoading || departmentsQuery.isLoading;
  const isError = projectsQuery.isError || departmentsQuery.isError;

  const refetchAll = () => {
    void projectsQuery.refetch();
    void departmentsQuery.refetch();
  };

  return {
    rows,
    projects,
    departments,
    isLoading,
    isError,
    refetchAll,
  };
};
