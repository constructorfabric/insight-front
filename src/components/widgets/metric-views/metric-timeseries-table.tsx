import { formatMetricNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MetricTimeseriesModel } from "@/components/widgets/metric-views/metric-timeseries-model";

export interface MetricTimeseriesTableProps {
  model: MetricTimeseriesModel;
  onEvidence?: (
    metricKey: string,
    columnKey: string,
    bucketStart: string | null
  ) => void;
}

const BUCKET_LABEL = {
  day: "Day",
  week: "Week",
  month: "Month",
} as const;

function MetricValues({
  model,
  values,
  showLabels = false,
}: {
  model: MetricTimeseriesModel;
  values: Array<number | null | undefined>;
  showLabels?: boolean;
}) {
  if (values.every((value) => value == null)) return <>—</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {model.metrics.map((metric, index) => (
        <span
          key={metric.metric_key}
          className="inline-flex items-center gap-1.5"
        >
          {index > 0 ? <span className="text-muted-foreground">·</span> : null}
          <span>
            {showLabels ? `${metric.label}: ` : ""}
            {values[index] == null
              ? "—"
              : formatMetricNumber(values[index], metric.format)}
          </span>
        </span>
      ))}
    </span>
  );
}

export function MetricTimeseriesTable({
  model,
  onEvidence,
}: MetricTimeseriesTableProps) {
  return (
    <Table
      className="min-w-max text-xs"
      containerClassName="h-full overflow-auto"
    >
      <TableHeader className="[&_tr]:border-b-0">
        {model.dimensions.length === 0 ? (
          <TableRow>
            <TableHead className="sticky top-0 left-0 z-30 h-10 w-28 max-w-28 min-w-28 bg-card py-0 shadow-[inset_0_-1px_0_0_var(--border)] after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border">
              {BUCKET_LABEL[model.bucket]}
            </TableHead>
            {model.metrics.map((metric, metricIndex) => (
              <TableHead
                key={metric.metric_key}
                className={cn(
                  "sticky top-0 z-20 h-10 min-w-24 bg-card py-0 text-right shadow-[inset_0_-1px_0_0_var(--border)]",
                  metricIndex > 0 &&
                    "before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-border"
                )}
              >
                {metric.label}
              </TableHead>
            ))}
          </TableRow>
        ) : model.metrics.length === 1 ? (
          <TableRow>
            <TableHead className="sticky top-0 left-0 z-30 h-10 w-28 max-w-28 min-w-28 bg-card py-0 shadow-[inset_0_-1px_0_0_var(--border)] after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border">
              {BUCKET_LABEL[model.bucket]}
            </TableHead>
            {model.columns.map((column, index) => (
              <TableHead
                key={column.key}
                className={cn(
                  "sticky top-0 z-20 h-10 min-w-24 bg-card py-0 text-center shadow-[inset_0_-1px_0_0_var(--border)]",
                  index > 0 &&
                    "before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-border"
                )}
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        ) : (
          <>
            <TableRow>
              <TableHead className="sticky top-0 left-0 z-30 h-10 w-28 max-w-28 min-w-28 bg-card py-0 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border">
                {BUCKET_LABEL[model.bucket]}
              </TableHead>
              {model.columns.map((column, index) => (
                <TableHead
                  key={column.key}
                  colSpan={model.metrics.length}
                  className={cn(
                    "sticky top-0 z-20 h-10 bg-card py-0 text-center after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border",
                    index > 0 &&
                      "before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-border"
                  )}
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
            <TableRow>
              <TableHead
                aria-hidden
                className="sticky top-10 left-0 z-30 h-9 w-28 max-w-28 min-w-28 bg-card py-0 shadow-[inset_0_-1px_0_0_var(--border)] after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border"
              />
              {model.columns.flatMap((column, columnIndex) =>
                model.metrics.map((metric, metricIndex) => (
                  <TableHead
                    key={`${column.key}-${metric.metric_key}`}
                    className={cn(
                      "sticky top-10 z-20 h-9 min-w-24 bg-card py-0 text-right after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border",
                      (columnIndex > 0 || metricIndex > 0) &&
                        "before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-border"
                    )}
                  >
                    {metric.label}
                  </TableHead>
                ))
              )}
            </TableRow>
          </>
        )}
      </TableHeader>
      <TableBody>
        {model.buckets.map((bucketStart) => (
          <TableRow key={bucketStart}>
            <TableCell className="sticky left-0 z-10 w-28 max-w-28 min-w-28 bg-card px-2 py-1 font-medium tabular-nums after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border">
              {bucketStart}
            </TableCell>
            {model.columns.flatMap((column, columnIndex) =>
              model.metrics.map((metric, metricIndex) => {
                const value = column.points
                  .get(metric.metric_key)
                  ?.get(bucketStart);
                return (
                  <TableCell
                    key={`${column.key}-${metric.metric_key}`}
                    className={cn(
                      "px-2 py-1 text-right tabular-nums",
                      (columnIndex > 0 || metricIndex > 0) && "border-l"
                    )}
                  >
                    {value == null ? (
                      "—"
                    ) : (
                      <button
                        type="button"
                        disabled={column.remainder || !onEvidence}
                        className="hover:underline disabled:no-underline"
                        onClick={() =>
                          onEvidence?.(
                            metric.metric_key,
                            column.key,
                            bucketStart
                          )
                        }
                      >
                        {formatMetricNumber(value, metric.format)}
                      </button>
                    )}
                  </TableCell>
                );
              })
            )}
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="sticky left-0 z-10 w-28 max-w-28 min-w-28 bg-muted px-2 py-1 font-semibold after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border">
            Total
          </TableCell>
          {model.columns.flatMap((column, columnIndex) =>
            model.metrics.map((metric, metricIndex) => {
              const value = column.totals.get(metric.metric_key);
              return (
                <TableCell
                  key={`${column.key}-${metric.metric_key}`}
                  className={cn(
                    "px-2 py-1 text-right font-semibold tabular-nums",
                    (columnIndex > 0 || metricIndex > 0) && "border-l"
                  )}
                >
                  {value == null ? (
                    "—"
                  ) : (
                    <button
                      type="button"
                      disabled={column.remainder || !onEvidence}
                      className="hover:underline disabled:no-underline"
                      onClick={() =>
                        onEvidence?.(metric.metric_key, column.key, null)
                      }
                    >
                      {formatMetricNumber(value, metric.format)}
                    </button>
                  )}
                </TableCell>
              );
            })
          )}
        </TableRow>
        {model.dimensions.length > 0 &&
        model.grandTotals.some((value) => value != null) ? (
          <TableRow>
            <TableCell className="sticky left-0 z-10 w-28 max-w-28 min-w-28 bg-muted px-2 pt-1 pb-5 font-semibold after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border">
              Grand total
            </TableCell>
            <TableCell
              colSpan={model.columns.length * model.metrics.length}
              className="bg-muted px-2 pt-1 pb-5 text-left font-semibold tabular-nums"
            >
              <MetricValues
                model={model}
                values={model.grandTotals}
                showLabels
              />
            </TableCell>
          </TableRow>
        ) : null}
      </TableFooter>
    </Table>
  );
}
