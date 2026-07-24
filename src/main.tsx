import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";

import "./index.css";
import { CatalogProvider } from "@/api/catalog-provider";
import { loadSession, startSessionRefresh } from "@/auth";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { ThemeProvider } from "@/components/theme-provider";
import i18n from "@/i18n";
import { queryClient } from "@/query-client";
import { router } from "./router";

async function enableMocking(): Promise<void> {
  if (!import.meta.env.DEV) return;
  if (import.meta.env.VITE_ENABLE_MOCKS !== "true") return;
  const { worker } = await import("@/mocks/browser");
  await worker.start({ onUnhandledRequest: "bypass" });
}

void enableMocking()
  // Probe the session once (mocks, if enabled, intercept /auth/me) before the
  // router mounts, so the root beforeLoad reads a resolved auth store.
  .then(() => loadSession())
  .then((status) => {
    // The session is non-sliding — without the refresh driver it dies
    // session_ttl (~10 min) after login regardless of activity (#1854).
    if (status === "authenticated") startSessionRefresh();
  })
  .then(() => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <CatalogProvider>
            <AppErrorBoundary>
              <ThemeProvider>
                <I18nextProvider i18n={i18n}>
                  <RouterProvider router={router} />
                </I18nextProvider>
              </ThemeProvider>
            </AppErrorBoundary>
          </CatalogProvider>
        </QueryClientProvider>
      </StrictMode>,
    );
  });
