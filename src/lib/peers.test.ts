import { describe, expect, it } from "vitest";

import { applyFocus, peerStatsFor, peerStatusVsQuartiles } from "@/lib/peers";

describe("peerStatusVsQuartiles", () => {
  it("keeps inclusive quartile boundaries when they sit beyond the median", () => {
    const stats = { p25: 2, p50: 5, p75: 8 };
    expect(peerStatusVsQuartiles(8, stats, true)).toBe("top");
    expect(peerStatusVsQuartiles(2, stats, true)).toBe("bottom");
    expect(peerStatusVsQuartiles(5, stats, true)).toBe("in_pack");
    expect(peerStatusVsQuartiles(2, stats, false)).toBe("top");
    expect(peerStatusVsQuartiles(8, stats, false)).toBe("bottom");
  });

  it("ranks nobody in a flat pool (everyone at the same value)", () => {
    const flat = { p25: 0, p50: 0, p75: 0 };
    expect(peerStatusVsQuartiles(0, flat, true)).toBe("in_pack");
    expect(peerStatusVsQuartiles(0, flat, false)).toBe("in_pack");
  });

  it("still ranks values strictly beyond a collapsed pool", () => {
    const collapsed = { p25: 0, p50: 0, p75: 0 };
    expect(peerStatusVsQuartiles(5, collapsed, true)).toBe("top");
    expect(peerStatusVsQuartiles(-1, collapsed, true)).toBe("bottom");
    expect(peerStatusVsQuartiles(5, collapsed, false)).toBe("bottom");
  });

  it("never brands a median tie as an outlier in a zero-inflated pool", () => {
    // Many peers at 0, a few above: p25 == median == 0 but the pool has
    // spread. A person at 0 is at the median — in the pack, not "Bottom 25%".
    const zeroInflated = { p25: 0, p50: 0, p75: 4 };
    expect(peerStatusVsQuartiles(0, zeroInflated, true)).toBe("in_pack");
    expect(peerStatusVsQuartiles(5, zeroInflated, true)).toBe("top");
    expect(peerStatusVsQuartiles(0, zeroInflated, false)).toBe("in_pack");
    expect(peerStatusVsQuartiles(5, zeroInflated, false)).toBe("bottom");
  });

  it("requires the median side for the top rank symmetrically", () => {
    // Right-heavy ties: p50 == p75. Sitting on them is the pack's middle.
    const tiedHigh = { p25: 1, p50: 6, p75: 6 };
    expect(peerStatusVsQuartiles(6, tiedHigh, true)).toBe("in_pack");
    expect(peerStatusVsQuartiles(7, tiedHigh, true)).toBe("top");
    expect(peerStatusVsQuartiles(1, tiedHigh, true)).toBe("bottom");
  });
});

describe("applyFocus", () => {
  it("passes everything through in 'all' mode", () => {
    expect(applyFocus("top", "all")).toBe("top");
    expect(applyFocus("bottom", "all")).toBe("bottom");
    expect(applyFocus("neutral", "all")).toBe("neutral");
  });

  it("keeps only 'bottom' in critical mode", () => {
    expect(applyFocus("bottom", "critical")).toBe("bottom");
    expect(applyFocus("top", "critical")).toBe("neutral");
    expect(applyFocus("in_pack", "critical")).toBe("neutral");
  });

  it("keeps only 'top' in rewards mode", () => {
    expect(applyFocus("top", "rewards")).toBe("top");
    expect(applyFocus("bottom", "rewards")).toBe("neutral");
  });

  it("mutes everything in neutral mode", () => {
    expect(applyFocus("top", "neutral")).toBe("neutral");
    expect(applyFocus("bottom", "neutral")).toBe("neutral");
  });
});

describe("peerStatsFor", () => {
  it("returns null when no finite values remain", () => {
    expect(peerStatsFor([])).toBeNull();
    expect(peerStatsFor([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
  });

  it("collapses a single value onto every quantile", () => {
    expect(peerStatsFor([7])).toEqual({
      p25: 7,
      p50: 7,
      p75: 7,
      min: 7,
      max: 7,
      n: 1,
    });
  });

  it("interpolates quartiles over a sorted pool", () => {
    expect(peerStatsFor([4, 1, 3, 2])).toEqual({
      p25: 1.75,
      p50: 2.5,
      p75: 3.25,
      min: 1,
      max: 4,
      n: 4,
    });
  });

  it("filters non-finite values before ranking", () => {
    const stats = peerStatsFor([3, Number.NaN, 1, 2]);
    expect(stats).not.toBeNull();
    expect(stats!.n).toBe(3);
    expect(stats!.p50).toBe(2);
    expect(stats!.min).toBe(1);
    expect(stats!.max).toBe(3);
  });

  it("lands exactly on a sample when the quantile position is integral", () => {
    // 5 samples → p50 position is exactly index 2.
    expect(peerStatsFor([10, 20, 30, 40, 50])!.p50).toBe(30);
  });
});
