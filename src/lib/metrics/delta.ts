import type {
  MetricComputation,
  MetricDirection,
  MetricFormat,
} from "@/api/metric-results-client";
import { formatPp } from "@/lib/format";
import type { Status } from "@/lib/status";

export type MetricDelta =
  | { kind: "percent_change"; value: number }
  | { kind: "pp_change"; value: number };

/**
 * Period-over-period delta semantics derive from the computation tag, not
 * per-metric code: a percent-formatted ratio compares in percentage points
 * (77% vs 72% is "+5 pp", not "+6.9%"); everything else compares relatively.
 */
export function computeDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  computation: MetricComputation,
  format: MetricFormat,
): MetricDelta | null {
  if (
    current == null ||
    previous == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous)
  ) {
    return null;
  }

  if (computation === "ratio" && format === "percent") {
    return { kind: "pp_change", value: current - previous };
  }

  if (previous === 0) return null;
  return {
    kind: "percent_change",
    value: ((current - previous) / Math.abs(previous)) * 100,
  };
}

/**
 * Whether a period-over-period move is favorable, given the metric's
 * direction. Neutral (no better/worse direction) and a zero move both read
 * as `neutral` — a change with no judgment attached.
 */
export function deltaStatus(
  delta: MetricDelta,
  direction: MetricDirection,
): Status {
  if (direction === "neutral" || delta.value === 0) return "neutral";
  const favorable =
    direction === "lower_is_better" ? delta.value < 0 : delta.value > 0;
  return favorable ? "good" : "bad";
}

/** Display-rounded delta; null when it rounds to zero (no "+0%" badges). */
export function formatTileDelta(delta: MetricDelta): string | null {
  if (delta.kind === "pp_change") {
    return Math.round(Math.abs(delta.value)) === 0
      ? null
      : formatPp(delta.value, 0);
  }
  const rounded = Math.round(delta.value);
  if (rounded === 0) return null;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}
