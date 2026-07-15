import { render, screen } from "@testing-library/react";
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
      screen.getByRole("heading", { name: "What's new — 13 July 2026" })
    ).toBeInTheDocument();
    expect(screen.getByText("9 improvements")).toBeInTheDocument();
    expect(
      screen.getByText("data accuracy & completeness")
    ).toBeInTheDocument();
  });

  it("renders every improvement entry with its category", () => {
    renderScreen();
    for (const title of [
      "“Direct reports only” toggle is back",
      "Full metrics when you expand a team member",
      "Bitbucket pull requests now counted",
      "Consistent commit & lines-of-code metrics",
      "Readable quarterly & yearly Git charts",
      "Jira Task Delivery metrics now populate",
      "Zoom meeting data restored",
      "AI adoption graphs fixed",
      "Claude Code cost shown as currency",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getAllByText("Team dashboards")).toHaveLength(2);
    expect(screen.getAllByText("Git & code reviews")).toHaveLength(3);
    expect(screen.getAllByText("AI adoption")).toHaveLength(2);
  });

  it("renders the known-gaps callout and the coming-next section", () => {
    renderScreen();
    expect(screen.getByText("Still on our list")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("GitLab lines-of-code");
    expect(screen.getByText("Coming next")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "One accurate metrics engine" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Better people matching" })
    ).toBeInTheDocument();
  });
});
