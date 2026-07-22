import { describe, expect, it } from "vitest";

import { deriveAiToolComposition } from "@/lib/insight/v2/derivations";
import type { BulletMetric } from "@/types/insight";

function aiRow(metric_key: string, value: string): BulletMetric {
  return {
    period: "week",
    section: "ai_adoption",
    metric_key,
    label: metric_key,
    value,
    unit: "lines",
    range_min: "0",
    range_max: "100",
    median: "—",
    median_label: "",
    bar_left_pct: 0,
    bar_width_pct: 0,
    median_left_pct: 0,
    status: "good",
    drill_id: "",
  };
}

describe("deriveAiToolComposition", () => {
  it("returns an empty composition for no rows", () => {
    expect(deriveAiToolComposition([])).toEqual([]);
  });

  it("names each known tool with a positive line count", () => {
    expect(
      deriveAiToolComposition([
        aiRow("cursor_lines", "100"),
        aiRow("cc_lines", "50"),
        aiRow("codex_lines", "0"),
        aiRow("copilot_lines", "25"),
      ]),
    ).toEqual([
      { name: "Cursor", value: 100 },
      { name: "Claude Code", value: 50 },
      { name: "Copilot", value: 25 },
    ]);
  });

  it("attributes the remainder of team_ai_loc to Other", () => {
    expect(
      deriveAiToolComposition([
        aiRow("cursor_lines", "100"),
        aiRow("team_ai_loc", "160"),
      ]),
    ).toEqual([
      { name: "Cursor", value: 100 },
      { name: "Other", value: 60 },
    ]);
  });

  it("omits Other when the named tools cover the total", () => {
    expect(
      deriveAiToolComposition([
        aiRow("cursor_lines", "100"),
        aiRow("team_ai_loc", "80"),
      ]),
    ).toEqual([{ name: "Cursor", value: 100 }]);
  });

  it("treats non-numeric values (em-dash) as zero", () => {
    expect(
      deriveAiToolComposition([
        aiRow("cursor_lines", "—"),
        aiRow("cc_lines", "40"),
        aiRow("team_ai_loc", "—"),
      ]),
    ).toEqual([{ name: "Claude Code", value: 40 }]);
  });
});
