import React from "react";
import {
  createRouter,
  RouterProvider,
  Outlet,
  createRootRoute,
  createRoute,
  redirect,
} from "@tanstack/react-router";
import { createHashHistory } from "@tanstack/history";
import { AppShell } from "./widgets/app-shell/AppShell";
import { queryClient } from "./app/queryClient";
import { currentUserQueryOptions } from "@hooks/useCurrentUser";

import * as Auth from "./pages/auth";
import * as PublicPages from "./pages/public";

const DashboardPage = React.lazy(() =>
  import("./pages/dashboard/DashboardPage").then((m) => ({
    default: m.DashboardPage,
  })),
);
const UsersPage = React.lazy(() =>
  import("./pages/settings/UsersPage").then((m) => ({ default: m.UsersPage })),
);
const ToolsAdminPage = React.lazy(() =>
  import("./pages/settings/ToolsAdminPage").then((m) => ({
    default: m.ToolsAdminPage,
  })),
);
const AuditLogPage = React.lazy(() =>
  import("./pages/settings/AuditLogPage").then((m) => ({
    default: m.AuditLogPage,
  })),
);
const TenantSettingsPage = React.lazy(() =>
  import("./pages/settings/TenantSettingsPage").then((m) => ({
    default: m.TenantSettingsPage,
  })),
);
const TenantBrandingPage = React.lazy(() =>
  import("./pages/settings/TenantBrandingPage").then((m) => ({
    default: m.TenantBrandingPage,
  })),
);
const TenantDepartmentEmailsPage = React.lazy(() =>
  import("./pages/settings/TenantDepartmentEmailsPage").then((m) => ({
    default: m.TenantDepartmentEmailsPage,
  })),
);
const UserSettingsPage = React.lazy(() =>
  import("./pages/settings/UserSettingsPage").then((m) => ({
    default: m.UserSettingsPage,
  })),
);
const SupportTicketsPage = React.lazy(() =>
  import("./pages/settings/SupportTicketsPage").then((m) => ({
    default: m.SupportTicketsPage,
  })),
);
const HrPage = React.lazy(() =>
  import("./pages/hr/HrPage").then((m) => ({ default: m.HrPage })),
);
const AgentTestPage = React.lazy(() =>
  import("./pages/AgentTestPage").then((m) => ({ default: m.AgentTestPage })),
);
const HrDepartmentsPage = React.lazy(() =>
  import("./pages/hr/HrDepartmentsPage").then((m) => ({
    default: m.HrDepartmentsPage,
  })),
);
const HrEmployeesPage = React.lazy(() =>
  import("./pages/hr/HrEmployeesPage").then((m) => ({
    default: m.HrEmployeesPage,
  })),
);
const HrPositionsPage = React.lazy(() =>
  import("./pages/hr/HrPositionsPage").then((m) => ({
    default: m.HrPositionsPage,
  })),
);
const HrTalentPage = React.lazy(() =>
  import("./pages/hr/HrTalentPage").then((m) => ({
    default: m.HrTalentPage,
  })),
);
const TimeControlPage = React.lazy(() =>
  import("./pages/erp/TimeControlPage").then((m) => ({
    default: m.TimeControlPage,
  })),
);
const ErpProjectsPage = React.lazy(() =>
  import("./pages/erp/ErpProjectsPage").then((m) => ({
    default: m.ErpProjectsPage,
  })),
);
const ErpProjectDetailPage = React.lazy(() =>
  import("./pages/erp/ErpProjectDetailPage").then((m) => ({
    default: m.ErpProjectDetailPage,
  })),
);
const ErpProjectBudgetPage = React.lazy(() =>
  import("./pages/erp/ErpProjectBudgetPage").then((m) => ({
    default: m.ErpProjectBudgetPage,
  })),
);
const ErpProjectDocumentsPage = React.lazy(() =>
  import("./pages/erp/ErpProjectDocumentsPage").then((m) => ({
    default: m.ErpProjectDocumentsPage,
  })),
);
const ErpTasksPage = React.lazy(() =>
  import("./pages/erp/ErpTasksPage").then((m) => ({
    default: m.ErpTasksPage,
  })),
);
const ErpWorkManagementPage = React.lazy(() =>
  import("./pages/erp/ErpWorkManagementPage").then((m) => ({
    default: m.ErpWorkManagementPage,
  })),
);
const ErpExternalCollaborationsPage = React.lazy(() =>
  import("./pages/erp/ErpExternalCollaborationsPage").then((m) => ({
    default: m.ErpExternalCollaborationsPage,
  })),
);
const ErpSimulationsPage = React.lazy(() =>
  import("./pages/simulations/SimulationsPage").then((m) => ({
    default: m.ErpSimulationsPage,
  })),
);
const ErpInvoicesPage = React.lazy(() =>
  import("./pages/invoices/InvoicesPage").then((m) => ({
    default: m.ErpInvoicesPage,
  })),
);
const ContractsRouteHost = React.lazy(() =>
  import("./pages/contracts/ContractsRouteAdapter").then((m) => ({
    default: m.ContractsRouteHost,
  })),
);
const ComparativesRouteHost = React.lazy(() =>
  import("./pages/erp/ComparativesRouteAdapter").then((m) => ({
    default: m.ComparativesRouteHost,
  })),
);
const TimeReportPage = React.lazy(() =>
  import("./pages/erp/TimeReportPage").then((m) => ({
    default: m.TimeReportPage,
  })),
);
const LegalDepartmentPage = React.lazy(() =>
  import("./pages/departments/LegalDepartmentPage").then((m) => ({
    default: m.LegalDepartmentPage,
  })),
);
const AdministrationDepartmentPage = React.lazy(() =>
  import("./pages/departments/AdministrationDepartmentPage").then((m) => ({
    default: m.AdministrationDepartmentPage,
  })),
);
const ProjectsPage = React.lazy(() =>
  import("./pages/projects/ProjectsPage/ProjectsPage").then((m) => ({
    default: m.ProjectsPage,
  })),
);

// Layout raiz: outlet base (permite separar rutas publicas/privadas).
const RouteFallback: React.FC = () => (
  <div style={{ padding: 24, textAlign: "center" }}>Cargando…</div>
);

const RootLayout: React.FC = () => (
  <React.Suspense fallback={<RouteFallback />}>
    <Outlet />
  </React.Suspense>
);

const RootError: React.FC<{ error: unknown }> = ({ error }) => {
  const message =
    error instanceof Error
      ? error.message
      : "No se pudo cargar la sesión. Reintenta en unos instantes.";
  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 12 }}>Error de conexión</h2>
      <p style={{ margin: 0 }}>{message}</p>
    </div>
  );
};

const PublicLayout: React.FC = () => <Outlet />;

const PrivateLayout: React.FC = () => (
  <AppShell>
    <Outlet />
  </AppShell>
);

// Ruta raiz del router.
const rootRoute = createRootRoute({
  component: RootLayout,
  errorComponent: RootError,
});

const publicLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "public",
  component: PublicLayout,
});

const privateLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "private",
  component: PrivateLayout,
  beforeLoad: async () => {
    try {
      await queryClient.ensureQueryData(currentUserQueryOptions);
    } catch (error) {
      const statusCode = (error as { response?: { status?: number } }).response
        ?.status;
      if (statusCode === 401 || statusCode === 403) {
        throw redirect({ to: "/" });
      }
      console.warn("No se pudo validar la sesión en beforeLoad", error);
      throw error;
    }
  },
});

// Rutas hijas principales.
const indexRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: "/",
  component: Auth.LoginPage,
});

const mfaRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: "/mfa",
  component: Auth.MFAVerifyPage,
});

const acceptInvitationRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: "/accept-invitation",
  component: Auth.AcceptInvitationPage,
});

const supplierOnboardingRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: "/supplier-onboarding",
  component: PublicPages.SupplierOnboardingPage,
});

const supplierDataCompleteRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: "/supplier/complete/$token",
  component: PublicPages.SupplierDataCompletePage,
});

const publicAutofirmaSignRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: "/public/autofirma-sign",
  component: PublicPages.PublicAutofirmaSignPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/dashboard",
  component: DashboardPage,
});

const usersRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/users",
  component: UsersPage,
});

const toolsRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/tools",
  component: ToolsAdminPage,
});

const erpProjectsRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/works",
  component: ErpProjectsPage,
});

const projectsRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/projects",
  component: ProjectsPage,
});

const erpProjectDetailRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/works/$projectId",
  component: ErpProjectDetailPage,
});

const erpProjectBudgetRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/works/$projectId/budget",
  component: ErpProjectBudgetPage,
});

const erpProjectDocumentsRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/works/$projectId/documents",
  component: ErpProjectDocumentsPage,
});

const erpTasksRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/tasks",
  component: ErpTasksPage,
});

const erpWorkManagementRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/work-management",
  component: ErpWorkManagementPage,
});

const erpWorksitesRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/work-management/worksites",
  component: ErpWorkManagementPage,
});

const erpProvidersRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/work-management/providers",
  component: ErpWorkManagementPage,
});

const erpExternalCollaborationsRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/external-collaborations",
  component: ErpExternalCollaborationsPage,
});

const erpSimulationsRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/simulations",
  component: ErpSimulationsPage,
});

const erpInvoicesRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/invoices",
  component: ErpInvoicesPage,
});

const SubOutlet: React.FC = () => null;

// Layout route SIN path propio que envuelve todas las rutas de contratos.
// Renderiza una sola vez el host del módulo y NO se desmonta al cambiar entre
// subrutas hermanas (list/view/edit), evitando el "flash" de remount.
//
// El mismo host atiende tres variantes de URL: /contracts (general),
// /legal-contracts (Jurídico) y /admin-contracts (Administración).
// Las tres comparten datos, filtros y permisos; solo cambia el título.
const contractsLayoutRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  id: "contractsLayout",
  component: () => <ContractsRouteHost />,
});

const erpContractsRoute = createRoute({
  getParentRoute: () => contractsLayoutRoute,
  path: "/contracts",
  component: SubOutlet,
});

const contractsViewRoute = createRoute({
  getParentRoute: () => contractsLayoutRoute,
  path: "/contracts/$contractId/view",
  component: SubOutlet,
});

const contractsEditRoute = createRoute({
  getParentRoute: () => contractsLayoutRoute,
  path: "/contracts/$contractId/edit",
  component: SubOutlet,
});

const legalContractsRoute = createRoute({
  getParentRoute: () => contractsLayoutRoute,
  path: "/legal-contracts",
  component: SubOutlet,
});

const legalContractsViewRoute = createRoute({
  getParentRoute: () => contractsLayoutRoute,
  path: "/legal-contracts/$contractId/view",
  component: SubOutlet,
});

const legalContractsEditRoute = createRoute({
  getParentRoute: () => contractsLayoutRoute,
  path: "/legal-contracts/$contractId/edit",
  component: SubOutlet,
});

const adminContractsRoute = createRoute({
  getParentRoute: () => contractsLayoutRoute,
  path: "/admin-contracts",
  component: SubOutlet,
});

const adminContractsViewRoute = createRoute({
  getParentRoute: () => contractsLayoutRoute,
  path: "/admin-contracts/$contractId/view",
  component: SubOutlet,
});

const adminContractsEditRoute = createRoute({
  getParentRoute: () => contractsLayoutRoute,
  path: "/admin-contracts/$contractId/edit",
  component: SubOutlet,
});

// Layout route SIN path propio que envuelve todas las rutas de comparativos.
// Renderiza una sola vez el host del módulo y NO se desmonta al cambiar entre
// subrutas hermanas (info/edit/aprobaciones), evitando el "flash" de remount.
const comparativesLayoutRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  id: "comparativesLayout",
  component: () => <ComparativesRouteHost />,
});

const erpComparativesRoute = createRoute({
  getParentRoute: () => comparativesLayoutRoute,
  path: "/comparatives",
  component: SubOutlet,
});

const comparativesNewRoute = createRoute({
  getParentRoute: () => comparativesLayoutRoute,
  path: "/comparatives/new",
  component: SubOutlet,
});

const comparativesNewResumeRoute = createRoute({
  getParentRoute: () => comparativesLayoutRoute,
  path: "/comparatives/new/resume",
  component: SubOutlet,
});

const comparativesNewInfoRoute = createRoute({
  getParentRoute: () => comparativesLayoutRoute,
  path: "/comparatives/new/info",
  component: SubOutlet,
});

const comparativesInfoRoute = createRoute({
  getParentRoute: () => comparativesLayoutRoute,
  path: "/comparatives/$comparativeId/info",
  component: SubOutlet,
});

const comparativesViewInfoRoute = createRoute({
  getParentRoute: () => comparativesLayoutRoute,
  path: "/comparatives/$comparativeId/view-info",
  component: SubOutlet,
});

const comparativesEditRoute = createRoute({
  getParentRoute: () => comparativesLayoutRoute,
  path: "/comparatives/$comparativeId/edit",
  component: SubOutlet,
});

const comparativesEditInfoRoute = createRoute({
  getParentRoute: () => comparativesLayoutRoute,
  path: "/comparatives/$comparativeId/edit-info",
  component: SubOutlet,
});

const comparativesAprobacionesRoute = createRoute({
  getParentRoute: () => comparativesLayoutRoute,
  path: "/comparatives/$comparativeId/aprobaciones",
  component: SubOutlet,
});

const legalDepartmentRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/departments/legal",
  component: LegalDepartmentPage,
});

// Compatibilidad: las antiguas URLs /departments/{legal,administration}/contracts
// ahora redirigen a las nuevas rutas dedicadas (/legal-contracts, /admin-contracts).
const legalDepartmentContractsRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/departments/legal/contracts",
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/legal-contracts", search });
  },
});

const administrationDepartmentRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/departments/administration",
  component: AdministrationDepartmentPage,
});

const administrationDepartmentWorksitesRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/departments/administration/worksites",
  component: AdministrationDepartmentPage,
});

const administrationDepartmentProvidersRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/departments/administration/providers",
  component: AdministrationDepartmentPage,
});

const administrationDepartmentContractsRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/departments/administration/contracts",
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/admin-contracts", search });
  },
});

const erpTimeControlRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/time-control",
  component: TimeControlPage,
});

const erpTimeReportRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/time-report",
  component: TimeReportPage,
});

const auditRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/audit",
  component: AuditLogPage,
});

const tenantSettingsRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/tenant-settings",
  component: TenantSettingsPage,
});

const tenantBrandingRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/tenant-branding",
  component: TenantBrandingPage,
});

const tenantDepartmentEmailsRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/tenant-department-emails",
  component: TenantDepartmentEmailsPage,
});

const userSettingsRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/user-settings",
  component: UserSettingsPage,
});

const supportRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/support",
  component: SupportTicketsPage,
});

const hrRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/hr",
  component: HrPage,
});

const agentTestRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/agent-test",
  component: AgentTestPage,
});

const hrDepartmentsRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/hr/departments",
  component: HrDepartmentsPage,
});

const hrEmployeesRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/hr/employees",
  component: HrEmployeesPage,
});

const hrPositionsRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/hr/positions",
  component: HrPositionsPage,
});

const hrTalentRoute = createRoute({
  getParentRoute: () => privateLayoutRoute,
  path: "/hr/talent",
  component: HrTalentPage,
});

// Arbol completo de rutas.
const routeTree = rootRoute.addChildren([
  publicLayoutRoute.addChildren([
    indexRoute,
    mfaRoute,
    acceptInvitationRoute,
    supplierOnboardingRoute,
    supplierDataCompleteRoute,
    publicAutofirmaSignRoute,
  ]),
  privateLayoutRoute.addChildren([
    dashboardRoute,
    usersRoute,
    toolsRoute,
    auditRoute,
    tenantSettingsRoute,
    tenantBrandingRoute,
    tenantDepartmentEmailsRoute,
    erpProjectsRoute,
    projectsRoute,
    erpProjectDetailRoute,
    erpProjectBudgetRoute,
    erpProjectDocumentsRoute,
    erpTasksRoute,
    erpWorkManagementRoute,
    erpWorksitesRoute,
    erpProvidersRoute,
    erpExternalCollaborationsRoute,
    erpSimulationsRoute,
    erpInvoicesRoute,
    comparativesLayoutRoute.addChildren([
      erpComparativesRoute,
      comparativesNewRoute,
      comparativesNewResumeRoute,
      comparativesNewInfoRoute,
      comparativesInfoRoute,
      comparativesViewInfoRoute,
      comparativesEditRoute,
      comparativesEditInfoRoute,
      comparativesAprobacionesRoute,
    ]),
    contractsLayoutRoute.addChildren([
      erpContractsRoute,
      contractsViewRoute,
      contractsEditRoute,
      legalContractsRoute,
      legalContractsViewRoute,
      legalContractsEditRoute,
      adminContractsRoute,
      adminContractsViewRoute,
      adminContractsEditRoute,
    ]),
    legalDepartmentRoute,
    legalDepartmentContractsRoute,
    administrationDepartmentRoute,
    administrationDepartmentWorksitesRoute,
    administrationDepartmentProvidersRoute,
    administrationDepartmentContractsRoute,
    erpTimeControlRoute,
    erpTimeReportRoute,
    userSettingsRoute,
    supportRoute,
    hrRoute,
    agentTestRoute,
    hrDepartmentsRoute,
    hrEmployeesRoute,
    hrPositionsRoute,
    hrTalentRoute,
  ]),
]);

// Instancia de router de TanStack.
const history = createHashHistory();
export const router = createRouter({ routeTree, history });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Re-export para uso en main.tsx.
export { RouterProvider };
