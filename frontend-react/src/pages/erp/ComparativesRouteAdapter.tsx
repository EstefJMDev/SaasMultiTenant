import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import {
  ErpComparativesPage,
  type ErpComparativesPageProps,
} from "./ErpComparativesPage";

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
type SubTab = "comparativo" | "informacion";

export type ComparativesUrlIntent =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "new-resume" }
  | { kind: "new-info" }
  | { kind: "info"; contractId: number }
  | { kind: "view-info"; contractId: number }
  | { kind: "edit"; contractId: number }
  | { kind: "edit-info"; contractId: number }
  | { kind: "aprobaciones"; contractId: number };

const resolveProps = (intent: ComparativesUrlIntent): ErpComparativesPageProps => {
  switch (intent.kind) {
    case "list":
      return { forcedView: "documents", forcedIsNewFlow: false };
    case "new":
      return {
        forcedView: "comparativo-upload",
        forcedIsNewFlow: true,
        forcedViewMode: "editar",
      };
    case "new-resume":
      return {
        forcedView: "comparativo-review",
        forcedIsNewFlow: true,
        forcedViewMode: "editar",
        forcedSubTab: "comparativo",
      };
    case "new-info":
      return {
        forcedView: "comparativo-review",
        forcedIsNewFlow: true,
        forcedViewMode: "editar",
        forcedSubTab: "informacion",
      };
    case "info":
      return {
        forcedView: "comparativo-review",
        forcedViewMode: "ver",
        forcedContractId: intent.contractId,
        forcedIsNewFlow: false,
        forcedSubTab: "comparativo",
      };
    case "view-info":
      return {
        forcedView: "comparativo-review",
        forcedViewMode: "ver",
        forcedContractId: intent.contractId,
        forcedIsNewFlow: false,
        forcedSubTab: "informacion",
      };
    case "edit":
      return {
        forcedView: "comparativo-review",
        forcedViewMode: "editar",
        forcedContractId: intent.contractId,
        forcedIsNewFlow: false,
        forcedSubTab: "comparativo",
      };
    case "edit-info":
      return {
        forcedView: "comparativo-review",
        forcedViewMode: "editar",
        forcedContractId: intent.contractId,
        forcedIsNewFlow: false,
        forcedSubTab: "informacion",
      };
    case "aprobaciones":
      return {
        forcedView: "approval-panel",
        forcedContractId: intent.contractId,
        forcedIsNewFlow: false,
      };
  }
};

const isNewFlowIntent = (intent: ComparativesUrlIntent): boolean =>
  intent.kind === "new" ||
  intent.kind === "new-resume" ||
  intent.kind === "new-info";

const mapInternalToPath = (
  intent: ComparativesUrlIntent,
  next: {
    view: ViewState;
    viewMode: Mode;
    contractId?: number | null;
    isNewFlow: boolean;
  },
  subTab: SubTab,
): string | null => {
  const id = next.contractId ?? null;
  // Se considera "nuevo flujo" si el módulo lo marca o si la URL actual ya está en él.
  const isInNewFlow = next.isNewFlow || isNewFlowIntent(intent);

  if (next.view === "documents") return "/comparatives";

  if (next.view === "comparativo-upload" || next.view === "comparativo-manual") {
    return "/comparatives/new";
  }

  if (next.view === "comparativo-review") {
    if (isInNewFlow) {
      return subTab === "informacion"
        ? "/comparatives/new/info"
        : "/comparatives/new/resume";
    }
    if (!id) return null;
    if (next.viewMode === "editar") {
      return subTab === "informacion"
        ? `/comparatives/${id}/edit-info`
        : `/comparatives/${id}/edit`;
    }
    return subTab === "informacion"
      ? `/comparatives/${id}/view-info`
      : `/comparatives/${id}/info`;
  }

  if (next.view === "approval-panel" && id) {
    return `/comparatives/${id}/aprobaciones`;
  }

  return null;
};

const intentToSubTab = (intent: ComparativesUrlIntent): SubTab => {
  switch (intent.kind) {
    case "view-info":
    case "edit-info":
    case "new-info":
      return "informacion";
    default:
      return "comparativo";
  }
};

export const pathnameToIntent = (pathname: string): ComparativesUrlIntent => {
  // Estructura URL:
  //   /comparatives
  //   /comparatives/new
  //   /comparatives/new/resume
  //   /comparatives/new/info
  //   /comparatives/:id/info
  //   /comparatives/:id/view-info
  //   /comparatives/:id/edit
  //   /comparatives/:id/edit-info
  //   /comparatives/:id/aprobaciones
  const path = pathname.replace(/\/+$/, "");
  if (path === "/comparatives") return { kind: "list" };
  if (path === "/comparatives/new") return { kind: "new" };
  if (path === "/comparatives/new/resume") return { kind: "new-resume" };
  if (path === "/comparatives/new/info") return { kind: "new-info" };

  const match = path.match(/^\/comparatives\/(\d+)\/(info|view-info|edit|edit-info|aprobaciones)$/);
  if (match) {
    const id = Number(match[1]);
    const sub = match[2];
    if (sub === "info") return { kind: "info", contractId: id };
    if (sub === "view-info") return { kind: "view-info", contractId: id };
    if (sub === "edit") return { kind: "edit", contractId: id };
    if (sub === "edit-info") return { kind: "edit-info", contractId: id };
    if (sub === "aprobaciones") return { kind: "aprobaciones", contractId: id };
  }
  return { kind: "list" };
};

export const ComparativesRouteHost: React.FC = () => {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const intent = useMemo(() => pathnameToIntent(pathname), [pathname]);
  return <ComparativesRouteAdapter intent={intent} />;
};

export const ComparativesRouteAdapter: React.FC<{ intent: ComparativesUrlIntent }> = ({
  intent,
}) => {
  const router = useRouter();
  const currentSubTabRef = useRef<SubTab>(intentToSubTab(intent));
  // Mantener currentSubTabRef sincronizado con el intent actual (importante
  // ahora que el adapter ya no se desmonta entre navegaciones de subruta).
  useEffect(() => {
    currentSubTabRef.current = intentToSubTab(intent);
  }, [intent]);
  // Sub-modo del wizard "new": upload (OCR) vs manual. No se refleja en URL.
  const [newSubView, setNewSubView] = useState<
    "comparativo-upload" | "comparativo-manual"
  >("comparativo-upload");

  // Reset del sub-modo si dejamos el intent "new".
  useEffect(() => {
    if (intent.kind !== "new") setNewSubView("comparativo-upload");
  }, [intent.kind]);

  const navigateTo = useCallback(
    (target: string | null) => {
      if (!target) return;
      const currentPath = router.state.location.pathname;
      if (target === currentPath) return;
      router.history.push(target);
    },
    [router],
  );

  const handleViewChange = useCallback<
    NonNullable<ErpComparativesPageProps["onViewChange"]>
  >(
    (next) => {
      // Dentro del wizard new, upload↔manual no cambia la URL: se persiste en estado local.
      if (
        intent.kind === "new" &&
        (next.view === "comparativo-upload" || next.view === "comparativo-manual")
      ) {
        setNewSubView(next.view);
        return;
      }
      const target = mapInternalToPath(intent, next, currentSubTabRef.current);
      navigateTo(target);
    },
    [intent, navigateTo],
  );

  const handleSubTabChange = useCallback<
    NonNullable<ErpComparativesPageProps["onSubTabChange"]>
  >(
    (subTab) => {
      currentSubTabRef.current = subTab;
      // Re-mapea con el view actual del intent (sub-tab change ocurre sólo en review)
      const isReview = intent.kind === "info" || intent.kind === "view-info" ||
                       intent.kind === "edit" || intent.kind === "edit-info" ||
                       intent.kind === "new-resume" || intent.kind === "new-info";
      if (!isReview) return;
      const id = "contractId" in intent ? intent.contractId : null;
      const isNew = intent.kind === "new-resume" || intent.kind === "new-info";
      const mode: Mode = isNew || intent.kind === "edit" || intent.kind === "edit-info"
        ? "editar"
        : "ver";
      const target = mapInternalToPath(
        intent,
        {
          view: "comparativo-review",
          viewMode: mode,
          contractId: id,
          isNewFlow: isNew,
        },
        subTab,
      );
      navigateTo(target);
    },
    [intent, navigateTo],
  );

  const baseProps = resolveProps(intent);
  const props: ErpComparativesPageProps =
    intent.kind === "new"
      ? { ...baseProps, forcedView: newSubView }
      : baseProps;
  return (
    <ErpComparativesPage
      {...props}
      onViewChange={handleViewChange}
      onSubTabChange={handleSubTabChange}
    />
  );
};

export default ComparativesRouteAdapter;
