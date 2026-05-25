import React, { useEffect, useMemo, useContext, useState } from "react";
import {
  Box,
  Center,
  Flex,
  Spinner,
  useColorModeValue,
} from "@chakra-ui/react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AppSidebar } from "./AppSidebar";
import { ConnectedTopbar } from "@components/layout/AppTopbar/ConnectedTopbar";
import { apiClient } from "@shared/api/client";
import { fetchBranding } from "@api/branding";
import { fetchTenantTools } from "@api/tools";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { buildNavSections, NavItem, NavSection } from "./nav";
import { PageInfoContext, PageInfoOverride } from "./PageInfoContext";
import { buildBreadcrumb } from "@shared/routing/breadcrumb";
import { EmptyState } from "@shared/ui/EmptyState";
import { parseTenantId, readTenantId } from "@shared/api/tenant";
import { isTenantScopedRoute } from "@shared/routing/tenantScope";

interface AppShellProps {
  children: React.ReactNode;
}

const AppShellContext = React.createContext(false);

const HIDE_SHELL_ROUTES = new Set([
  "/",
  "/mfa",
  "/accept-invitation",
  "/supplier-onboarding",
  "/supplier/complete",
  "/public/autofirma-sign",
]);

const isHiddenRoute = (pathname: string): boolean =>
  Array.from(HIDE_SHELL_ROUTES).some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

const isItemActive = (pathname: string, item: NavItem): boolean => {
  if (!item.to) return false;
  if (item.matchPrefix) {
    return pathname === item.to || pathname.startsWith(`${item.to}/`);
  }
  return pathname === item.to;
};

const findActiveLabel = (
  sections: NavSection[],
  pathname: string,
): string | null => {
  for (const section of sections) {
    for (const item of section.items) {
      if (isItemActive(pathname, item)) return item.label;
      if (item.children) {
        const found = item.children.find((child) =>
          isItemActive(pathname, child),
        );
        if (found) return found.label;
      }
    }
  }
  return null;
};

const findActiveBreadcrumb = (
  sections: NavSection[],
  pathname: string,
): string | undefined => {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.children) {
        const found = item.children.find((child) =>
          isItemActive(pathname, child),
        );
        if (found) return section.label ?? item.label ?? undefined;
      }
    }
  }
  return undefined;
};

const findActiveIcon = (
  sections: NavSection[],
  pathname: string,
): React.ComponentType<any> | undefined => {
  for (const section of sections) {
    for (const item of section.items) {
      if (isItemActive(pathname, item)) return item.icon;
      if (item.children) {
        const found = item.children.find((child) =>
          isItemActive(pathname, child),
        );
        if (found) return found.icon ?? item.icon;
      }
    }
  }
  return undefined;
};

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = useLocation({ select: (loc) => loc.pathname });
  const isNested = useContext(AppShellContext);

  const { data: currentUser, isLoading: isUserLoading } = useCurrentUser();
  const email = currentUser?.email ?? t("layout.user.fallbackEmail");
  const fullName = currentUser?.full_name ?? t("layout.user.fallbackName");
  const isSuperAdmin = currentUser?.is_super_admin === true;
  const isTenantAdmin =
    !isSuperAdmin && currentUser?.role_name === "tenant_admin";
  const roleName = (currentUser?.role_name ?? "").toLowerCase();
  const isGerencia =
    !isSuperAdmin &&
    (roleName === "gerencia" ||
      roleName === "gerente" ||
      roleName === "manager" ||
      roleName === "management");
  const isSupport = !isSuperAdmin && roleName === "support";
  const tenantId = currentUser?.tenant_id ?? null;
  const selectedTenantId = parseTenantId(readTenantId());
  const departmentNavConfig = currentUser?.department_nav_config ?? null;
  const canShowNav = (key: string): boolean =>
    departmentNavConfig?.[key] !== false;
  const canShowChildNav = (parent: string, child: string): boolean =>
    canShowNav(parent) && canShowNav(child);
  const hasAnyComparativeCap =
    isSuperAdmin ||
    Boolean(
      currentUser?.can_create_comparative ||
        currentUser?.can_edit_comparative ||
        currentUser?.can_delete_comparative ||
        currentUser?.can_approve_comparative ||
        currentUser?.can_reject_comparative ||
        currentUser?.can_view_all_comparatives,
    );
  const canViewWorksites = Boolean(
    isSuperAdmin || currentUser?.can_view_worksite,
  );
  const canEditWorksites = Boolean(
    isSuperAdmin || currentUser?.can_edit_worksite,
  );
  const canViewProviders = Boolean(
    isSuperAdmin || currentUser?.can_view_provider,
  );
  const canEditProviders = Boolean(
    isSuperAdmin || currentUser?.can_edit_provider,
  );

  const topbarBg = useColorModeValue("bg.surface", "gray.900");
  const pageBg = useColorModeValue("bg.canvas", "gray.950");
  const borderSubtle = useColorModeValue("border.subtle", "whiteAlpha.200");
  const contentMaxW = "1680px";
  const contentPx = { base: 3, md: 6 };

  const brandingQuery = useQuery({
    queryKey: ["tenant-branding-shell", tenantId],
    queryFn: () => fetchBranding(tenantId as number),
    enabled: Boolean(tenantId) && !isSuperAdmin,
  });

  const hasToolsReadPermission =
    isSuperAdmin || (currentUser?.permissions ?? []).includes("tools:read");
  const tenantToolsQuery = useQuery({
    queryKey: ["tenant-tools-shell", tenantId],
    queryFn: () => fetchTenantTools(tenantId as number),
    enabled: Boolean(tenantId) && !isSuperAdmin && hasToolsReadPermission,
  });
  const isErpEnabledForTenant = useMemo(() => {
    if (isSuperAdmin) return true;
    if (!tenantId) return false;
    if (!hasToolsReadPermission) return true;
    if (!tenantToolsQuery.data) return true;
    return tenantToolsQuery.data.some((tool) => tool.slug === "erp");
  }, [hasToolsReadPermission, isSuperAdmin, tenantId, tenantToolsQuery.data]);

  useEffect(() => {
    if (isUserLoading || !currentUser) return;
    const erpPrefixes = [
      "/works",
      "/tasks",
      "/work-management",
      "/external-collaborations",
      "/simulations",
      "/invoices",
      "/contracts",
      "/comparatives",
      "/time-control",
      "/time-report",
    ];
    const isErpPath = erpPrefixes.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    );
    if (!isErpEnabledForTenant && isErpPath) {
      router.history.push("/dashboard");
    }
  }, [currentUser, isErpEnabledForTenant, isUserLoading, pathname, router.history]);

  const needsBranding = !isSuperAdmin && Boolean(tenantId);
  const isBrandingLoading =
    needsBranding &&
    (brandingQuery.isLoading ||
      (!brandingQuery.data && brandingQuery.isFetching));

  const showCompanyName = brandingQuery.data?.show_company_name ?? true;
  const showCompanySubtitle = brandingQuery.data?.show_company_subtitle ?? true;
  const brandingName =
    !isSuperAdmin
      ? showCompanyName
        ? brandingQuery.data?.company_name ?? t("layout.brand.title")
        : t("layout.brand.title")
      : t("layout.brand.title");
  const brandingSubtitle =
    !isSuperAdmin
      ? showCompanySubtitle
        ? brandingQuery.data?.company_subtitle ?? t("layout.brand.subtitle")
        : t("layout.brand.subtitle")
      : t("layout.brand.subtitle");
  const handleLogout = () => {
    void apiClient.post("/api/v1/auth/logout").catch(() => undefined);
    localStorage.removeItem("access_token");
    queryClient.clear();
    router.history.push("/");
  };

  const [override, setOverrideState] = useState<PageInfoOverride | null>(null);
  const setOverride = (info: PageInfoOverride | null) => setOverrideState(info);
  const pageInfoCtxValue = useMemo(() => ({ setOverride }), []);

  const navSections = useMemo(
    () =>
      buildNavSections(t, {
        isSuperAdmin,
        isTenantAdmin,
        isGerencia,
        isSupport,
        isErpEnabledForTenant,
        canShowNav,
        canShowChildNav,
        hasAnyComparativeCap,
        canViewWorksites,
        canEditWorksites,
        canViewProviders,
        canEditProviders,
      }),
    [
      t,
      isSuperAdmin,
      isTenantAdmin,
      isGerencia,
      isSupport,
      isErpEnabledForTenant,
      canShowNav,
      canShowChildNav,
      hasAnyComparativeCap,
      canViewWorksites,
      canEditWorksites,
      canViewProviders,
      canEditProviders,
    ],
  );

  const visibleSections = useMemo(
    () => {
      const navCtx = {
        isSuperAdmin,
        isTenantAdmin,
        isGerencia,
        isSupport,
        isErpEnabledForTenant,
        canShowNav,
        canShowChildNav,
        hasAnyComparativeCap,
        canViewWorksites,
        canEditWorksites,
        canViewProviders,
        canEditProviders,
      };
      const isItemVisible = (item: { isVisible?: (ctx: typeof navCtx) => boolean }) =>
        !item.isVisible || item.isVisible(navCtx);
      return navSections
        .filter((section) => !section.isVisible || section.isVisible(navCtx))
        .map((section) => ({
          ...section,
          items: section.items
            .filter(isItemVisible)
            .map((item) => ({
              ...item,
              children: item.children?.filter(isItemVisible),
            }))
            .filter(
              (item) =>
                !item.children || item.children.length > 0 || Boolean(item.to),
            ),
        }))
        .filter((section) => section.items.length > 0);
    },
    [
      navSections,
      isSuperAdmin,
      isTenantAdmin,
      isGerencia,
      isSupport,
      isErpEnabledForTenant,
      canShowNav,
      canShowChildNav,
      hasAnyComparativeCap,
      canViewWorksites,
      canEditWorksites,
      canViewProviders,
      canEditProviders,
    ],
  );

  const pageTitle = useMemo(() => {
    if (override?.title) return override.title;
    if (pathname.startsWith("/works")) return t("layout.nav.erp");
    if (pathname.startsWith("/projects")) return t("layout.nav.projects");
    return findActiveLabel(visibleSections, pathname) ?? t("layout.header.title");
  }, [override?.title, pathname, t, visibleSections]);

  const pageBreadcrumb = override?.breadcrumb ?? findActiveBreadcrumb(visibleSections, pathname);

  // Breadcrumb dinámico desde el pathname para mostrar todos los niveles clicables.
  // Si la página define un breadcrumb manual (override.breadcrumb), tiene prioridad.
  const pageBreadcrumbCrumbs = useMemo(() => {
    if (override?.breadcrumb) return undefined;
    const crumbs = buildBreadcrumb(pathname);
    // Solo mostrar si hay más de un nivel (si es solo /comparatives ya está en el título).
    if (crumbs.length < 2) return undefined;
    return crumbs;
  }, [override?.breadcrumb, pathname]);

  const pageIconComponent = override?.icon
    ? undefined
    : findActiveIcon(visibleSections, pathname);
  const pageIcon: React.ReactNode = override?.icon
    ?? (pageIconComponent ? React.createElement(pageIconComponent, { size: 16 }) : undefined);

  if (isNested || isHiddenRoute(pathname)) {
    return <>{children}</>;
  }

  if (isUserLoading || isBrandingLoading) {
    return (
      <Center minH="100vh" bg={pageBg}>
        <Spinner size="lg" />
      </Center>
    );
  }

  if (isSuperAdmin && !selectedTenantId && isTenantScopedRoute(pathname)) {
    return (
      <AppShellContext.Provider value={true}>
        <PageInfoContext.Provider value={pageInfoCtxValue}>
        <Flex h="100vh" bg={pageBg} overflow="hidden">
          <Flex direction="column" flex="1" minW="0">
            <ConnectedTopbar pageTitle={pageTitle} pageBreadcrumb={pageBreadcrumb} pageBreadcrumbCrumbs={pageBreadcrumbCrumbs} pageIcon={pageIcon} />
            <Box as="main" px={contentPx} py={{ base: 6, md: 8 }}>
              <Box maxW="720px" mx="auto">
                <EmptyState
                  title={t("layout.tenant.emptyTitle", { defaultValue: "Selecciona un tenant" })}
                  description={t("layout.tenant.emptyDescription", {
                    defaultValue: "Para continuar necesitas elegir un tenant.",
                  })}
                  actionLabel={t("layout.tenant.selectAction", {
                    defaultValue: "Seleccionar tenant",
                  })}
                  onAction={() => undefined}
                />
              </Box>
            </Box>
          </Flex>
        </Flex>
        </PageInfoContext.Provider>
      </AppShellContext.Provider>
    );
  }

  return (
    <AppShellContext.Provider value={true}>
      <PageInfoContext.Provider value={pageInfoCtxValue}>
      <Flex h="100vh" bg={pageBg} overflow="hidden">
        <Box
          display={{ base: "none", lg: "block" }}
          position="sticky"
          top="0"
          h="100vh"
          flexShrink={0}
        >
          <AppSidebar
            sections={visibleSections}
            companyName={brandingName}
            companyPlan={brandingSubtitle}
            onNotifications={() => undefined}
          />
        </Box>

        <Flex
          direction="column"
          flex="1"
          minW="0"
          h="100vh"
          minH="0"
          overflow="hidden"
        >
          <Box position="sticky" top="0" zIndex={50}>
            <ConnectedTopbar pageTitle={pageTitle} pageBreadcrumb={pageBreadcrumb} pageBreadcrumbCrumbs={pageBreadcrumbCrumbs} pageIcon={pageIcon} />
          </Box>

          <Box
            as="main"
            data-scroll-root="true"
            flex="1"
            overflowY="auto"
            minH="0"
            px={contentPx}
            py={contentPx}
            w="100%"
            minW="0"
          >
            <Box maxW={contentMaxW} w="100%" minW="0" mx="auto">
              {children}
            </Box>
          </Box>
        </Flex>

      </Flex>
      </PageInfoContext.Provider>
    </AppShellContext.Provider>
  );
};
