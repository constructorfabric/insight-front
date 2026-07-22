import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KPI_ROW, metricGroups } from "@/lib/insight/groups";

const METRIC_KEYS = KPI_ROW.flatMap((s) =>
  s.kind === "metric" ? [s.metricKey] : []
);
const GROUP_IDS = metricGroups().map((def) => def.id);

const kpiState = {
  isPending: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
};
let tilesReturn: Array<{ key: string }> = [];
let attentionPerGroup: Array<{ key: string }> = [];
let omitGroupId: string | null = null;

vi.mock("@/hooks/use-period", () => ({
  usePeriod: () => ({
    period: "month",
    dateRange: { from: "2026-01-01", to: "2026-01-31" },
    setPeriod: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({ focusMode: "all" }),
}));

vi.mock("@/lib/insight/kpi-row", () => ({
  metricKpiTiles: () => tilesReturn,
}));

vi.mock("@/lib/insight/attention", () => ({
  metricAttentionItems: () => attentionPerGroup,
}));

vi.mock("@/queries/metric-results", () => ({
  useMetricCollection: () => ({
    byKey: new Map(),
    previousByKey: null,
    ...kpiState,
  }),
  useMetricCollectionSet: () => {
    const map = new Map();
    for (const id of GROUP_IDS) {
      if (id === omitGroupId) continue;
      map.set(id, {
        byKey: new Map(),
        previousByKey: null,
        isPending: false,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
      });
    }
    return map;
  },
  collectionSetPending: (set: Map<string, { isPending: boolean }>) =>
    [...set.values()].some((result) => result.isPending),
}));

vi.mock("@/components/widgets/v2/dashboard-header", () => ({
  DashboardHeader: ({ title }: { title: string }) => (
    <div data-testid="header">{title}</div>
  ),
}));

vi.mock("@/components/widgets/v2/ic-needs-attention", () => ({
  IcNeedsAttention: ({ items }: { items: unknown[] }) => (
    <div data-testid="attention">{items.length}</div>
  ),
}));

vi.mock("@/components/widgets/v2/kpi-tile", () => ({
  KpiTile: ({ tile }: { tile: { key: string } }) => (
    <div data-testid="kpi-tile">{tile.key}</div>
  ),
  KpiTilePlaceholder: () => <div data-testid="kpi-placeholder" />,
}));

vi.mock("@/components/widgets/coming-soon", () => ({
  ComingSoon: ({ onRetry }: { onRetry?: () => void }) => (
    <button data-testid="kpi-error" onClick={onRetry}>
      retry
    </button>
  ),
}));

vi.mock("@/components/widgets/metric-views/metric-group-card", () => ({
  MetricGroupCard: ({
    def,
    onOpen,
  }: {
    def: { id: string };
    onOpen: () => void;
  }) => (
    <button data-testid="metric-card" data-group={def.id} onClick={onOpen}>
      {def.id}
    </button>
  ),
}));

vi.mock("@/components/widgets/v2/group-drilldown-sheet", () => ({
  GroupDrilldownSheet: ({
    def,
    open,
  }: {
    def: { id: string };
    open: boolean;
  }) => (
    <div
      data-testid="drilldown"
      data-group={def.id}
      data-open={open ? "true" : "false"}
    />
  ),
}));

import { EngineeringDashboardV2 } from "./engineering-dashboard-v2";

beforeEach(() => {
  kpiState.isPending = false;
  kpiState.isFetching = false;
  kpiState.isError = false;
  kpiState.refetch = vi.fn();
  tilesReturn = [];
  attentionPerGroup = [];
  omitGroupId = null;
});

describe("EngineeringDashboardV2", () => {
  it("renders a KPI tile, a card per group, and the attention section", () => {
    tilesReturn = METRIC_KEYS.map((key) => ({ key }));
    attentionPerGroup = [{ key: "k" }];

    render(
      <EngineeringDashboardV2
        personId="me@x.io"
        person={{ display_name: "Me Person" } as never}
      />,
    );

    // The header shows the resolved name, never the raw id/email.
    expect(screen.getByTestId("header")).toHaveTextContent("Me Person");
    expect(screen.getByTestId("header")).not.toHaveTextContent("me@x.io");
    expect(screen.getAllByTestId("kpi-tile")).toHaveLength(METRIC_KEYS.length);
    expect(screen.getAllByTestId("metric-card")).toHaveLength(GROUP_IDS.length);
    expect(screen.getAllByTestId("drilldown")).toHaveLength(GROUP_IDS.length);
    expect(screen.getByTestId("attention")).toBeInTheDocument();
    expect(
      screen
        .getAllByTestId("drilldown")
        .every((el) => el.dataset.open === "false")
    ).toBe(true);
  });

  it("shows a retryable error tile per KPI when the collection errored", async () => {
    kpiState.isError = true;

    render(<EngineeringDashboardV2 personId="me@x.io" />);

    const errors = screen.getAllByTestId("kpi-error");
    expect(errors).toHaveLength(METRIC_KEYS.length);
    await userEvent.click(errors[0]!);
    expect(kpiState.refetch).toHaveBeenCalled();
  });

  it("shows the single page spinner while the collection is pending", () => {
    kpiState.isPending = true;

    render(<EngineeringDashboardV2 personId="me@x.io" />);

    // One loading state for the whole dashboard — no per-widget loaders and
    // no partially painted content.
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByTestId("kpi-tile")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attention")).not.toBeInTheDocument();
  });

  it("shows a placeholder per KPI when settled with no data", () => {
    render(<EngineeringDashboardV2 personId="me@x.io" />);

    expect(screen.getAllByTestId("kpi-placeholder")).toHaveLength(
      METRIC_KEYS.length
    );
  });

  it("renders no card for a group with no query result", () => {
    omitGroupId = GROUP_IDS[0]!;

    render(<EngineeringDashboardV2 personId="me@x.io" />);

    expect(screen.getAllByTestId("metric-card")).toHaveLength(
      GROUP_IDS.length - 1
    );
  });

  it("opens the drilldown for the group whose card is clicked", async () => {
    render(<EngineeringDashboardV2 personId="me@x.io" />);

    const firstGroup = GROUP_IDS[0]!;
    await userEvent.click(screen.getByRole("button", { name: firstGroup }));

    const sheet = screen
      .getAllByTestId("drilldown")
      .find((el) => el.dataset.group === firstGroup);
    expect(sheet?.dataset.open).toBe("true");
  });

  it("closes any open drilldown when the viewed person changes", async () => {
    const { rerender } = render(<EngineeringDashboardV2 personId="me@x.io" />);

    await userEvent.click(screen.getByRole("button", { name: GROUP_IDS[0]! }));
    expect(
      screen
        .getAllByTestId("drilldown")
        .some((el) => el.dataset.open === "true")
    ).toBe(true);

    rerender(<EngineeringDashboardV2 personId="other@x.io" />);
    expect(
      screen
        .getAllByTestId("drilldown")
        .every((el) => el.dataset.open === "false")
    ).toBe(true);
  });
});
