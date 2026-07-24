import { afterEach, describe, expect, it } from "vitest";

import { authStore } from "./auth-store";
import { getViewerEmail } from "./use-viewer";

afterEach(() => {
  authStore.reset();
});

describe("getViewerEmail", () => {
  it("returns the session email when authenticated", () => {
    authStore.setAuthenticated({
      personId: "p-1",
      email: "bob@example.com",
      tenantId: "",
      roles: [],
      csrfToken: "csrf-1",
    });

    expect(getViewerEmail()).toBe("bob@example.com");
  });

  it("returns null when there is no session", () => {
    authStore.setUnauthenticated();

    expect(getViewerEmail()).toBeNull();
  });
});
