import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { ComingSoon } from "@/components/widgets/coming-soon";
import { Spinner } from "@/components/ui/spinner";
import { useSettings } from "@/hooks/use-settings";
import { formatMetricValue } from "@/lib/format";
import type { MetricGroup } from "@/lib/insight/groups";
import { forEntity, type NormalizedMetricResult } from "@/lib/metrics/collection";
import { formatGapMagnitude } from "@/lib/metrics/gap";
import { derivePeerStanding, type PeerStanding } from "@/lib/metrics/peer-standing";
import { applyFocus, PEER_FILL, PEER_TEXT } from "@/lib/peers";
import type { MetricCollectionResult } from "@/queries/metric-results";
import { cn } from "@/lib/utils";

export interface TeamMemberRef {
  entityId: string;
  displayName: string;
}

export interface TeamCollectionDrilldownProps {
  def: MetricGroup;
  data: MetricCollectionResult;
  members: TeamMemberRef[];
  className?: string;
}

interface MemberStanding {
  member: TeamMemberRef;
  value: number;
  standing: PeerStanding;
}

interface MetricAnalysis {
  metric: NormalizedMetricResult;
  /** Members with an observed value — the spread. */
  measured: MemberStanding[];
  /** Measured members trailing their own cohort, most severe first. */
  below: MemberStanding[];
  shareBelow: number;
  maxSeverity: number;
}

/**
 * Drilldown for a metrics-backed group over a roster of people. The roster is
 * a set of individuals, not a unit, so nothing is pooled: each metric shows
 * how its members are spread and which of them trail their OWN cohort. Metrics
 * are ordered by the share of members below their peers, so the areas that
 * need a manager's attention lead.
 */
export function TeamCollectionDrilldown({
  def,
  data,
  members,
  className,
}: TeamCollectionDrilldownProps) {
  const { focusMode } = useSettings();

  const analyses = useMemo<MetricAnalysis[]>(() => {
    const metrics = def.collection.metrics.flatMap((cfg) => {
      const metric = data.byKey.get(cfg.key);
      return metric ? [metric] : [];
    });
    return metrics
      .map((metric) => {
        const measured: MemberStanding[] = [];
        for (const member of members) {
          const entity = forEntity(metric, member.entityId);
          const standing = derivePeerStanding(metric.direction, {
            value: entity.value,
            peer: entity.peer,
          });
          if (standing.observed && entity.value != null) {
            measured.push({ member, value: entity.value, standing });
          }
        }
        const below = measured
          .filter((m) => m.standing.rank === "bottom")
          .sort((a, b) => b.standing.severity - a.standing.severity);
        return {
          metric,
          measured,
          below,
          shareBelow: measured.length > 0 ? below.length / measured.length : 0,
          maxSeverity: below[0]?.standing.severity ?? 0,
        };
      })
      .sort(
        (a, b) =>
          b.shareBelow - a.shareBelow || b.maxSeverity - a.maxSeverity,
      );
  }, [def, data, members]);

  if (data.isPending) {
    return (
      <Centered className={className}>
        <Spinner className="size-12 text-muted-foreground" />
      </Centered>
    );
  }
  if (data.isError) {
    return (
      <Centered className={className}>
        <ComingSoon
          state="error"
          label="Unable to load metrics"
          onRetry={data.refetch}
        />
      </Centered>
    );
  }
  if (analyses.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No data for this group in the selected period.
      </p>
    );
  }
  if (members.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No team members to display.
      </p>
    );
  }

  const attention = analyses.filter((a) => a.below.length > 0);
  const onPar = analyses.filter((a) => a.below.length === 0);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-5 overflow-auto p-4 transition-opacity sm:p-6",
        data.isFetching && "opacity-60",
        className,
      )}
    >
      {attention.map((analysis) => (
        <MetricBlock
          key={analysis.metric.metric_key}
          analysis={analysis}
          focusMode={focusMode}
        />
      ))}
      {onPar.length > 0 ? (
        <OnParFold analyses={onPar} focusMode={focusMode} />
      ) : null}
    </div>
  );
}

function MetricBlock({
  analysis,
  focusMode,
}: {
  analysis: MetricAnalysis;
  focusMode: ReturnType<typeof useSettings>["focusMode"];
}) {
  const { metric, measured, below } = analysis;
  const unit = metric.unit;
  const total = measured.length;
  const sumLine =
    metric.computation === "sum" && total > 0
      ? `Σ ${formatMetricValue(
          measured.reduce((acc, m) => acc + m.value, 0),
          metric.format,
          unit,
        )} across ${total} ${total === 1 ? "person" : "people"}`
      : null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{metric.label}</h3>
        <span className={cn("shrink-0 text-xs tabular-nums", PEER_TEXT[applyFocus("bottom", focusMode)])}>
          {below.length} of {total} below peers
        </span>
      </div>
      <SpreadStrip
        measured={measured}
        format={metric.format}
        unit={unit}
        focusMode={focusMode}
      />
      <ul className="flex flex-col">
        {below.slice(0, 5).map(({ member, value, standing }) => {
          const gap =
            standing.stats != null
              ? formatGapMagnitude({
                  value,
                  median: standing.stats.p50,
                  gapPct: standing.gapPct,
                  gapDelta: standing.gapDelta,
                  format: metric.format,
                  unit,
                })
              : null;
          return (
            <li
              key={member.entityId}
              className="flex items-baseline justify-between gap-2 py-0.5 text-sm"
            >
              <Link
                to="/ic/$person/personal"
                params={{ person: member.entityId }}
                className="min-w-0 truncate hover:underline"
              >
                {member.displayName}
              </Link>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatMetricValue(value, metric.format, unit)}
                {gap && standing.stats != null ? (
                  <>
                    {" · "}
                    <span className={PEER_TEXT[applyFocus("bottom", focusMode)]}>
                      {gap}
                    </span>{" "}
                    vs median{" "}
                    {formatMetricValue(standing.stats.p50, metric.format, unit)}
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
        {below.length > 5 ? (
          <li className="py-0.5 text-xs text-muted-foreground">
            +{below.length - 5} more
          </li>
        ) : null}
      </ul>
      {sumLine ? (
        <p className="text-xs text-muted-foreground tabular-nums">{sumLine}</p>
      ) : null}
    </section>
  );
}

/**
 * Every measured member as a dot on the metric's own value axis, colored by
 * that member's standing vs their cohort. Scales from a handful to the whole
 * org: dots overlap into a density band at high counts, and the trailing
 * members are always named in the list beside it. A single distinct value
 * collapses to one centered dot.
 */
function SpreadStrip({
  measured,
  format,
  unit,
  focusMode,
}: {
  measured: MemberStanding[];
  format: NormalizedMetricResult["format"];
  unit: string | null;
  focusMode: ReturnType<typeof useSettings>["focusMode"];
}) {
  const values = measured.map((m) => m.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const dense = measured.length > 24;
  return (
    <div className="relative h-6 w-full">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
      {measured.map(({ member, value, standing }) => {
        const left = span > 1e-9 ? ((value - min) / span) * 100 : 50;
        return (
          <span
            key={member.entityId}
            title={`${member.displayName}: ${formatMetricValue(value, format, unit)}`}
            className={cn(
              "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-background",
              PEER_FILL[applyFocus(standing.rank, focusMode)],
              dense && "opacity-70",
            )}
            style={{ left: `${left}%` }}
          />
        );
      })}
    </div>
  );
}

function OnParFold({
  analyses,
  focusMode,
}: {
  analyses: MetricAnalysis[];
  focusMode: ReturnType<typeof useSettings>["focusMode"];
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronRight
          className={cn("size-4 transition-transform", open && "rotate-90")}
          aria-hidden
        />
        {analyses.length} {analyses.length === 1 ? "area" : "areas"} on par —
        nobody trailing
      </button>
      {open ? (
        <div className="flex flex-col gap-4 pl-5">
          {analyses.map((analysis) => (
            <MetricBlock
              key={analysis.metric.metric_key}
              analysis={analysis}
              focusMode={focusMode}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Centered({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-96 w-full items-center justify-center p-10",
        className,
      )}
    >
      {children}
    </div>
  );
}
