import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n";

import type {
  CrmFlowPoint,
  CrmKpis,
  CrmPipeline,
  IdentityPerson,
} from "@/types/insight";

interface QueryLike<T> {
  data: T | undefined;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: ReturnType<typeof vi.fn>;
}

function q<T>(data: T | undefined, over: Partial<QueryLike<T>> = {}): QueryLike<T> {
  return {
    data,
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
    ...over,
  };
}

const queries = {
  kpisQ: q<CrmKpis | null>(null),
  prevKpisQ: q<CrmKpis | null>(null),
  pipelineQ: q<CrmPipeline | null>(null),
  flowQ: q<CrmFlowPoint[]>([]),
  qualityQ: q<never[]>([]),
  activityQ: q<never[]>([]),
};

vi.mock("@/hooks/use-period", () => ({
  usePeriod: () => ({
    period: "month",
    customRange: null,
    dateRange: { from: "2026-01-01", to: "2026-01-31" },
    setPeriod: vi.fn(),
    setCustomRange: vi.fn(),
  }),
}));

vi.mock("@/queries/sales-dashboard", () => ({
  useSalesDashboardQueries: () => queries,
}));

vi.mock("@/components/ic-view-toggle", () => ({
  IcViewToggle: ({ hasReports }: { hasReports: boolean }) => (
    <div data-testid="ic-toggle" data-has-reports={String(hasReports)} />
  ),
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => null,
}));

vi.mock("@/components/widgets/period-selector-bar", () => ({
  PeriodSelectorBar: () => null,
}));

vi.mock("@/components/widgets/person-header", () => ({
  PersonHeader: ({ fallbackEmail }: { fallbackEmail: string }) => (
    <div data-testid="person-header">{fallbackEmail}</div>
  ),
}));

vi.mock("@/components/widgets/kpi-strip", () => ({
  KpiStrip: ({
    kpis,
  }: {
    kpis: Array<{ metric_key: string; label: string; value: string; sublabel?: string }>;
  }) => (
    <div data-testid="kpi-strip">
      {kpis.map((kpi) => (
        <div key={kpi.metric_key} data-testid={`kpi-${kpi.metric_key}`}>
          {kpi.label}|{kpi.value}|{kpi.sublabel}
        </div>
      ))}
    </div>
  ),
}));

vi.mock("@/components/widgets/sales-pacing-band", () => ({
  SalesPacingBand: () => <div data-testid="pacing-band" />,
}));

vi.mock("@/components/widgets/metric-card", () => ({
  MetricCard: ({
    title,
    loading,
    errored,
    revalidating,
    onRetry,
    personName,
  }: {
    title: string;
    loading: boolean;
    errored: boolean;
    revalidating: boolean;
    onRetry: () => void;
    personName?: string;
  }) => (
    <button
      data-testid="metric-card"
      data-loading={String(loading)}
      data-errored={String(errored)}
      data-revalidating={String(revalidating)}
      data-person={personName ?? ""}
      onClick={onRetry}
    >
      {title}
    </button>
  ),
}));

vi.mock("@/components/widgets/collapsible-section", () => ({
  CollapsibleSection: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

vi.mock("@/components/widgets/deal-flow-chart", () => ({
  DealFlowChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="deal-flow">{data.length}</div>
  ),
}));

vi.mock("@/components/widgets/coming-soon", () => ({
  ComingSoon: ({
    variant,
    state,
    onRetry,
  }: {
    variant: string;
    state: string;
    onRetry?: () => void;
  }) => (
    <button
      data-testid={`coming-soon-${variant}-${state}`}
      onClick={onRetry}
    >
      {state}
    </button>
  ),
}));

import { SalesDashboard } from "./sales-dashboard";

const KPIS: CrmKpis = {
  dealsOpened: 4,
  dealsClosed: 2,
  dealsWon: 1,
  dealsValueClosed: 25_000,
  commsCount: 12,
};

const PIPELINE: CrmPipeline = { pipelineCount: 3, pipelineValue: 1_500_000 };

function person(subordinates: IdentityPerson[] = []): IdentityPerson {
  return {
    person_id: "rep@x.io",
    email: "rep@x.io",
    display_name: "Rita Rep",
    subordinates,
  } as IdentityPerson;
}

beforeEach(() => {
  queries.kpisQ = q<CrmKpis | null>(null);
  queries.prevKpisQ = q<CrmKpis | null>(null);
  queries.pipelineQ = q<CrmPipeline | null>(null);
  queries.flowQ = q<CrmFlowPoint[]>([]);
  queries.qualityQ = q<never[]>([]);
  queries.activityQ = q<never[]>([]);
});

describe("SalesDashboard", () => {
  it("renders hero KPIs from CRM data with formatted values", () => {
    queries.kpisQ = q<CrmKpis | null>(KPIS);
    queries.pipelineQ = q<CrmPipeline | null>(PIPELINE);
    queries.flowQ = q<CrmFlowPoint[]>([
      { label: "W1", opened: 1, closed: 1, won: 0 },
      { label: "W2", opened: 2, closed: 0, won: 1 },
    ]);

    render(<SalesDashboard personId="rep@x.io" person={person([person()])} />);

    expect(screen.getByTestId("person-header")).toHaveTextContent("rep@x.io");
    expect(screen.getByTestId("ic-toggle")).toHaveAttribute(
      "data-has-reports",
      "true"
    );
    expect(screen.getByTestId("kpi-deals_opened")).toHaveTextContent(
      "Deals Opened|4|Created in period"
    );
    expect(screen.getByTestId("kpi-deals_closed")).toHaveTextContent(
      "Deals Closed|2|"
    );
    expect(screen.getByTestId("kpi-deals_value_closed")).toHaveTextContent(
      "Closed Value|$25k|"
    );
    expect(screen.getByTestId("kpi-win_rate")).toHaveTextContent(
      "Win Rate|50% (1/2)|"
    );
    expect(screen.getByTestId("kpi-pipeline_value")).toHaveTextContent(
      "Pipeline Now|$1.50M|3 open"
    );
    // KPIs present -> pacing band renders; flow settled -> chart renders.
    expect(screen.getByTestId("pacing-band")).toBeInTheDocument();
    expect(screen.getByTestId("deal-flow")).toHaveTextContent("2");
    // Section metric cards carry the person's display name.
    const cards = screen.getAllByTestId("metric-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Velocity & Quality");
    expect(cards[1]).toHaveTextContent("Outreach Activity");
    expect(cards[0]).toHaveAttribute("data-person", "Rita Rep");
  });

  it("falls back to zero pipeline values when the pipeline query has no data", () => {
    queries.kpisQ = q<CrmKpis | null>(KPIS);

    render(<SalesDashboard personId="rep@x.io" person={person()} />);

    expect(screen.getByTestId("kpi-pipeline_value")).toHaveTextContent(
      "Pipeline Now|$0|0 open"
    );
    expect(screen.getByTestId("ic-toggle")).toHaveAttribute(
      "data-has-reports",
      "false"
    );
  });

  it("shows the loading row while KPIs are pending and hides the pacing band", () => {
    queries.kpisQ = q<CrmKpis | null>(undefined, { isPending: true });

    render(<SalesDashboard personId="rep@x.io" />);

    expect(
      screen.getByTestId("coming-soon-row-loading")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("pacing-band")).not.toBeInTheDocument();
    expect(screen.queryByTestId("kpi-strip")).not.toBeInTheDocument();
  });

  it("shows a retryable error row when the KPI query fails", async () => {
    queries.kpisQ = q<CrmKpis | null>(undefined, { isError: true });

    render(<SalesDashboard personId="rep@x.io" />);

    await userEvent.click(screen.getByTestId("coming-soon-row-error"));
    expect(queries.kpisQ.refetch).toHaveBeenCalled();
  });

  it("shows the empty row when the KPI query settles with no data", () => {
    render(<SalesDashboard personId="rep@x.io" />);

    expect(screen.getByTestId("coming-soon-row-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("pacing-band")).not.toBeInTheDocument();
  });

  it("shows deal-flow loading and error states with retry", async () => {
    queries.flowQ = q<CrmFlowPoint[]>([], { isPending: true });
    const { unmount } = render(<SalesDashboard personId="rep@x.io" />);
    expect(
      screen.getByTestId("coming-soon-card-loading")
    ).toBeInTheDocument();
    unmount();

    queries.flowQ = q<CrmFlowPoint[]>([], { isError: true });
    render(<SalesDashboard personId="rep@x.io" />);
    await userEvent.click(screen.getByTestId("coming-soon-card-error"));
    expect(queries.flowQ.refetch).toHaveBeenCalled();
  });

  it("forwards section query states to the metric cards and retries", async () => {
    queries.qualityQ = q<never[]>([], { isError: true });
    queries.activityQ = q<never[]>([], { isFetching: true });

    render(<SalesDashboard personId="rep@x.io" />);

    const cards = screen.getAllByTestId("metric-card");
    expect(cards[0]).toHaveAttribute("data-errored", "true");
    expect(cards[1]).toHaveAttribute("data-revalidating", "true");
    await userEvent.click(cards[0]!);
    expect(queries.qualityQ.refetch).toHaveBeenCalled();
    await userEvent.click(cards[1]!);
    expect(queries.activityQ.refetch).toHaveBeenCalled();
  });
});
