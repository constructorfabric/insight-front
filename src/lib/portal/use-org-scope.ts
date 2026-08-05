import { useMemo } from "react";

import { useViewer } from "@/auth";
import {
  findIdentityNode,
  flattenSubordinates,
  hasIndirectReports,
  scopeRosterToDirectReports,
  type RosterEntry,
} from "@/lib/insight/identity-tree";
import {
  type OrgScope,
} from "@/lib/portal/portal-store";
import {
  usePortalScope,
} from "@/lib/portal/portal-nav";
import { useIcPerson } from "@/queries/ic-dashboard";
import type { IdentityPerson } from "@/types/insight";

export interface ManagerNode {
  /** Canonical person id — what links, `?scope=` and metric ids all carry. */
  person_id: string;
  name: string;
  depth: number;
  teamSize: number;
}

export interface ResolvedScope {
  /** The scope pivot (root manager node); null while the tree loads. */
  pivot: IdentityPerson | null;
  /** Everyone inside the scope (subtree or direct reports). */
  roster: RosterEntry[] | null;
  label: string;
  count: number;
  /** All manager nodes of the viewer's tree, for the ScopeSelect picker. */
  managerNodes: ManagerNode[];
  /** Whether directOnly can change anything at this pivot. */
  canDirectOnly: boolean;
}

/**
 * Pure scope resolution (design §6): pivot = scope.root within the viewer's
 * tree (permission boundary — identity only serves the viewer their subtree),
 * falling back to the viewer; roster = subtree, optionally direct-only.
 */
export function resolveScopeRoster(
  tree: IdentityPerson | null,
  viewerPersonId: string | null,
  scope: OrgScope,
): ResolvedScope {
  if (!tree) {
    return { pivot: null, roster: null, label: "", count: 0, managerNodes: [], canDirectOnly: false };
  }
  // Person id, not email: since the identity cutover that is the only key the
  // tree, the routes and the metric entity ids agree on.
  const viewerNode =
    (viewerPersonId ? findIdentityNode(tree, viewerPersonId) : null) ?? tree;
  const pivot =
    (scope.root ? findIdentityNode(viewerNode, scope.root) : null) ?? viewerNode;
  const full = flattenSubordinates(pivot);
  const canDirectOnly = hasIndirectReports(full);
  const roster = scopeRosterToDirectReports(full, canDirectOnly && scope.directOnly);

  const managerNodes: ManagerNode[] = [];
  const walk = (node: IdentityPerson, depth: number): void => {
    if (node.subordinates.length > 0) {
      managerNodes.push({
        person_id: node.person_id,
        name: node.display_name || node.email,
        depth,
        teamSize: flattenSubordinates(node).length,
      });
    }
    for (const sub of node.subordinates) walk(sub, depth + 1);
  };
  walk(viewerNode, 0);

  return {
    pivot,
    roster,
    label: pivot.display_name || pivot.email,
    count: roster?.length ?? 0,
    managerNodes,
    canDirectOnly,
  };
}

/** The one hook every org zone uses to know WHO it is looking at. */
export function useOrgScope(): ResolvedScope & {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  /** The pivot's person id — the roster key every org query is built from. */
  pivotPersonId: string;
} {
  const { personId } = useViewer();
  const viewerQ = useIcPerson(personId ?? "");
  const scope = usePortalScope();
  const resolved = useMemo(
    () => resolveScopeRoster(viewerQ.data ?? null, personId, scope),
    [viewerQ.data, personId, scope],
  );
  return {
    ...resolved,
    isLoading: viewerQ.isLoading,
    isError: viewerQ.isError,
    refetch: () => viewerQ.refetch(),
    pivotPersonId: resolved.pivot?.person_id ?? personId ?? "",
  };
}
