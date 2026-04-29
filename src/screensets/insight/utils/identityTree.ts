/**
 * IR subtree helpers.
 *
 * The team-view roster is derived from the Identity Resolution tree (the same
 * source the sidebar menu is built from), so both surfaces show the same set
 * of people for any given pivot.
 */

import { toLower } from 'lodash';
import type { IdentityPerson } from '@/app/types/identity';

/** DFS lookup of a node by email (case-insensitive). */
export function findIdentityNode(
  tree: IdentityPerson | null | undefined,
  email: string,
): IdentityPerson | null {
  if (!tree) return null;
  const target = toLower(email);
  if (toLower(tree.email) === target) return tree;
  for (const sub of tree.subordinates) {
    const found = findIdentityNode(sub, target);
    if (found) return found;
  }
  return null;
}

export interface RosterEntry {
  email: string;
  display_name: string;
  supervisor_email: string | null;
  /** True when the person is a direct report of the pivot (depth 1). */
  is_direct: boolean;
}

/**
 * Flatten a pivot's transitive subordinates into a roster.
 *
 * The pivot itself is excluded — Team Lead and exec drill targets read their
 * own metrics on their personal dashboard, not in the team table.
 */
export function flattenSubordinates(pivot: IdentityPerson): RosterEntry[] {
  const out: RosterEntry[] = [];
  const walk = (node: IdentityPerson, supervisorEmail: string, isDirect: boolean): void => {
    for (const sub of node.subordinates) {
      out.push({
        email: sub.email,
        display_name: sub.display_name,
        supervisor_email: supervisorEmail,
        is_direct: isDirect,
      });
      walk(sub, sub.email, false);
    }
  };
  walk(pivot, pivot.email, true);
  return out;
}
