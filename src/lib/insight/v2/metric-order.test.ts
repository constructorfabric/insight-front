import { describe, expect, it } from "vitest";

import {
  metricOrderIndex,
  orderRowsForSection,
} from "@/lib/insight/v2/metric-order";

const row = (metric_key: string) => ({ metric_key });

describe("orderRowsForSection", () => {
  it("returns rows untouched for a section without a pinned order", () => {
    const rows = [row("b"), row("a")];
    expect(orderRowsForSection("unknown_section", rows)).toBe(rows);
  });

  it("replays the pinned code_quality order", () => {
    const rows = [
      row("prs_per_dev"),
      row("build_success"),
      row("pr_cycle_time"),
      row("bugs_fixed"),
    ];
    expect(
      orderRowsForSection("code_quality", rows).map((r) => r.metric_key),
    ).toEqual(["build_success", "bugs_fixed", "pr_cycle_time", "prs_per_dev"]);
  });

  it("pushes unknown keys after pinned ones, alphabetically among themselves", () => {
    const rows = [
      row("zeta_metric"),
      row("alpha_metric"),
      row("build_success"),
    ];
    expect(
      orderRowsForSection("code_quality", rows).map((r) => r.metric_key),
    ).toEqual(["build_success", "alpha_metric", "zeta_metric"]);
  });

  it("does not mutate the input array", () => {
    const rows = [row("prs_per_dev"), row("build_success")];
    orderRowsForSection("code_quality", rows);
    expect(rows.map((r) => r.metric_key)).toEqual([
      "prs_per_dev",
      "build_success",
    ]);
  });
});

describe("metricOrderIndex", () => {
  it("returns the pinned index for a known section metric", () => {
    expect(metricOrderIndex("code_quality", "build_success")).toBe(0);
    expect(metricOrderIndex("code_quality", "prs_per_dev")).toBe(3);
  });

  it("returns MAX_SAFE_INTEGER for unknown sections or keys", () => {
    expect(metricOrderIndex("unknown_section", "build_success")).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(metricOrderIndex("code_quality", "ghost_metric")).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });
});
