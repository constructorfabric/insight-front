import type { SectionTrendPoint } from "@/components/widgets/v2/section-trend";
import { forEntity, type NormalizedMetricResult } from "@/lib/metrics/collection";

/**
 * Sum each metric's per-bucket timeseries points across a roster into a single
 * org/team series per bucket, sorted by date. Shared by every portal view that
 * draws a "team totals over time" chart (Overview, Directions, Collaboration)
 * so the aggregation stays in one place.
 */
export function buildTrendData(
  keys: readonly string[],
  byKey: Map<string, NormalizedMetricResult>,
  memberIds: readonly string[],
): SectionTrendPoint[] {
  const byDate = new Map<string, SectionTrendPoint>();
  for (const key of keys) {
    const r = byKey.get(key);
    if (!r) continue;
    for (const id of memberIds) {
      for (const s of forEntity(r, id).series) {
        for (const p of s.points) {
          const row = byDate.get(p.bucket_start) ?? { date: p.bucket_start };
          row[key] = ((row[key] as number | undefined) ?? 0) + (p.value ?? 0);
          byDate.set(p.bucket_start, row);
        }
      }
    }
  }
  return [...byDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}
