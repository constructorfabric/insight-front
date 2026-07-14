/**
 * Roster derivation from the identity tree (#1724).
 *
 * `flattenSubordinates` marks depth-1 reports `is_direct`;
 * `scopeRosterToDirectReports` narrows a roster to those entries when the
 * "Direct reports only" toggle is on, and passes `null` through so screens
 * keep their roster-not-loaded gate. `hasIndirectReports` tells screens
 * whether that toggle can change anything at all (#1756).
 */

import { describe, expect, it } from "vitest";

import type { IdentityPerson } from "@/types/insight";
import {
  flattenSubordinates,
  hasIndirectReports,
  scopeRosterToDirectReports,
  type RosterEntry,
} from "./identity-tree";

function person(
  email: string,
  subordinates: IdentityPerson[] = [],
): IdentityPerson {
  return {
    person_id: email,
    email,
    display_name: email.split("@")[0]!,
    subordinates,
  } as IdentityPerson;
}

const pivot = person("alice@x.io", [
  person("bob@x.io", [person("carol@x.io"), person("dave@x.io")]),
  person("erin@x.io"),
]);

describe("flattenSubordinates", () => {
  it("marks only depth-1 reports as direct", () => {
    const roster = flattenSubordinates(pivot);
    expect(roster.map((r) => [r.email, r.is_direct])).toEqual([
      ["bob@x.io", true],
      ["carol@x.io", false],
      ["dave@x.io", false],
      ["erin@x.io", true],
    ]);
  });
});

describe("scopeRosterToDirectReports", () => {
  const roster: RosterEntry[] = flattenSubordinates(pivot);

  it("keeps only direct reports when scoping is on", () => {
    expect(
      scopeRosterToDirectReports(roster, true)?.map((r) => r.email),
    ).toEqual(["bob@x.io", "erin@x.io"]);
  });

  it("returns the roster unchanged when scoping is off", () => {
    expect(scopeRosterToDirectReports(roster, false)).toBe(roster);
  });

  it("passes null through regardless of the toggle", () => {
    expect(scopeRosterToDirectReports(null, true)).toBeNull();
    expect(scopeRosterToDirectReports(null, false)).toBeNull();
  });
});

describe("hasIndirectReports", () => {
  it("is true when the roster has at least one indirect report", () => {
    expect(hasIndirectReports(flattenSubordinates(pivot))).toBe(true);
  });

  it("is false when every report is direct (no subteams)", () => {
    const flat = flattenSubordinates(
      person("dave@x.io", [person("fay@x.io"), person("gil@x.io")]),
    );
    expect(hasIndirectReports(flat)).toBe(false);
  });

  it("is false for an empty or missing roster", () => {
    expect(hasIndirectReports([])).toBe(false);
    expect(hasIndirectReports(null)).toBe(false);
  });
});
