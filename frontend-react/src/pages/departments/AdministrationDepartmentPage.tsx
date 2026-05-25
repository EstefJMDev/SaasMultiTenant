import React from "react";
import { useLocation } from "@tanstack/react-router";

import { useCurrentUser } from "@hooks/useCurrentUser";
import { AppShell } from "@widgets/app-shell/AppShell";
import { WorkCatalogPanel } from "@widgets/catalogs/WorkCatalogPanel";

export const AdministrationDepartmentPage: React.FC = () => {
  const { data: currentUser } = useCurrentUser();
  const pathname = useLocation({ select: (loc) => loc.pathname });
  const isSuperAdmin = currentUser?.is_super_admin === true;
  const resource = pathname.endsWith("/providers") ? "providers" : "worksites";

  return (
    <AppShell>
      <WorkCatalogPanel
        resource={resource}
        canView={Boolean(
          isSuperAdmin ||
            (resource === "worksites"
              ? currentUser?.can_view_worksite
              : currentUser?.can_view_provider),
        )}
        canEdit={Boolean(
          isSuperAdmin ||
            (resource === "worksites"
              ? currentUser?.can_edit_worksite
              : currentUser?.can_edit_provider),
        )}
      />
    </AppShell>
  );
};

export default AdministrationDepartmentPage;
