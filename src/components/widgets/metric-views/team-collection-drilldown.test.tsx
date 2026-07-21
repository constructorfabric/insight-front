import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  TeamCollectionDrilldown,
  type TeamMemberRef,
} from "@/components/widgets/metric-views/team-collection-drilldown";
import type { MetricGroup } from "@/lib/insight/groups";

vi.mock(
  "@/components/widgets/metric-views/team-metric-timeseries-view",
  () => ({
    TeamMetricTimeseriesView: ({
      id,
      metricKey,
    }: {
      id: string;
      metricKey: string;
    }) => <div data-card-id={id}>card:{metricKey}</div>,
  })
);

const RANGE = { from: "2026-04-20", to: "2026-05-04" };

const DEF: MetricGroup = {
  kind: "metrics",
  id: "ai_adoption",
  title: "AI adoption",
  collection: {
    metrics: [{ key: "ai.active_days", views: [{ view: "period" }] }],
  },
  card: { preview: [] },
  teamDrilldown: ["ai.accepted_lines", "ai.active_days"],
  drilldown: [],
};

const MEMBERS: TeamMemberRef[] = [
  { entityId: "a@x.com", displayName: "Ann" },
  { entityId: "b@x.com", displayName: "Bo" },
];

describe("TeamCollectionDrilldown", () => {
  it("renders one member-columns timeseries card per teamDrilldown metric", () => {
    render(
      <TeamCollectionDrilldown def={DEF} members={MEMBERS} range={RANGE} />
    );
    expect(screen.getByText("card:ai.accepted_lines")).toBeInTheDocument();
    expect(screen.getByText("card:ai.active_days")).toBeInTheDocument();
    expect(
      document.querySelector('[data-card-id="team-ai_adoption-ai.active_days"]')
    ).toBeInTheDocument();
  });

  it("shows the no-members message when the roster is empty", () => {
    render(<TeamCollectionDrilldown def={DEF} members={[]} range={RANGE} />);
    expect(screen.getByText(/No team members/i)).toBeInTheDocument();
  });

  it("shows the no-data message when the group declares no team metrics", () => {
    render(
      <TeamCollectionDrilldown
        def={{ ...DEF, teamDrilldown: [] }}
        members={MEMBERS}
        range={RANGE}
      />
    );
    expect(screen.getByText(/No data for this group/i)).toBeInTheDocument();
  });
});
