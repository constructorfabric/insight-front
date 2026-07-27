import { useMemo } from "react";

import { ComingSoon } from "@/components/widgets/coming-soon";
import { orgScopeGate } from "@/components/portal/org-scope-gate";
import { SectionTrend } from "@/components/widgets/v2/section-trend";
import { buildTrendData, pickTrendBucket } from "@/lib/portal/trend-data";
import { Card, CardContent } from "@/components/ui/card";
import { usePeriod } from "@/hooks/use-period";
import { flattenSubordinates, findIdentityNode } from "@/lib/insight/identity-tree";
import { metricGroups, type GroupId } from "@/lib/insight/groups";
import { collectRosterAttrs } from "@/lib/insight/slices";
import { quantile } from "@/lib/insight/within-team-peer";
import {
  forEntity,
  type MetricCollectionConfig,
  type NormalizedMetricResult,
} from "@/lib/metrics/collection";
import { normalizePersonId } from "@/lib/metrics/entity";
import { formatMetricValue } from "@/lib/format";
import { usePortalSlice } from "@/lib/portal/portal-store";
import { useIcPerson } from "@/queries/ic-dashboard";
import { useTeamMembers } from "@/queries/team-view";
import { useMetricCollection } from "@/queries/metric-results";
import { useMemberGridData } from "@/queries/v2/member-grid";

const EMPTY_COLLECTION: MetricCollectionConfig = { metrics: [] };

/**
 * A Direction rendered as a rich, team-level domain screen — not one heatmap:
 *   • team KPI strip (headline counters summed across the roster),
 *   • a trend chart (summable metrics' timeseries summed per bucket),
 *   • the members × metrics roster heatmap.
 * Aggregation is data-driven: only `computation === "sum"` metrics are summed;
 * ratios/medians can't be naively summed, so they surface via the roster's
 * peer standing rather than a wrong headline number.
 */
export interface DomainComposition {
  /** Metric to break down (a summable counter). */
  metricKey: string;
  /** Dimension to break it down by (e.g. "category", "tool"). */
  dimension: string;
  title: string;
}

export function RichDomainView({
  scopePerson,
  groupIds,
  title,
  composition,
  statTiles,
}: {
  scopePerson: string;
  groupIds: readonly GroupId[];
  title: string;
  composition?: DomainComposition;
  /** Extra metric keys shown as org-median "health" tiles (e.g. focus %). */
  statTiles?: readonly string[];
}) {
  const { period, dateRange } = usePeriod();

  const viewerQ = useIcPerson(scopePerson);
  const tree = viewerQ.data ?? null;
  const pivot = useMemo(
    () => (tree && scopePerson.includes("@") ? findIdentityNode(tree, scopePerson) : null),
    [tree, scopePerson],
  );
  const roster = useMemo(() => (pivot ? flattenSubordinates(pivot) : null), [pivot]);

  const membersQ = useTeamMembers(scopePerson, roster, period, dateRange, {
    keepPrevious: true,
  });
  const members = useMemo(() => membersQ.data ?? [], [membersQ.data]);
  const memberIds = useMemo(
    () => members.map((m) => normalizePersonId(m.person_id)),
    [members],
  );

  const defs = metricGroups().filter((d) => groupIds.includes(d.id));
  const gridCollection = useMemo<MetricCollectionConfig>(
    () => ({ metrics: defs.flatMap((d) => d.collection.metrics) }),
    [defs],
  );
  const headlineKeys = useMemo(() => defs.flatMap((d) => d.card.preview), [defs]);
  // Coarsen the bucket with roster size so an org-wide per-member timeseries
  // stays under the backend's row limit instead of 500-ing (same fix as the
  // Collaboration/Overview trends — otherwise Directions shows "unable to load").
  const trendBucket = useMemo(
    () => pickTrendBucket(memberIds.length, headlineKeys.length, dateRange),
    [memberIds.length, headlineKeys.length, dateRange],
  );
  const trendCollection = useMemo<MetricCollectionConfig>(
    () => ({
      metrics: headlineKeys.map((key) => ({
        key,
        views: [{ view: "timeseries" as const, bucket: trendBucket }],
      })),
    }),
    [headlineKeys, trendBucket],
  );

  const grid = useMemberGridData(
    gridCollection.metrics.length ? gridCollection : EMPTY_COLLECTION,
    { type: "person", ids: memberIds },
    dateRange,
    period,
  );

  // Slice drives the "by unit" breakdown; the domain view is org-level, so
  // there's no per-person heatmap here — People is where the roster lives.
  const slice = usePortalSlice();
  const attrByEntity = useMemo(
    () => collectRosterAttrs(tree, normalizePersonId),
    [tree],
  );
  const nameByEntity = useMemo(
    () => new Map(members.map((m) => [normalizePersonId(m.person_id), m.name])),
    [members],
  );
  const trend = useMetricCollection(
    trendCollection.metrics.length ? trendCollection : EMPTY_COLLECTION,
    { type: "person", ids: memberIds },
    dateRange,
  );

  // Composition: break one metric down by its domain dimension (git → category,
  // ai → tool, …) summed across the org — "what the domain is made of".
  const compCollection = useMemo<MetricCollectionConfig>(
    () =>
      composition
        ? {
            metrics: [
              {
                key: composition.metricKey,
                views: [{ view: "breakdown" as const, dimensions: [composition.dimension] }],
              },
            ],
          }
        : { metrics: [] },
    [composition],
  );
  const compData = useMetricCollection(
    composition && memberIds.length ? compCollection : EMPTY_COLLECTION,
    composition && memberIds.length
      ? { type: "person", ids: memberIds }
      : { type: "person", ids: [] },
    dateRange,
  );

  if (defs.length === 0)
    return <Pending label="Bullet-only direction — pending its semantic-layer migration" />;
  const gate = orgScopeGate({
    viewerLoading: viewerQ.isLoading,
    viewerError: viewerQ.isError,
    membersLoading: membersQ.isLoading,
    membersError: membersQ.isError,
    memberCount: members.length,
    gridPending: grid.isPending,
    gridError: grid.isError,
    emptyLabel:
      "No team under this node — a Direction shows a domain across the team; pick a manager (or the org root).",
    onRetry: () => {
      viewerQ.refetch();
      membersQ.refetch();
      grid.refetch();
    },
  });
  if (gate) return gate;

  // ── Team KPI strip: sum the summable headline metrics across the roster ──
  const kpis = headlineKeys
    .map((key) => grid.byKey.get(key))
    .filter((r): r is NormalizedMetricResult => Boolean(r) && r!.computation === "sum")
    .map((r) => {
      const total = memberIds.reduce(
        (acc, id) => acc + (forEntity(r, id).value ?? 0),
        0,
      );
      return { key: r.metric_key, label: r.short_label ?? r.label, value: total, r };
    });

  // ── Team trend: sum each summable metric's per-bucket points over members ──
  const trendSeries = kpis.slice(0, 3).map((k) => ({
    key: k.key,
    label: k.label,
    type: "line" as const,
  }));
  const trendData = buildTrendData(
    trendSeries.map((s) => s.key),
    trend.byKey,
    memberIds,
  );

  // Composition: primary metric broken down by the domain dimension.
  const compR = composition ? grid.byKey.get(composition.metricKey) : undefined;
  const compRows = composition
    ? aggregateByDimension(compData.byKey.get(composition.metricKey), memberIds, composition.dimension)
    : [];

  // By unit / contributors key off the leading counter that actually has data.
  const primary = kpis.find((k) => k.value > 0) ?? kpis[0];
  const unitRows =
    slice && primary
      ? byUnit(grid.byKey.get(primary.key), memberIds, (id) => attrByEntity.get(id)?.[slice]?.value ?? "—")
      : [];
  // Top contributors: who drives the primary counter (compact, not a heatmap).
  const contributors = primary
    ? byUnit(grid.byKey.get(primary.key), memberIds, (id) => nameByEntity.get(id) ?? id).slice(0, 8)
    : [];

  // Health tiles: org-median of the given metrics (ratios/counts, not sums).
  const stats = (statTiles ?? [])
    .map((key) => {
      const r = grid.byKey.get(key);
      if (!r) return null;
      const vals = memberIds
        .map((id) => forEntity(r, id).value)
        .filter((v): v is number => v != null && Number.isFinite(v));
      if (!vals.length) return null;
      const median = quantile([...vals].sort((a, b) => a - b), 0.5);
      return {
        key,
        label: r.short_label ?? r.label,
        text: formatMetricValue(median, r.format, r.unit),
      };
    })
    .filter((x): x is { key: string; label: string; text: string } => x != null);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {members.length} members · team totals &amp; distribution
        </p>
      </div>

      {kpis.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
          {kpis.map((k) => (
            <Card key={k.key}>
              <CardContent className="p-4">
                <div className="text-xs font-medium text-muted-foreground">
                  {k.label}
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatMetricValue(k.value, k.r.format, k.r.unit)}
                </div>
                <div className="text-xs text-muted-foreground">team total</div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {stats.length > 0 ? (
        <section className="flex flex-col gap-3">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Meeting health · org median
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
            {stats.map((s) => (
              <Card key={s.key}>
                <CardContent className="p-4">
                  <div className="text-xs font-medium text-muted-foreground">{s.label}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{s.text}</div>
                  <div className="text-xs text-muted-foreground">median / person</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {composition && compRows.length > 0 ? (
        <BarList
          title={composition.title}
          rows={compRows}
          format={compR?.format ?? "integer"}
          unit={compR?.unit ?? null}
        />
      ) : null}

      {slice && unitRows.length > 0 ? (
        <BarList
          title={`${primary?.label ?? "Output"} by unit`}
          rows={unitRows}
          format={primary?.r.format ?? "number"}
          unit={primary?.r.unit ?? null}
        />
      ) : null}

      {trendSeries.length > 0 && (trendData.length > 0 || trend.isError) ? (
        <SectionTrend
          title="Trend"
          description="Team totals per period"
          series={trendSeries}
          data={trendData}
          isPending={trend.isPending}
          isError={trend.isError}
          onRetry={trend.refetch}
        />
      ) : null}

      {primary && contributors.length > 0 ? (
        <BarList
          title={`Top contributors · ${primary.label}`}
          rows={contributors}
          format={primary.r.format}
          unit={primary.r.unit}
        />
      ) : null}
    </div>
  );
}

interface BarRow {
  label: string;
  value: number;
  pct: number;
}

/** Sum a breakdown metric across members, grouped by a dimension → share bars. */
function aggregateByDimension(
  result: NormalizedMetricResult | undefined,
  memberIds: readonly string[],
  dimension: string,
): BarRow[] {
  if (!result) return [];
  const bucket = new Map<string, number>();
  for (const id of memberIds) {
    for (const row of forEntity(result, id).breakdown) {
      const val = row.dimensions.find((d) => d.key === dimension)?.value;
      if (!val || row.value == null || row.value <= 0) continue;
      bucket.set(val, (bucket.get(val) ?? 0) + row.value);
    }
  }
  return toBarRows(bucket);
}

/** Sum a period metric across members, grouped by `keyOf(id)` → share bars. */
function byUnit(
  result: NormalizedMetricResult | undefined,
  memberIds: readonly string[],
  keyOf: (id: string) => string,
): BarRow[] {
  if (!result) return [];
  const bucket = new Map<string, number>();
  for (const id of memberIds) {
    const v = forEntity(result, id).value ?? 0;
    if (v <= 0) continue;
    bucket.set(keyOf(id), (bucket.get(keyOf(id)) ?? 0) + v);
  }
  return toBarRows(bucket);
}

function toBarRows(bucket: Map<string, number>): BarRow[] {
  const total = [...bucket.values()].reduce((a, b) => a + b, 0) || 1;
  return [...bucket.entries()]
    .map(([label, value]) => ({ label, value, pct: Math.round((value / total) * 100) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
}

function BarList({
  title,
  rows,
  format,
  unit,
}: {
  title: string;
  rows: BarRow[];
  format: NormalizedMetricResult["format"];
  unit: string | null;
}) {
  const max = rows[0]?.value || 1;
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {title}
      </p>
      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <div className="w-44 shrink-0 truncate text-sm">{row.label}</div>
              <div className="relative h-6 flex-1 overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded bg-primary/25"
                  style={{ width: `${Math.round((row.value / max) * 100)}%` }}
                />
                <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium tabular-nums">
                  {formatMetricValue(row.value, format, unit)} · {row.pct}%
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}


function Pending({ label }: { label: string }) {
  return (
    <div className="mx-auto w-full max-w-md p-8">
      <ComingSoon variant="card" state="empty" label={label} />
    </div>
  );
}
