/**
 * Unit coverage for the period/view-mode store (`src/hooks/use-period.ts`):
 * module-init validation of persisted localStorage values, the
 * usePeriod/useViewMode hooks, current* snapshot accessors, persistence
 * on set, and the best-effort catch when localStorage writes throw.
 *
 * The store keeps module-level state, so each test re-imports a fresh
 * copy via `vi.resetModules()` + dynamic import.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PERIOD_KEY = "insight.period";
const CUSTOM_KEY = "insight.period.custom";
const VIEW_MODE_KEY = "insight.view-mode";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function freshModule() {
  vi.resetModules();
  return import("@/hooks/use-period");
}

describe("use-period store init", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("defaults to month / chart / no custom range with empty storage", async () => {
    const mod = await freshModule();
    expect(mod.currentPeriod()).toBe("month");
    expect(mod.currentCustomRange()).toBeNull();
    expect(mod.currentViewMode()).toBe("chart");
  });

  it("restores valid persisted period, custom range, and view mode", async () => {
    window.localStorage.setItem(PERIOD_KEY, "quarter");
    window.localStorage.setItem(
      CUSTOM_KEY,
      JSON.stringify({ from: "2026-01-01", to: "2026-01-31" }),
    );
    window.localStorage.setItem(VIEW_MODE_KEY, "tile");
    const mod = await freshModule();
    expect(mod.currentPeriod()).toBe("quarter");
    expect(mod.currentCustomRange()).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(mod.currentViewMode()).toBe("tile");
  });

  it("ignores invalid persisted period and view mode", async () => {
    window.localStorage.setItem(PERIOD_KEY, "decade");
    window.localStorage.setItem(VIEW_MODE_KEY, "hologram");
    const mod = await freshModule();
    expect(mod.currentPeriod()).toBe("month");
    expect(mod.currentViewMode()).toBe("chart");
  });

  it("rejects a custom range that is not valid JSON", async () => {
    window.localStorage.setItem(CUSTOM_KEY, "{nope");
    const mod = await freshModule();
    expect(mod.currentCustomRange()).toBeNull();
  });

  it("rejects a custom range with malformed dates", async () => {
    window.localStorage.setItem(
      CUSTOM_KEY,
      JSON.stringify({ from: "01/02/2026", to: "2026-02-01" }),
    );
    const mod = await freshModule();
    expect(mod.currentCustomRange()).toBeNull();
  });

  it("rejects a custom range where from is after to", async () => {
    window.localStorage.setItem(
      CUSTOM_KEY,
      JSON.stringify({ from: "2026-03-01", to: "2026-02-01" }),
    );
    const mod = await freshModule();
    expect(mod.currentCustomRange()).toBeNull();
  });
});

describe("usePeriod", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("exposes the current period and a resolved date range", async () => {
    const mod = await freshModule();
    const { result } = renderHook(() => mod.usePeriod());
    expect(result.current.period).toBe("month");
    expect(result.current.customRange).toBeNull();
    expect(result.current.dateRange.from).toMatch(ISO);
    expect(result.current.dateRange.to).toMatch(ISO);
    expect(result.current.dateRange.from <= result.current.dateRange.to).toBe(
      true,
    );
  });

  it("setPeriod updates state, clears the custom range, and persists", async () => {
    window.localStorage.setItem(
      CUSTOM_KEY,
      JSON.stringify({ from: "2026-01-01", to: "2026-01-31" }),
    );
    const mod = await freshModule();
    const { result } = renderHook(() => mod.usePeriod());
    expect(result.current.customRange).not.toBeNull();

    act(() => {
      result.current.setPeriod("week");
    });
    expect(result.current.period).toBe("week");
    expect(result.current.customRange).toBeNull();
    expect(mod.currentPeriod()).toBe("week");
    expect(window.localStorage.getItem(PERIOD_KEY)).toBe("week");
    // Clearing the range removes the persisted custom key.
    expect(window.localStorage.getItem(CUSTOM_KEY)).toBeNull();
  });

  it("setCustomRange stores the range and drives dateRange from it", async () => {
    const mod = await freshModule();
    const { result } = renderHook(() => mod.usePeriod());
    const range = { from: "2026-05-01", to: "2026-05-10" };

    act(() => {
      result.current.setCustomRange(range);
    });
    expect(result.current.customRange).toEqual(range);
    expect(result.current.dateRange).toEqual(range);
    expect(mod.currentCustomRange()).toEqual(range);
    expect(mod.currentDateRange()).toEqual(range);
    expect(JSON.parse(window.localStorage.getItem(CUSTOM_KEY) ?? "")).toEqual(
      range,
    );

    act(() => {
      result.current.setCustomRange(null);
    });
    expect(result.current.customRange).toBeNull();
    expect(window.localStorage.getItem(CUSTOM_KEY)).toBeNull();
  });

  it("keeps the in-memory state when localStorage.setItem throws", async () => {
    const mod = await freshModule();
    const { result } = renderHook(() => mod.usePeriod());
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    act(() => {
      result.current.setPeriod("year");
    });
    expect(result.current.period).toBe("year");
    expect(mod.currentPeriod()).toBe("year");
  });
});

describe("useViewMode", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("toggles the view mode and persists it", async () => {
    const mod = await freshModule();
    const { result } = renderHook(() => mod.useViewMode());
    expect(result.current.viewMode).toBe("chart");

    act(() => {
      result.current.setViewMode("tile");
    });
    expect(result.current.viewMode).toBe("tile");
    expect(mod.currentViewMode()).toBe("tile");
    expect(window.localStorage.getItem(VIEW_MODE_KEY)).toBe("tile");
  });
});
