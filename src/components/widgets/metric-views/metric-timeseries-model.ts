import {
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import type {
  MetricBucket,
  MetricDimension,
} from "@/api/metric-results-client";
import type { DateRange } from "@/api/period-to-date-range";
import {
  dimensionColorSeed,
  dimensionLabel,
  dimensionSeriesKey,
} from "@/components/widgets/metric-views/dimension-series";
import {
  forEntity,
  type NormalizedMetricResult,
} from "@/lib/metrics/collection";

export interface MetricTimeseriesColumn {
  key: string;
  colorSeed: string;
  label: string;
  points: Map<string, Map<string, number | null>>;
  totals: Map<string, number | null>;
}

export interface MetricTimeseriesModel {
  metrics: NormalizedMetricResult[];
  dimensions: string[];
  bucket: MetricBucket;
  buckets: string[];
  columns: MetricTimeseriesColumn[];
  grandTotals: Array<number | null | undefined>;
}

function parseDate(value: string): Date | null {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

export function bucketStarts(
  range: DateRange,
  bucket: MetricBucket
): string[] {
  const from = parseDate(range.from);
  const to = parseDate(range.to);
  if (!from || !to || from > to) return [];
  const dates =
    bucket === "day"
      ? eachDayOfInterval({ start: from, end: to })
      : bucket === "week"
        ? eachWeekOfInterval(
            { start: startOfWeek(from, { weekStartsOn: 1 }), end: to },
            { weekStartsOn: 1 }
          )
        : eachMonthOfInterval({ start: startOfMonth(from), end: to });
  return dates.map((date) => format(date, "yyyy-MM-dd"));
}

function columnFor(
  columns: Map<string, MetricTimeseriesColumn>,
  dimensions: MetricDimension[]
): MetricTimeseriesColumn {
  const key = dimensionSeriesKey(dimensions);
  const existing = columns.get(key);
  if (existing) return existing;
  const column = {
    key,
    colorSeed: dimensionColorSeed(dimensions),
    label: dimensionLabel(dimensions),
    points: new Map(),
    totals: new Map(),
  };
  columns.set(key, column);
  return column;
}

function buildColumns(
  metrics: NormalizedMetricResult[],
  entityId: string
): MetricTimeseriesColumn[] {
  const columns = new Map<string, MetricTimeseriesColumn>();
  for (const metric of metrics) {
    const entity = forEntity(metric, entityId);
    for (const series of entity.series) {
      const column = columnFor(columns, series.dimensions);
      const points = column.points.get(metric.metric_key) ?? new Map();
      for (const point of series.points) {
        points.set(point.bucket_start, point.value);
      }
      column.points.set(metric.metric_key, points);
    }
    for (const row of entity.breakdown) {
      columnFor(columns, row.dimensions).totals.set(
        metric.metric_key,
        row.value
      );
    }
  }

  const primaryMetric = metrics[0]?.metric_key;
  return [...columns.values()].sort((left, right) => {
    const leftTotal = primaryMetric ? left.totals.get(primaryMetric) : null;
    const rightTotal = primaryMetric ? right.totals.get(primaryMetric) : null;
    return (
      (rightTotal ?? Number.NEGATIVE_INFINITY) -
        (leftTotal ?? Number.NEGATIVE_INFINITY) ||
      left.label.localeCompare(right.label) ||
      left.key.localeCompare(right.key)
    );
  });
}

export function buildMetricTimeseriesModel(
  byKey: Map<string, NormalizedMetricResult>,
  metricKeys: string[],
  entityId: string,
  range: DateRange,
  dimensions: string[]
): MetricTimeseriesModel {
  const metrics = metricKeys.flatMap((key) => {
    const metric = byKey.get(key);
    return metric ? [metric] : [];
  });
  const bucket = metrics[0]?.timeseries?.bucket ?? "day";
  const columns = buildColumns(metrics, entityId);
  if (dimensions.length === 0 && columns[0]) {
    for (const metric of metrics) {
      const value = metric.period?.values.find(
        (candidate) => candidate.entity_id === entityId
      );
      columns[0].totals.set(metric.metric_key, value?.value ?? null);
    }
  }
  return {
    metrics,
    dimensions,
    bucket,
    buckets: bucketStarts(range, bucket),
    columns,
    grandTotals: metrics.map((metric) => {
      const value = metric.period?.values.find(
        (candidate) => candidate.entity_id === entityId
      );
      return value?.value;
    }),
  };
}
