import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import { queryClient } from "./queryClient";
import { router } from "../router";
import { BrandingProvider } from "@shared/theme";
import { ErrorBoundary } from "../components/ErrorBoundary";

const ensureFonts = () => {
  if (document.getElementById("font-space-grotesk")) return;
  const link = document.createElement("link");
  link.id = "font-space-grotesk";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap";
  document.head.appendChild(link);
};

ensureFonts();

export const AppProviders: React.FC = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrandingProvider>
        <RouterProvider router={router} />
      </BrandingProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);
