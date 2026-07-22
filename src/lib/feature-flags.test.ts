/**
 * Unit coverage for the metrics-v2 feature-flag store
 * (`src/lib/feature-flags.ts`): module-init read from localStorage,
 * get/set, subscriber notification through the hook, persistence, and
 * the best-effort catch when localStorage writes throw.
 *
 * The store keeps module-level state, so each test re-imports a fresh
 * copy via `vi.resetModules()` + dynamic import.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "insight.metrics-v2";

async function freshModule() {
  vi.resetModules();
  return import("@/lib/feature-flags");
}

describe("feature-flags", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("defaults to disabled when localStorage has no value", async () => {
    const mod = await freshModule();
    expect(mod.isMetricsV2Enabled()).toBe(false);
  });

  it("reads a persisted 'true' at module init", async () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    const mod = await freshModule();
    expect(mod.isMetricsV2Enabled()).toBe(true);
  });

  it("treats any non-'true' persisted value as disabled", async () => {
    window.localStorage.setItem(STORAGE_KEY, "yes");
    const mod = await freshModule();
    expect(mod.isMetricsV2Enabled()).toBe(false);
  });

  it("setMetricsV2Enabled updates state and persists to localStorage", async () => {
    const mod = await freshModule();
    mod.setMetricsV2Enabled(true);
    expect(mod.isMetricsV2Enabled()).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("true");

    mod.setMetricsV2Enabled(false);
    expect(mod.isMetricsV2Enabled()).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("false");
  });

  it("useMetricsV2Enabled re-renders subscribers on change", async () => {
    const mod = await freshModule();
    const { result, unmount } = renderHook(() => mod.useMetricsV2Enabled());
    expect(result.current).toBe(false);

    act(() => {
      mod.setMetricsV2Enabled(true);
    });
    expect(result.current).toBe(true);

    // Unsubscribe path: further sets after unmount must not throw.
    unmount();
    act(() => {
      mod.setMetricsV2Enabled(false);
    });
    expect(mod.isMetricsV2Enabled()).toBe(false);
  });

  it("keeps the in-memory state when localStorage.setItem throws", async () => {
    const mod = await freshModule();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => mod.setMetricsV2Enabled(true)).not.toThrow();
    expect(mod.isMetricsV2Enabled()).toBe(true);
  });
});
