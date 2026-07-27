import { describe, expect, it } from "vitest";

import type { IdentityPerson } from "@/types/insight";
import {
  availableSlices,
  cohortKey,
  collectRosterAttrs,
  personAttributes,
  type SliceAttr,
} from "./slices";

function person(over: Partial<IdentityPerson>): IdentityPerson {
  return {
    email: "p@t",
    display_name: "P",
    department: "",
    division: "",
    job_title: "",
    subordinates: [],
    ...over,
  } as unknown as IdentityPerson;
}

function attrs(division?: string, title?: string): Record<string, SliceAttr> {
  const out: Record<string, SliceAttr> = {};
  if (division) out.division = { key: "division", label: "Division", value: division };
  if (title) out.title = { key: "title", label: "Title", value: title };
  return out;
}

describe("personAttributes", () => {
  it("maps filled identity fields and drops empty/whitespace ones", () => {
    const p = person({ division: "R&D", department: "  ", job_title: "Engineer" });
    const a = personAttributes(p);
    expect(a.division).toEqual({ key: "division", label: "Division", value: "R&D" });
    expect(a.title?.value).toBe("Engineer");
    expect(a.department).toBeUndefined();
  });
});

describe("availableSlices — data-driven gates", () => {
  it("hides a single-valued dimension (slices nothing)", () => {
    // Everyone in the same division: division must NOT be offered.
    const rosters = ["a", "b", "c", "d"].map(() => attrs("R&D", undefined));
    expect(availableSlices(rosters).map((d) => d.key)).toEqual([]);
  });

  it("offers a dimension that genuinely splits the roster", () => {
    const rosters = [attrs("R&D"), attrs("R&D"), attrs("Sales"), attrs("Sales")];
    expect(availableSlices(rosters)).toEqual([{ key: "division", label: "Division" }]);
  });

  it("hides a near-unique dimension (effectively an id)", () => {
    // 10 people, 10 distinct titles → unique ratio 1.0 ≥ 0.9 → hidden.
    const rosters = Array.from({ length: 10 }, (_, i) => attrs(undefined, `T${i}`));
    expect(availableSlices(rosters).map((d) => d.key)).toEqual([]);
  });

  it("keeps a repeating dimension under the unique-ratio ceiling", () => {
    // 10 people, 5 titles ×2 → ratio 0.5 → offered.
    const rosters = Array.from({ length: 10 }, (_, i) => attrs(undefined, `T${i % 5}`));
    expect(availableSlices(rosters).map((d) => d.key)).toEqual(["title"]);
  });

  it("preserves first-appearance order across dimensions", () => {
    const rosters = [
      attrs("R&D", "Dev"), attrs("Sales", "QA"),
      attrs("R&D", "Dev"), attrs("Sales", "QA"),
    ];
    expect(availableSlices(rosters).map((d) => d.key)).toEqual(["division", "title"]);
  });
});

describe("collectRosterAttrs", () => {
  it("walks the whole subtree and keys entities via keyOf", () => {
    const root = person({
      email: "Boss@T",
      division: "R&D",
      subordinates: [person({ email: "kid@t", division: "Sales" })],
    });
    const m = collectRosterAttrs(root, (e) => e.toLowerCase());
    expect(m.get("boss@t")?.division?.value).toBe("R&D");
    expect(m.get("kid@t")?.division?.value).toBe("Sales");
  });

  it("returns an empty map for a null root", () => {
    expect(collectRosterAttrs(null, (e) => e).size).toBe(0);
  });
});

describe("cohortKey", () => {
  const a = attrs("R&D");
  it("is 'all' when no slice is active", () => expect(cohortKey(a, "")).toBe("all"));
  it("is the attribute value under an active slice", () =>
    expect(cohortKey(a, "division")).toBe("R&D"));
  it("is null when the member lacks the attribute (excluded, not faked)", () => {
    expect(cohortKey(a, "title")).toBeNull();
    expect(cohortKey(undefined, "division")).toBeNull();
  });
});
