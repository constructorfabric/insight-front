/**
 * Unit coverage for the metrics-v2 feature-flag store
 * (`src/lib/feature-flags.ts`): default-on state, get/set, subscriber
 * notification through the hook, and the deliberate absence of
 * persistence across reloads (localStorage is never touched).
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

  it("defaults to enabled", async () => {
    const mod = await freshModule();
    expect(mod.isMetricsV2Enabled()).toBe(true);
  });

  it("ignores any persisted localStorage value at module init", async () => {
    window.localStorage.setItem(STORAGE_KEY, "false");
    const mod = await freshModule();
    expect(mod.isMetricsV2Enabled()).toBe(true);
  });

  it("setMetricsV2Enabled updates state without persisting to localStorage", async () => {
    const mod = await freshModule();
    mod.setMetricsV2Enabled(false);
    expect(mod.isMetricsV2Enabled()).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    mod.setMetricsV2Enabled(true);
    expect(mod.isMetricsV2Enabled()).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("a fresh module load resets the flag to enabled (no persistence)", async () => {
    const mod = await freshModule();
    mod.setMetricsV2Enabled(false);
    expect(mod.isMetricsV2Enabled()).toBe(false);

    const reloaded = await freshModule();
    expect(reloaded.isMetricsV2Enabled()).toBe(true);
  });

  it("useMetricsV2Enabled re-renders subscribers on change", async () => {
    const mod = await freshModule();
    const { result, unmount } = renderHook(() => mod.useMetricsV2Enabled());
    expect(result.current).toBe(true);

    act(() => {
      mod.setMetricsV2Enabled(false);
    });
    expect(result.current).toBe(false);

    // Unsubscribe path: further sets after unmount must not throw.
    unmount();
    act(() => {
      mod.setMetricsV2Enabled(true);
    });
    expect(mod.isMetricsV2Enabled()).toBe(true);
  });
});
