import { afterEach, describe, expect, it } from "vitest";

import { authStore } from "./auth-store";
import { getViewerEmail } from "./use-viewer";
import { makeSession } from "@/test/session";

afterEach(() => {
  authStore.reset();
});

describe("getViewerEmail", () => {
  it("returns the session email when authenticated", () => {
    authStore.setAuthenticated(makeSession({ email: "bob@example.com", tenantId: "", roles: [] }));

    expect(getViewerEmail()).toBe("bob@example.com");
  });

  it("returns null when there is no session", () => {
    authStore.setUnauthenticated();

    expect(getViewerEmail()).toBeNull();
  });
});
