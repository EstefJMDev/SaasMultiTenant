import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Stack,
  Text,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { AppShell } from "@widgets/app-shell/AppShell";
import { ProjectHero } from "@widgets/projects";
import { fetchBranding, updateBranding } from "@api/branding";
import { useHrDepartments, type Department } from "@entities/hr";
import { useEffectiveTenantId } from "@hooks/useEffectiveTenantId";

export const TenantDepartmentEmailsPage: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { tenantId: selectedTenantId, isSuperAdmin } = useEffectiveTenantId();
  const [departmentEmailsByName, setDepartmentEmailsByName] = useState<
    Record<string, string>
  >({});

  const tenantId = selectedTenantId ?? undefined;

  const brandingQuery = useQuery({
    queryKey: ["tenant-branding", tenantId],
    queryFn: () => fetchBranding(tenantId as number),
    enabled: Boolean(tenantId),
  });

  const departmentsQuery = useHrDepartments(tenantId, Boolean(tenantId));

  const departmentRows = useMemo(
    () =>
      [...(departmentsQuery.data ?? [])]
        .filter((item) => item.is_active)
        .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" })),
    [departmentsQuery.data],
  );

  useEffect(() => {
    if (!brandingQuery.data) return;
    if (!departmentRows.length) {
      setDepartmentEmailsByName({});
      return;
    }
    const fromBranding = brandingQuery.data.department_emails ?? {};
    const next: Record<string, string> = {};
    for (const dept of departmentRows) {
      next[dept.name] = fromBranding[dept.name] ?? "";
    }
    setDepartmentEmailsByName(next);
  }, [brandingQuery.data, departmentRows]);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateBranding(tenantId as number, {
        departmentEmails: Object.entries(departmentEmailsByName).reduce<
          Record<string, string>
        >((acc, [department, email]) => {
          const key = department.trim();
          const value = email.trim();
          if (!key || !value) return acc;
          acc[key] = value;
          return acc;
        }, {}),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["tenant-branding", tenantId], data);
      queryClient.invalidateQueries({ queryKey: ["tenant-branding", tenantId] });
      queryClient.invalidateQueries({
        queryKey: ["tenant-branding-shell", tenantId],
      });
      queryClient.invalidateQueries({
        queryKey: ["tenant-branding-global", tenantId],
      });
      queryClient.invalidateQueries({
        queryKey: ["tenant-branding-global"],
      });
      toast({
        title: t("branding.messages.updateSuccessTitle"),
        description: t("branding.messages.updateSuccessDesc"),
        status: "success",
      });
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ?? t("branding.messages.updateErrorFallback");
      toast({
        title: t("branding.messages.updateErrorTitle"),
        description: detail,
        status: "error",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    updateMutation.mutate();
  };

  const handleDepartmentEmailChange = (departmentName: string, email: string) => {
    setDepartmentEmailsByName((prev) => ({
      ...prev,
      [departmentName]: email,
    }));
  };

  return (
    <AppShell>
      <Box mb={8}>
        <ProjectHero
          items={[]}
          title={t("branding.departmentEmails.title")}
          subtitle={t("branding.departmentEmails.subtitle")}
          eyebrow={t("branding.header.eyebrow")}
          animation={`${fadeUp} 0.6s ease-out`}
        />
      </Box>

      {isSuperAdmin && (
        <Box mb={6}>
          <Text fontSize="sm" color={subtleText}>
            {selectedTenantId
              ? `Tenant activo: ${selectedTenantId}.`
              : "No hay tenant seleccionado."}{" "}
            Cambia el tenant desde el selector superior.
          </Text>
        </Box>
      )}

      <Box
        as="form"
        onSubmit={handleSubmit}
        bg={cardBg}
        borderWidth="1px"
        borderRadius="xl"
        p={{ base: 4, md: 6 }}
      >
        {!tenantId && (
          <Text color={subtleText}>{t("branding.messages.selectTenant")}</Text>
        )}
        {tenantId && brandingQuery.isLoading && (
          <Text>{t("branding.messages.loading")}</Text>
        )}
        {tenantId && brandingQuery.isError && (
          <Text color="red.500">{t("branding.messages.loadError")}</Text>
        )}
        {tenantId && departmentsQuery.isLoading && (
          <Text>{t("branding.messages.loading")}</Text>
        )}
        {tenantId && departmentsQuery.isError && (
          <Text color="red.500">{t("branding.messages.loadError")}</Text>
        )}

        {tenantId && brandingQuery.data && !departmentsQuery.isLoading && (
          <Stack spacing={4}>
            {departmentRows.length === 0 && (
              <Text fontSize="sm" color={subtleText}>
                {t("branding.departmentEmails.empty")}
              </Text>
            )}
            {departmentRows.map((department) => (
              <HStack key={`dept-email-${department.id}`} align="flex-end">
                <FormControl>
                  <FormLabel fontSize="xs">
                    {t("branding.departmentEmails.department")}
                  </FormLabel>
                  <Input size="sm" value={department.name} isReadOnly />
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="xs">
                    {t("branding.departmentEmails.email")}
                  </FormLabel>
                  <Input
                    size="sm"
                    type="email"
                    value={departmentEmailsByName[department.name] ?? ""}
                    onChange={(e) =>
                      handleDepartmentEmailChange(department.name, e.target.value)
                    }
                  />
                </FormControl>
              </HStack>
            ))}

            <Button
              type="submit"
              colorScheme="brand"
              alignSelf="flex-start"
              isLoading={updateMutation.isPending}
            >
              {t("branding.actions.save")}
            </Button>
          </Stack>
        )}
      </Box>
    </AppShell>
  );
};

