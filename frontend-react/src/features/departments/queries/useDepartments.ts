import { useQuery } from "@tanstack/react-query";

import { useEffectiveTenantId } from "@hooks/useEffectiveTenantId";
import { getDepartments } from "../api/departmentsApi";
import type { DepartmentRead } from "../types";

const buildDepartmentsKey = (tenantId: number | null) =>
  ["hr-departments", tenantId ?? "all"] as const;

export const useDepartments = () => {
  const { tenantId, isSuperAdmin } = useEffectiveTenantId();
  const tenantReady = !isSuperAdmin || tenantId !== null;

  return useQuery<DepartmentRead[]>({
    queryKey: buildDepartmentsKey(tenantId),
    queryFn: () => getDepartments(),
    enabled: tenantReady,
  });
};
