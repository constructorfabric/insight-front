import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { CollapsibleSection } from "@/components/widgets/collapsible-section";

describe("CollapsibleSection", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts collapsed by default and shows title + subtitle", () => {
    render(
      <CollapsibleSection title="Details" subtitle="per member">
        <p>Body</p>
      </CollapsibleSection>,
    );

    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("per member")).toBeInTheDocument();
    expect(screen.getByText("Collapsed")).toBeInTheDocument();
    expect(screen.queryByText("Body")).not.toBeInTheDocument();
  });

  it("expands on click and collapses back", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Details" defaultOpen>
        <p>Body</p>
      </CollapsibleSection>,
    );

    expect(screen.getByText("Expanded")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();

    await user.click(screen.getByRole("button"));
    expect(screen.getByText("Collapsed")).toBeInTheDocument();
  });

  it("persists the open state under the storage key", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <CollapsibleSection title="Details" storageKey="section.details">
        <p>Body</p>
      </CollapsibleSection>,
    );

    await user.click(screen.getByRole("button"));
    expect(localStorage.getItem("section.details")).toBe("1");
    unmount();

    render(
      <CollapsibleSection title="Details" storageKey="section.details">
        <p>Body</p>
      </CollapsibleSection>,
    );
    expect(screen.getByText("Expanded")).toBeInTheDocument();
  });
});
