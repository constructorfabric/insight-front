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
 *
 * Child widgets are stubbed: this file tests the roster/toggle wiring, not
 * widget render rules (those have their own component tests).
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
  TeamMetricGroupCard: () => null,
}));
vi.mock("@/components/widgets/v2/group-drilldown-sheet", () => ({
  GroupDrilldownSheet: () => null,
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

const useTeamMembers = vi.fn(
  (_teamId: string, roster: RosterEntry[] | null) => ({
    ...queryState,
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

vi.mock("@/queries/metric-results", () => ({
  useMetricCollectionSet: () => new Map(),
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

vi.mock("@/queries/ic-dashboard", () => ({
  useIcPerson: () => ({ ...queryState, data: viewerTree }),
}));

import { TeamViewV2Screen } from "./team-view-v2";

function renderScreen() {
  return render(
    <TeamViewV2Screen teamId="alice@x.io" viewerEmail="alice@x.io" />,
  );
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
});
