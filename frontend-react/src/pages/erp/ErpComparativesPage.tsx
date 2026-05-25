import React from "react";

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

export interface ErpComparativesPageProps {
  forcedView?: ViewState;
  forcedViewMode?: "ver" | "editar";
  forcedContractId?: number;
  forcedIsNewFlow?: boolean;
  forcedSubTab?: "comparativo" | "informacion";
  onViewChange?: (next: {
    view: ViewState;
    viewMode: "ver" | "editar";
    contractId?: number | null;
    isNewFlow: boolean;
  }) => void;
  onSubTabChange?: (subTab: "comparativo" | "informacion") => void;
}

export const ErpComparativesPage: React.FC<ErpComparativesPageProps> = ({
  forcedView,
  forcedViewMode,
  forcedContractId,
  forcedIsNewFlow,
  forcedSubTab,
  onViewChange,
  onSubTabChange,
}) => {
  return (
    <AppShell>
      <ContractsModule
        scope="comparatives"
        initialView="documents"
        forcedView={forcedView}
        forcedViewMode={forcedViewMode}
        forcedContractId={forcedContractId}
        forcedIsNewFlow={forcedIsNewFlow}
        forcedSubTab={forcedSubTab}
        onViewChange={onViewChange}
        onSubTabChange={onSubTabChange}
      />
    </AppShell>
  );
};

export default ErpComparativesPage;
