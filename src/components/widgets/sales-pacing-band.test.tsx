/**
 * Component coverage for `<SalesPacingBand>`: closed-value formatting,
 * prior-period comparison with positive/negative delta styling, the
 * delta-less prev<=0 branch, and the period-progress label.
 *
 * Uses the real i18n instance (same pattern as auth-gate.test.tsx).
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import "@/i18n";
import type { CrmKpis } from "@/types/insight";

import { SalesPacingBand } from "./sales-pacing-band";

function makeKpis(overrides: Partial<CrmKpis> = {}): CrmKpis {
  return {
    dealsOpened: 10,
    dealsClosed: 6,
    dealsWon: 4,
    dealsValueClosed: 1_200_000,
    commsCount: 100,
    ...overrides,
  };
}

const RANGE = { from: "2026-07-01", to: "2026-07-31" };

describe("<SalesPacingBand>", () => {
  it("renders the closed value and period progress without prior KPIs", () => {
    render(<SalesPacingBand kpis={makeKpis()} prevKpis={null} range={RANGE} />);
    expect(screen.getByText("Closed this period")).toBeInTheDocument();
    expect(screen.getByText("$1.20M")).toBeInTheDocument();
    expect(
      screen.queryByText("vs prior-year same period"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/^Day \d+ of \d+$/)).toBeInTheDocument();
  });

  it("renders the prior value with a positive delta badge", () => {
    render(
      <SalesPacingBand
        kpis={makeKpis()}
        prevKpis={makeKpis({ dealsValueClosed: 1_000_000 })}
        range={RANGE}
      />,
    );
    expect(screen.getByText("vs prior-year same period")).toBeInTheDocument();
    expect(screen.getByText("$1.00M")).toBeInTheDocument();
    const delta = screen.getByText("+20%");
    expect(delta.className).toContain("text-success");
  });

  it("renders a negative delta with destructive styling", () => {
    render(
      <SalesPacingBand
        kpis={makeKpis({ dealsValueClosed: 800_000 })}
        prevKpis={makeKpis({ dealsValueClosed: 1_000_000 })}
        range={RANGE}
      />,
    );
    const delta = screen.getByText("-20%");
    expect(delta.className).toContain("text-destructive");
  });

  it("omits the delta badge when the prior value is zero", () => {
    render(
      <SalesPacingBand
        kpis={makeKpis()}
        prevKpis={makeKpis({ dealsValueClosed: 0 })}
        range={RANGE}
      />,
    );
    expect(screen.getByText("vs prior-year same period")).toBeInTheDocument();
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });
});
