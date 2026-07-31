import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n";

import type { SavedQuerySummary } from "@/api/saved-queries-client";

let listState: {
  data?: SavedQuerySummary[];
  isPending: boolean;
  isError: boolean;
};

const createMutate = vi.fn();

vi.mock("@/queries/saved-queries", () => ({
  useSavedQueries: () => listState,
  useCreateSavedQuery: () => ({
    mutate: createMutate,
    isPending: false,
    error: null,
  }),
  useDeleteSavedQuery: () => ({ mutate: vi.fn() }),
  useUpdateSavedQuery: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useSavedQuery: () => ({ data: undefined }),
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => null,
}));

// Stub the detail pane so the screen test does not mount the run/chart stack.
vi.mock("@/components/widgets/query-console/query-detail", () => ({
  QueryDetail: ({ id }: { id: string }) => <div>detail:{id}</div>,
}));

vi.mock("@/components/widgets/query-console/query-editor-dialog", () => ({
  QueryEditorDialog: ({ mode }: { mode: string }) => (
    <div>editor:{mode}</div>
  ),
}));

import { QueryConsoleScreen } from "./query-console";

function summary(over: Partial<SavedQuerySummary> = {}): SavedQuerySummary {
  return { id: "q-1", name: "Sample query", description: null, ...over };
}

beforeEach(() => {
  listState = { data: undefined, isPending: false, isError: false };
  createMutate.mockReset();
});

describe("QueryConsoleScreen", () => {
  it("shows a spinner while the list is pending", () => {
    listState = { data: undefined, isPending: true, isError: false };
    render(<QueryConsoleScreen />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error alert when the list fails", () => {
    listState = { data: undefined, isPending: false, isError: true };
    render(<QueryConsoleScreen />);
    expect(
      screen.getByText("Failed to load saved queries")
    ).toBeInTheDocument();
  });

  it("shows an empty-list hint when there are no saved queries", () => {
    listState = { data: [], isPending: false, isError: false };
    render(<QueryConsoleScreen />);
    expect(
      screen.getByText("No saved queries yet. Create one to get started.")
    ).toBeInTheDocument();
    // Nothing selected yet.
    expect(screen.getByText("No query selected")).toBeInTheDocument();
  });

  it("selects a query and renders its detail pane", async () => {
    listState = {
      data: [summary({ id: "q-42", name: "Commits by tool" })],
      isPending: false,
      isError: false,
    };
    render(<QueryConsoleScreen />);

    await userEvent.click(screen.getByText("Commits by tool"));
    expect(screen.getByText("detail:q-42")).toBeInTheDocument();
  });

  it("opens the create editor from the New query button", async () => {
    listState = { data: [], isPending: false, isError: false };
    render(<QueryConsoleScreen />);

    await userEvent.click(screen.getByRole("button", { name: /new query/i }));
    expect(screen.getByText("editor:create")).toBeInTheDocument();
  });
});
