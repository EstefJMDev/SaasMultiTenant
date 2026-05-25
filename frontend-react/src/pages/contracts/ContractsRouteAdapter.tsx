import React, { useCallback, useMemo, useState } from "react";
import { Stack } from "@chakra-ui/react";
import { useRouter, useRouterState } from "@tanstack/react-router";

import { AppShell } from "@widgets/app-shell/AppShell";
import { ContractsModule } from "@widgets/contracts/ContractsModule";

type ViewState =
  | "dashboard"
  | "documents"
  | "comparativo-upload"
  | "comparativo-manual"
  | "comparativo-review"
  | "contrato-form"
  | "approval-panel"
  | "workflow-config";

type Mode = "ver" | "editar";

export type ContractsVariant = "default" | "legal" | "administration";

export type ContractsUrlIntent =
  | { kind: "list" }
  | { kind: "view"; contractId: number }
  | { kind: "edit"; contractId: number };

// Mapeo bases por variante. La página comparte datos/permisos/filtros con la
// principal: lo único que cambia es el prefijo de URL y el título mostrado.
const VARIANT_BASES: Record<ContractsVariant, string> = {
  default: "/contracts",
  legal: "/legal-contracts",
  administration: "/admin-contracts",
};

export const pathnameToVariant = (pathname: string): ContractsVariant => {
  const path = pathname.replace(/\/+$/, "");
  if (path.startsWith("/legal-contracts")) return "legal";
  if (path.startsWith("/admin-contracts")) return "administration";
  return "default";
};

export const pathnameToIntent = (pathname: string): ContractsUrlIntent => {
  const path = pathname.replace(/\/+$/, "");
  const variant = pathnameToVariant(path);
  const base = VARIANT_BASES[variant];
  if (path === base) return { kind: "list" };
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = path.match(new RegExp(`^${escapedBase}/(\\d+)/(view|edit)$`));
  if (match) {
    const id = Number(match[1]);
    const sub = match[2];
    if (sub === "view") return { kind: "view", contractId: id };
    if (sub === "edit") return { kind: "edit", contractId: id };
  }
  return { kind: "list" };
};

// Mapea los cambios de view/mode internos del módulo a la URL, respetando la variante.
const mapInternalToPath = (
  variant: ContractsVariant,
  next: {
    view: ViewState;
    viewMode: Mode;
    contractId?: number | null;
  },
): string | null => {
  const id = next.contractId ?? null;
  const base = VARIANT_BASES[variant];

  // Listado: dashboard (home del scope=contracts) y documents son la "lista".
  if (next.view === "dashboard" || next.view === "documents") {
    return base;
  }

  if (next.view === "contrato-form" && id) {
    return next.viewMode === "editar"
      ? `${base}/${id}/edit`
      : `${base}/${id}/view`;
  }

  return null;
};

const resolveForcedProps = (intent: ContractsUrlIntent) => {
  switch (intent.kind) {
    case "list":
      return {
        forcedView: "dashboard" as ViewState,
        forcedViewMode: "ver" as Mode,
        forcedContractId: undefined as number | undefined,
      };
    case "view":
      return {
        forcedView: "contrato-form" as ViewState,
        forcedViewMode: "ver" as Mode,
        forcedContractId: intent.contractId,
      };
    case "edit":
      return {
        forcedView: "contrato-form" as ViewState,
        forcedViewMode: "editar" as Mode,
        forcedContractId: intent.contractId,
      };
  }
};

export const ContractsRouteHost: React.FC = () => {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const intent = useMemo(() => pathnameToIntent(pathname), [pathname]);
  const variant = useMemo(() => pathnameToVariant(pathname), [pathname]);
  return <ContractsRouteAdapter intent={intent} variant={variant} />;
};

export const ContractsRouteAdapter: React.FC<{
  intent: ContractsUrlIntent;
  variant?: ContractsVariant;
}> = ({ intent, variant = "default" }) => {
  const router = useRouter();
  const [notFound, setNotFound] = useState(false);

  const navigateTo = useCallback(
    (target: string | null) => {
      if (!target) return;
      const currentPath = router.state.location.pathname;
      if (target === currentPath) return;
      router.history.push(target);
    },
    [router],
  );

  const handleViewChange = useCallback(
    (next: {
      view: ViewState;
      viewMode: Mode;
      contractId?: number | null;
      isNewFlow: boolean;
    }) => {
      const target = mapInternalToPath(variant, next);
      navigateTo(target);
    },
    [variant, navigateTo],
  );

  const handleContractNotFound = useCallback(() => {
    setNotFound(true);
  }, []);

  // Resetear notFound al cambiar de intent (lista o id distinto).
  const intentKey =
    intent.kind === "list" ? "list" : `${intent.kind}:${intent.contractId}`;
  React.useEffect(() => {
    setNotFound(false);
  }, [intentKey]);

  const forced = resolveForcedProps(intent);

  if (notFound && intent.kind !== "list") {
    return (
      <AppShell>
        <Stack spacing={6} p={6}>
          <div>
            <h2 style={{ marginBottom: 8 }}>Contrato no encontrado</h2>
            <p style={{ marginBottom: 12 }}>
              El contrato solicitado no existe o no tienes permiso para verlo.
            </p>
            <button
              type="button"
              onClick={() => router.history.push(VARIANT_BASES[variant])}
            >
              Volver al listado
            </button>
          </div>
        </Stack>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Stack spacing={6}>
        <ContractsModule
          scope="contracts"
          variant={variant}
          forcedView={forced.forcedView}
          forcedViewMode={forced.forcedViewMode}
          forcedContractId={forced.forcedContractId}
          onViewChange={handleViewChange}
          onContractNotFound={handleContractNotFound}
        />
      </Stack>
    </AppShell>
  );
};

export default ContractsRouteAdapter;
