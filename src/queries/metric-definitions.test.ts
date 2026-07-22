import { describe, expect, it } from "vitest";

import type { MetricDefinition } from "@/api/metric-definitions-client";
import { groupByKeyPrefix } from "@/queries/metric-definitions";

function metric(metric_key: string): MetricDefinition {
  return {
    metric_key,
    label: metric_key,
    short_label: null,
    description: null,
    explanation: null,
    unit: null,
    format: "integer",
    direction: "neutral",
    dimensions: [],
    is_enabled: true,
    schema_status: "ok",
  };
}

describe("groupByKeyPrefix", () => {
  it("groups by the metric_key prefix preserving server order", () => {
    const groups = groupByKeyPrefix([
      metric("ai.cost"),
      metric("ai.active_days"),
      metric("git.commits"),
      metric("tasks.completed"),
    ]);
    expect(groups.map((g) => g.prefix)).toEqual(["ai", "git", "tasks"]);
    expect(groups[0]?.metrics.map((m) => m.metric_key)).toEqual([
      "ai.cost",
      "ai.active_days",
    ]);
  });

  it("uses the whole key when there is no dot", () => {
    const groups = groupByKeyPrefix([metric("standalone")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.prefix).toBe("standalone");
  });

  it("returns no groups for an empty catalog", () => {
    expect(groupByKeyPrefix([])).toEqual([]);
  });
});
