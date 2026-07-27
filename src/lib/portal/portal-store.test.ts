// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  setPortalDir,
  setPortalEnabled,
  setPortalItem,
  setPortalLens,
  setPortalScope,
  setPortalSlice,
  setPortalZone,
  usePortalDir,
  usePortalEnabled,
  usePortalItem,
  usePortalLens,
  usePortalScope,
  usePortalSlice,
  usePortalZone,
} from "./portal-store";

beforeEach(() => {
  act(() => {
    setPortalEnabled(false);
    setPortalZone(null);
    setPortalItem(null);
    setPortalDir("dev");
    setPortalLens("Delivery");
    setPortalSlice("");
    setPortalScope({ root: null, directOnly: false });
  });
  window.localStorage.clear();
});

describe("portal store — setters drive subscribed hooks", () => {
  it("enabled flag round-trips and persists to localStorage", () => {
    const { result } = renderHook(() => usePortalEnabled());
    expect(result.current).toBe(false);
    act(() => setPortalEnabled(true));
    expect(result.current).toBe(true);
    expect(window.localStorage.getItem("insight.portal")).toBe("true");
  });

  it("zone/item/dir/lens/slice update their subscribers", () => {
    const { result } = renderHook(() => ({
      zone: usePortalZone(),
      item: usePortalItem(),
      dir: usePortalDir(),
      lens: usePortalLens(),
      slice: usePortalSlice(),
    }));
    act(() => {
      setPortalZone("overview");
      setPortalItem("trend");
      setPortalDir("collab");
      setPortalLens("Overview");
      setPortalSlice("division");
    });
    expect(result.current).toEqual({
      zone: "overview",
      item: "trend",
      dir: "collab",
      lens: "Overview",
      slice: "division",
    });
  });
});

describe("setPortalScope", () => {
  it("lowercases the root (route params vs identity emails casing)", () => {
    const { result } = renderHook(() => usePortalScope());
    act(() => setPortalScope({ root: "Nick.Efremov@T" }));
    expect(result.current.root).toBe("nick.efremov@t");
  });

  it("patches partially, keeping the other fields", () => {
    const { result } = renderHook(() => usePortalScope());
    act(() => setPortalScope({ root: "a@t" }));
    act(() => setPortalScope({ directOnly: true }));
    expect(result.current).toMatchObject({ root: "a@t", directOnly: true });
  });

  it("bails on a no-op patch without notifying subscribers", () => {
    act(() => setPortalScope({ root: "a@t", directOnly: false }));
    const { result } = renderHook(() => usePortalScope());
    const before = result.current;
    // Same values (different casing for root) → must not emit a new object,
    // or a route→scope sync effect could loop against a re-rendering writer.
    act(() => setPortalScope({ root: "A@T", directOnly: false }));
    expect(result.current).toBe(before);
  });

  it("clears the root back to null", () => {
    act(() => setPortalScope({ root: "a@t" }));
    const { result } = renderHook(() => usePortalScope());
    act(() => setPortalScope({ root: null }));
    expect(result.current.root).toBeNull();
  });
});
