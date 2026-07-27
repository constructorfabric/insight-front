import { Outlet, createRootRoute } from "@tanstack/react-router";

import { TooltipProvider } from "@/components/ui/tooltip";
import { getPerson } from "@/api/identity-client";
import { authStore, getViewerEmail, signIn } from "@/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthGate } from "@/components/auth-gate";
import { CenteredSpinner } from "@/components/widgets/centered-spinner";
import { MockBanner } from "@/components/mock-banner";
import { ViewAsBanner } from "@/components/view-as-banner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PortalLayout } from "@/components/portal/portal-layout";
import { usePortalEnabled } from "@/lib/portal/portal-store";
import { queryClient } from "@/query-client";

async function prefetchViewerIdentity(): Promise<void> {
  const email = getViewerEmail();
  if (!email) return;
  const key = email.toLowerCase();
  await queryClient.prefetchQuery({
    queryKey: ["identity", "person", key],
    queryFn: () => getPerson(email),
  });
}

export const Route = createRootRoute({
  beforeLoad: async () => {
    // The session was probed once at boot (main.tsx → loadSession), so the
    // store is already resolved here. No client-side token dance — an absent
    // session means a full-page bounce to the gateway's login flow.
    const { status } = authStore.getSnapshot();
    if (status === "authenticated") {
      await prefetchViewerIdentity();
      return;
    }
    signIn(window.location.pathname + window.location.search);
  },
  component: RootLayout,
  // Shown while beforeLoad resolves auth + the viewer identity — the app
  // shell (sidebar, headers) mounts only once identity is cached, so no
  // surface ever renders a raw email or an empty org tree. `pendingMs: 0`
  // spins immediately instead of a blank first second.
  pendingComponent: RootPending,
  pendingMs: 0,
});

function RootPending() {
  return <CenteredSpinner className="min-h-screen w-full" />;
}

function RootLayout() {
  const portal = usePortalEnabled();
  return (
    <TooltipProvider>
      <AuthGate>
        {portal ? (
          <PortalLayout />
        ) : (
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="min-w-0 overflow-x-clip">
              <MockBanner />
              <ViewAsBanner />
              <Outlet />
            </SidebarInset>
          </SidebarProvider>
        )}
      </AuthGate>
    </TooltipProvider>
  );
}
