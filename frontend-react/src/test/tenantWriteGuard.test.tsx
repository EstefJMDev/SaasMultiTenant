import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TenantSwitcher } from "@widgets/app-shell/TenantSwitcher";
import { useEffectiveTenantId } from "@hooks/useEffectiveTenantId";
import { writeTenantId } from "@shared/api/tenant";

vi.mock("@api/users", () => ({
  fetchAllTenants: vi.fn(async () => [
    { id: 1, name: "Tenant 1", subdomain: "t1", is_active: true },
    { id: 2, name: "Tenant 2", subdomain: "t2", is_active: true },
  ]),
}));

vi.mock("@shared/api/tenant", () => ({
  TENANT_STORAGE_KEY: "contracts_selected_tenant",
  readTenantId: vi.fn(() => null),
  parseTenantId: vi.fn(() => null),
  writeTenantId: vi.fn(),
  clearTenantId: vi.fn(),
}));

vi.mock("@hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    data: { is_super_admin: true, tenant_id: null },
  }),
}));

const TenantIndicator: React.FC = () => {
  const { tenantId } = useEffectiveTenantId();
  return <div data-testid="tenant-indicator">{tenantId ?? "none"}</div>;
};

describe("tenant write guard", () => {
  it("writes tenant only via TenantSwitcher", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <ChakraProvider>
          <TenantSwitcher isVisible={true} />
          <TenantIndicator />
        </ChakraProvider>
      </QueryClientProvider>,
    );

    expect(writeTenantId).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /tenant/i }));
    await user.click(await screen.findByRole("menuitem", { name: /tenant 2/i }));

    await waitFor(() => {
      expect(writeTenantId).toHaveBeenCalledTimes(1);
    });
  });
});
