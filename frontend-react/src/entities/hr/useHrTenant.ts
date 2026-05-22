import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchAllTenants, type TenantOption } from "@api/users";

interface UseHrTenantParams {
  isSuperAdmin: boolean;
  currentTenantId: number | null;
}

interface UseHrTenantResult {
  selectedTenantId: number | null;
  setSelectedTenantId: React.Dispatch<React.SetStateAction<number | null>>;
  effectiveTenantId: number | null;
  tenants: TenantOption[] | undefined;
  isLoadingTenants: boolean;
  isErrorTenants: boolean;
}

export const useHrTenant = ({
  isSuperAdmin,
  currentTenantId,
}: UseHrTenantParams): UseHrTenantResult => {
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);

  useEffect(() => {
    if (isSuperAdmin) return;
    if (!currentTenantId) return;
    if (selectedTenantId !== null) return;
    setSelectedTenantId(currentTenantId);
  }, [currentTenantId, isSuperAdmin, selectedTenantId]);

  const {
    data: tenants,
    isLoading: isLoadingTenants,
    isError: isErrorTenants,
  } = useQuery<TenantOption[]>({
    queryKey: ["hr-tenants"],
    queryFn: fetchAllTenants,
    enabled: isSuperAdmin,
  });

  const effectiveTenantId = isSuperAdmin ? selectedTenantId : currentTenantId;

  return {
    selectedTenantId,
    setSelectedTenantId,
    effectiveTenantId,
    tenants,
    isLoadingTenants,
    isErrorTenants,
  };
};

