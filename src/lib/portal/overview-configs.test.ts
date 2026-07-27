import { describe, expect, it } from "vitest";

import { metricGroups } from "@/lib/insight/groups";
import { ZONE_SECTIONS } from "@/lib/portal/nav-model";
import { sectionMetricKeys } from "@/lib/portal/lens-configs";
import { OVERVIEW_ITEMS, overviewMetricKeys } from "./overview-configs";

const KNOWN_KEYS = new Set(
  metricGroups().flatMap((g) => g.collection.metrics.map((m) => m.key)),
);
const NAV_ITEM_IDS = (ZONE_SECTIONS.overview ?? []).flatMap((group) =>
  group.items.map((i) => i.id),
);

describe("OVERVIEW_ITEMS registry", () => {
  it("covers every Overview pane item declared in nav-model", () => {
    for (const id of NAV_ITEM_IDS) {
      expect(OVERVIEW_ITEMS[id], id).toBeDefined();
    }
  });
  it("has no orphan items missing from nav-model", () => {
    for (const id of Object.keys(OVERVIEW_ITEMS)) {
      expect(NAV_ITEM_IDS.includes(id), id).toBe(true);
    }
  });
  it("references only metric keys that exist, per item and in total", () => {
    for (const [id, config] of Object.entries(OVERVIEW_ITEMS)) {
      const keys = sectionMetricKeys(config);
      expect(keys.length, id).toBeLessThanOrEqual(50);
      for (const k of keys) expect(KNOWN_KEYS.has(k), `${id}: ${k}`).toBe(true);
    }
    expect(overviewMetricKeys().length).toBeLessThanOrEqual(50);
  });
  it("spans multiple metric families in the union (zone-stable grid)", () => {
    const union = overviewMetricKeys();
    expect(union.some((k) => k.startsWith("git."))).toBe(true);
    expect(union.some((k) => k.startsWith("collab."))).toBe(true);
    expect(union.some((k) => k.startsWith("ai."))).toBe(true);
  });
  it("gives every item at least one section", () => {
    for (const [id, config] of Object.entries(OVERVIEW_ITEMS)) {
      expect(config.sections.length, id).toBeGreaterThanOrEqual(1);
    }
  });
});
