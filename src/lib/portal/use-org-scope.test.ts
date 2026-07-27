import { describe, expect, it } from "vitest";

import type { IdentityPerson } from "@/types/insight";
import { resolveScopeRoster } from "./use-org-scope";

const person = (
  email: string,
  name: string,
  subordinates: IdentityPerson[] = [],
): IdentityPerson =>
  ({ email, display_name: name, subordinates }) as unknown as IdentityPerson;

//        ao
//   ┌────┴─────┐
//  lead1      ic3
//  ┌──┴──┐
// ic1   lead2
//        │
//       ic2
const TREE = person("ao@x", "Ao", [
  person("lead1@x", "Lead One", [
    person("ic1@x", "IC One"),
    person("lead2@x", "Lead Two", [person("ic2@x", "IC Two")]),
  ]),
  person("ic3@x", "IC Three"),
]);

describe("resolveScopeRoster", () => {
  it("defaults to the viewer's whole subtree", () => {
    const s = resolveScopeRoster(TREE, "ao@x", { root: null, directOnly: false });
    expect(s.label).toBe("Ao");
    expect(s.count).toBe(5);
  });
  it("scopes to a sub-lead's subtree", () => {
    const s = resolveScopeRoster(TREE, "ao@x", { root: "lead1@x", directOnly: false });
    expect(s.label).toBe("Lead One");
    expect(s.roster?.map((r) => r.email).sort()).toEqual(["ic1@x", "ic2@x", "lead2@x"]);
  });
  it("narrows to direct reports", () => {
    const s = resolveScopeRoster(TREE, "ao@x", { root: "lead1@x", directOnly: true });
    expect(s.roster?.map((r) => r.email).sort()).toEqual(["ic1@x", "lead2@x"]);
  });
  it("falls back to the viewer when root is outside the tree", () => {
    const s = resolveScopeRoster(TREE, "ao@x", { root: "stranger@x", directOnly: false });
    expect(s.label).toBe("Ao");
  });
  it("does not resolve a root outside the VIEWER's own subtree", () => {
    // lead2 viewing with root=lead1: lead1 exists in the full tree but not in
    // lead2's own subtree — the permission boundary must win, falling back
    // to the viewer (lead2), not resolving to lead1.
    const s = resolveScopeRoster(TREE, "lead2@x", { root: "lead1@x", directOnly: false });
    expect(s.label).toBe("Lead Two");
  });
  it("directOnly is a no-op when the pivot has no indirect reports", () => {
    const s = resolveScopeRoster(TREE, "ao@x", { root: "lead2@x", directOnly: true });
    expect(s.roster?.map((r) => r.email)).toEqual(["ic2@x"]);
    expect(s.canDirectOnly).toBe(false);
  });
  it("lists manager nodes for the picker, depth-annotated", () => {
    const s = resolveScopeRoster(TREE, "ao@x", { root: null, directOnly: false });
    expect(s.managerNodes.map((m) => `${"·".repeat(m.depth)}${m.email}`)).toEqual([
      "ao@x",
      "·lead1@x",
      "··lead2@x",
    ]);
    expect(s.managerNodes.map((m) => m.teamSize)).toEqual([5, 3, 1]);
  });
});
