/**
 * Null-vs-zero matrix for IC KPI rendering (Refs #1337).
 *
 * The recurring bug: a metric whose source isn't ingested arrives as NULL and
 * gets rendered as a real "0" (or "0%"/"0h"), silently misrepresenting a
 * contributor. The transform layer must keep the two distinct:
 *   - NULL (not ingested)  → value stays `null` (the UI renders a "—"/coming
 *     -soon affordance — see kpi-tile.null.test.tsx).
 *   - real 0 (measured)    → value renders "0" / "0h" per the format.
 *
 * Pinned across every nullable numeric field × every wire format so a refactor
 * can't reintroduce the regression for one field/format and pass the others.
 */
import { describe, expect, it } from "vitest";

import type { CatalogMetric, CatalogResponse } from "./catalog-client";
import type { RawIcAggregateRow } from "./raw-types";
import { transformIcKpis } from "./transforms";

const NULLABLE_FIELDS: (keyof RawIcAggregateRow)[] = [
  "loc",
  "prs_merged",
  "pr_cycle_time_h",
  "build_success_pct",
];

const FORMATS = ["integer", "decimal1", "percent", "hours"] as const;
type Fmt = (typeof FORMATS)[number];

// formatValue policy in transforms.ts: whole-number display; hours append "h";
// percent has no "%" suffix at this layer (the unit adds it downstream).
const ZERO_RENDER: Record<Fmt, string> = {
  integer: "0",
  decimal1: "0",
  percent: "0",
  hours: "0h",
};

function icKpiRow(bareKey: string, format: Fmt): CatalogMetric {
  return {
    id: `id-${bareKey}`,
    metric_key: `ic_kpis.${bareKey}`,
    label: `KPI ${bareKey}`,
    sublabel: "src",
    description: "desc",
    higher_is_better: true,
    is_member_scale: false,
    source_tags: [],
    schema_status: "ok",
    format,
    thresholds: {
      good: 0,
      warn: 0,
      resolved_from: "product-default",
      bounded_by_lock: false,
    },
  };
}

function catalogWith(metric: CatalogMetric): CatalogResponse {
  return {
    tenant_id: "t-test",
    generated_at: "2026-06-01T00:00:00Z",
    metrics: [metric],
    links: [],
  };
}

function rawIc(overrides: Partial<RawIcAggregateRow>): RawIcAggregateRow {
  return {
    person_id: "p",
    loc: 1,
    ai_loc_share_pct: 0,
    prs_merged: 1,
    pr_cycle_time_h: 1,
    focus_time_pct: 0,
    tasks_closed: 1,
    bugs_fixed: 1,
    build_success_pct: 1,
    ai_sessions: 0,
    ...overrides,
  };
}

const combos = NULLABLE_FIELDS.flatMap((field) =>
  FORMATS.map((fmt) => ({ field, fmt })),
);

describe("transformIcKpis — NULL never renders as 0 (Refs #1337)", () => {
  it.each(combos)(
    "$field as NULL with format=$fmt → value is null, never a fake 0",
    ({ field, fmt }) => {
      const out = transformIcKpis(
        rawIc({ [field]: null } as Partial<RawIcAggregateRow>),
        null,
        "week",
        catalogWith(icKpiRow(String(field), fmt)),
      );
      const r = out.find((k) => k.metric_key === field);
      expect(r, `${field} should be emitted`).toBeDefined();
      expect(r?.raw_value).toBeNull();
      expect(r?.value).toBeNull();
    },
  );

  it.each(combos)(
    "$field as real 0 with format=$fmt → renders the formatted zero (distinct from NULL)",
    ({ field, fmt }) => {
      const out = transformIcKpis(
        rawIc({ [field]: 0 } as Partial<RawIcAggregateRow>),
        null,
        "week",
        catalogWith(icKpiRow(String(field), fmt)),
      );
      const r = out.find((k) => k.metric_key === field);
      expect(r?.raw_value).toBe(0);
      expect(r?.value).toBe(ZERO_RENDER[fmt]);
    },
  );
});
