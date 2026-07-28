import { format } from "date-fns";
import type { DotItemDotProps } from "recharts";

import {
  BarChart,
  CartesianGrid,
  ChartBar,
  ChartContainer,
  ChartLine,
  ChartTooltip,
  ChartTooltipContent,
  LineChart,
  XAxis,
  YAxis,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MetricTimeseriesModel } from "@/components/widgets/metric-views/metric-timeseries-model";
import { formatMetricNumber } from "@/lib/format";
import { percentShareLabels } from "@/lib/metrics/shares";
import { seriesColors } from "@/lib/series-colors";

export interface MetricTimeseriesChartProps {
  model: MetricTimeseriesModel;
  selectedMetricKey: string;
  onEvidence?: (
    metricKey: string,
    columnKey: string,
    bucketStart: string | null
  ) => void;
}

function dateLabel(value: string, pattern: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return format(new Date(year, month - 1, day), pattern);
}

function IsolatedPoint({
  cx,
  cy,
  index,
  points,
  stroke,
  value,
}: DotItemDotProps) {
  if (value == null || cx == null || cy == null) return null;
  if (points[index - 1]?.value != null || points[index + 1]?.value != null) {
    return null;
  }
  return <circle cx={cx} cy={cy} r={3} fill={stroke} />;
}

export function MetricTimeseriesChart({
  model,
  selectedMetricKey,
  onEvidence,
}: MetricTimeseriesChartProps) {
  const selectedMetric =
    model.metrics.find((metric) => metric.metric_key === selectedMetricKey) ??
    model.metrics[0];
  if (!selectedMetric) return null;

  const colors = seriesColors(model.columns.map((column) => column.colorSeed));
  const config: ChartConfig = Object.fromEntries(
    model.columns.map((column) => [
      column.key,
      { label: column.label, color: colors[column.colorSeed] },
    ])
  );
  const data = model.buckets.map((bucketStart) => ({
    bucketStart,
    label: dateLabel(
      bucketStart,
      model.bucket === "month" ? "MMM yyyy" : "MMM d"
    ),
    tooltipLabel: dateLabel(bucketStart, "MMMM d, yyyy"),
    ...Object.fromEntries(
      model.columns.map((column) => [
        column.key,
        column.points.get(selectedMetric.metric_key)?.get(bucketStart) ?? null,
      ])
    ),
  }));
  const totals = model.columns.map(
    (column) => column.totals.get(selectedMetric.metric_key) ?? null
  );
  const shares = percentShareLabels(totals.map((value) => value ?? 0));
  const chartContent = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
        tickLine={false}
        axisLine={false}
        height={24}
        interval="preserveStartEnd"
      />
      <YAxis
        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
        tickFormatter={(value) =>
          formatMetricNumber(Number(value), selectedMetric.format)
        }
        tickLine={false}
        axisLine={false}
        width={48}
      />
      <ChartTooltip
        content={
          <ChartTooltipContent
            className="min-w-48"
            labelFormatter={(_, payload) =>
              String(payload?.[0]?.payload?.tooltipLabel ?? "")
            }
          />
        }
      />
    </>
  );
  const openPoint = (columnKey: string, state: unknown) => {
    const point = state as {
      payload?: { bucketStart?: string };
    };
    const bucketStart = point.payload?.bucketStart;
    const column = model.columns.find(
      (candidate) => candidate.key === columnKey
    );
    if (bucketStart && column && !column.remainder) {
      onEvidence?.(selectedMetric.metric_key, column.key, bucketStart);
    }
  };

  return (
    <div className="flex h-full flex-col px-4 pb-3 sm:px-6">
      <ChartContainer
        config={config}
        className="aspect-auto min-h-0 w-full flex-1"
      >
        {model.dimensions.length > 0 ? (
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            {chartContent}
            {model.columns.map((column) => (
              <ChartBar
                key={column.key}
                dataKey={column.key}
                stackId={selectedMetric.metric_key}
                fill={`var(--color-${column.key})`}
                name={column.label}
                radius={[2, 2, 0, 0]}
                onClick={(point) => openPoint(column.key, point)}
              />
            ))}
          </BarChart>
        ) : (
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            {chartContent}
            {model.columns.map((column) => (
              <ChartLine
                key={column.key}
                type="monotone"
                dataKey={column.key}
                stroke={`var(--color-${column.key})`}
                strokeWidth={2}
                onClick={(point) => openPoint(column.key, point)}
                dot={IsolatedPoint}
                name={selectedMetric.label}
              />
            ))}
          </LineChart>
        )}
      </ChartContainer>
      {model.dimensions.length > 0 ? (
        <ul className="mt-3 flex max-h-16 shrink-0 flex-wrap gap-x-6 gap-y-1.5 overflow-y-auto">
          {model.columns.map((column, index) => (
            <li key={column.key} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: colors[column.colorSeed] }}
              />
              <span className="font-medium">{column.label}</span>
              <span className="text-muted-foreground tabular-nums">
                {totals[index] == null
                  ? "—"
                  : `${formatMetricNumber(totals[index], selectedMetric.format)}${selectedMetric.unit ? ` ${selectedMetric.unit}` : ""}${shares[index] ? ` · ${shares[index]}%` : ""}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
