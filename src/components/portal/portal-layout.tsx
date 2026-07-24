import { useEffect, useRef } from "react";

import { MockBanner } from "@/components/mock-banner";
import { ContextPane } from "@/components/portal/context-pane";
import { LensRail } from "@/components/portal/lens-rail";
import { PortalTopBar } from "@/components/portal/portal-topbar";
import { ZoneContent } from "@/components/portal/zone-content";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { setPortalZone } from "@/lib/portal/portal-store";
import { useViewerIsManager } from "@/lib/portal/use-viewer-is-manager";

/**
 * Portal shell (Phase 1 buildout), behind the `insight.portal` flag so the
 * default app is untouched. Composition (one SidebarProvider, all normal flow):
 *   [ lens rail ] [ zone-contextual pane ] [ content ]
 * Every zone renders through `<ZoneContent/>` (Person / People / Directions /
 * Overview / … all portal-native); the route only carries the active person.
 */
export function PortalLayout() {
  // Pin the landing zone exactly once, when the viewer's manager status first
  // resolves: a manager lands on the Overview org rollup; an IC has no subtree,
  // so we leave the zone route-driven (null) → their own Person page. Guarded
  // so it never fights later navigation.
  const { isManager, isPending } = useViewerIsManager();
  const landed = useRef(false);
  useEffect(() => {
    if (isPending || landed.current) return;
    landed.current = true;
    if (isManager) setPortalZone("overview");
  }, [isPending, isManager]);

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <LensRail />
      <ContextPane />
      <SidebarInset className="min-w-0 overflow-x-clip overflow-y-auto">
        <MockBanner />
        <PortalTopBar />
        <ZoneContent />
      </SidebarInset>
    </SidebarProvider>
  );
}
