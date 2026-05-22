import React from "react";
import { Box, Text, useColorModeValue } from "@chakra-ui/react";
import { useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { useCurrentUser } from "@hooks/useCurrentUser";
import { AppShell } from "@widgets/app-shell/AppShell";
import { PageHero } from "@widgets/app-shell/PageHero";
import { WorkCatalogPanel } from "@widgets/catalogs/WorkCatalogPanel";

export const ErpWorkManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const { data: currentUser } = useCurrentUser();
  const pathname = useLocation({ select: (loc) => loc.pathname });
  const panelBg = useColorModeValue("white", "gray.700");
  const isSuperAdmin = currentUser?.is_super_admin === true;
  const resource = pathname.endsWith("/providers") ? "providers" : "worksites";

  return (
    <AppShell>
      <PageHero
        eyebrow=""
        title={t("layout.nav.workManagement")}
        subtitle="Catálogos y apoyo operativo para obra."
      />
      <Box borderWidth="1px" borderRadius="xl" p={6} bg={panelBg}>
        <Text fontSize="sm" color="gray.500" mb={4}>
          {resource === "worksites"
            ? "Consulta de obras para el equipo de Gestión de obra."
            : "Consulta de proveedores para el equipo de Gestión de obra."}
        </Text>
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
      </Box>
    </AppShell>
  );
};
