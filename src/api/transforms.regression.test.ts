/**
 * Regression guards for the metric-rendering bug classes that recurred most
 * (silent wrong/blank numbers). These pin behavior that is currently CORRECT so
 * a future refactor can't reintroduce the regressions:
 *
 *  - not-ingested (NULL) must render as a null value, never "0" / "0%" — a
 *    fabricated zero misrepresents a contributor (Refs #1337).
 *  - a real zero must stay distinct from not-ingested.
 *  - no delta is fabricated when the previous period is absent.
 *  - delta direction respects `higher_is_better` (a sign flip is a wrong-signal
 *    correctness bug).
 *
 * Mirrors the fixture builders in transforms.test.ts.
 */
import { describe, expect, it } from "vitest";

import type { CatalogMetric, CatalogResponse } from "./catalog-client";
import type { RawIcAggregateRow } from "./raw-types";
import { transformIcKpis } from "./transforms";

const TENANT = "t-test";

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

function catalogWith(metrics: CatalogMetric[]): CatalogResponse {
  return {
    tenant_id: TENANT,
    generated_at: "2026-06-01T00:00:00Z",
    metrics,
    links: [],
  };
}

function rawIc(overrides: Partial<RawIcAggregateRow> = {}): RawIcAggregateRow {
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

function pick(out: ReturnType<typeof transformIcKpis>, key: string) {
  return out.find((k) => k.metric_key === key);
}

describe("transformIcKpis — not-ingested vs zero (Refs #1337)", () => {
  it("renders a NULL (not-ingested) metric as a null value, never '0'", () => {
    const out = transformIcKpis(
      rawIc({ prs_merged: null }),
      null,
      "week",
      catalogWith([icKpiRow("prs_merged")]),
    );
    const r = pick(out, "prs_merged");
    expect(r?.raw_value).toBeNull();
    // The bug: a not-ingested metric showing "0" fakes a real measurement.
    expect(r?.value).toBeNull();
  });

  it("renders a real zero as '0', distinct from not-ingested null", () => {
    const out = transformIcKpis(
      rawIc({ tasks_closed: 0 }),
      null,
      "week",
      catalogWith([icKpiRow("tasks_closed")]),
    );
    const r = pick(out, "tasks_closed");
    expect(r?.raw_value).toBe(0);
    expect(r?.value).toBe("0");
  });

  it("renders a NULL percent metric as null, never '0%' (null-ratio bug)", () => {
    const out = transformIcKpis(
      rawIc({ build_success_pct: null }),
      null,
      "week",
      catalogWith([icKpiRow("build_success_pct", { format: "percent" })]),
    );
    expect(pick(out, "build_success_pct")?.value).toBeNull();
  });
});

describe("transformIcKpis — delta direction & honesty", () => {
  it("emits no delta when the previous period is missing (no fabricated trend)", () => {
    const out = transformIcKpis(
      rawIc({ tasks_closed: 5 }),
      null,
      "week",
      catalogWith([icKpiRow("tasks_closed")]),
    );
    const r = pick(out, "tasks_closed");
    expect(r?.delta).toBe("");
    expect(r?.delta_type).toBe("neutral");
  });

  it("colors an increase 'good' when higher_is_better, 'bad' when not", () => {
    const goodOut = transformIcKpis(
      rawIc({ tasks_closed: 9 }),
      rawIc({ tasks_closed: 4 }),
      "week",
      catalogWith([icKpiRow("tasks_closed", { higher_is_better: true })]),
    );
    expect(pick(goodOut, "tasks_closed")?.delta_type).toBe("good");

    const badOut = transformIcKpis(
      rawIc({ tasks_closed: 9 }),
      rawIc({ tasks_closed: 4 }),
      "week",
      catalogWith([icKpiRow("tasks_closed", { higher_is_better: false })]),
    );
    expect(pick(badOut, "tasks_closed")?.delta_type).toBe("bad");
  });
});
