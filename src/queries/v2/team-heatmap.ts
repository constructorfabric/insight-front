import { useMemo } from "react";

import {
  previousPeriodRange,
  type DateRange,
} from "@/api/period-to-date-range";
import { HEATMAP_COLLECTION } from "@/lib/insight/groups";
import {
  projectViews,
  type MetricCollectionEntity,
  type NormalizedMetricResult,
} from "@/lib/metrics/collection";
import {
  useMetricCollectionSet,
  type KeyedCollection,
} from "@/queries/metric-results";
import type { PeriodValue } from "@/types/insight";

const HEATMAP_KEY = "heatmap";

const CURRENT_COLLECTIONS: readonly KeyedCollection[] = [
  { key: HEATMAP_KEY, collection: HEATMAP_COLLECTION },
];

// The previous-period twin fetches the period value only — WoW arrows compare
// values, not standings, so the peer view would be dead weight (and its rows
// would tighten chunking for no gain).
const PREVIOUS_COLLECTIONS: readonly KeyedCollection[] = [
  { key: HEATMAP_KEY, collection: projectViews(HEATMAP_COLLECTION, ["period"]) },
];

export interface TeamHeatmapResult {
  /** Current-period value + peer standing per heatmap metric key. */
  byKey: Map<string, NormalizedMetricResult>;
  /** Previous-period value per heatmap metric key (period view only). */
  previousByKey: Map<string, NormalizedMetricResult>;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}

const EMPTY = new Map<string, NormalizedMetricResult>();

/**
 * The members heatmap's unified data: the cross-family column metrics for the
 * roster (period + peer), plus a previous-period period-only twin for the
 * week-over-week arrows. Both requests chunk large rosters via
 * `useMetricCollectionSet`.
 */
export function useTeamHeatmap(
  entity: MetricCollectionEntity,
  range: DateRange,
  period: PeriodValue,
): TeamHeatmapResult {
  const current = useMetricCollectionSet(CURRENT_COLLECTIONS, entity, range);
  const previousRange = useMemo(
    () => previousPeriodRange(range, period),
    [range, period],
  );
  const previous = useMetricCollectionSet(
    PREVIOUS_COLLECTIONS,
    entity,
    previousRange,
  );

  const cur = current.get(HEATMAP_KEY);
  const prev = previous.get(HEATMAP_KEY);

  return {
    byKey: cur?.byKey ?? EMPTY,
    previousByKey: prev?.byKey ?? EMPTY,
    isPending: cur?.isPending ?? false,
    isFetching: (cur?.isFetching ?? false) || (prev?.isFetching ?? false),
    isError: cur?.isError ?? false,
    refetch: () => {
      cur?.refetch();
      prev?.refetch();
    },
  };
}
