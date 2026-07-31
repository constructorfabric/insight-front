// @vitest-environment jsdom
/**
 * Team-state dashboard semantics: honest KPI roll-ups (totals for counters,
 * medians for ratios), all-empty columns dropped instead of zero-painted,
 * attention wired to the roster, and the org-scope gate in front of it all.
 * Data arrives via the same stubbed query boundary as the real view.
 */
vi.mock("@tanstack/react-router", async () => {
  const { portalRouterMock } = await import("@/test/portal-router");
  return portalRouterMock();
});

import { portalRouter } from "@/test/portal-router";

import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NormalizedMetricResult } from "@/lib/metrics/collection";
import type { IdentityPerson } from "@/types/insight";

const mocks = vi.hoisted(() => ({
  email: "boss@x" as string | null,
  tree: undefined as IdentityPerson | undefined,
  grid: {
    byKey: new Map<string, NormalizedMetricResult>(),
    previousByKey: new Map<string, NormalizedMetricResult>(),
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ useViewer: () => ({ email: mocks.email }) }));
vi.mock("@/lib/portal/use-cohort-label", () => ({
  useCohortLabel: () => "team",
}));
vi.mock("@/queries/ic-dashboard", () => ({
  useIcPerson: () => ({ data: mocks.tree, isPending: false, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/queries/member-grid", () => ({ useMemberGridData: () => mocks.grid }));
vi.mock("@/hooks/use-portal-period", () => ({
  usePortalPeriod: () => ({ period: "week", dateRange: { start: "2026-07-20", end: "2026-07-26" } }),
}));


import { TeamStateView } from "./team-state-view";

const person = (email: string, subs: IdentityPerson[] = []): IdentityPerson =>
  ({ email, display_name: email.split("@")[0], subordinates: subs }) as unknown as IdentityPerson;


function metric(
  key: string,
  period: Array<[string, number | null]>,
  over: Partial<NormalizedMetricResult> = {},
): NormalizedMetricResult {
  return {
    metric_key: key,
    label: over.label ?? key,
    unit: null,
    computation: "sum",
    format: "integer",
    direction: "higher_is_better",
    period: { view: "period", values: period.map(([entity_id, value]) => ({ entity_id, value })) },
    peer: { view: "peer", values: period.map(([entity_id, value]) => ({ entity_id, target_value: value })) },
    ...over,
  } as unknown as NormalizedMetricResult;
}

const IDS = ["a@x", "b@x", "c@x", "d@x"];

beforeEach(() => {
  mocks.email = "boss@x";
  mocks.tree = person("boss@x", IDS.map((id) => person(id)));
  mocks.grid.isPending = false;
  mocks.grid.isError = false;
  // git.commits is a real headline key (GROUPS card.preview) — the view
  // only renders columns from that set.
  mocks.grid.byKey = new Map([
    ["git.commits", metric("git.commits", [["a@x", 10], ["b@x", 20], ["c@x", 30], ["d@x", 40]], { label: "Commits" })],
    // a ratio metric: must roll up as MEDIAN, not a summed percentage
    ["collab.focus_time_pct", metric("collab.focus_time_pct", [["a@x", 40], ["b@x", 50], ["c@x", 60], ["d@x", 70]], {
      computation: "avg",
      label: "Focus Time",
      format: "percent",
    } as never)],
    // ingested nowhere → its column must disappear, not paint zeros
    ["tasks.closed", metric("tasks.closed", IDS.map((id) => [id, null]), { label: "Tasks closed" })],
  ]);
  mocks.grid.previousByKey = new Map();
  act(() => {
    portalRouter.set({ slice: undefined });
    portalRouter.set({ scope: undefined, direct: false });
  });
});

describe("TeamStateView", () => {
  it("renders the scope header and every member row", () => {
    render(<TeamStateView />);
    expect(screen.getByText("boss's team")).toBeInTheDocument();
    expect(screen.getByText(/4 people · state & attention/)).toBeInTheDocument();
    // Names come from identity now — the roster is the member list.
    for (const id of IDS) {
      expect(screen.getByText(id.split("@")[0]!)).toBeInTheDocument();
    }
  });

  it("sums counters into a team total and medians ratios — never the reverse", () => {
    render(<TeamStateView />);
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getAllByText("team total").length).toBeGreaterThan(0);
    // median of 40,50,60,70 = 55%, NOT the 220% a sum would fabricate
    expect(screen.getByText("55%")).toBeInTheDocument();
    expect(screen.getAllByText("team median").length).toBeGreaterThan(0);
  });

  it("drops a column that has no data for anyone (honest, not zero-filled)", () => {
    render(<TeamStateView />);
    expect(screen.queryByText("Tasks closed")).not.toBeInTheDocument();
  });

  it("keeps the steady attention note when nobody diverges", () => {
    render(<TeamStateView />);
    expect(screen.getByText("All 4 people are within their usual range this period.")).toBeInTheDocument();
    expect(screen.getByText(/No outliers, declines, or collapses/)).toBeInTheDocument();
  });

  it("gates on the empty roster with the People-specific label", () => {
    mocks.tree = person("boss@x"); // a manager with nobody under them
    render(<TeamStateView />);
    expect(
      screen.getByText(
        "No people in the current scope — pick a different scope in the topbar.",
      ),
    ).toBeInTheDocument();
  });
});
