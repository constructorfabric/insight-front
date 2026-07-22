import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  queryBatchWithRange,
  type BatchQueryItem,
  type BatchQueryResult,
} from "@/api/analytics-client";
import { METRIC_REGISTRY } from "@/api/metric-registry";
import {
  useDeptDistributions,
  useTeamMemberBullets,
  useTeamMemberBulletsPrevious,
} from "@/queries/v2/team-extras";

vi.mock("@/api/analytics-client", async (orig) => ({
  ...(await orig<typeof import("@/api/analytics-client")>()),
  queryBatchWithRange: vi.fn(),
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
      metric("task_delivery_bullet_rows.tasks_completed", "Tasks Completed"),
      metric("collab_bullet_rows.reviews_given", "Reviews Given"),
    ],
    links: [],
  };
});

vi.mock("@/api/use-catalog", () => ({
  useCatalog: () => ({ data: CATALOG }),
}));

const mockBatch = vi.mocked(queryBatchWithRange);

const RANGE = { from: "2026-06-01", to: "2026-06-30" };
const PAGE = { has_next: false, cursor: null };

function ok<T>(id: string, items: T[]): BatchQueryResult<T> {
  return { status: "ok", id, metric_id: id, items, page_info: PAGE };
}

function err(id: string): BatchQueryResult<never> {
  return {
    status: "error",
    id,
    metric_id: id,
    error: { type: "about:blank", title: "boom", status: 500 },
  };
}

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  mockBatch.mockReset();
});

describe("useTeamMemberBullets", () => {
  const MEMBER_RESULTS = [
    ok("task_delivery", [
      { person_id: "Alice@X.com", metric_key: "tasks_completed", value: 10 },
      { person_id: "bob@x.com", metric_key: "tasks_completed", value: 2 },
      // Non-finite value: excluded from the roster min/max range.
      { person_id: "carol@x.com", metric_key: "ghost", value: null },
    ]),
    ok("collaboration", [
      { person_id: "alice@x.com", metric_key: "reviews_given", value: 4 },
    ]),
    // A result without an id is skipped.
    { status: "ok" as const, metric_id: "anon", items: [], page_info: PAGE },
  ];

  it("groups transformed bullets per member using the roster min/max range", async () => {
    mockBatch.mockResolvedValue({ results: MEMBER_RESULTS });
    const { result } = renderHook(
      () =>
        useTeamMemberBullets(["Alice@X.com", "bob@x.com"], "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const byMember = result.current.data!;
    const alice = byMember.get("alice@x.com")!;
    const bob = byMember.get("bob@x.com")!;

    // Alice: tasks_completed (task_delivery) + reviews_given (collaboration).
    expect(alice.map((b) => b.metric_key).sort()).toEqual([
      "reviews_given",
      "tasks_completed",
    ]);
    expect(bob.map((b) => b.metric_key)).toEqual(["tasks_completed"]);

    // The bullet range is the roster's own min/max per metric_key (2..10):
    // Alice sits at the max (100%), Bob at the min (0%).
    const aliceTasks = alice.find((b) => b.metric_key === "tasks_completed")!;
    const bobTasks = bob[0]!;
    expect(aliceTasks.bar_width_pct).toBe(100);
    expect(bobTasks.bar_width_pct).toBe(0);
    // Carol's "ghost" row has no catalog entry, so it is omitted; the
    // transform instead backfills the section's catalog key as an
    // honest-zero row without a range → unavailable.
    const carol = byMember.get("carol@x.com")!;
    expect(carol.map((b) => [b.metric_key, b.status])).toEqual([
      ["tasks_completed", "unavailable"],
    ]);

    // One batch item per retained section, scoped to the roster.
    const items = mockBatch.mock.calls[0]![1] as BatchQueryItem[];
    expect(items.map((i) => i.id)).toEqual(["task_delivery", "collaboration"]);
    expect(items[0]!.metric_id).toBe(METRIC_REGISTRY.V2_MEMBER_VALUES_DELIVERY);
    expect(items[0]!.$filter).toBe(
      "person_id in ('alice@x.com', 'bob@x.com')",
    );
  });

  it("errors when a section result fails", async () => {
    mockBatch.mockResolvedValue({
      results: [err("task_delivery"), ok("collaboration", [])],
    });
    const { result } = renderHook(
      () => useTeamMemberBullets(["alice@x.com"], "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe(
      "Failed to load task_delivery member values",
    );
  });

  it("stays disabled for an empty roster", async () => {
    const { result } = renderHook(
      () => useTeamMemberBullets([], "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(mockBatch).not.toHaveBeenCalled();
  });
});

describe("useTeamMemberBulletsPrevious", () => {
  it("queries the previous period window", async () => {
    mockBatch.mockResolvedValue({
      results: [ok("task_delivery", []), ok("collaboration", [])],
    });
    const { result } = renderHook(
      () => useTeamMemberBulletsPrevious(["alice@x.com"], "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.size).toBe(0);
    // June 1–30 shifted one month back.
    expect(mockBatch.mock.calls[0]![0]).toEqual({
      from: "2026-05-01",
      to: "2026-05-30",
    });
  });
});

describe("useDeptDistributions", () => {
  it("folds distribution rows into kpi and bullet cohort maps", async () => {
    mockBatch.mockResolvedValue({
      results: [
        ok(METRIC_REGISTRY.V2_DEPT_DIST_DELIVERY, [
          {
            org_unit_id: "dept-1",
            metric_key: "tasks_completed",
            p25: 1,
            median: 2,
            p75: 3,
            range_min: 0,
            range_max: 5,
            n: 10,
          },
          // n missing/zero → skipped.
          {
            org_unit_id: "dept-1",
            metric_key: "no_cohort",
            p25: 1,
            median: 2,
            p75: 3,
            range_min: 0,
            range_max: 5,
            n: 0,
          },
          // quartile missing → skipped (undefined coerces to NaN).
          {
            org_unit_id: "dept-1",
            metric_key: "no_median",
            p25: 1,
            median: undefined,
            p75: 3,
            range_min: 0,
            range_max: 5,
            n: 4,
          },
          // range absent → min/max fall back to p25/p75.
          {
            org_unit_id: "dept-2",
            metric_key: "tasks_completed",
            p25: 1,
            median: 2,
            p75: 3,
            range_min: undefined,
            range_max: undefined,
            n: 4,
          },
        ]),
        ok(METRIC_REGISTRY.V2_DEPT_DIST_COLLAB, []),
        ok(METRIC_REGISTRY.V2_DEPT_DIST_KPIS, [
          {
            org_unit_id: "dept-1",
            metric_key: "tasks_closed",
            p25: 2,
            median: 4,
            p75: 6,
            range_min: 1,
            range_max: 9,
            n: 7,
          },
        ]),
        // No id → skipped.
        {
          status: "ok" as const,
          metric_id: "anon",
          items: [],
          page_info: PAGE,
        },
      ],
    });
    const { result } = renderHook(
      () => useDeptDistributions(["dept-1", "dept-2"], "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cohorts = result.current.data!;
    expect(cohorts.bullet.get("dept-1")!.get("tasks_completed")).toEqual({
      p25: 1,
      p50: 2,
      p75: 3,
      min: 0,
      max: 5,
      n: 10,
    });
    expect(cohorts.bullet.get("dept-1")!.has("no_cohort")).toBe(false);
    expect(cohorts.bullet.get("dept-1")!.has("no_median")).toBe(false);
    expect(cohorts.bullet.get("dept-2")!.get("tasks_completed")).toEqual({
      p25: 1,
      p50: 2,
      p75: 3,
      min: 1,
      max: 3,
      n: 4,
    });
    expect(cohorts.kpi.get("dept-1")!.get("tasks_closed")).toEqual({
      p25: 2,
      p50: 4,
      p75: 6,
      min: 1,
      max: 9,
      n: 7,
    });

    // One batch item per distribution family, scoped by org_unit_id.
    const items = mockBatch.mock.calls[0]![1] as BatchQueryItem[];
    expect(items.map((i) => i.metric_id)).toEqual([
      METRIC_REGISTRY.V2_DEPT_DIST_DELIVERY,
      METRIC_REGISTRY.V2_DEPT_DIST_COLLAB,
      METRIC_REGISTRY.V2_DEPT_DIST_KPIS,
    ]);
    expect(items[0]!.$filter).toBe("org_unit_id in ('dept-1', 'dept-2')");
  });

  it("errors when a distribution family fails", async () => {
    mockBatch.mockResolvedValue({
      results: [err(METRIC_REGISTRY.V2_DEPT_DIST_DELIVERY)],
    });
    const { result } = renderHook(
      () => useDeptDistributions(["dept-1"], "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe(
      `Failed to load ${METRIC_REGISTRY.V2_DEPT_DIST_DELIVERY} department distribution`,
    );
  });

  it("stays disabled when opted out or without departments", async () => {
    const none = renderHook(() => useDeptDistributions([], "month", RANGE), {
      wrapper: wrapper(),
    });
    const optOut = renderHook(
      () =>
        useDeptDistributions(["dept-1"], "month", RANGE, { enabled: false }),
      { wrapper: wrapper() },
    );
    await waitFor(() =>
      expect(none.result.current.fetchStatus).toBe("idle"),
    );
    await waitFor(() =>
      expect(optOut.result.current.fetchStatus).toBe("idle"),
    );
    expect(mockBatch).not.toHaveBeenCalled();
  });
});
