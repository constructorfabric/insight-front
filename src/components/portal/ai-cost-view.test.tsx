// @vitest-environment jsdom
/**
 * AI & Cost zone semantics: the Claude-only cost caveat ("not tracked" is
 * never $0), adoption math (active users, funnel stage cuts), per-tool
 * aggregation from the breakdown view, by-unit rollups under a slice, and
 * honest ComingSoon for unwired pane items.
 */
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NormalizedMetricResult } from "@/lib/metrics/collection";
import type { IdentityPerson, TeamMember } from "@/types/insight";

const mocks = vi.hoisted(() => ({
  email: "boss@x" as string | null,
  tree: undefined as IdentityPerson | undefined,
  members: [] as TeamMember[],
  grid: {
    byKey: new Map<string, NormalizedMetricResult>(),
    previousByKey: new Map<string, NormalizedMetricResult>(),
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
  tools: {
    byKey: new Map<string, NormalizedMetricResult>(),
    previousByKey: null,
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ useViewer: () => ({ email: mocks.email }) }));
vi.mock("@/queries/ic-dashboard", () => ({
  useIcPerson: () => ({ data: mocks.tree, isPending: false, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/queries/team-view", () => ({
  useTeamMembers: () => ({ data: mocks.members, isPending: false, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/queries/member-grid", () => ({ useMemberGridData: () => mocks.grid }));
vi.mock("@/queries/metric-results", () => ({ useMetricCollection: () => mocks.tools }));
vi.mock("@/hooks/use-period", () => ({
  usePeriod: () => ({ period: "week", dateRange: { start: "2026-07-20", end: "2026-07-26" } }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import { setPortalScope, setPortalSlice } from "@/lib/portal/portal-store";
import { AiCostView } from "./ai-cost-view";

const person = (
  email: string,
  over: Partial<IdentityPerson> = {},
  subs: IdentityPerson[] = [],
): IdentityPerson =>
  ({ email, display_name: email.split("@")[0], subordinates: subs, ...over }) as unknown as IdentityPerson;

const member = (id: string): TeamMember =>
  ({ person_id: id, name: `Name ${id.split("@")[0]}` }) as unknown as TeamMember;

function metric(
  key: string,
  period: Array<[string, number | null]>,
  over: Partial<NormalizedMetricResult> = {},
): NormalizedMetricResult {
  return {
    metric_key: key,
    label: key,
    unit: null,
    computation: "sum",
    format: "integer",
    direction: "higher_is_better",
    period: { view: "period", values: period.map(([entity_id, value]) => ({ entity_id, value })) },
    peer: { view: "peer", values: period.map(([entity_id, value]) => ({ entity_id, target_value: value })) },
    ...over,
  } as unknown as NormalizedMetricResult;
}

function toolBreakdown(
  key: string,
  rows: Array<[string, string, number]>,
): NormalizedMetricResult {
  return {
    ...metric(key, []),
    breakdown: {
      view: "breakdown",
      values: rows.map(([entity_id, tool, value]) => ({
        entity_id,
        dimensions: [{ key: "tool", value: tool }],
        value,
      })),
    },
  } as unknown as NormalizedMetricResult;
}

const IDS = ["a@x", "b@x", "c@x", "d@x"];

beforeEach(() => {
  mocks.email = "boss@x";
  mocks.tree = person("boss@x", {}, IDS.map((id) => person(id)));
  mocks.members = IDS.map(member);
  mocks.grid.isPending = false;
  mocks.grid.isError = false;
  // 3 of 4 use AI; costs are Claude-only.
  mocks.grid.byKey = new Map([
    ["ai.cost", metric("ai.cost", [["a@x", 100], ["b@x", 50], ["c@x", 0], ["d@x", 0]], { format: "currency", unit: "USD" } as never)],
    ["ai.active_days", metric("ai.active_days", [["a@x", 5], ["b@x", 3], ["c@x", 1], ["d@x", 0]])],
    ["ai.accepted_lines", metric("ai.accepted_lines", [["a@x", 700], ["b@x", 200], ["c@x", 100], ["d@x", 0]])],
  ]);
  mocks.grid.previousByKey = new Map();
  mocks.tools.byKey = new Map([
    ["ai.cost", toolBreakdown("ai.cost", [["a@x", "claude_code", 100], ["b@x", "claude_code", 50]])],
    ["ai.accepted_lines", toolBreakdown("ai.accepted_lines", [
      ["a@x", "claude_code", 600],
      ["b@x", "chatgpt", 300],
      ["c@x", "chatgpt", 100],
    ])],
  ]);
  act(() => {
    setPortalSlice("");
    setPortalScope({ root: null, directOnly: false });
  });
});

describe("AiCostView", () => {
  it("renders headline KPIs: Claude-only cost, active users, org lines", () => {
    render(<AiCostView item={null} />);
    expect(screen.getByText("AI cost")).toBeInTheDocument();
    expect(screen.getByText("Claude Code only")).toBeInTheDocument();
    // 3 of 4 members have active days > 0
    expect(screen.getByText("Active AI users")).toBeInTheDocument();
    expect(screen.getByText("75% of 4")).toBeInTheDocument();
    expect(screen.getByText(/1[,  ]?000/)).toBeInTheDocument(); // 700+200+100 lines
  });

  it("shows per-tool cards where untracked cost reads 'not tracked', never $0", () => {
    render(<AiCostView item={null} />);
    expect(screen.getAllByText("Claude Code").length).toBeGreaterThan(0);
    expect(screen.getByText("ChatGPT")).toBeInTheDocument();
    // ChatGPT reports lines but no cost
    expect(screen.getByText("cost not tracked")).toBeInTheDocument();
    expect(screen.getByText(/2 users · 400 lines/)).toBeInTheDocument();
    // the caveat is spelled out for the reader
    expect(screen.getByText(/Only Claude Code is usage-metered/)).toBeInTheDocument();
  });

  it("computes the adoption funnel with data-relative stage cuts", () => {
    render(<AiCostView item="adoption-funnel" />);
    expect(screen.getByText("Adoption funnel")).toBeInTheDocument();
    expect(screen.getByText("In org")).toBeInTheDocument();
    expect(screen.getByText("Used AI (≥1 day)")).toBeInTheDocument();
    // users days = [1,3,5] → median 3 → active = {3,5} = 2; p75 = 4 → heavy = {5} = 1
    expect(screen.getByText(/Active \(≥3 days · median\)/)).toBeInTheDocument();
    expect(screen.getByText(/Heavy \(≥4 days · top quartile\)/)).toBeInTheDocument();
  });

  it("renders an honest ComingSoon for unwired pane items", () => {
    render(<AiCostView item="autofix" />);
    expect(screen.getByText(/no autofix signal ingested/i)).toBeInTheDocument();
    // no fabricated KPI cards behind it
    expect(screen.queryByText("AI cost")).not.toBeInTheDocument();
  });

  it("groups cost and adoption by unit when a slice is active", () => {
    mocks.tree = person("boss@x", {}, [
      person("a@x", { division: "R&D" } as never),
      person("b@x", { division: "R&D" } as never),
      person("c@x", { division: "Sales" } as never),
      person("d@x", { division: "Sales" } as never),
    ]);
    act(() => setPortalSlice("division"));
    render(<AiCostView item="by-unit-role" />);
    expect(screen.getByText("R&D")).toBeInTheDocument();
    expect(screen.getByText("Sales")).toBeInTheDocument();
  });

  it("gates on an empty scope instead of rendering zero KPIs", () => {
    mocks.members = [];
    mocks.tree = person("boss@x");
    render(<AiCostView item={null} />);
    expect(screen.getByText(/No people in the current scope/)).toBeInTheDocument();
    expect(screen.queryByText("AI cost")).not.toBeInTheDocument();
  });
});
