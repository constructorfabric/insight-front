import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryMetric, queryMetricRaw } from "@/api/analytics-client";
import { METRIC_REGISTRY } from "@/api/metric-registry";
import {
  useSalesBulletSection,
  useSalesDashboardQueries,
  useSalesFlow,
  useSalesKpis,
  useSalesPipelineNow,
  useSalesPrevKpis,
} from "@/queries/sales-dashboard";

vi.mock("@/api/analytics-client", async (orig) => ({
  ...(await orig<typeof import("@/api/analytics-client")>()),
  queryMetric: vi.fn(),
  queryMetricRaw: vi.fn(),
}));

const CATALOG = vi.hoisted(() => {
  const metric = (
    metric_key: string,
    label: string,
    higher_is_better = true,
  ) => ({
    id: metric_key,
    metric_key,
    label,
    higher_is_better,
    is_member_scale: false,
    source_tags: [] as string[],
    schema_status: "ok" as const,
    thresholds: {
      good: 5,
      warn: 2,
      resolved_from: "product-default",
      bounded_by_lock: false,
    },
  });
  return {
    tenant_id: "t-1",
    generated_at: "2026-06-01T00:00:00Z",
    metrics: [
      metric("crm_bullet_rows.win_rate", "Win Rate"),
      metric("crm_bullet_rows.cycle_days", "Cycle Days", false),
      metric("crm_bullet_rows.calls", "Calls"),
    ],
    links: [],
  };
});

vi.mock("@/api/use-catalog", () => ({
  useCatalog: () => ({ data: CATALOG }),
}));

const mockMetric = vi.mocked(queryMetric);
const mockRaw = vi.mocked(queryMetricRaw);

const RANGE = { from: "2026-06-01", to: "2026-06-30" };
const PAGE = { has_next: false, cursor: null };

function odata<T>(items: T[]) {
  return { items, page_info: PAGE };
}

const KPI_ROW = {
  person_id: "rep@x.com",
  deals_opened: "5", // CH UInt aggregates arrive as strings
  deals_closed: 2,
  deals_won: null, // NULL coerces to 0
  deals_value_closed: 120000,
  comms_count: "40",
};

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  mockMetric.mockReset();
  mockRaw.mockReset();
});

describe("useSalesKpis", () => {
  it("coerces the CH wire row into numeric KPIs", async () => {
    mockMetric.mockResolvedValue(odata([KPI_ROW]));
    const { result } = renderHook(() => useSalesKpis("Rep@X.com", RANGE), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      dealsOpened: 5,
      dealsClosed: 2,
      dealsWon: 0,
      dealsValueClosed: 120000,
      commsCount: 40,
    });
    expect(mockMetric).toHaveBeenCalledWith(METRIC_REGISTRY.CRM_KPIS, RANGE, {
      $filter: "person_id eq 'rep@x.com'",
    });
  });

  it("returns null when the person has no row", async () => {
    mockMetric.mockResolvedValue(odata([]));
    const { result } = renderHook(() => useSalesKpis("rep@x.com", RANGE), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe("useSalesPrevKpis", () => {
  it("shifts the window back one calendar year", async () => {
    mockMetric.mockResolvedValue(odata([KPI_ROW]));
    const { result } = renderHook(() => useSalesPrevKpis("rep@x.com", RANGE), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.dealsOpened).toBe(5);
    expect(mockMetric).toHaveBeenCalledWith(
      METRIC_REGISTRY.CRM_KPIS,
      { from: "2025-06-01", to: "2025-06-30" },
      { $filter: "person_id eq 'rep@x.com'" },
    );
  });
});

describe("useSalesFlow", () => {
  it("sorts flow rows by metric_date and coerces values", async () => {
    mockMetric.mockResolvedValue(
      odata([
        {
          date_bucket: "W24",
          metric_date: "2026-06-08",
          opened: "2",
          closed: 1,
          won: 1,
        },
        {
          date_bucket: "W23",
          metric_date: "2026-06-01",
          opened: 3,
          closed: "2",
          won: 0,
        },
      ]),
    );
    const { result } = renderHook(() => useSalesFlow("rep@x.com", RANGE), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { label: "W23", opened: 3, closed: 2, won: 0 },
      { label: "W24", opened: 2, closed: 1, won: 1 },
    ]);
  });
});

describe("useSalesPipelineNow", () => {
  it("queries the date-less stock metric without a period", async () => {
    mockRaw.mockResolvedValue(
      odata([{ person_id: "rep@x.com", pipeline_count: "3", pipeline_value: 1500 }]),
    );
    const { result } = renderHook(() => useSalesPipelineNow("rep@x.com"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ pipelineCount: 3, pipelineValue: 1500 });
    expect(mockRaw).toHaveBeenCalledWith(METRIC_REGISTRY.CRM_PIPELINE_NOW, {
      $filter: "person_id eq 'rep@x.com'",
    });
    expect(mockMetric).not.toHaveBeenCalled();
  });
});

describe("useSalesBulletSection", () => {
  it("emits quality bullets in pinned order, marking keys without rows unavailable", async () => {
    mockMetric.mockResolvedValue(
      odata([
        {
          metric_key: "win_rate",
          value: 50,
          median: 40,
          range_min: 0,
          range_max: 100,
        },
      ]),
    );
    const { result } = renderHook(
      () => useSalesBulletSection("quality", "rep@x.com", "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // avg_deal_size / deals_opened have no catalog rows → omitted; the
    // remaining keys keep the CRM_QUALITY_BARE_KEYS emission order.
    expect(result.current.data!.map((b) => [b.metric_key, b.status])).toEqual([
      ["win_rate", "good"], // 50 vs median 40, above tolerance
      ["cycle_days", "unavailable"], // catalog row present, no data row
    ]);
    expect(result.current.data![0]).toMatchObject({
      section: "velocity_quality",
      label: "Win Rate",
      bar_width_pct: 50,
    });
    expect(mockMetric).toHaveBeenCalledWith(
      METRIC_REGISTRY.CRM_BULLET_QUALITY,
      RANGE,
      { $filter: "person_id eq 'rep@x.com'" },
    );
  });

  it("targets the activity metric + section for kind=activity", async () => {
    mockMetric.mockResolvedValue(
      odata([
        {
          metric_key: "calls",
          value: 30,
          median: 40,
          range_min: 0,
          range_max: 100,
        },
      ]),
    );
    const { result } = renderHook(
      () => useSalesBulletSection("activity", "rep@x.com", "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0]).toMatchObject({
      section: "outreach_activity",
      metric_key: "calls",
      status: "bad", // 30 vs median 40, higher is better
    });
    expect(mockMetric).toHaveBeenCalledWith(
      METRIC_REGISTRY.CRM_BULLET_ACTIVITY,
      RANGE,
      { $filter: "person_id eq 'rep@x.com'" },
    );
  });
});

describe("useSalesDashboardQueries", () => {
  it("runs all six queries and exposes their transformed results", async () => {
    mockMetric.mockImplementation(async (metricId, range) => {
      if (metricId === METRIC_REGISTRY.CRM_KPIS) {
        return odata(
          range.from.startsWith("2025")
            ? [{ ...KPI_ROW, deals_opened: "1" }]
            : [KPI_ROW],
        );
      }
      if (metricId === METRIC_REGISTRY.CRM_CHART_FLOW) {
        return odata([
          {
            date_bucket: "W23",
            metric_date: "2026-06-01",
            opened: 3,
            closed: 2,
            won: 1,
          },
        ]);
      }
      if (metricId === METRIC_REGISTRY.CRM_BULLET_QUALITY) {
        return odata([
          {
            metric_key: "win_rate",
            value: 50,
            median: 40,
            range_min: 0,
            range_max: 100,
          },
        ]);
      }
      if (metricId === METRIC_REGISTRY.CRM_BULLET_ACTIVITY) {
        return odata([
          {
            metric_key: "calls",
            value: 30,
            median: 40,
            range_min: 0,
            range_max: 100,
          },
        ]);
      }
      throw new Error(`unexpected metric ${metricId}`);
    });
    mockRaw.mockResolvedValue(
      odata([{ person_id: "rep@x.com", pipeline_count: 4, pipeline_value: "9000" }]),
    );

    const { result } = renderHook(
      () => useSalesDashboardQueries("rep@x.com", "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => {
      expect(result.current.kpisQ.isSuccess).toBe(true);
      expect(result.current.prevKpisQ.isSuccess).toBe(true);
      expect(result.current.pipelineQ.isSuccess).toBe(true);
      expect(result.current.flowQ.isSuccess).toBe(true);
      expect(result.current.qualityQ.isSuccess).toBe(true);
      expect(result.current.activityQ.isSuccess).toBe(true);
    });

    expect(result.current.kpisQ.data?.dealsOpened).toBe(5);
    expect(result.current.prevKpisQ.data?.dealsOpened).toBe(1);
    expect(result.current.pipelineQ.data).toEqual({
      pipelineCount: 4,
      pipelineValue: 9000,
    });
    expect(result.current.flowQ.data).toEqual([
      { label: "W23", opened: 3, closed: 2, won: 1 },
    ]);
    expect(
      result.current.qualityQ.data!.map((b) => b.metric_key),
    ).toEqual(["win_rate", "cycle_days"]);
    expect(result.current.activityQ.data![0]).toMatchObject({
      metric_key: "calls",
      section: "outreach_activity",
    });
  });
});
