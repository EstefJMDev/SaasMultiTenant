import React from "react";

export interface PageInfoOverride {
  title?: string;
  breadcrumb?: string;
  icon?: React.ReactNode;
}

export const PageInfoContext = React.createContext<{
  setOverride: (info: PageInfoOverride | null) => void;
}>({ setOverride: () => {} });
