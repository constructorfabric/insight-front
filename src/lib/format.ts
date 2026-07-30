import { format, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";

import type { MetricFormat } from "@/api/metric-results-client";
import { LOCALE } from "@/config/constants";

const NF_THOUSANDS = new Intl.NumberFormat(LOCALE);

const METRIC_CURRENCY_FORMAT = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * Formatting for `/v1/metric-results` values: the wire `format` decides
 * rounding and presentation; `unit` is a display suffix only. Bare number —
 * no unit/percent suffix (use `formatMetricValue` for the suffixed form,
 * `metricDisplayUnit` when the unit renders as a separate element).
 */
export function formatMetricNumber(
  v: number,
  fmt: MetricFormat,
): string {
  if (fmt === "currency") return METRIC_CURRENCY_FORMAT.format(v);
  const rounded = fmt === "decimal" ? Math.round(v * 10) / 10 : Math.round(v);
  return NF_THOUSANDS.format(rounded);
}

export function formatMetricValue(
  v: number,
  fmt: MetricFormat,
  unit?: string | null,
): string {
  const s = formatMetricNumber(v, fmt);
  if (fmt === "currency") return s;
  if (fmt === "percent") return `${s}%`;
  return unit ? `${s} ${unit}` : s;
}

/** Unit rendered beside the number; none when the number carries it. */
export function metricDisplayUnit(
  fmt: MetricFormat,
  unit?: string | null,
): string | undefined {
  if (fmt === "currency" || fmt === "percent") return undefined;
  return unit ?? undefined;
}

/**
 * Ratio at/above which a runaway signed percent ("+300%", "+5460%") renders
 * as a multiple instead — shared by the vs-median gap and the
 * period-over-period delta so both surfaces switch at the same point.
 */
export const MULTIPLE_THRESHOLD = 2;

/** "5.6×" under 10, "56×" above — a multiple needs no decimal at that size. */
export function formatMultiple(ratio: number): string {
  const rounded = ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10;
  return `${rounded}×`;
}

export function formatPp(diff: number, decimals = 1): string {
  const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
  return `${sign}${Math.abs(diff).toFixed(decimals)} pp`;
}

export function formatDate(iso: string, pattern = "d MMM"): string {
  return format(parseISO(iso), pattern, { locale: enUS });
}

