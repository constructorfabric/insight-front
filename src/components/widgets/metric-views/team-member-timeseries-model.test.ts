import { describe, expect, it } from "vitest";

import type { MetricResult } from "@/api/metric-results-client";
import { safeSeriesKey } from "@/components/widgets/metric-views/dimension-series";
import { buildTeamMemberTimeseriesModel } from "@/components/widgets/metric-views/team-member-timeseries-model";
import { normalizeMetricResults } from "@/lib/metrics/collection";

const RANGE = { from: "2026-04-20", to: "2026-05-04" };

const MEMBERS = [
  { entityId: "ann@x.com", displayName: "Ann" },
  { entityId: "bo@x.com", displayName: "Bo" },
  { entityId: "cy@x.com", displayName: "Cy" },
];

function metric(overrides: Partial<MetricResult> = {}): MetricResult {
  return {
    metric_key: "git.commits",
    label: "Commits",
    unit: "commits",
    format: "integer",
    direction: "higher_is_better",
    computation: "sum",
    views: [
      {
        view: "period",
        values: [
          { entity_id: "ann@x.com", value: 3 },
          { entity_id: "bo@x.com", value: 8 },
          { entity_id: "cy@x.com", value: null },
        ],
      },
      {
        view: "timeseries",
        bucket: "week",
        series: [
          {
            entity_id: "ann@x.com",
            dimensions: [],
            points: [
              { bucket_start: "2026-04-20", value: 2 },
              { bucket_start: "2026-04-27", value: 1 },
            ],
          },
          {
            entity_id: "bo@x.com",
            dimensions: [],
            points: [
              { bucket_start: "2026-04-20", value: 5 },
              { bucket_start: "2026-05-04", value: 3 },
            ],
          },
        ],
      },
    ],
    ...overrides,
  } as MetricResult;
}

function normalized(result: MetricResult) {
  return normalizeMetricResults([result]).get(result.metric_key);
}

describe("buildTeamMemberTimeseriesModel", () => {
  it("builds one column per measured member, sorted by period total desc", () => {
    const model = buildTeamMemberTimeseriesModel(
      normalized(metric()),
      MEMBERS,
      RANGE
    );
    // Cy has no series and a null period value → skipped.
    expect(model.columns.map((column) => column.label)).toEqual(["Bo", "Ann"]);
    expect(model.columns[0]?.key).toBe(safeSeriesKey("bo@x.com"));
    expect(model.columns[0]?.colorSeed).toBe("bo@x.com");
    expect(model.dimensions).toEqual(["member"]);
  });

  it("maps series points per bucket and period totals per member", () => {
    const model = buildTeamMemberTimeseriesModel(
      normalized(metric()),
      MEMBERS,
      RANGE
    );
    const ann = model.columns.find((column) => column.label === "Ann");
    expect(ann?.points.get("git.commits")?.get("2026-04-20")).toBe(2);
    expect(ann?.points.get("git.commits")?.get("2026-04-27")).toBe(1);
    expect(ann?.totals.get("git.commits")).toBe(3);
    // Week buckets spanning the range come from the range, not the points.
    expect(model.buckets).toEqual(["2026-04-20", "2026-04-27", "2026-05-04"]);
    expect(model.bucket).toBe("week");
  });

  it("emits a sum grand total across members for sum metrics only", () => {
    const sum = buildTeamMemberTimeseriesModel(
      normalized(metric()),
      MEMBERS,
      RANGE
    );
    expect(sum.grandTotals).toEqual([11]);

    const ratio = buildTeamMemberTimeseriesModel(
      normalized(
        metric({
          metric_key: "git.merge_rate",
          computation: "ratio",
          scale: 100,
        } as Partial<MetricResult>)
      ),
      MEMBERS,
      RANGE
    );
    expect(ratio.grandTotals).toEqual([null]);
  });

  it("returns an empty model when the metric is missing", () => {
    const model = buildTeamMemberTimeseriesModel(undefined, MEMBERS, RANGE);
    expect(model.metrics).toEqual([]);
    expect(model.columns).toEqual([]);
    expect(model.buckets).toEqual([]);
  });
});
