import { describe, expect, it } from "vitest";

import {
  GROUPS,
  groupById,
  groupIdForMetricKey,
  legacyGroups,
  metricGroups,
} from "@/lib/insight/groups";

describe("groups registry", () => {
  it("groupById returns the def and throws on an unknown id", () => {
    expect(groupById("ai_adoption").id).toBe("ai_adoption");
    // @ts-expect-error — exercising the runtime guard with an invalid id.
    expect(() => groupById("does_not_exist")).toThrow(/Unknown group/);
  });

  it("partitions GROUPS by kind", () => {
    expect(legacyGroups().every((g) => g.kind === "legacy")).toBe(true);
    expect(metricGroups().every((g) => g.kind === "metrics")).toBe(true);
    expect(legacyGroups().length + metricGroups().length).toBe(GROUPS.length);
  });

  it("groupIdForMetricKey resolves a metric to its owning group, null otherwise", () => {
    expect(groupIdForMetricKey("ai.active_days")).toBe("ai_adoption");
    expect(groupIdForMetricKey("git.prs_merged")).toBe("git_output");
    expect(groupIdForMetricKey("git.pr_cycle_time_h")).toBe("git_output");
    expect(groupIdForMetricKey("tasks.closed")).toBe("task_delivery");
    expect(groupIdForMetricKey("nope.unknown")).toBeNull();
  });

  it("exposes git_output as a metrics group with a histogram drilldown block", () => {
    const git = groupById("git_output");
    expect(git.kind).toBe("metrics");
    if (git.kind === "metrics") {
      expect(git.collection.metrics.length).toBeGreaterThan(0);
      expect(git.drilldown.some((b) => b.view === "histogram")).toBe(true);
    }
  });

  it("combines compatible task throughput metrics in one chart", () => {
    const taskDelivery = groupById("task_delivery");
    if (taskDelivery.kind !== "metrics") {
      throw new Error("task_delivery must be metrics");
    }
    const throughput = taskDelivery.drilldown.find(
      (block) => block.view === "timeseries" && block.id === "task-throughput"
    );
    expect(throughput?.chart).toEqual({ multiMetric: "combined" });
  });

  it("caps repository activity and keeps line composition grouped by category", () => {
    const git = groupById("git_output");
    if (git.kind !== "metrics") throw new Error("git_output must be metrics");
    const timeseries = git.drilldown.filter(
      (block) => block.view === "timeseries"
    );
    expect(timeseries[0]?.groupBy?.limits?.repository).toEqual({
      count: 10,
      rankBy: "git.commits",
      includeRemainder: true,
    });
    expect(timeseries[0]?.table?.columns).toEqual([
      { metric: "git.commits" },
      { metric: "git.prs_merged", labelSource: "short" },
      {
        label: "Lines",
        template: [
          { metric: "git.lines_added", prefix: "+", tone: "success" },
          { text: " / " },
          {
            metric: "git.lines_removed",
            prefix: "−",
            tone: "destructive",
          },
        ],
      },
    ]);
    expect(timeseries[1]?.groupBy).toEqual({
      default: "category",
    });
    expect(timeseries[1]?.table?.columns).toEqual([
      {
        label: "Lines",
        template: [
          { metric: "git.lines_added", prefix: "+", tone: "success" },
          { text: " / " },
          {
            metric: "git.lines_removed",
            prefix: "−",
            tone: "destructive",
          },
        ],
      },
    ]);
  });
});
