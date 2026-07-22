import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authStore } from "./auth-store";
import { loadSession } from "./session";

const fetchMock = () => globalThis.fetch as ReturnType<typeof vi.fn>;

describe("loadSession", () => {
  beforeEach(() => {
    authStore.reset();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    authStore.reset();
  });

  it("populates the store from a 200 /auth/me and returns authenticated", async () => {
    fetchMock().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: "p-1",
        email: "bob@example.com",
        tenant_id: "t-1",
        roles: ["user"],
        csrf_token: "csrf-1",
      }),
    });

    const status = await loadSession();

    expect(status).toBe("authenticated");
    const snap = authStore.getSnapshot();
    expect(snap.status).toBe("authenticated");
    expect(snap.session).toEqual({
      personId: "p-1",
      email: "bob@example.com",
      tenantId: "t-1",
      roles: ["user"],
      csrfToken: "csrf-1",
    });
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe("/auth/me");
    expect(init).toMatchObject({ credentials: "include" });
  });

  it("defaults missing fields to empty values", async () => {
    fetchMock().mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await loadSession();

    expect(authStore.getSnapshot().session).toEqual({
      personId: "",
      email: "",
      tenantId: "",
      roles: [],
      csrfToken: "",
    });
  });

  it("fails closed to unauthenticated on a non-ok response", async () => {
    fetchMock().mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    const status = await loadSession();

    expect(status).toBe("unauthenticated");
    expect(authStore.getSnapshot().status).toBe("unauthenticated");
  });

  it("fails closed on a network error reaching the authenticator", async () => {
    fetchMock().mockRejectedValueOnce(new Error("network down"));

    const status = await loadSession();

    expect(status).toBe("unauthenticated");
    expect(authStore.getSnapshot().status).toBe("unauthenticated");
  });
});
