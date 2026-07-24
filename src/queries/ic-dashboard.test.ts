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
import { getPerson } from "@/api/identity-client";
import { METRIC_REGISTRY } from "@/api/metric-registry";
import type { RawIcAggregateRow } from "@/api/raw-types";
import type { IdentityPerson } from "@/types/insight";
import {
  useIcBulletSection,
  useIcDashboardData,
  useIcDeliveryTrend,
  useIcDrill,
  useIcKpis,
  useIcLocTrend,
  useIcPerson,
  useIcTimeOff,
} from "@/queries/ic-dashboard";

vi.mock("@/api/analytics-client", async (orig) => ({
  ...(await orig<typeof import("@/api/analytics-client")>()),
  queryMetric: vi.fn(),
  queryBatchWithRange: vi.fn(),
}));

vi.mock("@/api/identity-client", async (orig) => ({
  ...(await orig<typeof import("@/api/identity-client")>()),
  getPerson: vi.fn(),
}));

const CATALOG = vi.hoisted(() => {
  const metric = (metric_key: string, label: string) => ({
    id: metric_key,
    metric_key,
    label,
    higher_is_better: true,
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
      metric("ic_kpis.tasks_closed", "Tasks Closed"),
      metric("task_delivery_bullet_rows.tasks_completed", "Tasks Completed"),
      metric("code_quality_bullet_rows.build_success", "Build Success"),
      metric("git_bullet_rows.loc", "Lines of Code"),
      metric("ai_bullet_rows.ai_sessions", "AI Sessions"),
      metric("collab_bullet_rows.reviews_given", "Reviews Given"),
    ],
    links: [],
  };
});

vi.mock("@/api/use-catalog", () => ({
  useCatalog: () => ({ data: CATALOG }),
}));

const mockMetric = vi.mocked(queryMetric);
const mockBatch = vi.mocked(queryBatchWithRange);
const mockGetPerson = vi.mocked(getPerson);

const RANGE = { from: "2026-06-01", to: "2026-06-30" };
const PREV_RANGE = { from: "2026-05-01", to: "2026-05-30" };
const PAGE = { has_next: false, cursor: null };

function odata<T>(items: T[]) {
  return { items, page_info: PAGE };
}

function bulletRow(metric_key: string, value = 8) {
  return {
    metric_key,
    value,
    median: 5,
    range_min: 0,
    range_max: 10,
    p25: 3,
    p75: 7,
    n: 12,
  };
}

const KPI_CUR = {
  person_id: "alice@x.com",
  tasks_closed: 5,
  tasks_closed_median: 4,
  peer_n: 9,
} as unknown as RawIcAggregateRow;

const KPI_PREV = {
  person_id: "alice@x.com",
  tasks_closed: 3,
} as unknown as RawIcAggregateRow;

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  mockMetric.mockReset();
  mockBatch.mockReset();
  mockGetPerson.mockReset();
});

describe("useIcPerson", () => {
  it("resolves the identity person", async () => {
    const person = { email: "alice@x.com" } as IdentityPerson;
    mockGetPerson.mockResolvedValue(person);
    const { result } = renderHook(() => useIcPerson("Alice@X.com"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(person);
    expect(mockGetPerson).toHaveBeenCalledWith("Alice@X.com");
  });

  it("stays disabled for an empty person id", async () => {
    const { result } = renderHook(() => useIcPerson(""), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(mockGetPerson).not.toHaveBeenCalled();
  });
});

describe("useIcKpis", () => {
  it("fetches current + previous period and computes deltas", async () => {
    mockMetric.mockImplementation(async (_id, range) =>
      odata(range.from === RANGE.from ? [KPI_CUR] : [KPI_PREV]),
    );
    const { result } = renderHook(
      () => useIcKpis("alice@x.com", "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0]).toMatchObject({
      metric_key: "tasks_closed",
      label: "Tasks Closed",
      raw_value: 5,
      delta_type: "good", // 5 vs 3, higher is better
      peer_median: 4,
      peer_n: 9,
    });
    expect(mockMetric).toHaveBeenCalledWith(
      METRIC_REGISTRY.IC_KPIS,
      RANGE,
      { $filter: "person_id eq 'alice@x.com'" },
    );
    expect(mockMetric).toHaveBeenCalledWith(
      METRIC_REGISTRY.IC_KPIS,
      PREV_RANGE,
      { $filter: "person_id eq 'alice@x.com'" },
    );
  });
});

describe("useIcBulletSection", () => {
  it("transforms rows for the requested section", async () => {
    mockMetric.mockResolvedValue(odata([bulletRow("tasks_completed")]));
    const { result } = renderHook(
      () => useIcBulletSection("task_delivery", "alice@x.com", "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0]).toMatchObject({
      section: "task_delivery",
      label: "Tasks Completed",
      status: "good",
      bar_width_pct: 80,
    });
    expect(mockMetric).toHaveBeenCalledWith(
      METRIC_REGISTRY.IC_BULLET_DELIVERY,
      RANGE,
      { $filter: "person_id eq 'alice@x.com'" },
    );
  });
});

describe("useIcLocTrend", () => {
  it("maps raw buckets to chart points", async () => {
    mockMetric.mockResolvedValue(
      odata([
        { date_bucket: "2026-06-01", code_loc: 100, spec_lines: 10, config_loc: 5 },
      ]),
    );
    const { result } = renderHook(
      () => useIcLocTrend("alice@x.com", "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0]).toMatchObject({
      codeLoc: 100,
      specLines: 10,
      configLoc: 5,
    });
  });
});

describe("useIcDeliveryTrend", () => {
  it("maps raw buckets to chart points", async () => {
    mockMetric.mockResolvedValue(
      odata([
        { date_bucket: "2026-06-01", commits: 4, prs_merged: 2, tasks_done: 3 },
      ]),
    );
    const { result } = renderHook(
      () => useIcDeliveryTrend("alice@x.com", "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0]).toMatchObject({
      commits: 4,
      prsMerged: 2,
      tasksDone: 3,
    });
  });
});

describe("useIcTimeOff", () => {
  it("returns the first notice when present", async () => {
    mockMetric.mockResolvedValue(
      odata([{ days: 3, date_range: "Jun 1–3", bamboo_hr_url: "https://hr" }]),
    );
    const { result } = renderHook(() => useIcTimeOff("alice@x.com", RANGE), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      days: 3,
      dateRange: "Jun 1–3",
      bambooHrUrl: "https://hr",
    });
  });

  it("returns null when there is no notice", async () => {
    mockMetric.mockResolvedValue(odata([]));
    const { result } = renderHook(() => useIcTimeOff("alice@x.com", RANGE), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe("useIcDrill", () => {
  it("stays disabled with a null drill id", async () => {
    const { result } = renderHook(
      () => useIcDrill("alice@x.com", null, RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(mockMetric).not.toHaveBeenCalled();
  });

  it("fetches and transforms the drill row", async () => {
    mockMetric.mockResolvedValue(
      odata([
        {
          title: "Bugs",
          source: "jira",
          src_class: "jira",
          value: "4",
          filter: "f",
          columns: ["key"],
          rows: [{ key: "B-1" }],
        },
      ]),
    );
    const { result } = renderHook(
      () => useIcDrill("Alice@X.com", "bugs", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({
      title: "Bugs",
      srcClass: "jira",
    });
    expect(mockMetric).toHaveBeenCalledWith(METRIC_REGISTRY.IC_DRILL, RANGE, {
      $filter: "person_id eq 'alice@x.com' and drill_id eq 'bugs'",
    });
  });

  it("returns null when the drill has no rows", async () => {
    mockMetric.mockResolvedValue(odata([]));
    const { result } = renderHook(
      () => useIcDrill("alice@x.com", "bugs", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe("useIcDashboardData", () => {
  const DATA_BY_ID: Record<string, unknown[]> = {
    kpis: [KPI_CUR],
    kpis_prior: [KPI_PREV],
    delivery_bullets: [bulletRow("tasks_completed"), bulletRow("build_success")],
    git_output: [bulletRow("loc")],
    ai_adoption: [bulletRow("ai_sessions", 1)],
    collaboration: [bulletRow("reviews_given")],
    loc_trend: [
      { date_bucket: "2026-06-01", code_loc: 100, spec_lines: 10, config_loc: 5 },
    ],
    delivery_trend: [
      { date_bucket: "2026-06-01", commits: 4, prs_merged: 2, tasks_done: 3 },
    ],
    time_off: [{ days: 2, date_range: "Jun 9–10", bamboo_hr_url: "https://hr" }],
  };

  it("assembles every section from one batched round-trip pair", async () => {
    mockBatch.mockImplementation(async (_range, items: BatchQueryItem[]) => ({
      results: items.map(
        (it): BatchQueryResult<unknown> => ({
          status: "ok",
          id: it.id,
          metric_id: it.metric_id,
          items: DATA_BY_ID[it.id!] ?? [],
          page_info: PAGE,
        }),
      ),
    }));
    const { result } = renderHook(
      () => useIcDashboardData("alice@x.com", "month", RANGE, { keepPrevious: true }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    expect(data.kpis).toHaveLength(1);
    expect(data.kpis[0]).toMatchObject({ metric_key: "tasks_closed", raw_value: 5 });
    // One delivery_bullets payload feeds both sections; each keeps only
    // the metric keys its catalog wire-prefix owns.
    expect(data.taskDelivery.map((b) => b.metric_key)).toEqual(["tasks_completed"]);
    expect(data.codeQuality.map((b) => b.metric_key)).toEqual(["build_success"]);
    expect(data.gitOutput.map((b) => b.metric_key)).toEqual(["loc"]);
    expect(data.aiAdoption[0]).toMatchObject({ metric_key: "ai_sessions", status: "bad" });
    expect(data.collaboration.map((b) => b.metric_key)).toEqual(["reviews_given"]);
    expect(data.locTrend[0]).toMatchObject({ codeLoc: 100 });
    expect(data.deliveryTrend[0]).toMatchObject({ commits: 4 });
    expect(data.timeOff).toEqual({
      days: 2,
      dateRange: "Jun 9–10",
      bambooHrUrl: "https://hr",
    });
    expect(Object.values(data.errors).every((e) => e === false)).toBe(true);

    // Two batch calls: current range (8 items) + prior range (kpis only).
    expect(mockBatch).toHaveBeenCalledTimes(2);
    expect(mockBatch.mock.calls[0]![0]).toEqual(RANGE);
    expect(mockBatch.mock.calls[1]![0]).toEqual(PREV_RANGE);
    expect(
      (mockBatch.mock.calls[1]![1] as BatchQueryItem[]).map((i) => i.id),
    ).toEqual(["kpis_prior"]);
  });

  it("flags every section and returns empty shapes when all items error", async () => {
    mockBatch.mockImplementation(async (_range, items: BatchQueryItem[]) => ({
      results: items.map(
        (it): BatchQueryResult<unknown> => ({
          status: "error",
          id: it.id,
          metric_id: it.metric_id,
          error: { type: "about:blank", title: "boom", status: 500, detail: "boom" },
        }),
      ),
    }));
    const { result } = renderHook(
      () => useIcDashboardData("alice@x.com", "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    expect(data.kpis).toEqual([]);
    expect(data.taskDelivery).toEqual([]);
    expect(data.codeQuality).toEqual([]);
    expect(data.gitOutput).toEqual([]);
    expect(data.aiAdoption).toEqual([]);
    expect(data.collaboration).toEqual([]);
    expect(data.locTrend).toEqual([]);
    expect(data.deliveryTrend).toEqual([]);
    expect(data.timeOff).toBeNull();
    expect(data.errors).toEqual({
      kpis: true,
      task_delivery: true,
      code_quality: true,
      git_output: true,
      ai_adoption: true,
      collaboration: true,
      loc_trend: true,
      delivery_trend: true,
      time_off: true,
    });
  });

  it("stays disabled without a person id", async () => {
    const { result } = renderHook(
      () => useIcDashboardData("", "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(mockBatch).not.toHaveBeenCalled();
  });
});
