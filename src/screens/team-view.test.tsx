/**
 * "Direct reports only" scoping on the legacy team view.
 *
 * Mirrors the v2 screen tests: the toggle narrows the member list to depth-1
 * reports, and is hidden entirely when the team has no indirect reports —
 * there it could never change the roster (#1756).
 *
 * Child widgets are stubbed: this file tests the roster/toggle wiring, not
 * widget render rules.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RosterEntry } from "@/lib/insight/identity-tree";
import type {
  IdentityPerson,
  PeriodValue,
  TeamMember,
} from "@/types/insight";

vi.mock("@/components/ic-view-toggle", () => ({
  IcViewToggle: () => null,
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => null,
}));
vi.mock("@/components/widgets/period-selector-bar", () => ({
  PeriodSelectorBar: () => null,
}));
vi.mock("@/components/widgets/view-mode-toggle", () => ({
  ViewModeToggle: () => null,
}));
vi.mock("@/components/widgets/team-hero-strip", () => ({
  TeamHeroStrip: () => null,
}));
vi.mock("@/components/widgets/attention-needed", () => ({
  AttentionNeeded: () => null,
}));
vi.mock("@/components/widgets/members-table", () => ({
  MembersTable: ({ members }: { members: TeamMember[] }) => (
    <div data-testid="members">{members.map((m) => m.name).join(",")}</div>
  ),
}));
vi.mock("@/components/widgets/team-bullet-sections", () => ({
  TeamBulletSections: () => null,
}));
vi.mock("@/components/widgets/drill-modal", () => ({
  DrillModal: () => null,
}));
vi.mock("@/components/widgets/team-metrics-modal", () => ({
  TeamMetricsModal: () => null,
}));

vi.mock("@/api/view-configs", () => ({
  useTeamViewConfig: () => ({
    alert_thresholds: [],
    column_thresholds: {},
  }),
}));
vi.mock("@/lib/insight/team-kpis", () => ({
  useTeamKpis: () => ({}),
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

vi.mock("@/queries/team-view", () => ({
  useTeamMembers: (_teamId: string, roster: RosterEntry[] | null) => ({
    ...queryState,
    data: (roster ?? []).map(makeMember),
  }),
  useTeamBulletSection: () => ({ ...queryState, data: undefined }),
  useTeamDrill: () => ({ ...queryState, data: undefined }),
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

import { TeamViewScreen } from "./team-view";

beforeEach(() => {
  currentTree = viewerTree;
});

function renderScreen(teamId = "alice@x.io") {
  return render(<TeamViewScreen teamId={teamId} viewerEmail={teamId} />);
}

describe("TeamViewScreen direct-reports scoping", () => {
  it("defaults to direct reports only when subteams exist", () => {
    renderScreen();

    expect(screen.getByText("Direct reports only")).toBeInTheDocument();
    expect(screen.getByText("(2/3)")).toBeInTheDocument();
    expect(screen.getByText("Direct reports of Alice")).toBeInTheDocument();
    expect(screen.getByTestId("members")).toHaveTextContent("Bob,Erin");
  });

  it("widens to the whole department when toggled off", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole("switch"));

    expect(screen.getByText("Alice's department")).toBeInTheDocument();
    expect(screen.getByText("(3/3)")).toBeInTheDocument();
    expect(screen.getByTestId("members")).toHaveTextContent("Bob,Carol,Erin");
  });

  it("hides the toggle for a team with no subteams (#1756)", () => {
    currentTree = flatTree;
    renderScreen("dave@x.io");

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText("Direct reports only")).not.toBeInTheDocument();
    expect(screen.getByText("Dave's department")).toBeInTheDocument();
    expect(screen.getByTestId("members")).toHaveTextContent("Fay,Gil");
  });
});
