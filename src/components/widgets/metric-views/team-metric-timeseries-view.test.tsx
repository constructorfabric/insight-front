import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MetricResult } from "@/api/metric-results-client";
import { TeamMetricTimeseriesView } from "@/components/widgets/metric-views/team-metric-timeseries-view";
import { normalizeMetricResults } from "@/lib/metrics/collection";

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  csv: vi.fn(),
  xlsx: vi.fn(),
}));

vi.mock("@/queries/metric-results", () => ({
  useMetricCollection: mocks.collection,
}));

vi.mock("@/components/widgets/metric-views/metric-timeseries-chart", () => ({
  MetricTimeseriesChart: () => <div>chart presentation</div>,
}));

vi.mock("@/components/widgets/metric-views/metric-timeseries-table", () => ({
  MetricTimeseriesTable: () => <div>table presentation</div>,
}));

vi.mock("@/components/widgets/metric-views/metric-timeseries-csv", () => ({
  downloadMetricTimeseriesCsv: mocks.csv,
}));

vi.mock("@/components/widgets/metric-views/metric-timeseries-xlsx", () => ({
  downloadMetricTimeseriesXlsx: mocks.xlsx,
}));

const RANGE = { from: "2026-04-20", to: "2026-05-04" };

const MEMBERS = [
  { entityId: "ann@x.com", displayName: "Ann" },
  { entityId: "bo@x.com", displayName: "Bo" },
];

const COMMITS: MetricResult = {
  metric_key: "git.commits",
  label: "Commits",
  unit: "commits",
  format: "integer",
  direction: "higher_is_better",
  computation: "sum",
  views: [
    {
      view: "period",
      values: [
        { entity_id: "ann@x.com", value: 3 },
        { entity_id: "bo@x.com", value: 8 },
      ],
    },
    {
      view: "timeseries",
      bucket: "week",
      series: [
        {
          entity_id: "ann@x.com",
          dimensions: [],
          points: [{ bucket_start: "2026-04-20", value: 2 }],
        },
      ],
    },
  ],
} as MetricResult;

const ready = {
  byKey: normalizeMetricResults([COMMITS]),
  previousByKey: null,
  isPending: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
};

describe("TeamMetricTimeseriesView", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.collection.mockReset().mockReturnValue(ready);
    mocks.csv.mockReset();
    mocks.xlsx.mockReset().mockResolvedValue(undefined);
  });

  it("defaults to the table presentation with the server metric label", () => {
    render(
      <TeamMetricTimeseriesView
        id="team-git-commits"
        members={MEMBERS}
        range={RANGE}
        metricKey="git.commits"
      />
    );
    expect(screen.getByText("Commits")).toBeInTheDocument();
    expect(screen.getByText("table presentation")).toBeInTheDocument();
  });

  it("switches to chart and persists the choice per card", async () => {
    const user = userEvent.setup();
    render(
      <TeamMetricTimeseriesView
        id="team-git-commits"
        members={MEMBERS}
        range={RANGE}
        metricKey="git.commits"
      />
    );
    await user.click(screen.getByRole("button", { name: "Chart view" }));
    expect(screen.getByText("chart presentation")).toBeInTheDocument();
    expect(
      localStorage.getItem("insight.timeseries.team-git-commits.presentation")
    ).toBe("chart");
  });

  it("requests timeseries and period for the roster without a peer view", () => {
    render(
      <TeamMetricTimeseriesView
        id="team-git-commits"
        members={MEMBERS}
        range={RANGE}
        metricKey="git.commits"
      />
    );
    const [collection, entity] = mocks.collection.mock.calls[0] ?? [];
    expect(collection.metrics[0].views).toEqual([
      { view: "timeseries", bucket: "week" },
      { view: "period" },
    ]);
    expect(entity).toEqual({
      type: "person",
      ids: ["ann@x.com", "bo@x.com"],
    });
  });

  it("disables export while loading or on error", () => {
    mocks.collection.mockReturnValue({ ...ready, isError: true });
    render(
      <TeamMetricTimeseriesView
        id="team-git-commits"
        members={MEMBERS}
        range={RANGE}
        metricKey="git.commits"
      />
    );
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });

  it("skips the query and explains when the roster exceeds the row budget", () => {
    const roster = Array.from({ length: 1200 }, (_, index) => ({
      entityId: `person-${index}@x.com`,
      displayName: `Person ${index}`,
    }));
    render(
      <TeamMetricTimeseriesView
        id="team-git-commits"
        members={roster}
        range={RANGE}
        metricKey="git.commits"
      />
    );
    expect(
      screen.getByText(/Too many members for a per-member view/i)
    ).toBeInTheDocument();
    const [, entity] = mocks.collection.mock.calls[0] ?? [];
    expect(entity).toEqual({ type: "person", ids: [] });
  });
});
