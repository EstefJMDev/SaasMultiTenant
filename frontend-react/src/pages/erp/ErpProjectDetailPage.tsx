import React from "react";
import { Box, Text, useColorModeValue } from "@chakra-ui/react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AppShell } from "@widgets/app-shell/AppShell";
import { ProjectHero } from "@widgets/projects";

// Vista detalle basica para proyectos ERP.
export const ErpProjectDetailPage: React.FC = () => {
  const { projectId } = useParams({ strict: false }) as { projectId?: string };
  const { t } = useTranslation();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.500", "gray.300");

  const subtitle = t("erp.projectDetail.code", {
    id: projectId ?? t("erp.projectDetail.noId"),
  });

  return (
    <AppShell>
      <ProjectHero
        items={[]}
        title={t("erp.projectDetail.title")}
        subtitle={subtitle}
        breadcrumb="Gestión de proyectos"
      />
      <Box borderWidth="1px" borderRadius="xl" p={6} bg={cardBg}>
        <Text fontSize="sm" color={subtleText}>
          {subtitle}
        </Text>
      </Box>
    </AppShell>
  );
};
