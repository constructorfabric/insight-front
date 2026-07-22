/**
 * "Direct reports only" scoping on the v2 team dashboard (#1724).
 *
 * The toggle (default ON, matching the old team view) narrows the roster to
 * depth-1 reports before it reaches any query, so members, heatmap bullets,
 * legacy sections, and metric collections all scope together. Covers:
 *   - default render shows direct reports only, with the scope subtitle
 *     ("Direct reports of X") and the scoped/total count on the toggle.
 *   - toggling off widens the roster to the full subtree and flips the
 *     subtitle to "X's department".
 *   - the scoped roster is what `useTeamMembers` receives — scoping happens
 *     upstream of the fetch, not as a client-side row filter.
 *   - the toggle is hidden when the team has no indirect reports, where it
 *     could never change the roster (#1756).
 *
 * Child widgets are stubbed: this file tests the roster/toggle wiring, not
 * widget render rules (those have their own component tests).
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { metricGroups } from "@/lib/insight/groups";
import type { RosterEntry } from "@/lib/insight/identity-tree";
import type {
  IdentityPerson,
  PeriodValue,
  TeamMember,
} from "@/types/insight";

vi.mock("@/api/use-catalog", () => ({
  useCatalog: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    byId: () => undefined,
    byMetricKey: () => undefined,
    refetch: () => {},
  }),
}));

vi.mock("@/components/ic-view-toggle", () => ({
  IcViewToggle: () => null,
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => null,
}));
vi.mock("@/components/widgets/period-selector-bar", () => ({
  PeriodSelectorBar: () => null,
}));

vi.mock("@/components/widgets/v2/team-members-attention", () => ({
  TeamMembersAttention: () => null,
}));
vi.mock("@/components/widgets/v2/members-heatmap", () => ({
  MembersHeatmap: ({ members }: { members: TeamMember[] }) => (
    <div data-testid="heatmap">{members.map((m) => m.name).join(",")}</div>
  ),
}));
vi.mock("@/components/widgets/v2/section-card", () => ({
  SectionCard: () => null,
}));
vi.mock("@/components/widgets/metric-views/team-metric-group-card", () => ({
  TeamMetricGroupCard: ({
    def,
    onOpen,
  }: {
    def: { id: string };
    onOpen: () => void;
  }) => (
    <button data-testid="team-metric-card" onClick={onOpen}>
      {def.id}
    </button>
  ),
}));
vi.mock("@/components/widgets/v2/group-drilldown-sheet", () => ({
  GroupDrilldownSheet: ({
    def,
    open,
    onOpenChange,
    metricTarget,
  }: {
    def: { id: string };
    open: boolean;
    onOpenChange: (open: boolean) => void;
    metricTarget?: { kind: string; data: { isPending: boolean } };
  }) => (
    <div
      data-testid="drilldown"
      data-group={def.id}
      data-open={String(open)}
      data-target={
        metricTarget
          ? `${metricTarget.kind}:${String(metricTarget.data.isPending)}`
          : "none"
      }
    >
      <button
        data-testid={`drilldown-toggle-${def.id}`}
        onClick={() => onOpenChange(!open)}
      />
    </div>
  ),
}));
vi.mock("@/components/widgets/v2/dashboard-empty-state", () => ({
  DashboardEmptyState: () => <div data-testid="empty-state" />,
}));
vi.mock("@/components/widgets/coming-soon", () => ({
  ComingSoon: ({
    label,
    onRetry,
  }: {
    label?: string;
    onRetry?: () => void;
  }) => (
    <button data-testid="members-error" onClick={onRetry}>
      {label}
    </button>
  ),
}));

const queryState = {
  isPending: false,
  isFetching: false,
  isError: false,
  refetch: () => {},
};

function makeMember(entry: RosterEntry): TeamMember {
  return {
    person_id: entry.email,
    period: "month" as PeriodValue,
    name: entry.display_name,
    seniority: "",
    supervisor_email: entry.supervisor_email,
    org_unit_id: null,
    tasks_closed: 0,
    bugs_fixed: 0,
    dev_time_h: null,
    prs_merged: null,
    build_success_pct: null,
    focus_time_pct: null,
    ai_tools: [],
    ai_loc_share_pct: null,
  };
}

let membersOverrides: Partial<{
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}> = {};

const useTeamMembers = vi.fn(
  (_teamId: string, roster: RosterEntry[] | null) => ({
    ...queryState,
    ...membersOverrides,
    data: (roster ?? []).map(makeMember),
  }),
);

vi.mock("@/queries/team-view", () => ({
  useTeamMembers: (
    ...args: [string, RosterEntry[] | null, PeriodValue, unknown]
  ) => useTeamMembers(args[0], args[1]),
  useTeamBulletSections: () => ({
    ...queryState,
    data: { bySection: {}, errors: {} },
  }),
}));

vi.mock("@/queries/v2/team-extras", () => ({
  useTeamMemberBullets: () => ({ ...queryState, data: undefined }),
  useTeamMemberBulletsPrevious: () => ({ ...queryState, data: undefined }),
  useDeptDistributions: () => ({ ...queryState, data: undefined }),
}));

interface MetricSetResult {
  byKey: Map<string, never>;
  previousByKey: null;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}

function metricSetResult(
  over: Partial<MetricSetResult> = {},
): MetricSetResult {
  return {
    byKey: new Map(),
    previousByKey: null,
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: () => {},
    ...over,
  };
}

let metricSetReturn = new Map<string, MetricSetResult>();

vi.mock("@/queries/metric-results", () => ({
  useMetricCollectionSet: () => metricSetReturn,
}));

function person(
  email: string,
  name: string,
  subordinates: IdentityPerson[] = [],
): IdentityPerson {
  return {
    person_id: email,
    email,
    display_name: name,
    subordinates,
  } as IdentityPerson;
}

// Alice manages Bob and Erin directly; Carol reports to Bob (indirect).
const viewerTree = person("alice@x.io", "Alice", [
  person("bob@x.io", "Bob", [person("carol@x.io", "Carol")]),
  person("erin@x.io", "Erin"),
]);

// Dave's team is flat: every report is direct, so scoping is a no-op (#1756).
const flatTree = person("dave@x.io", "Dave", [
  person("fay@x.io", "Fay"),
  person("gil@x.io", "Gil"),
]);

let currentTree = viewerTree;

vi.mock("@/queries/ic-dashboard", () => ({
  useIcPerson: () => ({ ...queryState, data: currentTree }),
}));

import { TeamViewV2Screen } from "./team-view-v2";

beforeEach(() => {
  currentTree = viewerTree;
  membersOverrides = {};
  metricSetReturn = new Map();
});

function renderScreen(teamId = "alice@x.io") {
  return render(<TeamViewV2Screen teamId={teamId} viewerEmail={teamId} />);
}

describe("TeamViewV2Screen direct-reports scoping", () => {
  it("defaults to direct reports only, scoping the roster before the fetch", () => {
    renderScreen();

    expect(
      screen.getByText("Direct reports of Alice · 2 members"),
    ).toBeInTheDocument();
    expect(screen.getByText("Direct reports only")).toBeInTheDocument();
    expect(screen.getByText("(2/3)")).toBeInTheDocument();
    expect(screen.getByTestId("heatmap")).toHaveTextContent("Bob,Erin");

    const lastRoster = useTeamMembers.mock.lastCall?.[1];
    expect(lastRoster?.map((r) => r.email)).toEqual([
      "bob@x.io",
      "erin@x.io",
    ]);
  });

  it("widens to the whole department when toggled off", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole("switch"));

    expect(
      screen.getByText("Alice's department · 3 members"),
    ).toBeInTheDocument();
    expect(screen.getByText("(3/3)")).toBeInTheDocument();
    expect(screen.getByTestId("heatmap")).toHaveTextContent("Bob,Carol,Erin");

    const lastRoster = useTeamMembers.mock.lastCall?.[1];
    expect(lastRoster?.map((r) => r.email)).toEqual([
      "bob@x.io",
      "carol@x.io",
      "erin@x.io",
    ]);
  });

  it("hides the toggle for a team with no subteams (#1756)", () => {
    currentTree = flatTree;
    renderScreen("dave@x.io");

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText("Direct reports only")).not.toBeInTheDocument();
    // Without the toggle the scope label is meaningless too — the subtitle
    // is just the member count, and the full roster reaches the queries.
    expect(screen.getByText("2 members")).toBeInTheDocument();
    expect(
      screen.queryByText(/Direct reports of|department/),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("heatmap")).toHaveTextContent("Fay,Gil");

    const lastRoster = useTeamMembers.mock.lastCall?.[1];
    expect(lastRoster?.map((r) => r.email)).toEqual([
      "fay@x.io",
      "gil@x.io",
    ]);
  });
});

describe("TeamViewV2Screen metric groups, drilldowns, and load states", () => {
  const GROUP_IDS = metricGroups().map((def) => def.id);

  function fullMetricSet(): Map<string, MetricSetResult> {
    return new Map(GROUP_IDS.map((id) => [id, metricSetResult()]));
  }

  it("renders a metric card per fetched group and opens its drilldown", async () => {
    metricSetReturn = fullMetricSet();
    const user = userEvent.setup();
    renderScreen();

    const cards = screen.getAllByTestId("team-metric-card");
    expect(cards).toHaveLength(GROUP_IDS.length);
    expect(
      screen
        .getAllByTestId("drilldown")
        .every((el) => el.dataset.open === "false"),
    ).toBe(true);

    await user.click(cards[0]!);

    const sheet = screen
      .getAllByTestId("drilldown")
      .find((el) => el.dataset.group === GROUP_IDS[0]);
    expect(sheet?.dataset.open).toBe("true");
    // Fetched data flows into the sheet as a settled team target.
    expect(sheet?.dataset.target).toBe("team:false");
  });

  it("renders no card and a pending drilldown target for unfetched groups", () => {
    renderScreen();

    expect(screen.queryAllByTestId("team-metric-card")).toHaveLength(0);
    expect(
      screen
        .getAllByTestId("drilldown")
        .every((el) => el.dataset.target === "team:true"),
    ).toBe(true);
  });

  it("closes the open drilldown when the viewed team changes", async () => {
    metricSetReturn = fullMetricSet();
    const user = userEvent.setup();
    const { rerender } = render(
      <TeamViewV2Screen teamId="alice@x.io" viewerEmail="alice@x.io" />,
    );

    await user.click(screen.getAllByTestId("team-metric-card")[0]!);
    expect(
      screen
        .getAllByTestId("drilldown")
        .some((el) => el.dataset.open === "true"),
    ).toBe(true);

    rerender(<TeamViewV2Screen teamId="bob@x.io" viewerEmail="alice@x.io" />);

    expect(
      screen
        .getAllByTestId("drilldown")
        .every((el) => el.dataset.open === "false"),
    ).toBe(true);
  });

  it("lets the sheet open and close itself through onOpenChange", async () => {
    metricSetReturn = fullMetricSet();
    const user = userEvent.setup();
    renderScreen();

    const firstId = GROUP_IDS[0]!;
    const sheetFor = () =>
      screen
        .getAllByTestId("drilldown")
        .find((el) => el.dataset.group === firstId);

    await user.click(screen.getByTestId(`drilldown-toggle-${firstId}`));
    expect(sheetFor()?.dataset.open).toBe("true");

    await user.click(screen.getByTestId(`drilldown-toggle-${firstId}`));
    expect(sheetFor()?.dataset.open).toBe("false");
  });

  it("dims the page while a metric group revalidates", () => {
    const set = fullMetricSet();
    set.set(GROUP_IDS[0]!, metricSetResult({ isFetching: true }));
    metricSetReturn = set;
    renderScreen();

    expect(screen.getByTestId("heatmap").closest(".opacity-60")).not.toBeNull();
  });

  it("shows a retryable heatmap error when the members query fails", async () => {
    const refetch = vi.fn();
    membersOverrides = { isError: true, refetch };
    const user = userEvent.setup();
    renderScreen();

    expect(screen.queryByTestId("heatmap")).not.toBeInTheDocument();
    const error = screen.getByTestId("members-error");
    expect(error).toHaveTextContent("Heatmap — unable to load");

    await user.click(error);
    expect(refetch).toHaveBeenCalled();
  });

  it("shows a full-page spinner while the members query is pending", () => {
    membersOverrides = { isPending: true, isFetching: true };
    renderScreen();

    expect(screen.queryByTestId("heatmap")).not.toBeInTheDocument();
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("team-metric-card")).toHaveLength(0);
  });

  it("shows the empty state for a team id that resolves to no roster", () => {
    renderScreen("team-42");

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    // No "@" in the id -> no identity pivot -> bare member count subtitle.
    expect(screen.getByText("0 members")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});
