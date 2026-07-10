import type { IdentityPerson } from "@/types/insight";

const toLower = (s: string | undefined | null) => (s ?? "").toLowerCase();

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

/**
 * Narrow a roster to the pivot's direct reports when `directOnly` is set.
 *
 * `null` passes through unchanged so callers keep their "roster not loaded
 * yet" gate regardless of the toggle state.
 */
export function scopeRosterToDirectReports(
  roster: RosterEntry[] | null,
  directOnly: boolean,
): RosterEntry[] | null {
  if (!roster || !directOnly) return roster;
  return roster.filter((r) => r.is_direct);
}
