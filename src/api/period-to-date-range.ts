/**
 * Local-timezone aware: a "week" means 7 local days. ISO output is
 * YYYY-MM-DD without a timezone suffix — the backend filters by date string.
 */

import type { CustomRange, PeriodValue } from "@/types/insight";

export type DateRange = { from: string; to: string };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function subtractMonths(d: Date, months: number): Date {
  const out = new Date(d);
  const targetMonth = out.getMonth() - months;
  const originalDay = out.getDate();
  out.setDate(1);
  out.setMonth(targetMonth);
  const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(originalDay, lastDay));
  return out;
}

export function periodToDateRange(period: PeriodValue): DateRange {
  const today = localToday();
  const to = new Date(today);
  to.setDate(to.getDate() - 1);
  let from: Date;

  switch (period) {
    case "week":
      from = new Date(to);
      from.setDate(from.getDate() - 6);
      break;
    case "month":
      from = subtractMonths(to, 1);
      from.setDate(from.getDate() + 1);
      break;
    case "quarter":
      from = subtractMonths(to, 3);
      from.setDate(from.getDate() + 1);
      break;
    case "year": {
      from = new Date(to);
      from.setFullYear(from.getFullYear() - 1);
      from.setDate(from.getDate() + 1);
      break;
    }
  }

  return { from: toISODate(from), to: toISODate(to) };
}

function assertDateRange(range: DateRange): void {
  if (
    !ISO_DATE_RE.test(range.from) ||
    !ISO_DATE_RE.test(range.to) ||
    range.from > range.to
  ) {
    throw new Error(`Invalid date range: from=${range.from} to=${range.to}`);
  }
}

export function resolveDateRange(
  period: PeriodValue,
  customRange: CustomRange | null,
): DateRange {
  if (customRange) {
    const range: DateRange = { from: customRange.from, to: customRange.to };
    assertDateRange(range);
    return range;
  }
  return periodToDateRange(period);
}

// Month/quarter shifts clamp to the last day of the target month so
// end-of-month boundaries don't roll forward.
export function previousPeriodRange(
  range: DateRange,
  period: PeriodValue,
): DateRange {
  const shift = (iso: string): string => {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y, (m ?? 1) - 1, d ?? 1);
    const originalDay = date.getDate();

    const shiftMonths = (months: number): void => {
      date.setDate(1);
      date.setMonth(date.getMonth() - months);
      const lastDay = new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0,
      ).getDate();
      date.setDate(Math.min(originalDay, lastDay));
    };

    switch (period) {
      case "week":
        date.setDate(date.getDate() - 7);
        break;
      case "month":
        shiftMonths(1);
        break;
      case "quarter":
        shiftMonths(3);
        break;
      case "year":
        date.setFullYear(date.getFullYear() - 1);
        break;
    }
    return toISODate(date);
  };
  return { from: shift(range.from), to: shift(range.to) };
}

export function periodScale(period: PeriodValue): number {
  switch (period) {
    case "week":
      return 7;
    case "month":
      return 30;
    case "quarter":
      return 90;
    case "year":
      return 365;
  }
}

export function odataDateFilter(range: DateRange): string {
  return `metric_date ge '${range.from}' and metric_date le '${range.to}'`;
}

export function odataEscapeValue(value: string): string {
  return value.replace(/'/g, "''");
}

export type Granularity = "day" | "week" | "month" | "quarter";

export function bucketGranularity(range: DateRange): Granularity {
  const [fy, fm, fd] = range.from.split("-").map(Number);
  const [ty, tm, td] = range.to.split("-").map(Number);
  const from = new Date(fy, (fm ?? 1) - 1, fd ?? 1);
  const to = new Date(ty, (tm ?? 1) - 1, td ?? 1);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (days <= 10) return "day";
  if (days <= 45) return "week";
  if (days <= 180) return "month";
  return "quarter";
}

export function bucketStart(isoDate: string, g: Granularity): string {
  const [y, m, day] = isoDate.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1, day ?? 1);
  switch (g) {
    case "day":
      return isoDate;
    case "week": {
      const mondayOffset = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - mondayOffset);
      return toISODate(d);
    }
    case "month":
      return toISODate(new Date(y, (m ?? 1) - 1, 1));
    case "quarter":
      return toISODate(new Date(y, Math.floor(((m ?? 1) - 1) / 3) * 3, 1));
  }
}
