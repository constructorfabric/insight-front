/**
 * Component coverage for `<MetricCard>`: tile vs chart modes, the
 * loading/error/empty placeholder ladder, the round-robin column split,
 * pre-headed column groups, and the revalidating opacity treatment.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { BulletMetric, PeriodValue } from "@/types/insight";

import { MetricCard } from "./metric-card";

function makeMetric(
  overrides: Partial<BulletMetric> = {},
): BulletMetric & { period?: string } {
  return {
    period: "month" as PeriodValue,
    section: "task_delivery",
    metric_key: `m-${Math.random().toString(36).slice(2, 8)}`,
    label: "Tasks Closed",
    value: "12",
    unit: "tasks",
    range_min: "0",
    range_max: "20",
    median: "5",
    median_label: "Median: 5 tasks",
    bar_left_pct: 0,
    bar_width_pct: 60,
    median_left_pct: 25,
    status: "good",
    drill_id: "",
    ...overrides,
  };
}

describe("<MetricCard> chart mode", () => {
  it("renders title, legend, and metrics split across columns", () => {
    render(
      <MetricCard
        title="Delivery"
        columns={2}
        metrics={[
          makeMetric({ metric_key: "a", label: "Metric A" }),
          makeMetric({ metric_key: "b", label: "Metric B" }),
          makeMetric({ metric_key: "c", label: "Metric C" }),
        ]}
      />,
    );
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    expect(screen.getByText("Team range")).toBeInTheDocument();
    expect(screen.getByText("Team median")).toBeInTheDocument();
    expect(screen.getByText("Metric A")).toBeInTheDocument();
    expect(screen.getByText("Metric B")).toBeInTheDocument();
    expect(screen.getByText("Metric C")).toBeInTheDocument();
  });

  it("renders headed column groups when provided", () => {
    render(
      <MetricCard
        title="Collaboration"
        metrics={[makeMetric()]}
        groups={[
          {
            heading: "Chat",
            metrics: [makeMetric({ metric_key: "chat", label: "Messages" })],
          },
          {
            heading: "Email",
            metrics: [makeMetric({ metric_key: "email", label: "Threads" })],
          },
        ]}
      />,
    );
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Messages")).toBeInTheDocument();
    expect(screen.getByText("Threads")).toBeInTheDocument();
  });

  it("shows the empty placeholder without a legend when metrics are empty", () => {
    render(<MetricCard title="Delivery" metrics={[]} />);
    expect(screen.getByText("No data for this period")).toBeInTheDocument();
    expect(screen.queryByText("Team median")).not.toBeInTheDocument();
  });

  it("shows the loading placeholder when loading", () => {
    render(<MetricCard title="Delivery" metrics={[]} loading />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows the error placeholder with a working retry", async () => {
    const onRetry = vi.fn();
    render(
      <MetricCard title="Delivery" metrics={[]} errored onRetry={onRetry} />,
    );
    expect(screen.getByText("Unable to load")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("dims the content while revalidating", () => {
    const { container } = render(
      <MetricCard title="Delivery" metrics={[makeMetric()]} revalidating />,
    );
    expect(container.querySelector(".opacity-70")).not.toBeNull();
  });
});

describe("<MetricCard> tile mode", () => {
  it("renders metrics as tiles", () => {
    render(
      <MetricCard
        title="Delivery"
        mode="tile"
        metrics={[makeMetric({ metric_key: "a", label: "Metric A" })]}
      />,
    );
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    expect(screen.getByText("Metric A")).toBeInTheDocument();
    // Tile mode carries no chart legend.
    expect(screen.queryByText("Team median")).not.toBeInTheDocument();
    expect(screen.queryByText("Team range")).not.toBeInTheDocument();
  });

  it("shows the placeholder when empty", () => {
    render(<MetricCard title="Delivery" mode="tile" metrics={[]} />);
    expect(screen.getByText("No data for this period")).toBeInTheDocument();
  });
});
