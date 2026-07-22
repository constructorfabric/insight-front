/**
 * Component coverage for `<KpiStrip>`: value/unit/suffix rendering, delta
 * badges per delta_type, the missing-value chip, sublabels, the empty
 * placeholder, and plain (card-less) mode.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KpiStrip, type KpiStripKpi } from "./kpi-strip";

function makeKpi(overrides: Partial<KpiStripKpi> = {}): KpiStripKpi {
  return {
    metric_key: "tasks_done",
    label: "Tasks done",
    value: "42",
    unit: "tasks",
    period: "month",
    ...overrides,
  };
}

describe("<KpiStrip>", () => {
  it("renders value, unit, period suffix, and label", () => {
    render(<KpiStrip kpis={[makeKpi()]} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("tasks")).toBeInTheDocument();
    expect(screen.getByText("/ mo")).toBeInTheDocument();
    expect(screen.getByText("Tasks done")).toBeInTheDocument();
  });

  it("renders the delta badge when delta and delta_type are set", () => {
    render(
      <KpiStrip
        kpis={[makeKpi({ delta: "+17%", delta_type: "good" })]}
      />,
    );
    expect(screen.getByText("+17%")).toBeInTheDocument();
  });

  it("omits the delta badge without a delta_type", () => {
    render(<KpiStrip kpis={[makeKpi({ delta: "+17%" })]} />);
    expect(screen.queryByText("+17%")).not.toBeInTheDocument();
  });

  it("shows the coming-soon chip and no delta for a missing value", () => {
    render(
      <KpiStrip
        kpis={[
          makeKpi({ value: null, delta: "+17%", delta_type: "good" }),
        ]}
      />,
    );
    expect(
      screen.getByRole("status", { name: "No data for this period" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("+17%")).not.toBeInTheDocument();
  });

  it("renders the sublabel and the info affordance for a description", () => {
    render(
      <KpiStrip
        kpis={[
          makeKpi({ sublabel: "last 30 days", description: "What this is" }),
        ]}
      />,
    );
    expect(screen.getByText("last 30 days")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders separators for cells after the first", () => {
    const { container } = render(
      <KpiStrip
        kpis={[
          makeKpi({ metric_key: "a", label: "A" }),
          makeKpi({ metric_key: "b", label: "B" }),
          makeKpi({ metric_key: "c", label: "C" }),
        ]}
      />,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
    // Two desktop dividers for three cells.
    expect(container.querySelectorAll(".bg-border.absolute")).toHaveLength(2);
  });

  it("renders the empty placeholder when there are no KPIs", () => {
    render(<KpiStrip kpis={[]} />);
    expect(screen.getByText("No data for this period")).toBeInTheDocument();
  });

  it("skips the card wrapper in plain mode", () => {
    const { container } = render(<KpiStrip kpis={[makeKpi()]} plain />);
    expect(container.querySelector('[data-slot="card"]')).toBeNull();
  });

  it("wraps in a card by default", () => {
    const { container } = render(<KpiStrip kpis={[makeKpi()]} />);
    expect(container.querySelector('[data-slot="card"]')).not.toBeNull();
  });
});
