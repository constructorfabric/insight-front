import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The ranked member list renders a router `<Link>` to the IC page; these
// tests don't exercise navigation, so stub Link to a plain anchor.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
      ...rest
    }: {
      to?: string;
      params?: Record<string, string>;
      children?: React.ReactNode;
    }) => (
      <a
        href={(to ?? "").replace(
          "$person",
          encodeURIComponent(params?.person ?? ""),
        )}
        {...rest}
      >
        {children}
      </a>
    ),
  };
});

import {
  TeamCollectionDrilldown,
  type TeamMemberRef,
} from "@/components/widgets/metric-views/team-collection-drilldown";
import type { MetricGroup } from "@/lib/insight/groups";
import { normalizeMetricResults } from "@/lib/metrics/collection";
import type { MetricCollectionResult } from "@/queries/metric-results";
import type { MetricResult } from "@/api/metric-results-client";

const DEF: MetricGroup = {
  kind: "metrics",
  id: "ai_adoption",
  title: "AI adoption",
  collection: {
    metrics: [
      { key: "ai.active_days", views: [{ view: "period" }] },
    ],
  },
  card: { preview: [] },
  drilldown: [],
};

const MEMBERS: TeamMemberRef[] = [
  { entityId: "a@x.com", displayName: "Ann" },
  { entityId: "b@x.com", displayName: "Bo" },
];

function metric(values: Array<{ id: string; value: number | null }>): MetricResult {
  return {
    metric_key: "ai.active_days",
    label: "Active AI days",
    unit: "days",
    format: "integer",
    direction: "higher_is_better",
    computation: "sum",
    views: [
      {
        view: "period",
        values: values.map((v) => ({ entity_id: v.id, value: v.value })),
      },
    ],
  };
}

// A period + peer metric where each member is ranked against a cohort with a
// disclosed distribution (n>=5), so members resolve to a real standing.
function metricWithPeer(
  values: Array<{ id: string; value: number }>,
): MetricResult {
  return {
    metric_key: "ai.active_days",
    label: "Active AI days",
    unit: "days",
    format: "integer",
    direction: "higher_is_better",
    computation: "sum",
    views: [
      {
        view: "period",
        values: values.map((v) => ({ entity_id: v.id, value: v.value })),
      },
      {
        view: "peer",
        values: values.map((v) => ({
          entity_id: v.id,
          target_value: v.value,
          p25: 10,
          median: 15,
          p75: 20,
          min: 1,
          max: 25,
          n: 8,
        })),
      },
    ],
  };
}

function result(
  metrics: MetricResult[],
  overrides: Partial<MetricCollectionResult> = {},
): MetricCollectionResult {
  return {
    byKey: normalizeMetricResults(metrics),
    previousByKey: null,
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

describe("TeamCollectionDrilldown", () => {
  it("shows a spinner while pending", () => {
    const { container } = render(
      <TeamCollectionDrilldown
        def={DEF}
        data={result([], { isPending: true })}
        members={MEMBERS}
      />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("shows an error with retry", () => {
    const refetch = vi.fn();
    render(
      <TeamCollectionDrilldown
        def={DEF}
        data={result([], { isError: true, refetch })}
        members={MEMBERS}
      />,
    );
    expect(screen.getByText("Unable to load metrics")).toBeInTheDocument();
  });

  it("shows the no-metrics message when the collection is empty", () => {
    render(
      <TeamCollectionDrilldown def={DEF} data={result([])} members={MEMBERS} />,
    );
    expect(
      screen.getByText(/No data for this group/i),
    ).toBeInTheDocument();
  });

  it("shows the no-members message when the roster is empty", () => {
    render(
      <TeamCollectionDrilldown
        def={DEF}
        data={result([metric([{ id: "a@x.com", value: 5 }])])}
        members={[]}
      />,
    );
    expect(screen.getByText(/No team members/i)).toBeInTheDocument();
  });

  it("leads with the trailing members ranked against their own cohort", () => {
    render(
      <TeamCollectionDrilldown
        def={DEF}
        data={result([
          metricWithPeer([
            { id: "a@x.com", value: 3 }, // <= p25 (10) → bottom
            { id: "b@x.com", value: 16 }, // between p25/p75 → in pack
          ]),
        ])}
        members={MEMBERS}
      />,
    );
    // One of two members trails; the block leads with the count and names
    // the trailing member with their gap vs their own median.
    expect(screen.getByText("1 of 2 below peers")).toBeInTheDocument();
    expect(screen.getByText("Ann")).toBeInTheDocument();
    expect(screen.getByText(/vs median 15\s*days/)).toBeInTheDocument();
    // The in-pack member is not called out as trailing.
    expect(screen.queryByText("Bo")).not.toBeInTheDocument();
  });

  it("folds metrics where nobody trails their peers", () => {
    render(
      <TeamCollectionDrilldown
        def={DEF}
        data={result([
          metricWithPeer([
            { id: "a@x.com", value: 16 }, // in pack
            { id: "b@x.com", value: 18 }, // in pack
          ]),
        ])}
        members={MEMBERS}
      />,
    );
    expect(screen.getByText(/on par — nobody trailing/i)).toBeInTheDocument();
  });
});
