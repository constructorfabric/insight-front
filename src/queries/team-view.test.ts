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
import type { RawDrillRow, RawTeamMemberRow } from "@/api/raw-types";
import type { RosterEntry } from "@/lib/insight/identity-tree";
import {
  isTeamBulletSectionId,
  useTeamBulletSection,
  useTeamBulletSections,
  useTeamDrill,
  useTeamMembers,
} from "@/queries/team-view";

vi.mock("@/api/analytics-client", async (orig) => ({
  ...(await orig<typeof import("@/api/analytics-client")>()),
  queryMetric: vi.fn(),
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
const mockMetric = vi.mocked(queryMetric);

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

function odata<T>(items: T[]) {
  return { items, page_info: PAGE };
}

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

const ROSTER: RosterEntry[] = [
  {
    email: "Alice@X.com",
    display_name: "Alice",
    supervisor_email: "boss@x.com",
    is_direct: true,
  },
  {
    email: "bob@x.com",
    display_name: "Bob",
    supervisor_email: "boss@x.com",
    is_direct: true,
  },
];

const ALICE_ROW: RawTeamMemberRow = {
  person_id: "alice@x.com",
  display_name: "Alice A.",
  seniority: "senior",
  supervisor_email: "boss@x.com",
  org_unit_id: "dept-1",
  tasks_closed: 7.2,
  bugs_fixed: 1,
  dev_time_h: 20,
  prs_merged: null,
  build_success_pct: 90,
  focus_time_pct: 55,
  ai_tools: ["copilot"],
  ai_loc_share_pct: 10,
};

beforeEach(() => {
  mockBatch.mockReset();
  mockMetric.mockReset();
});

describe("isTeamBulletSectionId", () => {
  it("accepts ids backed by a team bullet section", () => {
    expect(isTeamBulletSectionId("collaboration")).toBe(true);
    expect(isTeamBulletSectionId("task_delivery")).toBe(true);
  });

  it("rejects ids with no team bullet section", () => {
    expect(isTeamBulletSectionId("wiki")).toBe(false);
    expect(isTeamBulletSectionId("nonsense")).toBe(false);
  });
});

describe("useTeamMembers", () => {
  it("merges member rows with per-person PRs and synthesizes missing members", async () => {
    mockBatch.mockResolvedValue({
      results: [
        ok("members", [ALICE_ROW]),
        ok("prs", [
          { person_id: "Alice@X.com", prs_merged: 7 },
          // Non-finite PR count is skipped, not merged as 0/NaN.
          { person_id: "bob@x.com", prs_merged: Number.NaN },
        ]),
        // Unknown result ids are ignored.
        ok("junk", [{ person_id: "x", prs_merged: 1 }]),
        // Errored side results are skipped without failing the query.
        err("side"),
      ],
    });

    const { result } = renderHook(
      () => useTeamMembers("team-1", ROSTER, "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [alice, bob] = result.current.data!;
    expect(alice).toMatchObject({
      person_id: "alice@x.com",
      // Identity (roster) name wins over the analytics row's display_name (#1837).
      name: "Alice",
      tasks_closed: 7,
      prs_merged: 7, // merged from the V2_MEMBER_PRS row
    });
    // Bob has no backend row: synthetic member built from the roster entry.
    expect(bob).toMatchObject({
      person_id: "bob@x.com",
      name: "Bob",
      seniority: "",
      tasks_closed: 0,
      prs_merged: null,
      dev_time_h: null,
    });

    // The batch was scoped to the roster emails (lowercased).
    const items = mockBatch.mock.calls[0]![1] as BatchQueryItem[];
    expect(items.map((i) => i.id)).toEqual(["members", "prs"]);
    expect(items[0]!.$filter).toBe(
      "person_id in ('alice@x.com', 'bob@x.com')",
    );
  });

  it("errors when the members batch item fails", async () => {
    mockBatch.mockResolvedValue({ results: [err("members")] });
    const { result } = renderHook(
      () => useTeamMembers("team-1", ROSTER, "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe(
      "Failed to load team members",
    );
  });

  it("stays disabled without a roster", async () => {
    const { result } = renderHook(
      () => useTeamMembers("team-1", null, "month", RANGE),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(mockBatch).not.toHaveBeenCalled();
  });
});

describe("useTeamBulletSection", () => {
  it("transforms bullet aggregate rows for the section", async () => {
    mockMetric.mockResolvedValue(
      odata([
        {
          metric_key: "tasks_completed",
          value: 8,
          median: 5,
          range_min: 0,
          range_max: 10,
          p25: 3,
          p75: 7,
          n: 12,
        },
      ]),
    );
    const { result } = renderHook(
      () =>
        useTeamBulletSection("task_delivery", "team-1", 4, "month", RANGE, {
          roster: ROSTER,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0]).toMatchObject({
      section: "task_delivery",
      metric_key: "tasks_completed",
      label: "Tasks Completed",
      status: "good", // 8 >= good threshold 5
      bar_width_pct: 80,
      peer: { p25: 3, p50: 5, p75: 7, min: 0, max: 10, n: 12 },
    });
    expect(mockMetric).toHaveBeenCalledWith(
      METRIC_REGISTRY.TEAM_BULLET_DELIVERY,
      RANGE,
      { $filter: "person_id in ('alice@x.com', 'bob@x.com')" },
    );
  });

  it("stays disabled without a roster", async () => {
    const { result } = renderHook(
      () =>
        useTeamBulletSection("task_delivery", "team-1", 4, "month", RANGE, {
          roster: [],
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(mockMetric).not.toHaveBeenCalled();
  });
});

describe("useTeamBulletSections", () => {
  it("splits ok and errored sections into bySection/errors", async () => {
    mockBatch.mockResolvedValue({
      results: [
        ok("task_delivery", [
          {
            metric_key: "tasks_completed",
            value: 8,
            median: 5,
            range_min: 0,
            range_max: 10,
          },
        ]),
        err("collaboration"),
      ],
    });
    const { result } = renderHook(
      () =>
        useTeamBulletSections(
          ["task_delivery", "collaboration"],
          "team-1",
          4,
          "month",
          RANGE,
          { roster: ROSTER, keepPrevious: true },
        ),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    expect(data.errors).toEqual({ task_delivery: false, collaboration: true });
    expect(data.bySection.task_delivery).toHaveLength(1);
    expect(data.bySection.task_delivery![0]!.label).toBe("Tasks Completed");
    expect(data.bySection.collaboration).toEqual([]);
  });
});

describe("useTeamDrill", () => {
  const DRILL_ROW: RawDrillRow = {
    title: "Closed tasks",
    source: "jira",
    src_class: "jira",
    value: "12",
    filter: "f",
    columns: ["key"],
    rows: [{ key: "T-1" }],
  };

  it("stays disabled with a null target", async () => {
    const { result } = renderHook(() => useTeamDrill(null, RANGE), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(mockMetric).not.toHaveBeenCalled();
  });

  it("fetches and transforms the drill row for a cell target", async () => {
    mockMetric.mockResolvedValue(odata([DRILL_ROW]));
    const { result } = renderHook(
      () =>
        useTeamDrill(
          { kind: "cell", personId: "Alice@X.com", drillId: "tasks" },
          RANGE,
        ),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      title: "Closed tasks",
      source: "jira",
      srcClass: "jira",
      value: "12",
      filter: "f",
      columns: ["key"],
      rows: [{ key: "T-1" }],
    });
    expect(mockMetric).toHaveBeenCalledWith(METRIC_REGISTRY.IC_DRILL, RANGE, {
      $filter: "person_id eq 'alice@x.com' and drill_id eq 'tasks'",
    });
  });

  it("returns null when the drill has no rows", async () => {
    mockMetric.mockResolvedValue(odata([]));
    const { result } = renderHook(
      () =>
        useTeamDrill(
          { kind: "cell", personId: "alice@x.com", drillId: "tasks" },
          RANGE,
        ),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
