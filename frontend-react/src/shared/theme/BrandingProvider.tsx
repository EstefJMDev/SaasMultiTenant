import React, { useMemo } from "react";
import {
  ChakraProvider,
  ColorModeScript,
  Center,
  Spinner,
  extendTheme,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";

import { useEffectiveTenantId } from "@hooks/useEffectiveTenantId";
import { fetchBranding } from "@api/branding";
import { buildThemeFromBranding } from "./brandTheme";
import { theme as defaultTheme } from "@theme";

interface BrandingProviderProps {
  children: React.ReactNode;
}

const toastOptions = {
  defaultOptions: {
    duration: 3500,
    isClosable: true,
    position: "top-right" as const,
  },
};

export const BrandingProvider: React.FC<BrandingProviderProps> = ({ children }) => {
  const { tenantId, isSuperAdmin } = useEffectiveTenantId();

  const brandingQuery = useQuery({
    queryKey: ["tenant-branding-global", tenantId],
    queryFn: () => fetchBranding(tenantId as number),
    enabled: Boolean(tenantId),
  });

  const needsBranding = Boolean(tenantId);
  const isBrandingLoading =
    needsBranding &&
    (brandingQuery.isLoading ||
      (!brandingQuery.data && brandingQuery.isFetching));

  const theme = useMemo(() => {
    const branding =
      tenantId || brandingQuery.data ? brandingQuery.data : undefined;
    return extendTheme(defaultTheme, buildThemeFromBranding(branding));
  }, [brandingQuery.data, isSuperAdmin, tenantId]);

  if (isBrandingLoading) {
    return (
      <ChakraProvider theme={defaultTheme} toastOptions={toastOptions}>
        <ColorModeScript
          initialColorMode={defaultTheme.config.initialColorMode}
        />
        <Center minH="100vh" bg="gray.50">
          <Spinner size="lg" />
        </Center>
      </ChakraProvider>
    );
  }

  return (
    <ChakraProvider theme={theme} toastOptions={toastOptions}>
      <ColorModeScript
        initialColorMode={defaultTheme.config.initialColorMode}
      />
      {children}
    </ChakraProvider>
  );
};
