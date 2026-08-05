import { useMemo } from "react";

import { useViewer } from "@/auth";
import { findIdentityNode } from "@/lib/insight/identity-tree";
import { useIcPerson } from "@/queries/ic-dashboard";

/**
 * Whether the current viewer manages anyone. The portal's org zones (Overview,
 * People, Directions, AI & Cost, …) all roll up the viewer's subtree, so they
 * only mean something for a manager. An individual contributor has no subtree,
 * so those zones would be empty — the shell collapses to their Person page
 * instead (see LensRail / PortalLayout).
 *
 * `isPending` is true only until the viewer's own identity resolves; callers
 * should treat pending as "assume manager" to avoid hiding zones on a flash.
 */
export function useViewerIsManager(): { isManager: boolean; isPending: boolean } {
  const { personId } = useViewer();
  const q = useIcPerson(personId ?? "");

  const isManager = useMemo(() => {
    const tree = q.data ?? null;
    if (!tree || !personId) return false;
    const node = findIdentityNode(tree, personId) ?? tree;
    return (node.subordinates?.length ?? 0) > 0;
  }, [q.data, personId]);

  return { isManager, isPending: q.isPending };
}
