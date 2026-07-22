/**
 * Catalog-driven transform tests (Refs #78, #82).
 *
 * Pins the contract: `transformBulletMetrics` / `transformIcKpis` consume
 * the hydrated Metric Catalog and have no compile-in fallback. See
 * DESIGN §3.3 "Catalog Consumer Contract":
 *  - `schema_status='error'` → suppress threshold-based coloring
 *    (`status='unavailable'`) and flag the row with `schema_error: true`.
 *  - `schema_status='unchecked'` → render identically to `ok`.
 *  - Missing-id (catalog row absent) → silently omit.
 *  - Honest-zero rows use the catalog's label.
 *  - Catalog === undefined → empty array (consumers render skeletons).
 */

import { describe, expect, it } from "vitest";

import type { CatalogMetric, CatalogResponse } from "./catalog-client";
import type {
  RawBulletAggregateRow,
  RawCrmFlowRow,
  RawCrmKpisRow,
  RawCrmPipelineRow,
  RawDeliveryTrendRow,
  RawDrillRow,
  RawIcAggregateRow,
  RawLocTrendRow,
  RawTeamMemberRow,
  RawTimeOffRow,
} from "./raw-types";
import {
  formatKpiValue,
  transformBulletMetrics,
  transformCrmBullets,
  transformCrmFlow,
  transformCrmKpis,
  transformCrmPipeline,
  transformDeliveryTrend,
  transformDrill,
  transformIcKpis,
  transformLocTrend,
  transformTeamMembers,
  transformTimeOff,
} from "./transforms";

const TENANT = "t-test";

function bulletCatalogRow(
  bareKey: string,
  overrides: Partial<CatalogMetric> = {},
): CatalogMetric {
  // Default to a task_delivery_bullet_rows wire-prefix; tests that need
  // other prefixes override `metric_key` explicitly.
  return {
    id: `id-${bareKey}`,
    metric_key: `task_delivery_bullet_rows.${bareKey}`,
    label: `Label ${bareKey}`,
    sublabel: `Sublabel ${bareKey}`,
    higher_is_better: true,
    is_member_scale: false,
    source_tags: [],
    schema_status: "ok",
    thresholds: {
      good: 5,
      warn: 3,
      resolved_from: "product-default",
      bounded_by_lock: false,
    },
    ...overrides,
  };
}

function catalogWith(metrics: CatalogMetric[]): CatalogResponse {
  return {
    tenant_id: TENANT,
    generated_at: "2026-06-01T00:00:00Z",
    metrics,
    links: [],
  };
}

function rawBullet(
  bareKey: string,
  overrides: Partial<RawBulletAggregateRow> = {},
): RawBulletAggregateRow {
  return {
    metric_key: bareKey,
    value: 7,
    median: 5,
    range_min: 0,
    range_max: 10,
    ...overrides,
  };
}

describe("transformBulletMetrics", () => {
  it("renders schema_status='ok' rows with threshold-based status (parity)", () => {
    const catalog = catalogWith([bulletCatalogRow("tasks_completed")]);
    const out = transformBulletMetrics(
      [rawBullet("tasks_completed", { value: 7 })],
      "task_delivery",
      "week",
      undefined,
      "ic",
      catalog,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.status).toBe("good");
    expect(out[0]!.schema_error).toBeUndefined();
    expect(out[0]!.label).toBe("Label tasks_completed");
  });

  it("renders schema_status='unchecked' identically to 'ok' (no schema_error flag)", () => {
    const catalog = catalogWith([
      bulletCatalogRow("tasks_completed", { schema_status: "unchecked" }),
    ]);
    const out = transformBulletMetrics(
      [rawBullet("tasks_completed", { value: 7 })],
      "task_delivery",
      "week",
      undefined,
      "ic",
      catalog,
    );
    expect(out).toHaveLength(1);
    // Threshold-based status still computed (same as 'ok' path).
    expect(out[0]!.status).toBe("good");
    expect(out[0]!.schema_error).toBeUndefined();
  });

  it("flags schema_status='error' rows with schema_error:true and suppresses threshold coloring", () => {
    const catalog = catalogWith([
      bulletCatalogRow("tasks_completed", { schema_status: "error" }),
    ]);
    const out = transformBulletMetrics(
      [rawBullet("tasks_completed", { value: 7 })],
      "task_delivery",
      "week",
      undefined,
      "ic",
      catalog,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.schema_error).toBe(true);
    // Threshold coloring suppressed → status falls back to 'unavailable'.
    expect(out[0]!.status).toBe("unavailable");
    // Label still visible — consumers render it next to the broken indicator.
    expect(out[0]!.label).toBe("Label tasks_completed");
  });

  it("silently omits raw rows whose metric_key isn't in the catalog (missing-id)", () => {
    // Catalog knows only tasks_completed; backend returns an extra
    // `ghost_metric` row (e.g. catalog row was deleted between hydration
    // and this fetch).
    const catalog = catalogWith([bulletCatalogRow("tasks_completed")]);
    const out = transformBulletMetrics(
      [
        rawBullet("tasks_completed", { value: 7 }),
        rawBullet("ghost_metric", { value: 99 }),
      ],
      "task_delivery",
      "week",
      undefined,
      "ic",
      catalog,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.metric_key).toBe("tasks_completed");
  });

  it("backfills honest-zero rows for catalog gaps when the section responded", () => {
    // Override the label so we can confirm the transform sources from the
    // catalog row (no compile-in fallback exists post-#82).
    const catalog = catalogWith([
      bulletCatalogRow("tasks_completed", { label: "Tasks Closed" }),
      bulletCatalogRow("task_dev_time", { label: "Catalog Override Label" }),
    ]);
    // Backend answered the section with one metric; the catalog-known gap is
    // backfilled as an honest zero.
    const out = transformBulletMetrics(
      [rawBullet("tasks_completed", { value: 7 })],
      "task_delivery",
      "week",
      undefined,
      "ic",
      catalog,
    );
    expect(out).toHaveLength(2);
    const synth = out.find((r) => r.metric_key === "task_dev_time")!;
    expect(synth.label).toBe("Catalog Override Label");
    // Honest-zero rows have no distribution → 'unavailable'.
    expect(synth.status).toBe("unavailable");
  });

  it("returns no rows when the backend answered the section with nothing", () => {
    // An entirely absent section is "no data for this period" — the transform
    // must not fabricate a grid of zeros that masks the empty state.
    const catalog = catalogWith([bulletCatalogRow("tasks_completed")]);
    const out = transformBulletMetrics(
      [],
      "task_delivery",
      "week",
      undefined,
      "ic",
      catalog,
    );
    expect(out).toHaveLength(0);
  });

  it("filters catalog rows by section prefix (mismatched prefix is omitted)", () => {
    // git_output → wire prefix `git_bullet_rows`. A catalog row with a
    // task_delivery_bullet_rows prefix must NOT be picked up.
    const catalog = catalogWith([
      bulletCatalogRow("tasks_completed"), // task_delivery prefix
      bulletCatalogRow("commits", {
        metric_key: "git_bullet_rows.commits",
        label: "Commits Authored",
      }),
    ]);
    const out = transformBulletMetrics(
      [rawBullet("commits", { value: 30 })],
      "git_output",
      "week",
      undefined,
      "ic",
      catalog,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.metric_key).toBe("commits");
    expect(out[0]!.label).toBe("Commits Authored");
  });

  it("keeps hour-unit bullets in hours even when the cohort range exceeds 48h (#1475)", () => {
    // Regression: the FE used to rescale any 'h' bullet to days (÷24) once the
    // cohort's range_max crossed 48h, diverging the displayed unit from the
    // backend catalog (whose thresholds stay in hours). The displayed unit must
    // always equal the catalog unit, regardless of cohort spread.
    const catalog = catalogWith([bulletCatalogRow("task_dev_time", { unit: "h" })]);
    const out = transformBulletMetrics(
      [
        rawBullet("task_dev_time", {
          value: 60,
          median: 50,
          range_min: 0,
          range_max: 96,
        }),
      ],
      "task_delivery",
      "week",
      undefined,
      "ic",
      catalog,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.unit).toBe("h");
    expect(out[0]!.value).toBe("60");
    expect(out[0]!.range_max).toBe("96h");
  });
});

function icKpiRow(
  bareKey: string,
  overrides: Partial<CatalogMetric> = {},
): CatalogMetric {
  return {
    id: `id-kpi-${bareKey}`,
    metric_key: `ic_kpis.${bareKey}`,
    label: `KPI ${bareKey}`,
    sublabel: "src",
    description: "desc",
    higher_is_better: true,
    is_member_scale: false,
    source_tags: [],
    schema_status: "ok",
    format: "integer",
    thresholds: {
      good: 0,
      warn: 0,
      resolved_from: "product-default",
      bounded_by_lock: false,
    },
    ...overrides,
  };
}

function rawIcAggregate(
  overrides: Partial<RawIcAggregateRow> = {},
): RawIcAggregateRow {
  return {
    person_id: "p",
    loc: null,
    ai_loc_share_pct: 0,
    prs_merged: null,
    pr_cycle_time_h: null,
    focus_time_pct: 0,
    tasks_closed: 0,
    bugs_fixed: 0,
    build_success_pct: null,
    ai_sessions: 0,
    ...overrides,
  };
}

describe("transformIcKpis", () => {
  it("emits one IcKpi per catalog ic_kpis row using catalog label / sublabel", () => {
    const catalog = catalogWith([
      icKpiRow("tasks_closed", { label: "Catalog Tasks Closed" }),
      icKpiRow("bugs_fixed", { label: "Catalog Bugs Fixed" }),
    ]);
    const out = transformIcKpis(
      rawIcAggregate({ tasks_closed: 8, bugs_fixed: 2 }),
      null,
      "week",
      catalog,
    );
    const byKey = new Map(out.map((r) => [r.metric_key, r]));
    expect(byKey.get("tasks_closed")?.label).toBe("Catalog Tasks Closed");
    expect(byKey.get("tasks_closed")?.raw_value).toBe(8);
    expect(byKey.get("bugs_fixed")?.label).toBe("Catalog Bugs Fixed");
    expect(byKey.get("bugs_fixed")?.raw_value).toBe(2);
  });

  it("omits catalog ic_kpis rows whose bare key has no raw aggregate column", () => {
    // `unknown_metric` is not a column on RawIcAggregateRow → transform
    // can't source its raw value and silently omits.
    const catalog = catalogWith([
      icKpiRow("tasks_closed"),
      icKpiRow("unknown_metric"),
    ]);
    const out = transformIcKpis(
      rawIcAggregate({ tasks_closed: 8 }),
      null,
      "week",
      catalog,
    );
    expect(out.map((r) => r.metric_key)).toEqual(["tasks_closed"]);
  });

  it("returns [] when the current raw aggregate row is null", () => {
    const catalog = catalogWith([icKpiRow("tasks_closed")]);
    expect(transformIcKpis(null, null, "week", catalog)).toEqual([]);
  });

  it("returns [] when catalog is undefined (no labels → skeletons)", () => {
    expect(
      transformIcKpis(rawIcAggregate({ tasks_closed: 8 }), null, "week", undefined),
    ).toEqual([]);
  });
});

describe("transformBulletMetrics undefined-catalog handling", () => {
  it("returns [] when catalog is undefined", () => {
    expect(
      transformBulletMetrics(
        [rawBullet("tasks_completed", { value: 7 })],
        "task_delivery",
        "week",
        undefined,
        "ic",
        undefined,
      ),
    ).toEqual([]);
  });
});

describe("transformTeamMembers", () => {
  function rawMember(
    overrides: Partial<RawTeamMemberRow> = {},
  ): RawTeamMemberRow {
    return {
      person_id: "alice@example.com",
      display_name: "Alice Kim",
      seniority: "Senior",
      supervisor_email: "bob@example.com",
      org_unit_id: "Engineering",
      tasks_closed: 8,
      bugs_fixed: 2,
      dev_time_h: 14,
      prs_merged: 3,
      build_success_pct: 96,
      focus_time_pct: 72,
      ai_tools: ["Cursor"],
      ai_loc_share_pct: 27,
      ...overrides,
    };
  }

  it("extracts org_unit_id onto the member", () => {
    const [member] = transformTeamMembers(
      [rawMember({ org_unit_id: "Engineering" })],
      "month",
    );
    expect(member.org_unit_id).toBe("Engineering");
  });

  it("maps a missing org_unit_id to null", () => {
    const [member] = transformTeamMembers(
      [rawMember({ org_unit_id: null })],
      "month",
    );
    expect(member.org_unit_id).toBeNull();
  });
});

describe("formatKpiValue", () => {
  it("rounds by catalog format", () => {
    expect(formatKpiValue(3.44, "decimal1")).toBe("3.4");
    expect(formatKpiValue(78.6, "percent")).toBe("79");
    expect(formatKpiValue(7.6, "hours")).toBe("8h");
    expect(formatKpiValue(7.4, "integer")).toBe("7");
  });

  it("falls back to whole-number display for unknown / missing formats", () => {
    expect(formatKpiValue(7.4, undefined)).toBe("7");
    expect(formatKpiValue(7.6, "weird-wire-format")).toBe("8");
  });
});

describe("transformIcKpis deltas and peer medians", () => {
  it("computes a good delta when higher is better and the value rose", () => {
    const catalog = catalogWith([icKpiRow("tasks_closed")]);
    const [kpi] = transformIcKpis(
      rawIcAggregate({ tasks_closed: 8 }),
      rawIcAggregate({ tasks_closed: 5 }),
      "week",
      catalog,
    );
    expect(kpi.delta).toBe("+3");
    expect(kpi.delta_type).toBe("good");
  });

  it("computes a bad delta when lower is better and the value rose", () => {
    const catalog = catalogWith([
      icKpiRow("pr_cycle_time_h", { higher_is_better: false, format: "hours" }),
    ]);
    const [kpi] = transformIcKpis(
      rawIcAggregate({ pr_cycle_time_h: 12.4 }),
      rawIcAggregate({ pr_cycle_time_h: 10 }),
      "week",
      catalog,
    );
    expect(kpi.value).toBe("12h");
    expect(kpi.delta).toBe("+2h");
    expect(kpi.delta_type).toBe("bad");
  });

  it("treats a lower-is-better drop as good", () => {
    const catalog = catalogWith([
      icKpiRow("pr_cycle_time_h", { higher_is_better: false, format: "hours" }),
    ]);
    const [kpi] = transformIcKpis(
      rawIcAggregate({ pr_cycle_time_h: 8 }),
      rawIcAggregate({ pr_cycle_time_h: 10 }),
      "week",
      catalog,
    );
    expect(kpi.delta).toBe("-2h");
    expect(kpi.delta_type).toBe("good");
  });

  it("formats percent and decimal1 deltas per catalog format", () => {
    const catalog = catalogWith([
      icKpiRow("focus_time_pct", { format: "percent" }),
      icKpiRow("ai_loc_share_pct", { format: "decimal1" }),
    ]);
    const out = transformIcKpis(
      rawIcAggregate({ focus_time_pct: 72, ai_loc_share_pct: 3.46 }),
      rawIcAggregate({ focus_time_pct: 70, ai_loc_share_pct: 1.2 }),
      "week",
      catalog,
    );
    const byKey = new Map(out.map((r) => [r.metric_key, r]));
    expect(byKey.get("focus_time_pct")?.value).toBe("72");
    expect(byKey.get("focus_time_pct")?.delta).toBe("+2%");
    expect(byKey.get("ai_loc_share_pct")?.value).toBe("3.5");
    expect(byKey.get("ai_loc_share_pct")?.delta).toBe("+2");
  });

  it("marks a near-zero delta neutral", () => {
    const catalog = catalogWith([icKpiRow("tasks_closed")]);
    const [kpi] = transformIcKpis(
      rawIcAggregate({ tasks_closed: 5 }),
      rawIcAggregate({ tasks_closed: 5 }),
      "week",
      catalog,
    );
    expect(kpi.delta).toBe("0");
    expect(kpi.delta_type).toBe("neutral");
  });

  it("emits null value and empty delta when the raw column is NULL", () => {
    const catalog = catalogWith([icKpiRow("prs_merged")]);
    const [kpi] = transformIcKpis(
      rawIcAggregate({ prs_merged: null }),
      rawIcAggregate({ prs_merged: 3 }),
      "week",
      catalog,
    );
    expect(kpi.value).toBeNull();
    expect(kpi.raw_value).toBeNull();
    expect(kpi.delta).toBe("");
    expect(kpi.delta_type).toBe("neutral");
  });

  it("skips the delta when the previous row is missing", () => {
    const catalog = catalogWith([icKpiRow("tasks_closed")]);
    const [kpi] = transformIcKpis(
      rawIcAggregate({ tasks_closed: 8 }),
      null,
      "week",
      catalog,
    );
    expect(kpi.delta).toBe("");
    expect(kpi.delta_type).toBe("neutral");
  });

  it("folds the department peer median and cohort size onto the row", () => {
    const catalog = catalogWith([icKpiRow("tasks_closed")]);
    const [kpi] = transformIcKpis(
      rawIcAggregate({ tasks_closed: 8, tasks_closed_median: 6, peer_n: 9 }),
      null,
      "week",
      catalog,
    );
    expect(kpi.peer_median).toBe(6);
    expect(kpi.peer_n).toBe(9);
  });

  it("maps a NULL peer median / cohort to null", () => {
    const catalog = catalogWith([icKpiRow("tasks_closed")]);
    const [kpi] = transformIcKpis(
      rawIcAggregate({ tasks_closed: 8, tasks_closed_median: null, peer_n: null }),
      null,
      "week",
      catalog,
    );
    expect(kpi.peer_median).toBeNull();
    expect(kpi.peer_n).toBeNull();
  });
});

describe("transformBulletMetrics member-scale and peer cohorts", () => {
  it("rewrites unit and range for member-scale metrics when team size is known", () => {
    const catalog = catalogWith([
      bulletCatalogRow("active_ai_members", {
        metric_key: "ai_bullet_rows.active_ai_members",
        is_member_scale: true,
        unit: "count",
      }),
    ]);
    const [row] = transformBulletMetrics(
      [
        rawBullet("active_ai_members", {
          value: 5,
          median: 4,
          range_min: 2,
          range_max: 8,
          p25: 3,
          p75: 6,
          n: 5,
        }),
      ],
      "ai_adoption",
      "week",
      12,
      "team",
      catalog,
    );
    expect(row.unit).toBe("/ 12");
    expect(row.range_min).toBe("0");
    expect(row.range_max).toBe("12");
    // Peer cohort carries the rewritten scale bounds.
    expect(row.peer).toEqual({ p25: 3, p50: 4, p75: 6, min: 0, max: 12, n: 5 });
    expect(row.bar_width_pct).toBe(42); // 5 of [0,12]
  });

  it("renders member-scale metrics unavailable when team size is unknown", () => {
    const catalog = catalogWith([
      bulletCatalogRow("active_ai_members", {
        metric_key: "ai_bullet_rows.active_ai_members",
        is_member_scale: true,
        unit: "count",
      }),
    ]);
    const [row] = transformBulletMetrics(
      [rawBullet("active_ai_members", { value: 5 })],
      "ai_adoption",
      "week",
      undefined,
      "ic",
      catalog,
    );
    expect(row.status).toBe("unavailable");
    expect(row.unit).toBe("");
    expect(row.range_min).toBe("—");
  });

  it("renders a NULL value as an em-dash unavailable row", () => {
    const catalog = catalogWith([bulletCatalogRow("tasks_completed")]);
    const [row] = transformBulletMetrics(
      [rawBullet("tasks_completed", { value: null as unknown as number })],
      "task_delivery",
      "week",
      undefined,
      "ic",
      catalog,
    );
    expect(row.status).toBe("unavailable");
    expect(row.value).toBe("—");
  });

  it("renders unavailable when the cohort range is missing", () => {
    const catalog = catalogWith([bulletCatalogRow("tasks_completed")]);
    const [row] = transformBulletMetrics(
      [rawBullet("tasks_completed", { range_min: null, range_max: null })],
      "task_delivery",
      "week",
      undefined,
      "ic",
      catalog,
    );
    expect(row.status).toBe("unavailable");
    expect(row.range_min).toBe("—");
    expect(row.median).toBe("—");
  });

  it("omits the peer cohort when quartiles or n are missing", () => {
    const catalog = catalogWith([bulletCatalogRow("tasks_completed")]);
    const [row] = transformBulletMetrics(
      [rawBullet("tasks_completed", { p25: null, p75: null, n: null })],
      "task_delivery",
      "week",
      undefined,
      "ic",
      catalog,
    );
    expect(row.peer).toBeUndefined();
    expect(row.status).toBe("good");
  });

  it("keeps one decimal for day-unit values and range edges", () => {
    const catalog = catalogWith([bulletCatalogRow("cycle_days", { unit: "d" })]);
    const [row] = transformBulletMetrics(
      [
        rawBullet("cycle_days", {
          value: 1.64,
          median: 2.25,
          range_min: 0.5,
          range_max: 4.26,
        }),
      ],
      "task_delivery",
      "week",
      undefined,
      "ic",
      catalog,
    );
    expect(row.value).toBe("1.6");
    expect(row.median).toBe("2.3");
    expect(row.range_max).toBe("4.3d");
    expect(row.median_label).toBe("Median: 2.3d");
  });

  it("formats %, h/mo and multiplier range units", () => {
    const catalog = catalogWith([
      bulletCatalogRow("focus_pct", { unit: "%" }),
      bulletCatalogRow("meeting_load", { unit: "h/mo" }),
      bulletCatalogRow("ai_speedup", { unit: "×" }),
    ]);
    const out = transformBulletMetrics(
      [
        rawBullet("focus_pct", { value: 61.2, median: 55.6, range_min: 0, range_max: 100 }),
        rawBullet("meeting_load", { value: 20, median: 18.4, range_min: 0, range_max: 40.6 }),
        rawBullet("ai_speedup", { value: 2, median: 1.6, range_min: 1, range_max: 3.4 }),
      ],
      "task_delivery",
      "week",
      undefined,
      "ic",
      catalog,
    );
    const byKey = new Map(out.map((r) => [r.metric_key, r]));
    expect(byKey.get("focus_pct")?.range_max).toBe("100%");
    expect(byKey.get("focus_pct")?.median_label).toBe("Median: 56%");
    expect(byKey.get("meeting_load")?.range_max).toBe("41h");
    expect(byKey.get("ai_speedup")?.range_max).toBe("3×");
  });
});

describe("trend transforms", () => {
  const locRow = (date_bucket: string): RawLocTrendRow => ({
    date_bucket,
    code_loc: 100,
    spec_lines: 20,
    config_loc: 5,
  });

  it("labels week buckets with the locale short weekday", () => {
    const expected = new Intl.DateTimeFormat(undefined, { weekday: "short" })
      .format(new Date(2026, 0, 5));
    const out = transformLocTrend([locRow("2026-01-05")], "week");
    expect(out).toEqual([
      { label: expected, codeLoc: 100, specLines: 20, configLoc: 5 },
    ]);
  });

  it("labels month buckets with the week-of-month index", () => {
    const out = transformLocTrend(
      [locRow("2026-01-03"), locRow("2026-01-15"), locRow("2026-01-29")],
      "month",
    );
    expect(out.map((p) => p.label)).toEqual(["W1", "W3", "W5"]);
  });

  it("labels quarter buckets with the locale short month", () => {
    const expected = new Intl.DateTimeFormat(undefined, { month: "short" })
      .format(new Date(2026, 3, 1));
    const out = transformLocTrend([locRow("2026-04-01")], "quarter");
    expect(out[0]!.label).toBe(expected);
  });

  it("labels year buckets with the quarter", () => {
    const out = transformLocTrend(
      [locRow("2026-01-15"), locRow("2026-04-15"), locRow("2026-07-15"), locRow("2026-12-31")],
      "year",
    );
    expect(out.map((p) => p.label)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
  });

  it("maps delivery trend rows preserving nullable prs_merged", () => {
    const row: RawDeliveryTrendRow = {
      date_bucket: "2026-07-01",
      commits: 12,
      prs_merged: null,
      tasks_done: 4,
    };
    const out = transformDeliveryTrend([row], "year");
    expect(out).toEqual([
      { label: "Q3", commits: 12, prsMerged: null, tasksDone: 4 },
    ]);
  });
});

describe("transformTeamMembers rounding", () => {
  it("rounds counts and preserves null prs_merged", () => {
    const row: RawTeamMemberRow = {
      person_id: "a@x.com",
      display_name: "A",
      seniority: "mid",
      supervisor_email: "b@x.com",
      org_unit_id: undefined,
      tasks_closed: 7.4,
      bugs_fixed: 1.6,
      dev_time_h: 12.5,
      prs_merged: null,
      build_success_pct: null,
      focus_time_pct: 50,
      ai_tools: [],
      ai_loc_share_pct: 0,
    };
    const [m] = transformTeamMembers([row], "week");
    expect(m.tasks_closed).toBe(7);
    expect(m.bugs_fixed).toBe(2);
    expect(m.prs_merged).toBeNull();
    expect(m.org_unit_id).toBeNull();
  });

  it("rounds a numeric prs_merged", () => {
    const row: RawTeamMemberRow = {
      person_id: "a@x.com",
      display_name: "A",
      seniority: "mid",
      supervisor_email: "b@x.com",
      org_unit_id: "eng",
      tasks_closed: 1,
      bugs_fixed: 0,
      dev_time_h: 1,
      prs_merged: 2.6,
      build_success_pct: 90,
      focus_time_pct: 50,
      ai_tools: [],
      ai_loc_share_pct: 0,
    };
    expect(transformTeamMembers([row], "week")[0]!.prs_merged).toBe(3);
  });
});

describe("transformTimeOff / transformDrill", () => {
  it("maps the time-off notice fields", () => {
    const row: RawTimeOffRow = {
      days: 3,
      date_range: "Jul 1 – Jul 3",
      bamboo_hr_url: "https://bamboo.example/x",
    };
    expect(transformTimeOff(row)).toEqual({
      days: 3,
      dateRange: "Jul 1 – Jul 3",
      bambooHrUrl: "https://bamboo.example/x",
    });
  });

  it("maps the drill payload fields", () => {
    const row: RawDrillRow = {
      title: "PRs",
      source: "Bitbucket",
      src_class: "git",
      value: "12",
      filter: "state eq 'merged'",
      columns: ["id", "title"],
      rows: [{ id: 1, title: "Fix" }],
    };
    expect(transformDrill(row)).toEqual({
      title: "PRs",
      source: "Bitbucket",
      srcClass: "git",
      value: "12",
      filter: "state eq 'merged'",
      columns: ["id", "title"],
      rows: [{ id: 1, title: "Fix" }],
    });
  });
});

describe("CRM transforms", () => {
  it("transformCrmKpis coerces CH string aggregates and nulls to numbers", () => {
    const row: RawCrmKpisRow = {
      person_id: "p",
      deals_opened: "5",
      deals_closed: 3,
      deals_won: null,
      deals_value_closed: "125000.5",
      comms_count: "not-a-number",
    };
    expect(transformCrmKpis(row)).toEqual({
      dealsOpened: 5,
      dealsClosed: 3,
      dealsWon: 0,
      dealsValueClosed: 125000.5,
      commsCount: 0,
    });
  });

  it("transformCrmKpis passes null through", () => {
    expect(transformCrmKpis(null)).toBeNull();
  });

  it("transformCrmPipeline coerces and passes null through", () => {
    const row: RawCrmPipelineRow = {
      person_id: "p",
      pipeline_count: "7",
      pipeline_value: undefined as unknown as null,
    };
    expect(transformCrmPipeline(row)).toEqual({
      pipelineCount: 7,
      pipelineValue: 0,
    });
    expect(transformCrmPipeline(null)).toBeNull();
  });

  it("transformCrmFlow sorts by metric_date and coerces values", () => {
    const rows: RawCrmFlowRow[] = [
      { date_bucket: "W2", metric_date: "2026-01-12", opened: "2", closed: 1, won: "1" },
      { date_bucket: "W1", metric_date: "2026-01-05", opened: 4, closed: "3", won: 0 },
    ];
    expect(transformCrmFlow(rows)).toEqual([
      { label: "W1", opened: 4, closed: 3, won: 0 },
      { label: "W2", opened: 2, closed: 1, won: 1 },
    ]);
  });
});

function crmCatalogRow(
  bareKey: string,
  overrides: Partial<CatalogMetric> = {},
): CatalogMetric {
  return bulletCatalogRow(bareKey, {
    metric_key: `crm_bullet_rows.${bareKey}`,
    ...overrides,
  });
}

describe("transformCrmBullets", () => {
  it("returns [] when catalog is undefined", () => {
    expect(
      transformCrmBullets([rawBullet("win_rate")], "week", "quality", ["win_rate"], undefined),
    ).toEqual([]);
  });

  it("silently omits bare keys with no catalog row", () => {
    const catalog = catalogWith([crmCatalogRow("win_rate")]);
    const out = transformCrmBullets(
      [rawBullet("win_rate"), rawBullet("ghost")],
      "week",
      "quality",
      ["win_rate", "ghost"],
      catalog,
    );
    expect(out.map((r) => r.metric_key)).toEqual(["win_rate"]);
  });

  it("replays the canonical bareKeys ordering regardless of row order", () => {
    const catalog = catalogWith([crmCatalogRow("a"), crmCatalogRow("b")]);
    const out = transformCrmBullets(
      [rawBullet("b"), rawBullet("a")],
      "week",
      "activity",
      ["a", "b"],
      catalog,
    );
    expect(out.map((r) => r.metric_key)).toEqual(["a", "b"]);
  });

  it("renders an unavailable row when the backend returned no data for the key", () => {
    const catalog = catalogWith([crmCatalogRow("win_rate", { unit: "%" })]);
    const [row] = transformCrmBullets([], "week", "quality", ["win_rate"], catalog);
    expect(row.status).toBe("unavailable");
    expect(row.value).toBe("—");
    expect(row.range_min).toBe("—");
  });

  it("renders unavailable when the distribution is degenerate (min == max)", () => {
    const catalog = catalogWith([crmCatalogRow("win_rate", { unit: "%" })]);
    const [row] = transformCrmBullets(
      [rawBullet("win_rate", { value: 50, range_min: 50, range_max: 50 })],
      "week",
      "quality",
      ["win_rate"],
      catalog,
    );
    expect(row.status).toBe("unavailable");
  });

  it("marks a value within 10% of the median as warn", () => {
    const catalog = catalogWith([crmCatalogRow("win_rate", { unit: "%" })]);
    const [row] = transformCrmBullets(
      [rawBullet("win_rate", { value: 42, median: 40, range_min: 0, range_max: 100 })],
      "week",
      "quality",
      ["win_rate"],
      catalog,
    );
    expect(row.status).toBe("warn");
    expect(row.value).toBe("42.0%");
    expect(row.median_label).toBe("Median: 40.0%");
  });

  it("marks above-median good when higher is better and below-median good otherwise", () => {
    const catalog = catalogWith([
      crmCatalogRow("win_rate", { unit: "%" }),
      crmCatalogRow("cycle_days", { unit: "d", higher_is_better: false }),
    ]);
    const out = transformCrmBullets(
      [
        rawBullet("win_rate", { value: 60, median: 40, range_min: 0, range_max: 100 }),
        rawBullet("cycle_days", { value: 3, median: 5, range_min: 0, range_max: 10 }),
      ],
      "week",
      "quality",
      ["win_rate", "cycle_days"],
      catalog,
    );
    expect(out[0]!.status).toBe("good");
    expect(out[1]!.status).toBe("good");
    expect(out[1]!.value).toBe("3.0d");
  });

  it("marks the wrong side of the median bad", () => {
    const catalog = catalogWith([
      crmCatalogRow("cycle_days", { unit: "d", higher_is_better: false }),
    ]);
    const [row] = transformCrmBullets(
      [rawBullet("cycle_days", { value: 9, median: 5, range_min: 0, range_max: 10 })],
      "week",
      "quality",
      ["cycle_days"],
      catalog,
    );
    expect(row.status).toBe("bad");
    expect(row.bar_width_pct).toBe(90);
    expect(row.median_left_pct).toBe(50);
  });

  it("defaults to warn with an em-dash median when the median is missing", () => {
    const catalog = catalogWith([crmCatalogRow("win_rate", { unit: "%" })]);
    const [row] = transformCrmBullets(
      [rawBullet("win_rate", { value: 60, median: null, range_min: 0, range_max: 100 })],
      "week",
      "quality",
      ["win_rate"],
      catalog,
    );
    expect(row.status).toBe("warn");
    expect(row.median).toBe("—");
    expect(row.median_label).toBe("");
    expect(row.median_left_pct).toBe(0);
  });

  it("formats currency values compactly ($M / $k / $)", () => {
    const catalog = catalogWith([crmCatalogRow("deal_value", { unit: "$" })]);
    const [row] = transformCrmBullets(
      [
        rawBullet("deal_value", {
          value: 2_500_000,
          median: 12_000,
          range_min: 500,
          range_max: 3_000_000,
        }),
      ],
      "week",
      "quality",
      ["deal_value"],
      catalog,
    );
    expect(row.value).toBe("$2.50M");
    expect(row.median).toBe("$12k");
    expect(row.range_min).toBe("$500");
  });

  it("formats unitless values with en-US thousands grouping", () => {
    const catalog = catalogWith([crmCatalogRow("comms", { unit: "" })]);
    const [row] = transformCrmBullets(
      [rawBullet("comms", { value: 1234.6, median: 1000, range_min: 0, range_max: 2000 })],
      "week",
      "activity",
      ["comms"],
      catalog,
    );
    expect(row.value).toBe("1,235");
  });
});
