import { forEntity, type NormalizedMetricResult } from "@/lib/metrics/collection";

export interface EventBin {
  lo: number;
  hi: number;
  count: number;
}

/**
 * Merge per-entity server histograms into one org event histogram — valid
 * only when every entity shares identical bin edges (design §7 open
 * question). Returns null when edges differ, no data, or an entity has an
 * anomalous bin count; the caller falls back honestly (no chart) rather than
 * summing incomparable bins.
 */
export function mergeEventHistogram(
  result: NormalizedMetricResult | undefined,
  memberIds: readonly string[],
): EventBin[] | null {
  if (!result?.histogram) return null;
  let reference: EventBin[] | null = null;
  const totals: number[] = [];
  for (const id of memberIds) {
    const bins = forEntity(result, id).histogram[0]?.bins;
    if (!bins?.length) continue;
    if (!reference) {
      reference = bins.map((b) => ({ lo: b.lo, hi: b.hi, count: 0 }));
      totals.length = bins.length;
      totals.fill(0);
    }
    if (bins.length !== reference.length) return null;
    for (let i = 0; i < bins.length; i++) {
      if (bins[i]!.lo !== reference[i]!.lo || bins[i]!.hi !== reference[i]!.hi) return null;
      totals[i] += bins[i]!.count;
    }
  }
  if (!reference) return null;
  return reference.map((b, i) => ({ ...b, count: totals[i]! }));
}
