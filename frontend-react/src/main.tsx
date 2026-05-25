import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n";
import { AppProviders } from "./app/providers";

const redirectDirectPublicRouteToHash = () => {
  if (window.location.hash) return;

  const { pathname, search } = window.location;
  const directPublicRoutes = new Set([
    "/accept-invitation",
    "/supplier-onboarding",
    "/public/autofirma-sign",
  ]);

  const isSupplierComplete = pathname.startsWith("/supplier/complete/");
  if (!directPublicRoutes.has(pathname) && !isSupplierComplete) return;

  window.location.replace(`/#${pathname}${search}`);
};

redirectDirectPublicRouteToHash();

const rootElement = document.getElementById("root") as HTMLElement;

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppProviders />
  </React.StrictMode>,
);
