import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authStore } from "./auth-store";
import { signOut } from "./use-auth";

const fetchMock = () => globalThis.fetch as ReturnType<typeof vi.fn>;

describe("signOut", () => {
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    authStore.reset();
    authStore.setAuthenticated({
      personId: "p-1",
      email: "bob@example.com",
      tenantId: "t-1",
      roles: ["user"],
      csrfToken: "csrf-1",
    });
    vi.stubGlobal("fetch", vi.fn());
    assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    authStore.reset();
  });

  it("POSTs /auth/logout, clears the session, and follows rp_logout_url", async () => {
    fetchMock().mockResolvedValueOnce({
      json: async () => ({ rp_logout_url: "https://idp.example/logout" }),
    });

    await signOut();

    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe("/auth/logout");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(init.headers).toMatchObject({ "X-CSRF-Token": "csrf-1" });
    expect(authStore.getSnapshot().status).toBe("unauthenticated");
    expect(assign).toHaveBeenCalledWith("https://idp.example/logout");
  });

  it("falls back to / when no rp_logout_url is returned", async () => {
    fetchMock().mockResolvedValueOnce({ json: async () => ({}) });

    await signOut();

    expect(assign).toHaveBeenCalledWith("/");
    expect(authStore.getSnapshot().status).toBe("unauthenticated");
  });

  it("still clears the session and bounces to / on a network error", async () => {
    fetchMock().mockRejectedValueOnce(new Error("network down"));

    await signOut();

    expect(authStore.getSnapshot().status).toBe("unauthenticated");
    expect(assign).toHaveBeenCalledWith("/");
  });
});
