import { describe, expect, it } from "vitest";

import { isPersonId, normalizePersonId } from "./entity";

describe("normalizePersonId", () => {
  it("trims and lowercases so a route param and an identity record compare equal", () => {
    expect(normalizePersonId("  019E27BC-DEC0-7626-81A9-C5524662A6A9 ")).toBe(
      "019e27bc-dec0-7626-81a9-c5524662a6a9",
    );
  });
});

describe("isPersonId", () => {
  it("accepts a canonical person UUID in any casing", () => {
    expect(isPersonId("019e27bc-dec0-7626-81a9-c5524662a6a9")).toBe(true);
    expect(isPersonId(" 019E27BC-DEC0-7626-81A9-C5524662A6A9 ")).toBe(true);
  });

  it("rejects the pre-cutover email key so the route can redirect instead of 400", () => {
    expect(isPersonId("alice@example.com")).toBe(false);
  });

  it.each(["", "   ", "019e27bc", "019e27bc-dec0-7626-81a9-c5524662a6a9-extra"])(
    "rejects malformed value %j",
    (value) => {
      expect(isPersonId(value)).toBe(false);
    },
  );
});
