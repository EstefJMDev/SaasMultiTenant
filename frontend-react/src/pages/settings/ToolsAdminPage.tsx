import React from "react";
import {
  Box,
  Heading,
  Text,
  SimpleGrid,
  Badge,
  Button,
  useToast,
  useColorModeValue,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { AppShell } from "@widgets/app-shell/AppShell";
import { ProjectHero } from "@widgets/projects";
import {
  fetchToolCatalog,
  fetchTenantTools,
  setTenantToolEnabled,
  Tool,
} from "@api/tools";
import { useEffectiveTenantId } from "@hooks/useEffectiveTenantId";

/**
 * Página de administración de herramientas por tenant.
 *
 * Muestra el catálogo global y cuáles están habilitadas para el tenant actual.
 * - Como Super Admin: cambia el tenant desde el selector superior para gestionar herramientas.
 * - Como admin_tenant: gestionas las herramientas de tu tenant.
 */
// Pantalla de herramientas por tenant.
export const ToolsAdminPage: React.FC = () => {
  // Utilidades y estilos base.
  const toast = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { tenantId: selectedTenantId, isSuperAdmin } = useEffectiveTenantId();

  // Catalogo global de herramientas.
  const { data: catalog, isLoading: isCatalogLoading } = useQuery<Tool[]>({
    queryKey: ["tool-catalog"],
    queryFn: fetchToolCatalog,
  });

  // Herramientas habilitadas para el tenant seleccionado.
  const { data: tenantTools, isLoading: isTenantLoading } = useQuery<Tool[]>({
    queryKey: ["tenant-tools-admin", selectedTenantId],
    queryFn: () => fetchTenantTools(selectedTenantId as number),
    enabled: selectedTenantId !== null,
  });

  // Activar/desactivar herramienta para un tenant.
  const toggleMutation = useMutation({
    mutationFn: async ({
      tenantId,
      toolId,
      nextEnabled,
    }: {
      tenantId: number;
      toolId: number;
      nextEnabled: boolean;
    }) => {
      await setTenantToolEnabled(tenantId, toolId, nextEnabled);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["tenant-tools-admin", variables.tenantId],
      });
      toast({
        title: t("toolsAdmin.messages.updateSuccessTitle"),
        description: t("toolsAdmin.messages.updateSuccessDesc"),
        status: "success",
      });
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        t("toolsAdmin.messages.updateErrorFallback");
      toast({
        title: t("toolsAdmin.messages.updateErrorTitle"),
        description: detail,
        status: "error",
      });
    },
  });

  const tenantToolIds = new Set(tenantTools?.map((t) => t.id) ?? []);
  const fixMojibake = (value?: string | null): string => {
    if (!value) return "";
    try {
      return decodeURIComponent(escape(value));
    } catch {
      return value.replace(/�/g, "");
    }
  };

  // Alterna el estado de una herramienta.
  const handleToggle = (toolId: number, enabled: boolean) => {
    if (!selectedTenantId) return;
    toggleMutation.mutate({
      tenantId: selectedTenantId,
      toolId,
      nextEnabled: !enabled,
    });
  };

  // Render principal de la pagina.
  return (
    <AppShell>
      <Box mb={8}>
        <ProjectHero
          items={[]}
          title={t("toolsAdmin.header.title")}
          subtitle={t("toolsAdmin.header.subtitle")}
          eyebrow={t("toolsAdmin.header.eyebrow")}
          animation={`${fadeUp} 0.6s ease-out`}
        />
      </Box>

      {isSuperAdmin && (
        <Box mb={4}>
          <Text fontSize="sm" color={subtleText}>
            {selectedTenantId
              ? `Tenant activo: ${selectedTenantId}.`
              : "No hay tenant seleccionado."}{" "}
            Cambia el tenant desde el selector superior.
          </Text>
        </Box>
      )}

      <Text mb={6}>
        Configuración de herramientas externas (Moodle, ERP, BI, etc.)
        habilitadas para este tenant.
      </Text>

      {(isCatalogLoading ||
        isTenantLoading ||
        (isSuperAdmin && !selectedTenantId)) && (
        <Text>{t("toolsAdmin.loading")}</Text>
      )}

      {!isCatalogLoading && catalog && selectedTenantId && (
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          {catalog.map((tool) => {
            const enabled = tenantToolIds.has(tool.id);
            return (
              <Box
                key={tool.id}
                borderWidth="1px"
                borderRadius="md"
                p={4}
                bg={cardBg}
              >
                <Heading size="sm" mb={2}>
                  {tool.name}
                </Heading>
                <Text fontSize="sm" mb={2} color={subtleText}>
                  {fixMojibake(
                    tool.description ?? t("toolsAdmin.catalog.fallbackDescription"),
                  )}
                </Text>
                <Badge colorScheme={enabled ? "brand" : "gray"} mb={3}>
                  {enabled
                    ? t("toolsAdmin.catalog.enabled")
                    : t("toolsAdmin.catalog.disabled")}
                </Badge>
                <Button
                  size="sm"
                  variant={enabled ? "outline" : "solid"}
                  colorScheme={enabled ? "red" : "brand"}
                  onClick={() => handleToggle(tool.id, enabled)}
                  isLoading={toggleMutation.isPending}
                  isDisabled={enabled}
                >
                  {enabled
                    ? t("toolsAdmin.actions.disable")
                    : t("toolsAdmin.actions.enable")}
                </Button>
              </Box>
            );
          })}
        </SimpleGrid>
      )}
    </AppShell>
  );
};
