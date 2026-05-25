import React, { Suspense } from "react";
import { AppShell } from "@widgets/app-shell/AppShell";
import { SkeletonTable } from "@shared/ui";

const SupportTicketsPanel = React.lazy(() =>
  import("@widgets/support-tickets/SupportTicketsPanel").then((mod) => ({
    default: mod.SupportTicketsPanel,
  })),
);

// Pantalla de soporte: listado de tickets y conversacion.
export const SupportTicketsPage: React.FC = () => (
  <AppShell>
    <Suspense fallback={<SkeletonTable rows={8} cols={4} />}>
      <SupportTicketsPanel />
    </Suspense>
  </AppShell>
);
