/**
 * Component coverage for `<DealFlowChart>`: the empty-data placeholder and
 * the populated chart path (row mapping + recharts composition).
 *
 * jsdom has no ResizeObserver or layout, so recharts' ResponsiveContainer
 * gets a stub observer; assertions target the container rather than
 * rendered SVG geometry.
 */

import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { CrmFlowPoint } from "@/types/insight";

import { DealFlowChart } from "./deal-flow-chart";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

const DATA: CrmFlowPoint[] = [
  { label: "W1", opened: 5, closed: 3, won: 2 },
  { label: "W2", opened: 7, closed: 4, won: 3 },
];

describe("<DealFlowChart>", () => {
  it("renders the coming-soon card when there is no data", () => {
    render(<DealFlowChart data={[]} />);
    expect(
      screen.getByRole("status", { name: "No data for this period" }),
    ).toBeInTheDocument();
  });

  it("renders the responsive chart container when data is present", () => {
    const { container } = render(<DealFlowChart data={DATA} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      container.querySelector(".recharts-responsive-container"),
    ).not.toBeNull();
  });
});
