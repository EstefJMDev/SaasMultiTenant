import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Image,
  Input,
  Checkbox,
  SimpleGrid,
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
import { apiClient } from "@shared/api/client";
import { extractApiError } from "@shared/api/errors";
import { fetchBranding, updateBranding } from "@api/branding";
import { useEffectiveTenantId } from "@hooks/useEffectiveTenantId";

export const TenantBrandingPage: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const logoPreviewBg = useColorModeValue("white", "gray.800");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { tenantId: selectedTenantId, isSuperAdmin } = useEffectiveTenantId();
  const [accentColor, setAccentColor] = useState("#00662b");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [companySubtitle, setCompanySubtitle] = useState("");
  const [showCompanyName, setShowCompanyName] = useState(true);
  const [showCompanySubtitle, setShowCompanySubtitle] = useState(true);

  const tenantId = selectedTenantId ?? undefined;

  const brandingQuery = useQuery({
    queryKey: ["tenant-branding", tenantId],
    queryFn: () => fetchBranding(tenantId as number),
    enabled: Boolean(tenantId),
  });

  useEffect(() => {
    if (!brandingQuery.data) return;
    setAccentColor(brandingQuery.data.accent_color);
    setLogoFile(null);
    setLogoVersion((prev) => prev + 1);
    setCompanyName(brandingQuery.data.company_name ?? "");
    setCompanySubtitle(brandingQuery.data.company_subtitle ?? "");
    setShowCompanyName(brandingQuery.data.show_company_name ?? true);
    setShowCompanySubtitle(brandingQuery.data.show_company_subtitle ?? true);
  }, [brandingQuery.data]);

  const previewPalette = useMemo(() => {
    const hex = accentColor.toLowerCase();
    if (!/^#([0-9a-f]{6})$/.test(hex)) {
      return brandingQuery.data?.color_palette ?? {};
    }

    const toRgb = (value: string) => ({
      r: parseInt(value.slice(1, 3), 16),
      g: parseInt(value.slice(3, 5), 16),
      b: parseInt(value.slice(5, 7), 16),
    });
    const mix = (base: number, target: number, ratio: number) =>
      Math.round(base + (target - base) * ratio);
    const toHex = (r: number, g: number, b: number) =>
      `#${[r, g, b]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")}`;

    const base = toRgb(hex);
    const lightMix: Record<string, number> = {
      "50": 0.9227,
      "100": 0.8365,
      "200": 0.6845,
      "300": 0.5216,
      "400": 0.3582,
    };
    const darkMix: Record<string, number> = {
      "600": 0.1794,
      "700": 0.354,
      "800": 0.4973,
      "900": 0.6504,
    };

    const palette: Record<string, string> = {};
    Object.entries(lightMix).forEach(([key, ratio]) => {
      palette[key] = toHex(
        mix(base.r, 255, ratio),
        mix(base.g, 255, ratio),
        mix(base.b, 255, ratio),
      );
    });
    palette["500"] = hex;
    Object.entries(darkMix).forEach(([key, ratio]) => {
      palette[key] = toHex(
        mix(base.r, 0, ratio),
        mix(base.g, 0, ratio),
        mix(base.b, 0, ratio),
      );
    });
    return palette;
  }, [accentColor, brandingQuery.data?.color_palette]);

  const resolvedLogo = useMemo(() => {
    if (logoFile) {
      return URL.createObjectURL(logoFile);
    }
    const logo = brandingQuery.data?.logo ?? null;
    if (!logo) return null;
    if (logo.startsWith("http")) return logo;
    const base = apiClient.defaults.baseURL || window.location.origin;
    return `${base}${logo}?v=${logoVersion}`;
  }, [brandingQuery.data?.logo, logoVersion, logoFile]);

  useEffect(() => {
    return () => {
      if (logoFile) {
        URL.revokeObjectURL(resolvedLogo ?? "");
      }
    };
  }, [logoFile, resolvedLogo]);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateBranding(tenantId as number, {
        accentColor,
        logoFile,
        companyName,
        companySubtitle,
        showCompanyName,
        showCompanySubtitle,
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
      setLogoVersion(Date.now());
      setLogoFile(null);
      toast({
        title: t("branding.messages.updateSuccessTitle"),
        description: t("branding.messages.updateSuccessDesc"),
        status: "success",
      });
    },
    onError: (error: unknown) => {
      const detail = extractApiError(error, t("branding.messages.updateErrorFallback"));
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

  return (
    <AppShell>
      <Box mb={8}>
        <ProjectHero
          items={[]}
          title={t("branding.header.title")}
          subtitle={t("branding.header.subtitle")}
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

        {tenantId && brandingQuery.data && (
          <Stack spacing={5}>
            <FormControl>
              <FormLabel>{t("branding.fields.logo")}</FormLabel>
              <HStack spacing={4} align="center">
                <Box
                  borderWidth="1px"
                  borderRadius="md"
                  p={3}
                  bg={logoPreviewBg}
                >
                  {resolvedLogo ? (
                    <Image
                      src={resolvedLogo}
                      alt="logo"
                      maxH="80px"
                      maxW="200px"
                      objectFit="contain"
                    />
                  ) : (
                    <Text fontSize="sm" color={subtleText}>
                      {t("branding.fields.noLogo")}
                    </Text>
                  )}
                </Box>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                />
              </HStack>
            </FormControl>

            <FormControl maxW="420px">
              <FormLabel>{t("branding.fields.companyName")}</FormLabel>
              <Checkbox
                isChecked={showCompanyName}
                onChange={(e) => setShowCompanyName(e.target.checked)}
                mb={2}
              >
                {t("branding.fields.companyNameEnabled")}
              </Checkbox>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                isDisabled={!showCompanyName}
              />
            </FormControl>

            <FormControl maxW="520px">
              <FormLabel>{t("branding.fields.companySubtitle")}</FormLabel>
              <Checkbox
                isChecked={showCompanySubtitle}
                onChange={(e) => setShowCompanySubtitle(e.target.checked)}
                mb={2}
              >
                {t("branding.fields.companySubtitleEnabled")}
              </Checkbox>
              <Input
                value={companySubtitle}
                onChange={(e) => setCompanySubtitle(e.target.value)}
                isDisabled={!showCompanySubtitle}
              />
            </FormControl>

            <FormControl maxW="220px">
              <FormLabel>{t("branding.fields.accentColor")}</FormLabel>
              <HStack>
                <Input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  w="64px"
                  p={0}
                />
                <Input
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                />
              </HStack>
            </FormControl>

            <Box>
              <Text fontSize="sm" color={subtleText} mb={2}>
                {t("branding.fields.palette")}
              </Text>
              <SimpleGrid columns={{ base: 2, md: 5 }} spacing={3}>
                {Object.entries(previewPalette).map(([key, value]) => {
                  const keyNum = Number(key);
                  const labelColor = keyNum <= 400 ? "#111" : "white";
                  return (
                    <Box
                      key={key}
                      borderWidth="1px"
                      borderRadius="md"
                      p={3}
                      bg={value}
                    >
                      <Text fontSize="xs" color={labelColor}>
                        {key}: {value}
                      </Text>
                    </Box>
                  );
                })}
              </SimpleGrid>
            </Box>

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


