import { useMemo } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

import type { DateRange } from "@/api/period-to-date-range";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChartEmpty } from "@/components/widgets/metric-views/chart-empty";
import {
  TimeseriesBody,
  TimeseriesExportMenu,
  TimeseriesPresentationToggle,
} from "@/components/widgets/metric-views/metric-timeseries-chrome";
import {
  parseTimeseriesPresentation,
  serializeTimeseriesPresentation,
  type TimeseriesPresentation,
} from "@/components/widgets/metric-views/metric-timeseries-presentation";
import { bucketStarts } from "@/components/widgets/metric-views/metric-timeseries-model";
import {
  buildTeamMemberTimeseriesModel,
  type TeamMemberRef,
} from "@/components/widgets/metric-views/team-member-timeseries-model";
import {
  parseLocalStorageBoolean,
  serializeLocalStorageBoolean,
  useLocalStorageState,
} from "@/hooks/use-local-storage-state";
import {
  MAX_PROJECTED_ROWS,
  resolveTimeseriesBucket,
  type MetricCollectionConfig,
} from "@/lib/metrics/collection";
import { useMetricCollection } from "@/queries/metric-results";
import { cn } from "@/lib/utils";

export interface TeamMetricTimeseriesViewProps {
  id: string;
  members: TeamMemberRef[];
  range: DateRange;
  metricKey: string;
  defaultPresentation?: TimeseriesPresentation;
}

/**
 * Roster twin of `MetricTimeseriesView`: one metric, columns are the team
 * members, rows stay time buckets. Facts only — no peer view rides the
 * request and no standing colors the cells; judgment lives on the section
 * cards, heatmap, and attention block. When the roster would blow the
 * backend's all-or-nothing row limit the query is skipped entirely (empty
 * entity set disables it) and the card says so instead of failing the batch.
 */
export function TeamMetricTimeseriesView({
  id,
  members,
  range,
  metricKey,
  defaultPresentation = "table",
}: TeamMetricTimeseriesViewProps) {
  const [presentation, setPresentation] =
    useLocalStorageState<TimeseriesPresentation>({
      key: `insight.timeseries.${id}.presentation`,
      defaultValue: defaultPresentation,
      parse: parseTimeseriesPresentation,
      serialize: serializeTimeseriesPresentation,
    });
  const [expanded, setExpanded] = useLocalStorageState<boolean>({
    key: `insight.timeseries.${id}.expanded`,
    defaultValue: false,
    parse: parseLocalStorageBoolean,
    serialize: serializeLocalStorageBoolean,
  });

  const bucket = resolveTimeseriesBucket(range);
  // Projected rows: one timeseries row per member per bucket plus one period
  // row per member. Over the limit the backend rejects the whole request, so
  // don't send it at all.
  const overBudget =
    members.length * (bucketStarts(range, bucket).length + 1) >
    MAX_PROJECTED_ROWS;

  const collection = useMemo<MetricCollectionConfig>(
    () => ({
      metrics: [
        {
          key: metricKey,
          views: [{ view: "timeseries", bucket }, { view: "period" }],
        },
      ],
    }),
    [metricKey, bucket]
  );
  const entity = useMemo(
    () => ({
      type: "person" as const,
      ids: overBudget ? [] : members.map((member) => member.entityId),
    }),
    [members, overBudget]
  );
  const data = useMetricCollection(collection, entity, range, {
    keepPreviousData: true,
  });

  const model = buildTeamMemberTimeseriesModel(
    data.byKey.get(metricKey),
    members,
    range
  );
  const metric = model.metrics[0];
  const empty = !metric || model.columns.length === 0;

  return (
    <Card
      className={cn(
        "shrink-0 gap-0 overflow-hidden py-0",
        expanded && "lg:col-span-2",
        data.isFetching && "opacity-60"
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b p-2">
        <h3 className="min-w-0 truncate px-2 text-sm font-semibold">
          {metric?.label ?? ""}
        </h3>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <TimeseriesExportMenu
            id={id}
            model={model}
            range={range}
            disabled={empty || data.isFetching || data.isError}
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="hidden lg:inline-flex"
            aria-label={expanded ? "Collapse card" : "Expand card"}
            title={expanded ? "Collapse card" : "Expand card"}
            aria-pressed={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </Button>
          <TimeseriesPresentationToggle
            presentation={presentation}
            onChange={setPresentation}
          />
        </div>
      </div>
      <CardContent
        className="relative flex h-96 min-h-0 flex-col px-0"
        aria-busy={data.isFetching}
      >
        {overBudget ? (
          <ChartEmpty
            message="Too many members for a per-member view in this period"
            className="h-full"
          />
        ) : (
          <TimeseriesBody
            isPending={data.isPending}
            isFetching={data.isFetching}
            isError={data.isError}
            onRetry={data.refetch}
            empty={empty}
            presentation={presentation}
            model={model}
            selectedMetricKey={metricKey}
          />
        )}
      </CardContent>
    </Card>
  );
}
