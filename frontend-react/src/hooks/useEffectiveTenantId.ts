import { useEffect, useMemo, useState } from "react";

import { useCurrentUser } from "./useCurrentUser";
import {
  clearTenantId,
  parseTenantId,
  readTenantId,
  writeTenantId,
} from "@shared/api/tenant";

export const useEffectiveTenantId = () => {
  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = currentUser?.is_super_admin === true;
  const [storedTenantId, setStoredTenantId] = useState<string | null>(() =>
    readTenantId(),
  );

  useEffect(() => {
    const refresh = () => setStoredTenantId(readTenantId());
    if (typeof window === "undefined") return;
    window.addEventListener("storage", refresh);
    window.addEventListener("tenant:changed", refresh as EventListener);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("tenant:changed", refresh as EventListener);
    };
  }, []);

  const parsedTenantId = useMemo(
    () => parseTenantId(storedTenantId),
    [storedTenantId],
  );

  const effectiveTenantId = isSuperAdmin
    ? parsedTenantId
      ? Number(parsedTenantId)
      : null
    : currentUser?.tenant_id ?? null;

  const setTenantId = (tenantId: number | null) => {
    if (!isSuperAdmin) return;
    if (!tenantId) {
      clearTenantId();
      return;
    }
    writeTenantId(String(tenantId));
  };

  return {
    tenantId: effectiveTenantId,
    tenantIdString: parsedTenantId,
    isSuperAdmin,
    setTenantId,
  };
};
