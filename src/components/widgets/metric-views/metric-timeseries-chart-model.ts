import { safeSeriesKey } from "@/components/widgets/metric-views/dimension-series";
import type { MetricTimeseriesModel } from "@/components/widgets/metric-views/metric-timeseries-model";
import type { NormalizedMetricResult } from "@/lib/metrics/collection";
import type { MetricTimeseriesChartConfig } from "@/lib/metrics/timeseries-chart";

interface MetricTimeseriesChartSeries {
  key: string;
  colorSeed: string;
  label: string;
  points: Map<string, number | null>;
  total: number | null;
}

export interface MetricTimeseriesChartModel {
  grouped: boolean;
  valueMetric: NormalizedMetricResult;
  series: MetricTimeseriesChartSeries[];
}

export function shouldCombineTimeseriesMetrics(
  model: MetricTimeseriesModel,
  multiMetric: MetricTimeseriesChartConfig["multiMetric"]
): boolean {
  return (
    multiMetric === "combined" &&
    model.dimensions.length === 0 &&
    model.metrics.length > 1
  );
}

export function buildMetricTimeseriesChartModel(
  model: MetricTimeseriesModel,
  selectedMetricKey: string,
  multiMetric: MetricTimeseriesChartConfig["multiMetric"]
): MetricTimeseriesChartModel | null {
  const selectedMetric =
    model.metrics.find((metric) => metric.metric_key === selectedMetricKey) ??
    model.metrics[0];
  if (!selectedMetric) return null;

  if (shouldCombineTimeseriesMetrics(model, multiMetric)) {
    const column = model.columns[0];
    return {
      grouped: false,
      valueMetric: selectedMetric,
      series: model.metrics.map((metric) => ({
        key: safeSeriesKey(metric.metric_key),
        colorSeed: metric.metric_key,
        label: metric.label,
        points: column?.points.get(metric.metric_key) ?? new Map(),
        total: column?.totals.get(metric.metric_key) ?? null,
      })),
    };
  }

  return {
    grouped: model.dimensions.length > 0,
    valueMetric: selectedMetric,
    series: model.columns.map((column) => ({
      key: column.key,
      colorSeed: column.colorSeed,
      label: column.label,
      points: column.points.get(selectedMetric.metric_key) ?? new Map(),
      total: column.totals.get(selectedMetric.metric_key) ?? null,
    })),
  };
}
