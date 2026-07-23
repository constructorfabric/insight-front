import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  queryBatchWithRange,
  queryMetric,
  type BatchQueryItem,
  type BatchQueryResult,
} from "@/api/analytics-client";
import { METRIC_REGISTRY } from "@/api/metric-registry";
import {
  icDrilldownBatchQueryOptions,
  icHistogramQueryOptions,
  useIcDrilldownBatch,
  useIcHistogram,
  useIcSectionTrend,
  type HistogramBin,
} from "@/queries/v2/ic-extras";

vi.mock("@/api/analytics-client", async (orig) => ({
  ...(await orig<typeof import("@/api/analytics-client")>()),
  queryMetric: vi.fn(),
  queryBatchWithRange: vi.fn(),
}));

const mockMetric = vi.mocked(queryMetric);
const mockBatch = vi.mocked(queryBatchWithRange);

const RANGE = { from: "2026-06-01", to: "2026-06-30" };
const PAGE = { has_next: false, cursor: null };

function odata<T>(items: T[]) {
  return { items, page_info: PAGE };
}

function ok<T>(id: string, items: T[]): BatchQueryResult<T> {
  return { status: "ok", id, metric_id: id, items, page_info: PAGE };
}

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

const BINS: HistogramBin[] = [
  { metric_key: "focus_h", bin: 0, bin_end: 2, count: 3 },
  { metric_key: "focus_h", bin: 2, bin_end: 4, count: 1 },
];

beforeEach(() => {
  mockMetric.mockReset();
  mockBatch.mockReset();
});

describe("useIcHistogram", () => {
  it("fetches bins with a canonicalized person + metric filter", async () => {
    mockMetric.mockResolvedValue(odata(BINS));
    const { result } = renderHook(
      () => useIcHistogram("  Alice@X.com ", "focus_h", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(BINS);
    expect(mockMetric).toHaveBeenCalledWith(
      METRIC_REGISTRY.V2_IC_HISTOGRAM,
      RANGE,
      {
        $filter:
          "person_id eq 'alice@x.com' and metric_key eq 'focus_h'",
      },
    );
  });

  it("is disabled when the metric key is empty", () => {
    const opts = icHistogramQueryOptions("alice@x.com", "", RANGE);
    expect(opts.enabled).toBe(false);
    expect(opts.queryKey).toEqual([
      "v2",
      "ic-histogram",
      "alice@x.com",
      "",
      RANGE.from,
      RANGE.to,
    ]);
  });
});

describe("useIcSectionTrend", () => {
  it("pivots long rows to wide date points, sorted by date", async () => {
    mockMetric.mockResolvedValue(
      odata([
        { metric_date: "2026-06-08", series_key: "b", value: 2 },
        { date: "2026-06-01", series_key: "a", value: 1 },
        { metric_date: "2026-06-01", series_key: "b", value: 3 },
        // Row without any date is dropped.
        { series_key: "c", value: 9 },
      ]),
    );
    const { result } = renderHook(
      () => useIcSectionTrend("Alice@X.com", "code_quality", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { date: "2026-06-01", a: 1, b: 3 },
      { date: "2026-06-08", b: 2 },
    ]);
    expect(mockMetric).toHaveBeenCalledWith(
      METRIC_REGISTRY.V2_IC_SECTION_TREND,
      RANGE,
      {
        $filter:
          "person_id eq 'alice@x.com' and section_id eq 'code_quality'",
      },
    );
  });

  it("passes already-wide rows through untouched", async () => {
    const wide = [{ date: "2026-06-01", loc: 120 }];
    mockMetric.mockResolvedValue(odata(wide));
    const { result } = renderHook(
      () => useIcSectionTrend("alice@x.com", "ai_adoption", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(wide);
  });

  it("returns an empty series for no rows", async () => {
    mockMetric.mockResolvedValue(odata([]));
    const { result } = renderHook(
      () => useIcSectionTrend("alice@x.com", "code_quality", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("icDrilldownBatchQueryOptions", () => {
  it("is disabled and returns the empty shape when any input is missing", async () => {
    const opts = icDrilldownBatchQueryOptions({
      sectionId: null,
      personId: "alice@x.com",
      range: RANGE,
      period: "month",
    });
    expect(opts.enabled).toBe(false);
    // Defensive guard inside the queryFn (unreachable through the hook).
    const data = await opts.queryFn();
    expect(data.histograms.size).toBe(0);
    expect(data.sectionTrend).toBeNull();
    expect(mockBatch).not.toHaveBeenCalled();
  });
});

describe("useIcDrilldownBatch", () => {
  it("adds a section-trend item for code_quality and groups histograms by metric", async () => {
    mockBatch.mockResolvedValue({
      results: [
        ok("histograms", [
          ...BINS,
          { metric_key: "build_success", bin: 0, bin_end: 1, count: 5 },
        ]),
        ok("section_trend", [
          { metric_date: "2026-06-01", series_key: "s", value: 7 },
        ]),
      ],
    });
    const { result } = renderHook(
      () =>
        useIcDrilldownBatch({
          sectionId: "code_quality",
          personId: "Alice@X.com",
          range: RANGE,
          period: "month",
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    expect(data.histograms.get("focus_h")).toHaveLength(2);
    expect(data.histograms.get("build_success")).toHaveLength(1);
    expect(data.sectionTrend).toEqual([{ date: "2026-06-01", s: 7 }]);

    const items = mockBatch.mock.calls[0]![1] as BatchQueryItem[];
    expect(items.map((i) => i.id)).toEqual(["histograms", "section_trend"]);
    expect(items[1]!.$filter).toBe(
      "person_id eq 'alice@x.com' and section_id eq 'code_quality'",
    );
  });

  it("skips the trend item for other sections and tolerates errored histograms", async () => {
    mockBatch.mockResolvedValue({
      results: [
        {
          status: "error",
          id: "histograms",
          metric_id: METRIC_REGISTRY.V2_IC_HISTOGRAM,
          error: { type: "about:blank", title: "boom", status: 500, detail: "boom" },
        },
      ],
    });
    const { result } = renderHook(
      () =>
        useIcDrilldownBatch({
          sectionId: "collaboration",
          personId: "alice@x.com",
          range: RANGE,
          period: "month",
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.histograms.size).toBe(0);
    expect(result.current.data!.sectionTrend).toBeNull();
    const items = mockBatch.mock.calls[0]![1] as BatchQueryItem[];
    expect(items.map((i) => i.id)).toEqual(["histograms"]);
  });

  it("stays disabled when inputs are incomplete", async () => {
    const { result } = renderHook(
      () =>
        useIcDrilldownBatch({
          sectionId: "code_quality",
          personId: null,
          range: RANGE,
          period: "month",
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(mockBatch).not.toHaveBeenCalled();
  });
});
