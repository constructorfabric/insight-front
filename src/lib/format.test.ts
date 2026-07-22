import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  diffDaysInclusive,
  formatCurrencyCompact,
  formatDate,
  formatDeltaPct,
  formatHours,
  formatMetricNumber,
  formatMetricValue,
  formatNumber,
  formatNumberWithUnit,
  formatPercent,
  formatPeriodProgress,
  formatPp,
  formatRange,
  formatWinRate,
  isFillerUnit,
  metricDisplayUnit,
  parseISODate,
  toLocalISODate,
} from "@/lib/format";

describe("isFillerUnit", () => {
  it("recognizes filler units and rejects everything else", () => {
    expect(isFillerUnit("tasks")).toBe(true);
    expect(isFillerUnit("LOC")).toBe(true);
    expect(isFillerUnit("%")).toBe(false);
    expect(isFillerUnit(undefined)).toBe(false);
  });
});

describe("formatNumber", () => {
  it("renders an em-dash for null / undefined / NaN", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
    expect(formatNumber(Number.NaN)).toBe("—");
  });

  it("compacts values at or above 10k with a trimmed k suffix", () => {
    expect(formatNumber(12_345)).toBe("12.3k");
    expect(formatNumber(10_000)).toBe("10k");
  });

  it("rounds integer-unit values with thousands grouping", () => {
    expect(formatNumber(1234.6, "tasks")).toBe("1,235");
    expect(formatNumber(3.4, "count")).toBe("3");
  });

  it("groups thousands for unitless values at or above 1000", () => {
    expect(formatNumber(1234.4, "h")).toBe("1,234");
  });

  it("drops decimals from 100 upward and keeps one below", () => {
    expect(formatNumber(123.45, "h")).toBe("123");
    expect(formatNumber(12.34, "h")).toBe("12.3");
    expect(formatNumber(5, "h")).toBe("5");
  });
});

describe("formatNumberWithUnit", () => {
  it("passes through when there is no unit or no value", () => {
    expect(formatNumberWithUnit(5)).toBe("5");
    expect(formatNumberWithUnit(null, "%")).toBe("—");
  });

  it("suppresses filler units, glues %, and spaces the rest", () => {
    expect(formatNumberWithUnit(5, "tasks")).toBe("5");
    expect(formatNumberWithUnit(5, "%")).toBe("5%");
    expect(formatNumberWithUnit(5, "h")).toBe("5 h");
  });
});

describe("formatMetricNumber / formatMetricValue / metricDisplayUnit", () => {
  it("formats currency without fraction digits", () => {
    expect(formatMetricNumber(1234, "currency")).toBe("$1,234");
    expect(formatMetricValue(1234, "currency", "USD")).toBe("$1,234");
  });

  it("rounds decimal format to one decimal and integers to whole", () => {
    expect(formatMetricNumber(1.24, "decimal")).toBe("1.2");
    expect(formatMetricNumber(1234.6, "integer")).toBe("1,235");
  });

  it("suffixes percent and unit forms", () => {
    expect(formatMetricValue(42.4, "percent")).toBe("42%");
    expect(formatMetricValue(5, "integer", "h")).toBe("5 h");
    expect(formatMetricValue(5, "integer", null)).toBe("5");
  });

  it("hides the side unit when the number already carries it", () => {
    expect(metricDisplayUnit("currency", "USD")).toBeUndefined();
    expect(metricDisplayUnit("percent", "%")).toBeUndefined();
    expect(metricDisplayUnit("integer", "h")).toBe("h");
    expect(metricDisplayUnit("integer", null)).toBeUndefined();
  });
});

describe("small formatters", () => {
  it("formatPercent respects the decimals argument", () => {
    expect(formatPercent(12.345)).toBe("12%");
    expect(formatPercent(12.345, 1)).toBe("12.3%");
  });

  it("formatHours suffixes h", () => {
    expect(formatHours(7)).toBe("7h");
    expect(formatHours(7.25, 1)).toBe("7.3h");
  });

  it("formatPp signs the difference and always shows points", () => {
    expect(formatPp(2.5)).toBe("+2.5 pp");
    expect(formatPp(-2.5)).toBe("-2.5 pp");
    expect(formatPp(0)).toBe("0.0 pp");
  });

  it("formatCurrencyCompact picks $M / $k / $ bands", () => {
    expect(formatCurrencyCompact(2_500_000)).toBe("$2.50M");
    expect(formatCurrencyCompact(12_000)).toBe("$12k");
    expect(formatCurrencyCompact(500)).toBe("$500");
  });

  it("formatWinRate renders pct with the fraction, em-dash on empty", () => {
    expect(formatWinRate(5, 10)).toBe("50% (5/10)");
    expect(formatWinRate(0, 0)).toBe("—");
  });

  it("formatDeltaPct signs the relative change and refuses a non-positive base", () => {
    expect(formatDeltaPct(110, 100)).toBe("+10%");
    expect(formatDeltaPct(90, 100)).toBe("-10%");
    expect(formatDeltaPct(5, 0)).toBeNull();
  });
});

describe("date helpers", () => {
  it("toLocalISODate zero-pads the local date", () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("parseISODate parses into local time", () => {
    const d = parseISODate("2026-01-05");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(5);
  });

  it("formatDate renders the default and custom patterns", () => {
    expect(formatDate("2026-01-05")).toBe("5 Jan");
    expect(formatDate("2026-01-05", "yyyy-MM")).toBe("2026-01");
  });

  it("formatRange renders both edges with the inclusive day count", () => {
    expect(formatRange("2026-01-01", "2026-01-07")).toBe("1 Jan – 7 Jan (7d)");
  });

  it("diffDaysInclusive counts both endpoints", () => {
    expect(diffDaysInclusive("2026-01-01", "2026-01-07")).toBe(7);
    expect(diffDaysInclusive("2026-01-01", "2026-01-01")).toBe(1);
  });
});

describe("formatPeriodProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 12, 0, 0)); // local 2026-06-10
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports elapsed days within the period", () => {
    expect(formatPeriodProgress("2026-06-01", "2026-06-30")).toBe(
      "Day 10 of 30",
    );
  });

  it("clamps to zero before the period starts", () => {
    expect(formatPeriodProgress("2026-07-01", "2026-07-31")).toBe(
      "Day 0 of 31",
    );
  });

  it("clamps to the total after the period ends", () => {
    expect(formatPeriodProgress("2026-05-01", "2026-05-31")).toBe(
      "Day 31 of 31",
    );
  });
});
