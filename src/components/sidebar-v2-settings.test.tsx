import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n";

import { setMetricsV2Enabled } from "@/lib/feature-flags";

vi.mock("@/components/ui/sidebar", () => ({
  SidebarMenu: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarMenuItem: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarMenuButton: ({
    children,
    onClick,
    "aria-pressed": ariaPressed,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    "aria-pressed"?: boolean;
  }) => (
    <div
      data-testid="menu-button"
      role="button"
      tabIndex={0}
      aria-pressed={ariaPressed}
      onClick={onClick}
    >
      {children}
    </div>
  ),
}));

import { SidebarV2Settings } from "./sidebar-v2-settings";

beforeEach(() => {
  localStorage.clear();
  setMetricsV2Enabled(false);
});

describe("SidebarV2Settings", () => {
  it("hides the v2-only controls while the flag is off", () => {
    render(<SidebarV2Settings />);

    expect(screen.getByText("New metrics UI")).toBeInTheDocument();
    expect(screen.queryByText("Focus")).not.toBeInTheDocument();
    expect(screen.queryByText("Explanations")).not.toBeInTheDocument();
  });

  it("toggles the metrics-v2 flag and reveals focus + explanations controls", async () => {
    const user = userEvent.setup();
    render(<SidebarV2Settings />);

    const v2Row = screen
      .getByText("New metrics UI")
      .closest('[data-testid="menu-button"]') as HTMLElement;
    expect(v2Row).toHaveAttribute("aria-pressed", "false");

    await user.click(v2Row);

    expect(v2Row).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("insight.metrics-v2")).toBe("true");
    expect(screen.getByText("Focus")).toBeInTheDocument();
    expect(screen.getByText("Explanations")).toBeInTheDocument();
    // All four focus modes are offered.
    for (const label of ["All", "Critical", "Rewards", "Calm"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("changes the focus mode through the toggle group", async () => {
    const user = userEvent.setup();
    setMetricsV2Enabled(true);
    render(<SidebarV2Settings />);

    await user.click(screen.getByRole("button", { name: "Critical" }));
    expect(localStorage.getItem("insight.focus-mode")).toBe("critical");

    // Clicking the already-selected mode deselects in the widget but the
    // handler ignores the empty value - the mode is retained.
    await user.click(screen.getByRole("button", { name: "Critical" }));
    expect(localStorage.getItem("insight.focus-mode")).toBe("critical");

    await user.click(screen.getByRole("button", { name: "Rewards" }));
    expect(localStorage.getItem("insight.focus-mode")).toBe("rewards");
  });

  it("toggles explanations from its row", async () => {
    const user = userEvent.setup();
    setMetricsV2Enabled(true);
    render(<SidebarV2Settings />);

    const row = screen
      .getByText("Explanations")
      .closest('[data-testid="menu-button"]') as HTMLElement;
    const before = row.getAttribute("aria-pressed");

    await user.click(row);

    const after = before === "true" ? "false" : "true";
    expect(row).toHaveAttribute("aria-pressed", after);
    expect(localStorage.getItem("insight.explanations")).toBe(
      after === "true" ? "true" : "false",
    );
  });
});
