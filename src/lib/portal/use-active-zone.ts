import { useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";

import { useViewer } from "@/auth";

import { usePortalZone } from "./portal-nav";

/**
 * Resolves the active portal zone and the person the entity lenses point at.
 * The zone itself comes from the URL (`usePortalZone`: the path for
 * Person/People, `?zone=` for theme zones); this hook adds the person the
 * route names (its person id), so the rail and the context pane highlight in
 * sync.
 */
export function useActiveZone(): { activeZone: string; activePerson: string } {
  const zone = usePortalZone();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { personId } = useViewer();

  return useMemo(() => {
    // The path segment is a person id since the identity cutover, so this is
    // the id every portal surface keys on — not an email.
    const m = /^\/ic\/([^/]+)/.exec(pathname);
    const activePerson = m ? decodeURIComponent(m[1]!) : (personId ?? "");
    // No zone anywhere yet (a bare /portal before the landing pin) → the
    // person view is the only thing that renders without an org rollup.
    return { activeZone: zone ?? "person", activePerson };
  }, [zone, pathname, personId]);
}
