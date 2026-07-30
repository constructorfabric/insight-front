import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";

import "@/i18n";

import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WhatsNewScreen } from "@/screens/whats-new";

// SidebarProvider's useIsMobile reads window.matchMedia, which jsdom does
// not implement — provide a desktop-shaped stub.
beforeAll(() => {
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
});

function renderScreen() {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <WhatsNewScreen />
      </SidebarProvider>
    </TooltipProvider>
  );
}

describe("WhatsNewScreen", () => {
  it("renders the release header and stamp", () => {
    renderScreen();
    expect(
      screen.getByRole("heading", { name: "What's new — 31 July 2026" })
    ).toBeInTheDocument();
    expect(screen.getByText("8 improvements")).toBeInTheDocument();
    expect(
      screen.getByText("new dashboards by default & numbers you can check")
    ).toBeInTheDocument();
  });

  it("renders every improvement entry with its category", () => {
    renderScreen();
    for (const title of [
      "The new dashboards are now the default",
      "Activity over time, by repository",
      "Lines of code that count only your code",
      "Every metric, defined in one place",
      "AI cost, complete, to the day — Cursor included",
      "Collaboration counted across the right people",
      "“No data” instead of a misleading zero",
      "Steadier data across your connectors",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getAllByText("Dashboards")).toHaveLength(2);
    expect(screen.getByText("Git output")).toBeInTheDocument();
    expect(screen.getByText("Collaboration")).toBeInTheDocument();
  });

  it("states today's limitation inside each coming-next entry", () => {
    renderScreen();
    expect(screen.getByText("Coming next")).toBeInTheDocument();
    for (const title of [
      "Trace any number to its evidence",
      "Better people matching",
      "Compare like with like",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    // The separate "still on our list" callout is gone; the limitations it
    // listed have to survive inside the entries that address them.
    expect(screen.queryByText("Still on our list")).not.toBeInTheDocument();
    expect(
      screen.getByText(/email doesn't match isn't attributed/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/but not the underlying records/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/GitLab repositories still report 0 lines/)
    ).toBeInTheDocument();
  });

  it("keeps earlier releases on the page, collapsed", async () => {
    const user = userEvent.setup();
    renderScreen();

    expect(screen.getByText("Earlier releases")).toBeInTheDocument();
    const entry = screen.getByRole("button", {
      name: /What's new — 13 July 2026/,
    });
    expect(entry).toHaveTextContent("9 improvements");
    expect(
      screen.queryByRole("heading", { name: "Zoom meeting data restored" })
    ).not.toBeInTheDocument();

    await user.click(entry);

    expect(
      screen.getByRole("heading", { name: "Zoom meeting data restored" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Bitbucket pull requests now counted",
      })
    ).toBeInTheDocument();
  });
});
