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
  email: string;
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
  viewerEmail: string | null,
  scope: OrgScope,
): ResolvedScope {
  if (!tree) {
    return { pivot: null, roster: null, label: "", count: 0, managerNodes: [], canDirectOnly: false };
  }
  const viewerNode =
    (viewerEmail ? findIdentityNode(tree, viewerEmail) : null) ?? tree;
  const pivot =
    (scope.root ? findIdentityNode(viewerNode, scope.root) : null) ?? viewerNode;
  const full = flattenSubordinates(pivot);
  const canDirectOnly = hasIndirectReports(full);
  const roster = scopeRosterToDirectReports(full, canDirectOnly && scope.directOnly);

  const managerNodes: ManagerNode[] = [];
  const walk = (node: IdentityPerson, depth: number): void => {
    if (node.subordinates.length > 0) {
      managerNodes.push({
        email: node.email,
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
  pivotEmail: string;
} {
  const { email } = useViewer();
  const viewerQ = useIcPerson(email ?? "");
  const scope = usePortalScope();
  const resolved = useMemo(
    () => resolveScopeRoster(viewerQ.data ?? null, email, scope),
    [viewerQ.data, email, scope],
  );
  return {
    ...resolved,
    isLoading: viewerQ.isLoading,
    isError: viewerQ.isError,
    refetch: () => viewerQ.refetch(),
    pivotEmail: resolved.pivot?.email ?? email ?? "",
  };
}
