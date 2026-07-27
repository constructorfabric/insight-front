import { describe, expect, it } from "vitest";

import type { NormalizedMetricResult } from "@/lib/metrics/collection";
import {
  attentionSummary,
  computeAttentionFlags,
  type FlagParams,
} from "./attention-flags";

function fixture(
  period: Array<[string, number | null]>,
  opts?: Partial<Pick<NormalizedMetricResult, "direction" | "label" | "format">>,
): NormalizedMetricResult {
  return {
    metric_key: "t.metric",
    label: opts?.label ?? "Commits",
    unit: null,
    computation: "sum",
    format: opts?.format ?? "integer",
    direction: opts?.direction ?? "higher_is_better",
    period: {
      view: "period",
      values: period.map(([entity_id, value]) => ({ entity_id, value })),
    },
  } as unknown as NormalizedMetricResult;
}

/** 7 well-behaved members around 10, plus one member under test. */
const BASE: Array<[string, number]> = [
  ["m1", 9], ["m2", 10], ["m3", 10], ["m4", 11], ["m5", 10], ["m6", 9], ["m7", 11],
];
const IDS = [...BASE.map(([id]) => id), "x"];

function params(over: Partial<FlagParams>): FlagParams {
  return {
    headlineKeys: ["t.metric"],
    byKey: new Map(),
    previousByKey: new Map(),
    memberIds: IDS,
    cohortOf: () => "team",
    nameOf: (id) => `Name ${id}`,
    emailOf: (id) => `${id}@t`,
    cohortLabel: "team",
    ...over,
  };
}

describe("computeAttentionFlags", () => {
  it("flags a collapse when a member has zero against a positive median", () => {
    const flags = computeAttentionFlags(
      params({ byKey: new Map([["t.metric", fixture([...BASE, ["x", 0]])]]) }),
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ kind: "collapse", email: "x@t", name: "Name x" });
    expect(flags[0]!.reason).toContain("no commits");
    expect(flags[0]!.reason).toContain("team median 10");
  });

  it("flags a low outlier below the Tukey fence on a higher-is-better metric", () => {
    const flags = computeAttentionFlags(
      params({ byKey: new Map([["t.metric", fixture([...BASE, ["x", 2]])]]) }),
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]!.kind).toBe("outlier");
    expect(flags[0]!.reason).toContain("unusually low");
  });

  it("flags a HIGH outlier when lower is better (e.g. meeting hours)", () => {
    const flags = computeAttentionFlags(
      params({
        byKey: new Map([
          ["t.metric", fixture([...BASE, ["x", 40]], { direction: "lower_is_better" })],
        ]),
      }),
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]!.kind).toBe("outlier");
    expect(flags[0]!.reason).toContain("unusually high");
  });

  it("does not flag anyone in a tight, healthy cohort", () => {
    const flags = computeAttentionFlags(
      params({ byKey: new Map([["t.metric", fixture([...BASE, ["x", 10]])]]) }),
    );
    expect(flags).toEqual([]);
  });

  it("skips neutral-direction metrics entirely", () => {
    const flags = computeAttentionFlags(
      params({
        byKey: new Map([
          ["t.metric", fixture([...BASE, ["x", 0]], { direction: "neutral" })],
        ]),
      }),
    );
    expect(flags).toEqual([]);
  });

  it("stays silent when the cohort is too small to judge", () => {
    const flags = computeAttentionFlags(
      params({
        byKey: new Map([["t.metric", fixture([["m1", 10], ["m2", 10], ["x", 0]])]]),
        memberIds: ["m1", "m2", "x"],
      }),
    );
    expect(flags).toEqual([]);
  });

  it("flags an adverse period-over-period decline", () => {
    const flags = computeAttentionFlags(
      params({
        byKey: new Map([["t.metric", fixture([...BASE, ["x", 8]])]]),
        previousByKey: new Map([["t.metric", fixture([...BASE, ["x", 16]])]]),
      }),
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]!.kind).toBe("decline");
    expect(flags[0]!.reason).toBe("down 50% vs last period");
  });

  it("treats an INCREASE as adverse when lower is better", () => {
    // x=12 stays inside the Tukey fence (so the outlier branch, which is
    // checked first and wins, stays quiet) but is +50% vs last period.
    const flags = computeAttentionFlags(
      params({
        byKey: new Map([
          ["t.metric", fixture([...BASE, ["x", 12]], { direction: "lower_is_better" })],
        ]),
        previousByKey: new Map([
          ["t.metric", fixture([...BASE, ["x", 8]], { direction: "lower_is_better" })],
        ]),
      }),
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]!.kind).toBe("decline");
    expect(flags[0]!.reason).toBe("up 50% vs last period");
  });

  it("judges members within their own cohort, not the whole roster", () => {
    // Cohort A hovers at 10; cohort B at 1000. x belongs to B with 900 —
    // fine within B, catastrophic vs the global median. Must NOT flag.
    const period: Array<[string, number]> = [
      ["a1", 9], ["a2", 10], ["a3", 11], ["a4", 10],
      ["b1", 990], ["b2", 1000], ["b3", 1010], ["b4", 1000], ["x", 995],
    ];
    const flags = computeAttentionFlags(
      params({
        byKey: new Map([["t.metric", fixture(period)]]),
        memberIds: period.map(([id]) => id),
        cohortOf: (id) => (id.startsWith("a") ? "A" : "B"),
      }),
    );
    expect(flags).toEqual([]);
  });

  it("keeps only the strongest flag per person+metric and ranks by severity", () => {
    // x collapses (0 vs median) AND declined vs last period — collapse wins.
    const flags = computeAttentionFlags(
      params({
        byKey: new Map([["t.metric", fixture([...BASE, ["x", 0], ["y", 2]])]]),
        previousByKey: new Map([["t.metric", fixture([...BASE, ["x", 10], ["y", 2]])]]),
        memberIds: [...IDS, "y"],
      }),
    );
    const x = flags.filter((f) => f.email === "x@t");
    expect(x).toHaveLength(1);
    expect(x[0]!.kind).toBe("collapse");
    // collapse severity (1 + relGap) outranks y's outlier severity (relGap)
    expect(flags[0]!.email).toBe("x@t");
  });
});

describe("attentionSummary", () => {
  it("reports steady when there are no flags", () => {
    expect(attentionSummary([], 0, 12)).toBe(
      "All 12 people are within their usual range this period.",
    );
  });

  it("names the top metric themes with counts", () => {
    const flags = computeAttentionFlags(
      params({ byKey: new Map([["t.metric", fixture([...BASE, ["x", 0]])]]) }),
    );
    expect(attentionSummary(flags, 1, 8)).toBe(
      "1 of 8 people need a look — most flags on Commits (1).",
    );
  });
});
