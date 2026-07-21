import { useMemo, useState } from "react";
import { ListFilter, Maximize2, Minimize2, X } from "lucide-react";

import type { DateRange } from "@/api/period-to-date-range";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { buildMetricTimeseriesModel } from "@/components/widgets/metric-views/metric-timeseries-model";
import {
  forEntity,
  resolveTimeseriesBucket,
  type MetricCollectionConfig,
  type MetricTimeseriesGroupLimitConfig,
} from "@/lib/metrics/collection";
import { cn } from "@/lib/utils";
import {
  parseLocalStorageBoolean,
  serializeLocalStorageBoolean,
  useLocalStorageState,
} from "@/hooks/use-local-storage-state";
import {
  useMetricCollection,
  useMetricCollectionSet,
} from "@/queries/metric-results";

export interface MetricTimeseriesGroupBy {
  default: string;
  options?: string[];
  limits?: Record<string, MetricTimeseriesGroupLimitConfig>;
}

interface DimensionFilterControl {
  dimension: string;
  options: Array<{ value: string; label: string }>;
  selectedValue?: string;
  selectedLabel?: string;
  disabled: boolean;
}

interface DimensionControlsProps {
  bucketLabel?: string;
  dimensions: string[];
  selectedDimension: string;
  filters: DimensionFilterControl[];
  onDimensionChange: (dimension: string) => void;
  onFilterChange: (dimension: string, value?: string) => void;
  className?: string;
}

export interface MetricTimeseriesViewProps {
  id: string;
  entityId: string;
  range: DateRange;
  metricKeys: string[];
  defaultPresentation?: Presentation;
  groupBy?: MetricTimeseriesGroupBy;
}

type Presentation = TimeseriesPresentation;

function dimensionName(dimension: string): string {
  const label = dimension.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function dimensionDescription(dimension: string): string {
  return dimension.replaceAll("_", " ");
}

function encodedFilterValue(value: string): string {
  return `value:${value}`;
}

function DimensionControls({
  bucketLabel,
  dimensions,
  selectedDimension,
  filters,
  onDimensionChange,
  onFilterChange,
  className,
}: DimensionControlsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {dimensions.length > 1 ? (
        <Select
          value={selectedDimension}
          onValueChange={(value) => {
            if (value) onDimensionChange(value);
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label="Group by"
            className="h-7 border-transparent bg-transparent px-0 text-xs text-muted-foreground shadow-none hover:text-foreground focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent"
          >
            <SelectValue>
              {bucketLabel
                ? `${bucketLabel} by ${dimensionDescription(selectedDimension)}`
                : `Group by: ${dimensionName(selectedDimension)}`}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start">
            {dimensions.map((dimension) => (
              <SelectItem key={dimension} value={dimension}>
                {dimensionName(dimension)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : bucketLabel ? (
        <span className="text-xs text-muted-foreground">
          {selectedDimension
            ? `${bucketLabel} by ${dimensionDescription(selectedDimension)}`
            : bucketLabel}
        </span>
      ) : null}
      {filters.length > 0 ? (
        <Popover>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Filters"
                title="Filters"
              >
                <ListFilter className="size-4" />
              </Button>
            }
          />
          <PopoverContent align="start" className="w-72">
            <PopoverHeader>
              <PopoverTitle>Filters</PopoverTitle>
            </PopoverHeader>
            {filters.map((filter) => (
              <div key={filter.dimension} className="flex flex-col gap-2">
                <span className="text-xs font-medium">
                  {dimensionName(filter.dimension)}
                </span>
                <Select
                  value={
                    filter.selectedValue
                      ? encodedFilterValue(filter.selectedValue)
                      : "all"
                  }
                  onValueChange={(value) => {
                    onFilterChange(
                      filter.dimension,
                      !value || value === "all"
                        ? undefined
                        : value.slice("value:".length)
                    );
                  }}
                  disabled={filter.disabled}
                >
                  <SelectTrigger
                    className="w-full"
                    aria-label={`Filter by ${filter.dimension}`}
                  >
                    <SelectValue>{filter.selectedLabel ?? "All"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectItem value="all">All</SelectItem>
                    {filter.options.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={encodedFilterValue(option.value)}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </PopoverContent>
        </Popover>
      ) : null}
      {filters
        .filter((filter) => filter.selectedValue)
        .map((filter) => (
          <Button
            key={filter.dimension}
            type="button"
            variant="secondary"
            size="xs"
            className="rounded-full"
            aria-label={`Clear ${dimensionName(filter.dimension)} filter`}
            onClick={() => onFilterChange(filter.dimension)}
          >
            {dimensionName(filter.dimension)}: {filter.selectedLabel}
            <X className="size-3" />
          </Button>
        ))}
    </div>
  );
}

export function MetricTimeseriesView({
  id,
  entityId,
  range,
  metricKeys,
  defaultPresentation = "chart",
  groupBy,
}: MetricTimeseriesViewProps) {
  const [presentation, setPresentation] = useLocalStorageState<Presentation>({
    key: `insight.timeseries.${id}.presentation`,
    defaultValue: defaultPresentation,
    parse: parseTimeseriesPresentation,
    serialize: serializeTimeseriesPresentation,
  });
  const [expanded, setExpanded] = useLocalStorageState<boolean>({
    key: `insight.timeseries.${id}.expanded`,
    defaultValue: true,
    parse: parseLocalStorageBoolean,
    serialize: serializeLocalStorageBoolean,
  });
  const [selectedMetricKey, setSelectedMetricKey] = useState(
    metricKeys[0] ?? ""
  );
  const dimensionOptions = useMemo(
    () =>
      groupBy
        ? [...new Set([groupBy.default, ...(groupBy.options ?? [])])]
        : [],
    [groupBy]
  );
  const [selectedGroupBy, setSelectedGroupBy] = useState(
    groupBy?.default ?? ""
  );
  const [dimensionFilters, setDimensionFilters] = useState<
    Record<string, string>
  >({});
  const filters = useMemo(
    () =>
      Object.entries(dimensionFilters)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([dimension, value]) => ({ dimension, values: [value] })),
    [dimensionFilters]
  );
  const groupLimit = selectedGroupBy
    ? groupBy?.limits?.[selectedGroupBy]
    : undefined;
  const collection = useMemo<MetricCollectionConfig>(
    () => ({
      metrics: metricKeys.map((key) => ({
        key,
        filters,
        views: [
          {
            view: "timeseries",
            bucket: resolveTimeseriesBucket(range),
            dimensions: selectedGroupBy ? [selectedGroupBy] : [],
            ...(groupLimit
              ? {
                  groupLimit: {
                    count: groupLimit.count,
                    rank_by_metric: groupLimit.rankBy,
                    include_remainder: groupLimit.includeRemainder,
                  },
                }
              : {}),
          },
          { view: "period" },
        ],
      })),
    }),
    [filters, groupLimit, metricKeys, range, selectedGroupBy]
  );
  const entity = useMemo(
    () => ({ type: "person" as const, ids: [entityId] }),
    [entityId]
  );
  const data = useMetricCollection(collection, entity, range, {
    keepPreviousData: true,
  });
  const optionCollections = useMemo(
    () =>
      selectedMetricKey && dimensionOptions.length > 1
        ? dimensionOptions
            .filter((dimension) => dimension !== selectedGroupBy)
            .map((dimension) => ({
              key: dimension,
              collection: {
                metrics: [
                  {
                    key: selectedMetricKey,
                    views: [
                      { view: "breakdown" as const, dimensions: [dimension] },
                    ],
                  },
                ],
              },
            }))
        : [],
    [dimensionOptions, selectedGroupBy, selectedMetricKey]
  );
  const optionData = useMetricCollectionSet(optionCollections, entity, range);

  const model = buildMetricTimeseriesModel(
    data.byKey,
    metricKeys,
    entityId,
    range,
    selectedGroupBy ? [selectedGroupBy] : []
  );
  const empty = model.metrics.length === 0 || model.columns.length === 0;
  const selectedMetric =
    model.metrics.find((metric) => metric.metric_key === selectedMetricKey) ??
    model.metrics[0];
  const filterModels = dimensionOptions
    .filter((dimension) => dimension !== selectedGroupBy)
    .map((dimension) => {
      const result = optionData.get(dimension);
      const metric = result?.byKey.get(selectedMetricKey);
      const values = new Map<string, string>();
      if (metric) {
        for (const row of forEntity(metric, entityId).breakdown) {
          const item = row.dimensions.find(
            (candidate) => candidate.key === dimension
          );
          if (item) values.set(item.value, item.label ?? item.value);
        }
      }
      const options = [...values]
        .map(([value, label]) => ({ value, label }))
        .sort((left, right) => left.label.localeCompare(right.label));
      const selectedValue = dimensionFilters[dimension];
      return {
        dimension,
        options,
        selectedValue,
        selectedLabel: selectedValue
          ? (values.get(selectedValue) ?? selectedValue)
          : undefined,
        disabled: Boolean(result?.isPending || result?.isError),
      };
    });
  const displayBucket =
    model.metrics.length > 0 ? model.bucket : resolveTimeseriesBucket(range);
  const bucketLabel =
    displayBucket === "day"
      ? "Daily"
      : displayBucket === "week"
        ? "Weekly"
        : "Monthly";

  function changeDimension(dimension: string): void {
    if (!dimension) return;
    setSelectedGroupBy(dimension);
    setDimensionFilters((current) => {
      const next = { ...current };
      delete next[dimension];
      return next;
    });
  }

  function changeFilter(dimension: string, value?: string): void {
    setDimensionFilters((current) => {
      const next = { ...current };
      if (value) next[dimension] = value;
      else delete next[dimension];
      return next;
    });
  }

  return (
    <Card
      className={cn(
        "shrink-0 gap-0 overflow-hidden py-0",
        expanded && "lg:col-span-2",
        data.isFetching && "opacity-60"
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b p-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {selectedMetric ? (
            model.metrics.length > 1 && presentation === "chart" ? (
              <Select
                value={selectedMetric.metric_key}
                onValueChange={(value) => {
                  if (value) setSelectedMetricKey(value);
                }}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="Metric"
                  className="border-transparent bg-transparent ps-2 pe-2 font-semibold shadow-none hover:bg-muted/50 focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted/50 dark:bg-transparent dark:hover:bg-muted/50"
                >
                  <SelectValue>{selectedMetric.label}</SelectValue>
                </SelectTrigger>
                <SelectContent align="start">
                  {model.metrics.map((metric) => (
                    <SelectItem
                      key={metric.metric_key}
                      value={metric.metric_key}
                    >
                      {metric.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : model.metrics.length === 1 ? (
              <h3 className="px-2 text-sm font-semibold">
                {selectedMetric.label}
              </h3>
            ) : null
          ) : null}
          {presentation === "table" &&
          (dimensionOptions.length > 1 || filterModels.length > 0) ? (
            <DimensionControls
              dimensions={dimensionOptions}
              selectedDimension={selectedGroupBy}
              filters={filterModels}
              onDimensionChange={changeDimension}
              onFilterChange={changeFilter}
            />
          ) : null}
        </div>
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
        {presentation === "chart" ? (
          <DimensionControls
            bucketLabel={bucketLabel}
            dimensions={dimensionOptions}
            selectedDimension={selectedGroupBy}
            filters={filterModels}
            onDimensionChange={changeDimension}
            onFilterChange={changeFilter}
            className="min-h-10 shrink-0 px-4 py-2 sm:px-6"
          />
        ) : null}
        <TimeseriesBody
          isPending={data.isPending}
          isFetching={data.isFetching}
          isError={data.isError}
          onRetry={data.refetch}
          empty={empty}
          presentation={presentation}
          model={model}
          selectedMetricKey={selectedMetric?.metric_key ?? ""}
        />
      </CardContent>
    </Card>
  );
}
