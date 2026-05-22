import { useQuery } from "@tanstack/react-query";

import { projectKeys } from "@entities/projects";
import { useEffectiveTenantId } from "@hooks/useEffectiveTenantId";
import { getProjects } from "../api/projectsApi";
import type { ProjectRead } from "../types";

export const useProjects = () => {
  const { tenantId, isSuperAdmin } = useEffectiveTenantId();
  const tenantReady = !isSuperAdmin || tenantId !== null;

  return useQuery<ProjectRead[]>({
    queryKey: projectKeys.list(tenantId ?? undefined),
    queryFn: () => getProjects(),
    enabled: tenantReady,
  });
};
