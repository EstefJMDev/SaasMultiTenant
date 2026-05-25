import { useQuery } from "@tanstack/react-query";

import { fetchDepartments, fetchEmployees, fetchHeadcount } from "@api/hr";
import type { Department, EmployeeProfile, HeadcountItem } from "./types";
import { hrKeys } from "./keys";

export const useHrDepartments = (tenantId?: number | null, enabled = true) => {
  return useQuery<Department[]>({
    queryKey: hrKeys.departments(tenantId ?? undefined),
    queryFn: () => fetchDepartments(tenantId ?? undefined),
    enabled,
  });
};

export const useHrEmployees = (
  tenantId?: number | null,
  enabled = true,
  year?: number,
) => {
  return useQuery<EmployeeProfile[]>({
    queryKey: hrKeys.employees(tenantId ?? undefined, year),
    queryFn: () => fetchEmployees(tenantId ?? undefined, year),
    enabled,
  });
};

export const useHrHeadcount = (tenantId?: number | null, enabled = true) => {
  return useQuery<HeadcountItem[]>({
    queryKey: hrKeys.headcount(tenantId ?? undefined),
    queryFn: () => fetchHeadcount(tenantId ?? undefined),
    enabled,
  });
};
