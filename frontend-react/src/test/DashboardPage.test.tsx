import React from "react";
import { screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { fetchDashboardSummary } from "@api/dashboard";
import { fetchTenantTools } from "@api/tools";
import type { CurrentUser } from "@api/users";
import { DashboardPage } from "@pages/dashboard";
import { renderWithProviders } from "./testUtils";

const mockCurrentUser: Partial<CurrentUser> = {
  tenant_id: 1,
  is_super_admin: false,
  permissions: ["tools:read", "hr:read", "erp:reports:read"],
  role_name: "tenant_admin",
  full_name: "Tenant Admin",
  email: "tenantadmin@example.com",
};

vi.mock("@widgets/app-shell/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    data: mockCurrentUser,
  }),
}));

vi.mock("@api/tools", () => ({
  fetchTenantTools: vi.fn(),
  launchTool: vi.fn(),
}));

vi.mock("@api/dashboard", () => ({
  fetchDashboardSummary: vi.fn(async () => ({
    tenants_activos: 0,
    usuarios_activos: 0,
    active_users_now: 0,
    active_users_today: 0,
    herramientas_activas: 0,
    horas_hoy: 0,
    horas_ultima_semana: 0,
    tickets_abiertos: 0,
    tickets_en_progreso: 0,
    tickets_resueltos_hoy: 0,
    tickets_cerrados_ultima_semana: 0,
  })),
}));

vi.mock("@api/erpReports", () => ({
  fetchErpProjects: vi.fn(async () => []),
  fetchTimeReport: vi.fn(async () => []),
}));

vi.mock("@api/erpBudgets", () => ({
  fetchProjectBudgets: vi.fn(async () => []),
}));

vi.mock("@api/hr", () => ({
  fetchDepartments: vi.fn(async () => []),
  fetchEmployees: vi.fn(async () => []),
  fetchEmployeeAllocations: vi.fn(async () => []),
  fetchHeadcount: vi.fn(async () => []),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  deleteEmployee: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    history: { push: vi.fn() },
    state: { location: { pathname: "/dashboard", searchStr: "" } },
  }),
  useNavigate: () => vi.fn(),
  Link: React.forwardRef<HTMLAnchorElement, { to: string; children: React.ReactNode }>(
    ({ to, children }, ref) => (
      <a ref={ref} href={to}>
        {children}
      </a>
    ),
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockedFetchTenantTools = vi.mocked(fetchTenantTools);
const mockedFetchDashboardSummary = vi.mocked(fetchDashboardSummary);

describe("DashboardPage", () => {
  beforeEach(() => {
    mockedFetchTenantTools.mockReset();
    mockedFetchDashboardSummary.mockReset();
    mockedFetchDashboardSummary.mockResolvedValue({
      tenants_activos: 0,
      usuarios_activos: 0,
      active_users_now: 0,
      active_users_today: 0,
      herramientas_activas: 0,
      horas_hoy: 0,
      horas_ultima_semana: 0,
      tickets_abiertos: 0,
      tickets_en_progreso: 0,
      tickets_resueltos_hoy: 0,
      tickets_cerrados_ultima_semana: 0,
    });
    mockCurrentUser.tenant_id = 1;
    mockCurrentUser.is_super_admin = false;
    mockCurrentUser.permissions = ["tools:read", "hr:read", "erp:reports:read"];
    mockCurrentUser.role_name = "tenant_admin";
  });

  it("muestra el listado de herramientas del tenant", async () => {
    mockedFetchTenantTools.mockResolvedValueOnce([
      {
        id: 1,
        name: "Moodle Demo",
        slug: "moodle-demo",
        base_url: "https://moodle.mavico.shop",
        description: "Instancia Moodle de pruebas",
      },
    ]);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(mockedFetchTenantTools).toHaveBeenCalledWith(1);
    });
  });

  it("oculta el widget de actividad para usuarios no superadmin", async () => {
    mockedFetchTenantTools.mockResolvedValueOnce([]);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(mockedFetchDashboardSummary).toHaveBeenCalled();
    });

    expect(screen.queryByText("dashboard.actions.manageTenants")).not.toBeInTheDocument();
  });

  it("muestra el widget de actividad para superadmin", async () => {
    mockCurrentUser.tenant_id = null;
    mockCurrentUser.is_super_admin = true;
    mockCurrentUser.permissions = [];
    mockCurrentUser.role_name = "super_admin";
    mockedFetchDashboardSummary.mockResolvedValueOnce({
      tenants_activos: 3,
      usuarios_activos: 12,
      active_users_now: 4,
      active_users_today: 9,
      herramientas_activas: 2,
      horas_hoy: 0,
      horas_ultima_semana: 0,
      tickets_abiertos: 0,
      tickets_en_progreso: 0,
      tickets_resueltos_hoy: 0,
      tickets_cerrados_ultima_semana: 0,
    });
    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("dashboard.actions.manageTenants")).toBeInTheDocument();
    });

    expect(screen.getByText("dashboard.stats.tenantsActive")).toBeInTheDocument();
    expect(screen.getByText("dashboard.stats.usersActive")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getAllByText((_, node) => node?.textContent === "3").length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText((_, node) => node?.textContent === "12").length,
      ).toBeGreaterThan(0);
    });
  });
});
