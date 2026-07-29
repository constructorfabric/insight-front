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
    // Match the trailing `/team` SEGMENT, not a substring: the person email is
    // part of the path, so `/ic/team%40x/personal` contains "/team" and a
    // substring check would send a whole person's dashboard to the People zone.
    const routeZone = /\/team\/?$/.test(pathname) ? "people" : "person";
    return { activeZone: zone ?? routeZone, activePerson };
  }, [zone, pathname, email]);
}
