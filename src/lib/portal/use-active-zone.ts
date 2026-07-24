import { useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";

import { useViewer } from "@/auth";

import { usePortalZone } from "./portal-store";

/**
 * Resolves the active portal zone and the person the entity lenses point at.
 * `zone === null` in the store means "follow the route" (an entity lens), so
 * we derive person/people from the pathname. Shared by the rail and the
 * context pane so their highlighting stays in sync.
 */
export function useActiveZone(): { activeZone: string; activePerson: string } {
  const zone = usePortalZone();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { email } = useViewer();

  return useMemo(() => {
    const m = /^\/ic\/([^/]+)/.exec(pathname);
    const activePerson = m ? decodeURIComponent(m[1]!) : (email ?? "");
    const routeZone = pathname.includes("/team") ? "people" : "person";
    return { activeZone: zone ?? routeZone, activePerson };
  }, [zone, pathname, email]);
}
