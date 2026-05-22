import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChakraProvider } from "@chakra-ui/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";

import { TenantSwitcher } from "@widgets/app-shell/TenantSwitcher";

vi.mock("@api/users", () => ({
  fetchAllTenants: vi.fn(async () => [
    { id: 1, name: "Tenant 1", subdomain: "t1", is_active: true },
    { id: 2, name: "Tenant 2", subdomain: "t2", is_active: true },
  ]),
}));

const TicketsQuery: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const queryFn = async () => ({ tenantId });
  const { data } = useQuery({
    queryKey: ["tickets", tenantId, { status: "open" }],
    queryFn,
    enabled: Boolean(tenantId),
    staleTime: 0,
  });
  return <div data-testid="tickets-tenant">{data?.tenantId ?? "none"}</div>;
};

const TestHarness: React.FC<{ client: QueryClient }> = ({ client }) => {
  const [tenantId, setTenantId] = useState("1");
  return (
    <QueryClientProvider client={client}>
      <ChakraProvider>
        <TenantSwitcher
          isVisible={true}
          onTenantSelected={(id) => setTenantId(String(id))}
        />
        <TicketsQuery tenantId={tenantId} />
      </ChakraProvider>
    </QueryClientProvider>
  );
};

describe("TenantSwitcher integration", () => {
  it("cleans tenant-scoped cache and refetches with new tenant", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const cancelSpy = vi.spyOn(client, "cancelQueries");
    const removeSpy = vi.spyOn(client, "removeQueries");
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    client.setQueryData(
      ["tickets", "1", { status: "open" }],
      { tenantId: "1" },
    );
    client.setQueryData(["notifications", { onlyUnread: true }], { ok: true });

    render(<TestHarness client={client} />);

    expect(await screen.findByTestId("tickets-tenant")).toHaveTextContent("1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /tenant/i }));
    await user.click(await screen.findByRole("menuitem", { name: /tenant 2/i }));

    await waitFor(() => {
      expect(cancelSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
      expect(invalidateSpy).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(
        client.getQueryData(["tickets", "1", { status: "open" }]),
      ).toBeUndefined();
    });

    expect(
      client.getQueryData(["notifications", { onlyUnread: true }]),
    ).toEqual({ ok: true });

    await waitFor(() => {
      expect(screen.getByTestId("tickets-tenant")).toHaveTextContent("2");
    });
  });
});
