import { describe, expect, it } from "vitest";

import type { NormalizedMetricResult } from "@/lib/metrics/collection";
import { buildTrendData, pickTrendBucket } from "./trend-data";

const RANGE_30D = { from: "2026-06-24", to: "2026-07-23" };

describe("pickTrendBucket", () => {
  it("keeps daily buckets for a small team", () =>
    expect(pickTrendBucket(5, 2, RANGE_30D)).toBe("day"));
  it("coarsens to weekly for the org root (152×2×30 > row limit)", () =>
    expect(pickTrendBucket(152, 2, RANGE_30D)).toBe("week"));
  it("falls to monthly for a year at org scale", () =>
    expect(pickTrendBucket(152, 2, { from: "2025-07-24", to: "2026-07-23" })).toBe("month"));
});

describe("buildTrendData", () => {
  it("sums per-bucket points across members and sorts by date", () => {
    const r = {
      metric_key: "m",
      computation: "sum",
      timeseries: {
        view: "timeseries",
        bucket: "week",
        series: [
          { entity_id: "a", points: [{ bucket_start: "2026-07-06", value: 2 }] },
          { entity_id: "b", points: [{ bucket_start: "2026-07-06", value: 3 }, { bucket_start: "2026-06-29", value: 1 }] },
        ],
      },
    } as unknown as NormalizedMetricResult;
    const data = buildTrendData(["m"], new Map([["m", r]]), ["a", "b"]);
    expect(data).toEqual([
      { date: "2026-06-29", m: 1 },
      { date: "2026-07-06", m: 5 },
    ]);
  });
});
