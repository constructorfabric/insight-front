/**
 * Component coverage for `<BulletChart>`: chart and tile modes, period
 * suffixing, drill interactions (click + keyboard), the unavailable-status
 * meter suppression, and the schema-error escape hatch that keeps the meter.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { BulletMetric, PeriodValue } from "@/types/insight";

import { BulletChart } from "./bullet-chart";

function makeMetric(
  overrides: Partial<BulletMetric & { period?: string }> = {},
): BulletMetric & { period?: string } {
  return {
    period: "month" as PeriodValue,
    section: "task_delivery",
    metric_key: "tasks_completed",
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

describe("<BulletChart> chart mode", () => {
  it("renders label, value, unit, period suffix, and meter labels", () => {
    render(<BulletChart metric={makeMetric()} />);
    expect(screen.getByText("Tasks Closed")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("tasks")).toBeInTheDocument();
    expect(screen.getByText("/ mo")).toBeInTheDocument();
    expect(screen.getByText("Median: 5 tasks")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("appends the person name to the sublabel", () => {
    render(
      <BulletChart
        metric={makeMetric({ sublabel: "last 30 days" })}
        personName="Jane"
      />,
    );
    expect(screen.getByText("last 30 days · Jane")).toBeInTheDocument();
  });

  it("renders the sublabel alone without a person name", () => {
    render(<BulletChart metric={makeMetric({ sublabel: "last 30 days" })} />);
    expect(screen.getByText("last 30 days")).toBeInTheDocument();
  });

  it("drills through click, Enter, and Space when drill_id is set", async () => {
    const onDrillClick = vi.fn();
    render(
      <BulletChart
        metric={makeMetric({ drill_id: "d-1" })}
        onDrillClick={onDrillClick}
      />,
    );
    const value = screen.getByRole("button", {
      name: "Drill into Tasks Closed",
    });
    await userEvent.click(value);
    expect(onDrillClick).toHaveBeenCalledWith("d-1");

    value.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onDrillClick).toHaveBeenCalledTimes(3);

    // Unrelated keys do not drill.
    await userEvent.keyboard("x");
    expect(onDrillClick).toHaveBeenCalledTimes(3);
  });

  it("is not interactive without a drill_id", () => {
    render(<BulletChart metric={makeMetric()} onDrillClick={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("suppresses the meter for unavailable rows", () => {
    render(
      <BulletChart
        metric={makeMetric({ status: "unavailable", median_label: "" })}
      />,
    );
    expect(
      screen.getByRole("status", { name: "No data for this period" }),
    ).toBeInTheDocument();
  });

  it("keeps the meter for unavailable schema-error rows with meter data", () => {
    render(
      <BulletChart
        metric={makeMetric({ status: "unavailable", schema_error: true })}
      />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Median: 5 tasks")).toBeInTheDocument();
  });
});

describe("<BulletChart> tile mode", () => {
  it("renders value, unit, suffix, and the median badge", () => {
    render(<BulletChart metric={makeMetric()} mode="tile" />);
    expect(screen.getByText("Tasks Closed")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("tasks")).toBeInTheDocument();
    expect(screen.getByText("/ mo")).toBeInTheDocument();
    expect(screen.getByText("Median: 5 tasks")).toBeInTheDocument();
  });

  it("drills from the tile container when drill_id is set", async () => {
    const onDrillClick = vi.fn();
    render(
      <BulletChart
        metric={makeMetric({ drill_id: "d-2" })}
        onDrillClick={onDrillClick}
        mode="tile"
      />,
    );
    const tile = screen.getByRole("button", { name: "Tasks Closed: 12 tasks" });
    await userEvent.click(tile);
    expect(onDrillClick).toHaveBeenCalledWith("d-2");

    tile.focus();
    await userEvent.keyboard("{Enter}");
    expect(onDrillClick).toHaveBeenCalledTimes(2);
  });

  it("shows the coming-soon chip for unavailable tiles", () => {
    render(
      <BulletChart
        metric={makeMetric({ status: "unavailable", median_label: "" })}
        mode="tile"
      />,
    );
    expect(
      screen.getByRole("status", { name: "No data for this period" }),
    ).toBeInTheDocument();
  });
});
