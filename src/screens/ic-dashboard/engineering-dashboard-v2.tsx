import { useState } from "react";

import { CenteredSpinner } from "@/components/widgets/centered-spinner";
import { ComingSoon } from "@/components/widgets/coming-soon";
import { DashboardHeader } from "@/components/widgets/v2/dashboard-header";
import { IcNeedsAttention } from "@/components/widgets/v2/ic-needs-attention";
import {
  KpiTile,
  KpiTilePlaceholder,
} from "@/components/widgets/v2/kpi-tile";
import { MetricGroupCard } from "@/components/widgets/metric-views/metric-group-card";
import { GroupDrilldownSheet } from "@/components/widgets/v2/group-drilldown-sheet";
import { usePeriod } from "@/hooks/use-period";
import { useSettings } from "@/hooks/use-settings";
import { metricAttentionItems } from "@/lib/insight/attention";
import { metricKpiTiles, type KpiTileData } from "@/lib/insight/kpi-row";
import {
  KPI_ROW,
  KPI_ROW_COLLECTION,
  metricGroups,
  type GroupId,
} from "@/lib/insight/groups";
import {
  projectViews,
  type MetricCollectionConfig,
} from "@/lib/metrics/collection";
import { normalizePersonId } from "@/lib/metrics/entity";
import {
  collectionSetPending,
  useMetricCollection,
  useMetricCollectionSet,
} from "@/queries/metric-results";
import type { IdentityPerson } from "@/types/insight";

// Stable references so the disabled drilldown query keeps a constant key.
const EMPTY_COLLECTION: MetricCollectionConfig = { metrics: [] };
const CLOSED_ENTITY = { type: "person" as const, ids: [] };
// Placeholder for closed drilldown sheets; their body never renders.
const CLOSED_DRILLDOWN_DATA = {
  byKey: new Map(),
  previousByKey: null,
  isPending: true,
  isFetching: false,
  isError: false,
  refetch: () => {},
} as const;

export interface EngineeringDashboardV2Props {
  personId: string;
  person?: IdentityPerson | null;
}

export function EngineeringDashboardV2({
  personId,
  person,
}: EngineeringDashboardV2Props) {
  const { period, dateRange } = usePeriod();
  const { focusMode } = useSettings();
  const entityId = normalizePersonId(personId);
  const entity = { type: "person" as const, ids: [entityId] };

  const kpiData = useMetricCollection(KPI_ROW_COLLECTION, entity, dateRange, {
    previousPeriod: period,
  });
  // Cards only render period + peer; the heavy timeseries/breakdown views
  // exist for the drilldown. Fetch the light projection here so a card paints
  // as fast as a KPI tile, and let the open drilldown fetch the full
  // collection lazily below.
  const groupData = useMetricCollectionSet(
    metricGroups().map((def) => ({
      key: def.id,
      collection: projectViews(def.collection, ["period", "peer"]),
    })),
    entity,
    dateRange
  );

  const [openGroup, setOpenGroup] = useState<GroupId | null>(null);

  // Full collection for the open metrics group only (drives the drilldown's
  // chart blocks + peer story). Disabled while nothing is open — empty ids
  // gate the query off — so heavy views are never fetched for drilldowns the
  // user doesn't open.
  const openMetricDef =
    openGroup != null
      ? (metricGroups().find((def) => def.id === openGroup) ?? null)
      : null;
  const drilldownData = useMetricCollection(
    openMetricDef?.collection ?? EMPTY_COLLECTION,
    openMetricDef ? entity : CLOSED_ENTITY,
    dateRange
  );

  // Never fall back to the raw id (an email) — a person outside the viewer's
  // cached tree resolves in a beat; the title stays blank until then.
  const displayName = person?.display_name ?? "";
  const role = person?.job_title;

  // The one loading gate: a single page spinner while any of the screen's
  // queries has no data. A period change mints new query keys, so the same
  // gate re-trips — no per-widget loaders, no partial paints.
  const isLoading = kpiData.isPending || collectionSetPending(groupData);

  const tiles = metricKpiTiles(
    kpiData.byKey,
    kpiData.previousByKey,
    entityId,
    focusMode
  );
  const tilesByKey = new Map<string, KpiTileData>(
    tiles.map((tile) => [tile.key, tile])
  );

  const attentionItems = metricGroups().flatMap((def) =>
    metricAttentionItems(
      def,
      groupData.get(def.id)?.byKey ?? new Map(),
      entityId
    )
  );

  // Close any open drilldown when the viewed person changes. Render-phase
  // reset against the previous id rather than an effect (no cascading commit).
  const [prevPersonId, setPrevPersonId] = useState(personId);
  if (personId !== prevPersonId) {
    setPrevPersonId(personId);
    setOpenGroup(null);
  }

  return (
    <div className="flex flex-col">
      <DashboardHeader
        title={displayName}
        subtitle={role}
        person={personId}
        hasReports={(person?.subordinates?.length ?? 0) > 0}
      />
      <main className="flex flex-1 flex-col gap-8 p-4 md:p-6">
        {isLoading ? (
          <CenteredSpinner className="min-h-[70vh]" />
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <p className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                At a glance
              </p>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-3">
                {KPI_ROW.map((source) => {
                  const key =
                    source.kind === "metric" ? source.metricKey : source.key;
                  const tile = tilesByKey.get(key);
                  if (tile) {
                    return (
                      <KpiTile
                        key={key}
                        tile={tile}
                        onOpenGroup={setOpenGroup}
                      />
                    );
                  }
                  if (source.kind === "metric" && kpiData.isError) {
                    return (
                      <ComingSoon
                        key={key}
                        variant="card"
                        state="error"
                        onRetry={kpiData.refetch}
                      />
                    );
                  }
                  return <KpiTilePlaceholder key={key} />;
                })}
              </div>
            </section>

            <IcNeedsAttention
              items={attentionItems}
              onOpenGroup={setOpenGroup}
            />

            <section className="flex flex-col gap-3">
              <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Sections
              </p>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-3">
                {metricGroups().map((def) => {
                  const result = groupData.get(def.id);
                  if (!result) return null;
                  return (
                    <MetricGroupCard
                      key={def.id}
                      def={def}
                      data={result}
                      entityId={entityId}
                      onOpen={() => setOpenGroup(def.id)}
                    />
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>

      {metricGroups().map((def) => (
        <GroupDrilldownSheet
          key={def.id}
          open={openGroup === def.id}
          onOpenChange={(o) => setOpenGroup(o ? def.id : null)}
          def={def}
          rows={[]}
          metricTarget={{
            kind: "person",
            entityId,
            // The drilldown for the open group reads the full-collection
            // query; closed sheets never render their body.
            data: def.id === openGroup ? drilldownData : CLOSED_DRILLDOWN_DATA,
          }}
          personId={personId}
          range={dateRange}
          period={period}
          cohortLabel="department"
        />
      ))}
    </div>
  );
}
