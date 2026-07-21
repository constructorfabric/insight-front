import type { DateRange } from "@/api/period-to-date-range";
import { safeSeriesKey } from "@/components/widgets/metric-views/dimension-series";
import {
  bucketStarts,
  type MetricTimeseriesColumn,
  type MetricTimeseriesModel,
} from "@/components/widgets/metric-views/metric-timeseries-model";
import {
  forEntity,
  type NormalizedMetricResult,
} from "@/lib/metrics/collection";

export interface TeamMemberRef {
  entityId: string;
  displayName: string;
}

/**
 * Member-columns twin of `buildMetricTimeseriesModel`: one metric, one column
 * per roster member, rows stay time buckets. Every cell is that member's own
 * observed value — nothing is pooled across the roster; the one cross-member
 * number is the grand total, emitted only for sum metrics where "Σ across
 * people" is a factual count. Members with no series and no period value are
 * skipped so unmeasured people don't render empty columns. The table, chart,
 * and exporters consume the resulting model unchanged.
 */
export function buildTeamMemberTimeseriesModel(
  metric: NormalizedMetricResult | undefined,
  members: TeamMemberRef[],
  range: DateRange
): MetricTimeseriesModel {
  if (!metric) {
    return {
      metrics: [],
      dimensions: ["member"],
      bucket: "day",
      buckets: [],
      columns: [],
      grandTotals: [],
    };
  }
  const columns: MetricTimeseriesColumn[] = [];
  for (const member of members) {
    const entity = forEntity(metric, member.entityId);
    if (entity.series.length === 0 && entity.value == null) continue;
    const points = new Map<string, number | null>();
    for (const series of entity.series) {
      for (const point of series.points) {
        const prior = points.get(point.bucket_start);
        points.set(
          point.bucket_start,
          prior == null ? point.value : prior + (point.value ?? 0)
        );
      }
    }
    columns.push({
      key: safeSeriesKey(member.entityId),
      colorSeed: member.entityId,
      label: member.displayName,
      points: new Map([[metric.metric_key, points]]),
      totals: new Map([[metric.metric_key, entity.value]]),
    });
  }
  columns.sort((left, right) => {
    const leftTotal = left.totals.get(metric.metric_key);
    const rightTotal = right.totals.get(metric.metric_key);
    return (
      (rightTotal ?? Number.NEGATIVE_INFINITY) -
        (leftTotal ?? Number.NEGATIVE_INFINITY) ||
      left.label.localeCompare(right.label) ||
      left.key.localeCompare(right.key)
    );
  });
  const bucket = metric.timeseries?.bucket ?? "day";
  const grandTotal =
    metric.computation === "sum" && columns.length > 0
      ? columns.reduce(
          (sum, column) => sum + (column.totals.get(metric.metric_key) ?? 0),
          0
        )
      : null;
  return {
    metrics: [metric],
    dimensions: ["member"],
    bucket,
    buckets: bucketStarts(range, bucket),
    columns,
    grandTotals: [grandTotal],
  };
}
