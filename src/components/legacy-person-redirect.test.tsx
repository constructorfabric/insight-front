/**
 * Legacy `/ic/<email>` URLs must land on the canonical person-id URL.
 *
 * A bookmark or shared link made before the person_id cutover carries an
 * email, which the metrics API answers with a 400. This component is the only
 * thing standing between such a link and that dead end.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { Component, createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPersonByEmail, IdentityApiError } from "@/api/identity-client";
import type { IdentityPerson } from "@/types/insight";

const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("@/api/identity-client", async (orig) => ({
  ...(await orig<typeof import("@/api/identity-client")>()),
  getPersonByEmail: vi.fn(),
}));

vi.mock("@/components/full-screen-loading", () => ({
  FullScreenLoading: () => <div data-testid="loading" />,
}));

import { LegacyPersonRedirect } from "./legacy-person-redirect";

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <div data-testid="boundary" /> : this.props.children;
  }
}

const resolve = vi.mocked(getPersonByEmail);

const PERSON_ID = "019e2802-0000-7000-8000-00000000a11c";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  navigate.mockReset();
  resolve.mockReset();
});

describe("LegacyPersonRedirect", () => {
  it("replaces the URL with the resolved person id, keeping the view", async () => {
    resolve.mockResolvedValue({ person_id: PERSON_ID } as IdentityPerson);

    render(<LegacyPersonRedirect email="Alice@X.io" view="team" />, {
      wrapper,
    });

    expect(screen.getByTestId("loading")).toBeInTheDocument();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: "/ic/$person/team",
        params: { person: PERSON_ID },
        replace: true,
      });
    });
    // `replace`, not a push: the email URL must not sit in the history stack
    // where Back would bounce the user straight back into it.
    expect(resolve).toHaveBeenCalledWith("Alice@X.io");
  });

  it("routes the personal view to the personal dashboard", async () => {
    resolve.mockResolvedValue({ person_id: PERSON_ID } as IdentityPerson);

    render(<LegacyPersonRedirect email="alice@x.io" view="personal" />, {
      wrapper,
    });

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: "/ic/$person/personal" }),
      );
    });
  });

  it("falls back to the root dashboard when identity answers 404", async () => {
    resolve.mockRejectedValue(new IdentityApiError(404, { error: "not_found" }));

    render(<LegacyPersonRedirect email="ghost@x.io" view="personal" />, {
      wrapper,
    });

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true });
    });
  });

  it.each([
    ["an expired session", new IdentityApiError(401, {})],
    ["a broken identity service", new IdentityApiError(500, {})],
    ["a network failure", new Error("Failed to fetch")],
  ])(
    "surfaces %s to the error boundary instead of redirecting",
    async (_label, error) => {
      // Routing these to "/" would report a broken session or a down service
      // as "no such person" — the user would never learn to retry.
      resolve.mockRejectedValue(error);

      render(
        <ErrorBoundary>
          <LegacyPersonRedirect email="alice@x.io" view="personal" />
        </ErrorBoundary>,
        { wrapper },
      );

      await waitFor(() => {
        expect(screen.getByTestId("boundary")).toBeInTheDocument();
      });
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it("stays on the loading screen while identity is still resolving", () => {
    resolve.mockReturnValue(new Promise(() => {}));

    render(<LegacyPersonRedirect email="alice@x.io" view="personal" />, {
      wrapper,
    });

    expect(screen.getByTestId("loading")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
