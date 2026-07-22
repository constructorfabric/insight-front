import { Maximize2, Minimize2, XIcon } from "lucide-react";

import { ComingSoon } from "@/components/widgets/coming-soon";
import { CountersBlock } from "@/components/widgets/v2/counters-block";
import { DistributionStrip } from "@/components/widgets/v2/distribution-strip";
import { CollectionDrilldown } from "@/components/widgets/metric-views/collection-drilldown";
import {
  TeamCollectionDrilldown,
  type TeamMemberRef,
} from "@/components/widgets/metric-views/team-collection-drilldown";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { DateRange } from "@/api/period-to-date-range";
import type { GroupDef } from "@/lib/insight/groups";
import { partitionBullets } from "@/lib/insight/v2/partition";
import { useIcDrilldownBatch } from "@/queries/v2/ic-extras";
import type { PeerCohortLabel } from "@/lib/peers";
import type { MetricCollectionResult } from "@/queries/metric-results";
import { cn } from "@/lib/utils";
import {
  parseLocalStorageBoolean,
  serializeLocalStorageBoolean,
  useLocalStorageState,
} from "@/hooks/use-local-storage-state";
import type { BulletMetric, PeriodValue } from "@/types/insight";

/** Data target for a metrics-backed group's drilldown body. */
export type MetricDrilldownTarget =
  | {
      kind: "person";
      entityId: string;
      data: MetricCollectionResult;
    }
  | { kind: "team"; members: TeamMemberRef[] };

export interface GroupDrilldownSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  def: GroupDef;
  /** Legacy group rows; unused for `def.kind === "metrics"`. */
  rows: BulletMetric[];
  /** Required when `def.kind === "metrics"`. */
  metricTarget?: MetricDrilldownTarget;
  personId?: string | null;
  range?: DateRange;
  period?: PeriodValue;
  cohortLabel?: PeerCohortLabel;
}

export function GroupDrilldownSheet({
  open,
  onOpenChange,
  def,
  rows,
  metricTarget,
  personId,
  range,
  period,
  cohortLabel = "department",
}: GroupDrilldownSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex w-fit max-w-none! flex-col gap-0 overflow-hidden p-0"
      >
        <DrilldownPanel
          def={def}
          rows={rows}
          metricTarget={metricTarget}
          personId={personId}
          range={range}
          period={period}
          cohortLabel={cohortLabel}
        />
      </DialogContent>
    </Dialog>
  );
}

function DrilldownPanel({
  def,
  rows,
  metricTarget,
  personId,
  range,
  period,
  cohortLabel,
}: {
  def: GroupDef;
  rows: BulletMetric[];
  metricTarget?: MetricDrilldownTarget;
  personId?: string | null;
  range?: DateRange;
  period?: PeriodValue;
  cohortLabel: PeerCohortLabel;
}) {
  const [expanded, setExpanded] = useLocalStorageState<boolean>({
    key: "insight.drilldown.expanded",
    defaultValue: true,
    parse: parseLocalStorageBoolean,
    serialize: serializeLocalStorageBoolean,
  });

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden",
        expanded ? "h-[95vh] w-[95vw]" : "h-[70vh] w-[80vw]"
      )}
    >
      <DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-2 border-b p-4">
        <DialogTitle>{def.title}</DialogTitle>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Shrink" : "Expand"}
          >
            {expanded ? <Minimize2 /> : <Maximize2 />}
          </Button>
          <DialogClose
            render={
              <Button variant="ghost" size="icon-sm" aria-label="Close" />
            }
          >
            <XIcon />
          </DialogClose>
        </div>
      </DialogHeader>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {def.kind === "metrics" ? (
          metricTarget?.kind === "person" ? (
            <CollectionDrilldown
              def={def}
              data={metricTarget.data}
              entityId={metricTarget.entityId}
              range={range}
              cohortLabel={cohortLabel}
            />
          ) : metricTarget?.kind === "team" && range && period ? (
            <TeamCollectionDrilldown
              def={def}
              members={metricTarget.members}
              range={range}
              period={period}
              cohortLabel={cohortLabel}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-10">
              <ComingSoon state="error" label="Missing drilldown data" />
            </div>
          )
        ) : (
          <LegacyDrilldownBody
            rows={rows}
            sectionId={def.id}
            personId={personId}
            range={range}
            period={period}
            cohortLabel={cohortLabel}
          />
        )}
      </div>
    </div>
  );
}

function LegacyDrilldownBody({
  rows,
  sectionId,
  personId,
  range,
  period,
  cohortLabel,
}: {
  rows: BulletMetric[];
  sectionId: string;
  personId?: string | null;
  range?: DateRange;
  period?: PeriodValue;
  cohortLabel: PeerCohortLabel;
}) {
  const { counters, distributions } = partitionBullets(rows);

  const batchQ = useIcDrilldownBatch({
    sectionId,
    personId: personId ?? null,
    range: range ?? null,
    period: period ?? null,
  });

  const batch = batchQ.data;
  const isFirstLoad = batchQ.isPending && batchQ.fetchStatus !== "idle";
  const isBodyEmpty =
    Boolean(batch) &&
    counters.length === 0 &&
    distributions.length === 0 &&
    batch?.histograms.size === 0 &&
    !batch?.sectionTrend?.length;
  const showFullSpinner = isFirstLoad || (isBodyEmpty && batchQ.isFetching);

  if (showFullSpinner) {
    return (
      <div className="flex h-full w-full items-center justify-center p-10">
        <Spinner className="size-12 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-6 p-4 transition-opacity sm:p-6",
        batchQ.isFetching && "opacity-60"
      )}
    >
      {counters.length > 0 ? (
        <CountersBlock rows={counters} cohortLabel={cohortLabel} />
      ) : null}
      {/* Histograms (ic_histogram) are per-person; a team aggregate has no
          single person, so the team renders distributions as a compact
          value-vs-expectation list (matches the sandbox's list layout). */}
      {distributions.length > 0 ? (
        personId != null ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {distributions.map((r) => (
              <DistributionStrip
                key={r.metric_key}
                row={r}
                bins={batch?.histograms.get(r.metric_key) ?? null}
                cohortLabel={cohortLabel}
              />
            ))}
          </div>
        ) : (
          <CountersBlock
            rows={distributions}
            cohortLabel={cohortLabel}
            layout="list"
          />
        )
      ) : null}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No data for this section in the selected period.
        </p>
      ) : null}
    </div>
  );
}
