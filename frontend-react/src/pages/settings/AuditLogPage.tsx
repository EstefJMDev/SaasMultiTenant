import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Select,
  Spinner,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@widgets/app-shell/AppShell";
import { ProjectHero } from "@widgets/projects";
import { apiClient } from "@shared/api/client";
import { fetchAllTenants } from "@api/users";
import { useCurrentUser } from "@hooks/useCurrentUser";

interface TenantOption {
  id: number;
  name: string;
  subdomain: string;
}

interface AuditLogItem {
  id: number;
  created_at: string;
  user_email: string | null;
  source: string | null;
  action: string;
  details: string | null;
}

/**
 * Página de auditoria.
 *
 * Muestra el log real de acciones clave (login, gestión de tenants, etc.)
 * obtenido del backend.
 */
// Pantalla de auditoria con el registro de acciones.
export const AuditLogPage: React.FC = () => {
  const { t } = useTranslation();
  // Estilos base de la tabla.
  const cardBg = useColorModeValue("white", "gray.700");
  const tableHeadBg = useColorModeValue("gray.50", "gray.800");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = currentUser?.is_super_admin === true;
  const currentTenantId = currentUser?.tenant_id ?? null;

  const [filters, setFilters] = useState({
    tenantId: null as number | null,
    source: "all" as "all" | "web" | "app",
    userEmail: "",
    dateFrom: "",
    dateTo: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);

  const { data: tenants, isLoading: isLoadingTenants } = useQuery<TenantOption[]>({
    queryKey: ["audit-tenants"],
    queryFn: fetchAllTenants,
    enabled: isSuperAdmin,
  });

  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (isSuperAdmin) {
      if (tenants && tenants.length > 0 && !filters.tenantId) {
        setFilters((prev) => ({ ...prev, tenantId: tenants[0].id }));
      }
      return;
    }
    if (currentTenantId && filters.tenantId !== currentTenantId) {
      setFilters((prev) => ({ ...prev, tenantId: currentTenantId }));
    }
  }, [currentTenantId, filters.tenantId, isSuperAdmin, tenants]);

  // Carga el log de auditoria al montar la pagina.

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        setIsError(false);
        const params: Record<string, string | number> = { limit: 200 };
        if (isSuperAdmin && appliedFilters.tenantId) {
          params.tenant_id = appliedFilters.tenantId;
        }
        if (appliedFilters.source !== "all") {
          params.source = appliedFilters.source;
        }
        if (appliedFilters.userEmail.trim()) {
          params.user_email = appliedFilters.userEmail.trim();
        }
        if (appliedFilters.dateFrom) {
          params.start_date = `${appliedFilters.dateFrom}T00:00:00`;
        }
        if (appliedFilters.dateTo) {
          params.end_date = `${appliedFilters.dateTo}T23:59:59`;
        }
        const response = await apiClient.get<AuditLogItem[]>("/api/v1/audit/", {
          params,
        });
        if (!cancelled) {
          setItems(response.data);
        }
      } catch {
        if (!cancelled) {
          setIsError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [appliedFilters, isSuperAdmin]);

  // Render principal de la pagina.
  return (
    <AppShell>
      <Box mb={8}>
        <ProjectHero
          items={[]}
          title={t("audit.header.title")}
          subtitle={t("audit.header.subtitle")}
          eyebrow={t("audit.header.eyebrow")}
          animation={`${fadeUp} 0.6s ease-out`}
        />
      </Box>
      <Text mb={6}>
        {t("audit.description")}
      </Text>
      <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg} mb={6}>
        <Stack spacing={4}>
          <HStack spacing={4} align="flex-end" flexWrap="wrap">
            {isSuperAdmin && (
              <FormControl maxW="260px">
                <FormLabel>{t("audit.filters.tenant")}</FormLabel>
                <Select
                  value={filters.tenantId ?? ""}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      tenantId: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  isDisabled={isLoadingTenants}
                >
                  {(tenants ?? []).map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.subdomain})
                    </option>
                  ))}
                </Select>
              </FormControl>
            )}
            <FormControl maxW="200px">
              <FormLabel>{t("audit.filters.source")}</FormLabel>
              <Select
                value={filters.source}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    source: e.target.value as typeof prev.source,
                  }))
                }
              >
                <option value="all">{t("audit.filters.all")}</option>
                <option value="web">{t("audit.sources.web")}</option>
                <option value="app">{t("audit.sources.app")}</option>
              </Select>
            </FormControl>
            <FormControl maxW="260px">
              <FormLabel>{t("audit.filters.user")}</FormLabel>
              <Input
                value={filters.userEmail}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, userEmail: e.target.value }))
                }
                placeholder={t("audit.filters.userPlaceholder")}
              />
            </FormControl>
            <FormControl maxW="200px">
              <FormLabel>{t("audit.filters.from")}</FormLabel>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
                }
              />
            </FormControl>
            <FormControl maxW="200px">
              <FormLabel>{t("audit.filters.to")}</FormLabel>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
                }
              />
            </FormControl>
          </HStack>
          <HStack spacing={3}>
            <Button
              colorScheme="brand"
              size="sm"
              onClick={() => setAppliedFilters(filters)}
            >
              {t("audit.filters.apply")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const reset = {
                  tenantId: isSuperAdmin ? (tenants?.[0]?.id ?? null) : currentTenantId,
                  source: "all" as const,
                  userEmail: "",
                  dateFrom: "",
                  dateTo: "",
                };
                setFilters(reset);
                setAppliedFilters(reset);
              }}
            >
              {t("audit.filters.clear")}
            </Button>
          </HStack>
        </Stack>
      </Box>

      {isLoading && (
        <Box mb={4}>
          <Spinner size="sm" mr={2} />
          <Text as="span" fontSize="sm">
            {t("audit.loading")}
          </Text>
        </Box>
      )}

      {isError && (
        <Text mb={4} fontSize="sm" color="red.500">
          {t("audit.error")}
        </Text>
      )}

      <Box borderWidth="1px" borderRadius="md" overflow="hidden" bg={cardBg}>
        <Table size="sm">
          <Thead bg={tableHeadBg}>
            <Tr>
              <Th>{t("audit.table.date")}</Th>
              <Th>{t("audit.table.user")}</Th>
              <Th>{t("audit.table.source")}</Th>
              <Th>{t("audit.table.action")}</Th>
              <Th>{t("audit.table.details")}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {items.length === 0 ? (
              <Tr>
                <Td colSpan={4}>
                  <Text fontSize="sm" color="gray.500">
                    {t("audit.table.empty")}
                  </Text>
                </Td>
              </Tr>
            ) : (
              items.map((item) => (
                <Tr key={item.id}>
                  <Td>{new Date(item.created_at).toLocaleString()}</Td>
                  <Td>{item.user_email ?? "-"}</Td>
                  <Td>{item.source ? t(`audit.sources.${item.source}`, { defaultValue: item.source }) : "-"}</Td>
                  <Td>{t(`audit_actions.${item.action}`, { defaultValue: item.action })}</Td>
                  <Td>{t(`audit_details.${item.action}`, { defaultValue: item.details ?? "-" })}</Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </Box>
    </AppShell>
  );
};


