import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { ComingSoon } from "@/components/widgets/coming-soon";
import { orgScopeGate } from "@/components/portal/org-scope-gate";
import { SectionTrend } from "@/components/widgets/v2/section-trend";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart,
  CartesianGrid,
  ChartBar,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  XAxis,
  YAxis,
  type ChartConfig,
} from "@/components/ui/chart";
import { usePeriod } from "@/hooks/use-period";
import { findIdentityNode, flattenSubordinates } from "@/lib/insight/identity-tree";
import { availableSlices, collectRosterAttrs, PLANNED_SLICES } from "@/lib/insight/slices";
import { MIN_COHORT } from "@/lib/insight/within-team-peer";
import {
  forEntity,
  type MetricCollectionConfig,
  type NormalizedMetricResult,
} from "@/lib/metrics/collection";
import type { MetricBucket, MetricDirection } from "@/api/metric-results-client";
import { normalizePersonId } from "@/lib/metrics/entity";
import { formatMetricValue } from "@/lib/format";
import {
  distribution,
  familyObserved,
  fmtCompact,
  medianAcross,
  perCapita,
  representative,
  topDecileShare,
} from "@/lib/portal/metric-stats";
import {
  sectionMetricKeys,
  type ConcentrationFraming,
  type LensConfig,
  type SectionSpec,
} from "@/lib/portal/lens-configs";
import { buildTrendData, pickTrendBucket } from "@/lib/portal/trend-data";
import { usePortalSlice } from "@/lib/portal/portal-store";
import { useIcPerson } from "@/queries/ic-dashboard";
import { useTeamMembers } from "@/queries/team-view";
import { useMetricCollection } from "@/queries/metric-results";
import { useMemberGridData } from "@/queries/v2/member-grid";

const EMPTY_COLLECTION: MetricCollectionConfig = { metrics: [] };

/**
 * One renderer for every Directions lens (design §4): sections come from the
 * lens config, values follow the metric grammar (§3), each section
 * self-suppresses on degenerate data (rule 11), the whole tab collapses to an
 * honest "not ingested" state when no metric of the family is observed
 * (rule 6), and no individual is ever named (rule 10).
 */
export function DomainLensView({
  scopePerson,
  config,
}: {
  scopePerson: string;
  config: LensConfig;
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

  // One period+peer grid for every metric the sections reference.
  const gridKeys = useMemo(() => sectionMetricKeys(config), [config]);
  const gridCollection = useMemo<MetricCollectionConfig>(
    () => ({
      metrics: gridKeys.map((key) => ({
        key,
        views: [{ view: "period" as const }, { view: "peer" as const }],
      })),
    }),
    [gridKeys],
  );
  const grid = useMemberGridData(
    gridCollection.metrics.length ? gridCollection : EMPTY_COLLECTION,
    { type: "person", ids: memberIds },
    dateRange,
    period,
    { keepPrevious: true },
  );

  // Trend: bucket coarsened to the roster so org scope never trips the row limit.
  const trendKeys = useMemo(
    () =>
      config.sections
        .filter((s): s is Extract<SectionSpec, { kind: "trend" }> => s.kind === "trend")
        .flatMap((s) => s.metrics),
    [config],
  );
  const trendBucket = useMemo(
    () => pickTrendBucket(memberIds.length, trendKeys.length, dateRange),
    [memberIds.length, trendKeys.length, dateRange],
  );
  const trendCollection = useMemo<MetricCollectionConfig>(
    () => ({
      metrics: trendKeys.map((key) => ({
        key,
        views: [{ view: "timeseries" as const, bucket: trendBucket }],
      })),
    }),
    [trendKeys, trendBucket],
  );
  const trend = useMetricCollection(
    trendCollection.metrics.length && memberIds.length ? trendCollection : EMPTY_COLLECTION,
    trendCollection.metrics.length && memberIds.length
      ? { type: "person", ids: memberIds }
      : { type: "person", ids: [] },
    dateRange,
  );

  // Composition: one breakdown request covering every composition section.
  const compSections = useMemo(
    () =>
      config.sections.filter(
        (s): s is Extract<SectionSpec, { kind: "composition" }> => s.kind === "composition",
      ),
    [config],
  );
  const compCollection = useMemo<MetricCollectionConfig>(
    () => ({
      metrics: compSections.map((s) => ({
        key: s.metric,
        views: [{ view: "breakdown" as const, dimensions: [s.dimension] }],
      })),
    }),
    [compSections],
  );
  const compData = useMetricCollection(
    compSections.length && memberIds.length ? compCollection : EMPTY_COLLECTION,
    compSections.length && memberIds.length
      ? { type: "person", ids: memberIds }
      : { type: "person", ids: [] },
    dateRange,
  );

  // Slice → by-unit auto-section (rule 7).
  const slice = usePortalSlice();
  const attrByEntity = useMemo(() => collectRosterAttrs(pivot, normalizePersonId), [pivot]);
  const sliceDims = useMemo(() => availableSlices(attrByEntity.values()), [attrByEntity]);
  const sliceLabel = slice
    ? (sliceDims.find((d) => d.key === slice)?.label ?? slice)
    : null;

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

  // Rule 6: nothing in this family was ever observed → the source isn't wired.
  if (!familyObserved(grid.byKey, gridKeys, memberIds)) {
    return (
      <Pending
        label={config.notIngested ?? `${config.title} — source isn't ingested for this org yet.`}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{config.title}</h1>
        <p className="text-sm text-muted-foreground">
          {members.length} members · {config.tagline ?? "trend & balance"}
        </p>
      </div>

      {config.sections.map((s, i) => (
        <Section
          key={`${s.kind}-${i}`}
          spec={s}
          grid={grid}
          trend={trend}
          trendBucket={trendBucket}
          compData={compData.byKey}
          compIsError={compData.isError}
          compRefetch={compData.refetch}
          memberIds={memberIds}
        />
      ))}

      {slice ? (
        <ByUnitSection
          config={config}
          grid={grid.byKey}
          memberIds={memberIds}
          keyOf={(id) => attrByEntity.get(id)?.[slice]?.value ?? null}
          sliceKey={slice}
          sliceLabel={sliceLabel ?? slice}
        />
      ) : null}
    </div>
  );
}

/* ── Section dispatch ────────────────────────────────────────────────── */

interface GridData {
  byKey: Map<string, NormalizedMetricResult>;
  previousByKey: Map<string, NormalizedMetricResult>;
}
interface TrendData {
  byKey: Map<string, NormalizedMetricResult>;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}

function Section({
  spec,
  grid,
  trend,
  trendBucket,
  compData,
  compIsError,
  compRefetch,
  memberIds,
}: {
  spec: SectionSpec;
  grid: GridData;
  trend: TrendData;
  trendBucket: MetricBucket;
  compData: Map<string, NormalizedMetricResult>;
  compIsError: boolean;
  compRefetch: () => void;
  memberIds: readonly string[];
}) {
  switch (spec.kind) {
    case "headline":
      return <HeadlineSection metrics={spec.metrics} grid={grid} memberIds={memberIds} />;
    case "stat-tiles":
      return (
        <StatTilesSection title={spec.title} metrics={spec.metrics} grid={grid} memberIds={memberIds} />
      );
    case "trend":
      return (
        <TrendSection metrics={spec.metrics} grid={grid} trend={trend} bucket={trendBucket} memberIds={memberIds} />
      );
    case "distribution":
      return <DistributionSection spec={spec} grid={grid} memberIds={memberIds} />;
    case "concentration":
      return <ConcentrationSection spec={spec} grid={grid} memberIds={memberIds} />;
    case "composition":
      return (
        <CompositionSection
          spec={spec}
          compData={compData}
          compIsError={compIsError}
          compRefetch={compRefetch}
          grid={grid}
          memberIds={memberIds}
        />
      );
    case "event-histogram":
    case "participation":
      // P3 sections — configs may stage them early; render nothing until then.
      return null;
  }
}

/* ── headline (rules 1-2) ────────────────────────────────────────────── */

function HeadlineSection({
  metrics,
  grid,
  memberIds,
}: {
  metrics: readonly string[];
  grid: GridData;
  memberIds: readonly string[];
}) {
  const cards = metrics
    .map((key) => {
      const r = grid.byKey.get(key);
      if (!r) return null;
      const now = representative(r, memberIds);
      if (now == null) return null;
      const prev = representative(grid.previousByKey.get(key), memberIds);
      const isSum = r.computation === "sum";
      return { key, r, now, prev, isSum };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (!cards.length) return null;

  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        Per person · vs previous period
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
        {cards.map((c) => (
          <Card key={c.key}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground">
                  {c.r.short_label ?? c.r.label}
                </div>
                <Delta now={c.now} prev={c.prev} direction={c.r.direction} />
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {formatMetricValue(c.isSum ? perCapita(c.r, memberIds) : c.now, c.r.format, c.r.unit)}
              </div>
              <div className="text-xs text-muted-foreground">
                {c.isSum
                  ? `per active person · ${formatMetricValue(c.now, c.r.format, c.r.unit)} team total`
                  : "median / person"}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

/* ── stat-tiles (rule 2, with deltas) ────────────────────────────────── */

function StatTilesSection({
  title,
  metrics,
  grid,
  memberIds,
}: {
  title: string;
  metrics: readonly string[];
  grid: GridData;
  memberIds: readonly string[];
}) {
  const tiles = metrics
    .map((key) => {
      const r = grid.byKey.get(key);
      if (!r) return null;
      const median = medianAcross(r, memberIds);
      if (median == null) return null;
      const prev = medianAcross(grid.previousByKey.get(key), memberIds);
      return { key, r, median, prev };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (!tiles.length) return null;

  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{title}</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
        {tiles.map((t) => (
          <Card key={t.key}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground">
                  {t.r.short_label ?? t.r.label}
                </div>
                <Delta now={t.median} prev={t.prev} direction={t.r.direction} />
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {formatMetricValue(t.median, t.r.format, t.r.unit)}
              </div>
              <div className="text-xs text-muted-foreground">median / person</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

/* ── trend (rule 8) ──────────────────────────────────────────────────── */

function TrendSection({
  metrics,
  grid,
  trend,
  bucket,
  memberIds,
}: {
  metrics: readonly string[];
  grid: GridData;
  trend: TrendData;
  bucket: MetricBucket;
  memberIds: readonly string[];
}) {
  const series = metrics
    .map((key) => {
      const r = grid.byKey.get(key);
      if (!r || r.computation !== "sum") return null;
      return { key, label: r.short_label ?? r.label };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .map((s, i) => ({
      key: s.key,
      label: s.label,
      type: "line" as const,
      yAxisId: (i === 0 ? "left" : "right") as "left" | "right",
    }));
  const data = buildTrendData(series.map((s) => s.key), trend.byKey, memberIds);

  if (series.length === 0) return null;
  if (trend.isError)
    return (
      <SectionTrend
        title="Activity over time"
        series={series}
        data={[]}
        isError
        onRetry={trend.refetch}
      />
    );
  if (data.length < 2) return null;
  return (
    <SectionTrend
      title="Activity over time"
      description={`Team totals · per ${bucket}`}
      series={series}
      data={data}
      rightAxis={series.some((s) => s.yAxisId === "right")}
      isPending={trend.isPending}
    />
  );
}

/* ── distribution (rules 3, 11) ──────────────────────────────────────── */

const DIST_CONFIG: ChartConfig = { count: { label: "People" } };

function DistributionSection({
  spec,
  grid,
  memberIds,
}: {
  spec: Extract<SectionSpec, { kind: "distribution" }>;
  grid: GridData;
  memberIds: readonly string[];
}) {
  const r = grid.byKey.get(spec.metric);
  const values = r
    ? memberIds
        .map((id) => forEntity(r, id).value)
        .filter((v): v is number => v != null && Number.isFinite(v) && v >= 0)
    : [];
  const fmt =
    r?.format === "percent" ? (n: number) => formatMetricValue(n, "percent", null) : fmtCompact;
  const rows = distribution(values, fmt);
  if (!rows.length) return null;

  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {spec.title} · {values.length} people
      </p>
      <Card>
        <CardContent className="p-4">
          <p className="mb-3 text-xs text-muted-foreground">{spec.caption}</p>
          <ChartContainer config={DIST_CONFIG} className="h-56 w-full">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                width={28}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="min-w-40"
                    labelFormatter={(_, p) =>
                      (p?.[0]?.payload as { range?: string } | undefined)?.range ?? ""
                    }
                  />
                }
              />
              <ChartBar dataKey="count" name="People" radius={[2, 2, 0, 0]} fill="var(--chart-1)" />
            </BarChart>
          </ChartContainer>
          <p className="mt-1 text-center text-[10px] text-muted-foreground">{spec.unitLabel}</p>
        </CardContent>
      </Card>
    </section>
  );
}

/* ── concentration (rules 4, 10 — aggregate only, framed per domain) ─── */

const FRAMING_COPY: Record<ConcentrationFraming, { heading: string; note: string }> = {
  "bus-factor": {
    heading: "Bus factor · top 10% of contributors",
    note: "high concentration = continuity risk",
  },
  "load-balance": {
    heading: "Load concentration · top 10% of contributors",
    note: "even share ≈ 10%",
  },
};

function ConcentrationSection({
  spec,
  grid,
  memberIds,
}: {
  spec: Extract<SectionSpec, { kind: "concentration" }>;
  grid: GridData;
  memberIds: readonly string[];
}) {
  const cards = spec.metrics
    .map((key) => {
      const r = grid.byKey.get(key);
      if (!r) return null;
      const vals = memberIds
        .map((id) => forEntity(r, id).value)
        .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
      const share = topDecileShare(vals);
      if (share == null) return null;
      return { key, label: r.short_label ?? r.label, share, contributors: vals.length };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (!cards.length) return null;
  const copy = FRAMING_COPY[spec.framing];

  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {copy.heading}
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-3">
        {cards.map((c) => (
          <Card key={c.key}>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-muted-foreground">{c.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {Math.round(c.share * 100)}%
              </div>
              <div className="text-xs text-muted-foreground">
                carried by the busiest {Math.max(1, Math.ceil(c.contributors * 0.1))} of{" "}
                {c.contributors} · {copy.note}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

/* ── composition (rule 5) ────────────────────────────────────────────── */

function CompositionSection({
  spec,
  compData,
  compIsError,
  compRefetch,
  grid,
  memberIds,
}: {
  spec: Extract<SectionSpec, { kind: "composition" }>;
  compData: Map<string, NormalizedMetricResult>;
  compIsError: boolean;
  compRefetch: () => void;
  grid: GridData;
  memberIds: readonly string[];
}) {
  if (compIsError) {
    return (
      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {spec.title}
        </p>
        <ComingSoon
          variant="card"
          state="error"
          label={`${spec.title} — unable to load`}
          onRetry={compRefetch}
        />
      </section>
    );
  }

  const r = grid.byKey.get(spec.metric);
  const bd = compData.get(spec.metric);
  const bucket = new Map<string, number>();
  if (bd) {
    for (const id of memberIds) {
      for (const row of forEntity(bd, id).breakdown) {
        const val = row.dimensions.find((d) => d.key === spec.dimension)?.value;
        if (!val || row.value == null || row.value <= 0) continue;
        bucket.set(val, (bucket.get(val) ?? 0) + row.value);
      }
    }
  }
  const rows = toBarRows(bucket);
  // A single 100%-share bar is an empty shell (rule 11), same as ByUnitSection.
  if (rows.length < 2) return null;

  return (
    <BarList title={spec.title} rows={rows} format={r?.format ?? "integer"} unit={r?.unit ?? null} />
  );
}

/* ── by-unit auto-section (rule 7) ───────────────────────────────────── */

const NO_COMPARABLE_UNITS_NOTE =
  "No comparable units for this lens at this slice (needs a summable headline metric and ≥2 units of ≥4 people).";

function ByUnitSection({
  config,
  grid,
  memberIds,
  keyOf,
  sliceKey,
  sliceLabel,
}: {
  config: LensConfig;
  grid: Map<string, NormalizedMetricResult>;
  memberIds: readonly string[];
  keyOf: (id: string) => string | null;
  sliceKey: string;
  sliceLabel: string;
}) {
  // A declared-but-unfed dimension (e.g. functional team) can never produce
  // by-unit data — say so plainly rather than fall through to the generic
  // "no comparable units" note, which would wrongly suggest a data quirk.
  const planned = PLANNED_SLICES.find((d) => d.key === sliceKey);
  if (planned) {
    return <SliceNote text={`The ${planned.label} dimension isn't ingested yet.`} />;
  }

  // Compare units on the lens's first headline counter, per active person.
  const headline = config.sections.find(
    (s): s is Extract<SectionSpec, { kind: "headline" }> => s.kind === "headline",
  );
  const key = headline?.metrics.find((k) => grid.get(k)?.computation === "sum");
  const r = key ? grid.get(key) : undefined;
  if (!r) return <SliceNote text={NO_COMPARABLE_UNITS_NOTE} />;

  const byUnit = new Map<string, string[]>();
  for (const id of memberIds) {
    const unit = keyOf(id);
    if (!unit) continue;
    (byUnit.get(unit) ?? byUnit.set(unit, []).get(unit)!).push(id);
  }
  const bucket = new Map<string, number>();
  for (const [unit, ids] of byUnit) {
    if (ids.length < MIN_COHORT) continue; // small-cohort suppression
    const v = perCapita(r, ids);
    if (v > 0) bucket.set(`${unit} · ${ids.length}`, v);
  }
  const rows = toBarRows(bucket);
  if (rows.length < 2) return <SliceNote text={NO_COMPARABLE_UNITS_NOTE} />;

  return (
    <BarList
      title={`${r.short_label ?? r.label} per active person · by ${sliceLabel}`}
      rows={rows}
      format={r.format}
      unit={r.unit}
      showShare={false}
    />
  );
}

/* ── shared bits ─────────────────────────────────────────────────────── */

interface BarRow {
  label: string;
  value: number;
  pct: number;
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
  showShare = true,
}: {
  title: string;
  rows: BarRow[];
  format: NormalizedMetricResult["format"];
  unit: string | null;
  /** False for per-capita values, where a share-of-total percent would mislead. */
  showShare?: boolean;
}) {
  const max = rows[0]?.value || 1;
  // toBarRows caps at 12 — when the cap is hit, the list is a sample, not the
  // full picture, and the title should say so.
  const displayTitle = rows.length === 12 ? `${title} · top 12` : title;
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {displayTitle}
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
                  {formatMetricValue(row.value, format, unit)}
                  {showShare ? ` · ${row.pct}%` : ""}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function SliceNote({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
      {text}
    </p>
  );
}

function Delta({
  now,
  prev,
  direction,
}: {
  now: number;
  prev: number | null;
  direction: MetricDirection;
}) {
  if (prev == null || prev === 0) return null;
  const diff = now - prev;
  if (Math.abs(diff) / Math.abs(prev) < 0.01) {
    return <span className="text-xs text-muted-foreground tabular-nums">±0%</span>;
  }
  const up = diff > 0;
  const good = direction === "neutral" ? null : direction === "higher_is_better" ? up : !up;
  const color =
    good == null ? "text-muted-foreground" : good ? "text-success" : "text-destructive";
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const pct = Math.round((diff / Math.abs(prev)) * 100);
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium tabular-nums ${color}`}>
      <Icon className="h-3.5 w-3.5" />
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

export function Pending({ label }: { label: string }) {
  return (
    <div className="mx-auto w-full max-w-md p-8">
      <ComingSoon variant="card" state="empty" label={label} />
    </div>
  );
}
