import { useMemo } from "react";

import { ComingSoon } from "@/components/widgets/coming-soon";
import { orgScopeGate } from "@/components/portal/org-scope-gate";
import { SectionTrend } from "@/components/widgets/v2/section-trend";
import { buildTrendData, pickTrendBucket } from "@/lib/portal/trend-data";
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
import { flattenSubordinates, findIdentityNode } from "@/lib/insight/identity-tree";
import { metricGroups } from "@/lib/insight/groups";
import { quantile } from "@/lib/insight/within-team-peer";
import {
  forEntity,
  type MetricCollectionConfig,
  type NormalizedMetricResult,
} from "@/lib/metrics/collection";
import type { MetricDirection } from "@/api/metric-results-client";
import { normalizePersonId } from "@/lib/metrics/entity";
import { formatMetricValue } from "@/lib/format";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useIcPerson } from "@/queries/ic-dashboard";
import { useTeamMembers } from "@/queries/team-view";
import { useMetricCollection } from "@/queries/metric-results";
import { useMemberGridData } from "@/queries/v2/member-grid";

const EMPTY_COLLECTION: MetricCollectionConfig = { metrics: [] };

/**
 * A collaboration lens rendered as a **trend & balance** screen — deliberately
 * NOT the Development totals + composition template. Each lens answers two
 * questions a lead actually has:
 *   • Trend — is per-person load moving? (headline metrics as per-person values
 *     with a period-over-period delta coloured by the metric's server-owned
 *     direction) + an org activity trend line.
 *   • Balance — is the load shared or concentrated? (distribution of the lens's
 *     primary metric across people + top-decile concentration).
 * Raw team totals, tool-mix and chattiness rankings are dropped: they carry no
 * signal for a lead. Every section self-trims when its metric has no data, so a
 * lens never fabricates a chart it can't back. Everything is derived from the
 * same period+peer roster grid the rest of the portal uses.
 *
 * `ModalityConfig` is the only thing that varies between lenses (Overview,
 * Messaging, …) — which metrics headline, which drives the distribution, which
 * carry the trend. Adding Meetings / Email / Files later is a new config, not a
 * new screen.
 */
interface ModalityConfig {
  title: string;
  /** Candidate headline cards (self-trim to those with data). */
  headlineKeys: readonly string[];
  /** Summable metrics for the activity-over-time chart. */
  trendKeys: readonly string[];
  /** Metric whose per-person distribution the histogram shows. */
  distKey: string;
  distTitle: string;
  distCaption: string;
  /** Axis caption naming the distributed quantity, e.g. "messages per person". */
  distUnitLabel: string;
  /** Summable metrics for the top-decile concentration cards. */
  concentrationKeys: readonly string[];
}

const OVERVIEW_MODALITY: ModalityConfig = {
  title: "Collaboration",
  headlineKeys: ["collab.messages_sent", "collab.meeting_hours", "collab.focus_time_pct"],
  trendKeys: ["collab.messages_sent", "collab.meeting_hours"],
  distKey: "collab.meeting_hours",
  distTitle: "Meeting-load distribution",
  distCaption:
    "How many people fall in each meeting-hours band — a long right tail means a few people carry an outsized meeting load.",
  distUnitLabel: "meeting hours per person",
  concentrationKeys: ["collab.meeting_hours", "collab.messages_sent"],
};

// Messaging leans on `messages_sent` (solid) + intensity/consistency. It does
// NOT split channel-vs-DM (channel_posts is largely honest-NULL) and does NOT
// break messages down by tool: the metric's own explanation warns cross-tool
// counts aren't comparable (Slack over-counts thread replies, M365 merges
// chat+channel), so a tool-share bar would mislead.
const MESSAGING_MODALITY: ModalityConfig = {
  title: "Messaging",
  headlineKeys: ["collab.messages_sent", "collab.msgs_per_active_day", "collab.active_days"],
  trendKeys: ["collab.messages_sent"],
  distKey: "collab.messages_sent",
  distTitle: "Messaging-load distribution",
  distCaption:
    "How many people fall in each message-volume band — a long right tail means a few people account for most of the chatter.",
  distUnitLabel: "messages per person",
  concentrationKeys: ["collab.messages_sent"],
};

const MEETINGS_MODALITY: ModalityConfig = {
  title: "Meetings",
  headlineKeys: ["collab.meeting_hours", "collab.meetings_count", "collab.meeting_free_days"],
  trendKeys: ["collab.meeting_hours"],
  distKey: "collab.meeting_hours",
  distTitle: "Meeting-load distribution",
  distCaption:
    "How many people fall in each meeting-hours band — a long right tail means a few people carry an outsized meeting load.",
  distUnitLabel: "meeting hours per person",
  concentrationKeys: ["collab.meeting_hours"],
};

// `emails_received` is deliberately omitted: it's dominated by distribution
// lists and CI/alert mail (people hit 100k+), so as a headline it reads as
// misleading inbox-volume noise. `emails_sent` (effort) and `emails_read`
// (inbound engagement) are the honest signals.
const EMAIL_MODALITY: ModalityConfig = {
  title: "Email",
  headlineKeys: ["collab.emails_sent", "collab.emails_read"],
  trendKeys: ["collab.emails_sent"],
  distKey: "collab.emails_sent",
  distTitle: "Email-volume distribution",
  distCaption:
    "How many people fall in each sent-email band — a long right tail means a few people send most of the email.",
  distUnitLabel: "emails sent per person",
  concentrationKeys: ["collab.emails_sent"],
};

const FILES_MODALITY: ModalityConfig = {
  title: "Files & sharing",
  headlineKeys: ["collab.files_shared", "collab.files_engaged", "collab.files_shared_external"],
  trendKeys: ["collab.files_shared"],
  distKey: "collab.files_shared",
  distTitle: "File-sharing distribution",
  distCaption:
    "How many people fall in each files-shared band — a long right tail means a few people do most of the sharing.",
  distUnitLabel: "files shared per person",
  concentrationKeys: ["collab.files_shared"],
};

// Focus time is a ratio, so there's no summable trend and top-decile
// concentration is meaningless; the distribution is the story — how many people
// have little protected focus. Its bins render as whole percents.
const FOCUS_MODALITY: ModalityConfig = {
  title: "Focus time",
  headlineKeys: ["collab.focus_time_pct", "collab.meeting_free_days"],
  trendKeys: [],
  distKey: "collab.focus_time_pct",
  distTitle: "Focus-time distribution",
  distCaption:
    "How many people fall in each focus-time band — a cluster on the left means many people have little uninterrupted focus time.",
  distUnitLabel: "focus time (share of working time) per person",
  concentrationKeys: [],
};

const LENS_CONFIG: Record<string, ModalityConfig> = {
  Overview: OVERVIEW_MODALITY,
  Messaging: MESSAGING_MODALITY,
  Meetings: MEETINGS_MODALITY,
  Email: EMAIL_MODALITY,
  "Files & sharing": FILES_MODALITY,
  "Focus time": FOCUS_MODALITY,
};

/**
 * Routes a Collaboration lens to its trend & balance screen. Every declared
 * lens has a config; unknown lenses fall back to an honest ComingSoon.
 */
export function CollaborationLensView({
  scopePerson,
  lens,
}: {
  scopePerson: string;
  lens: string;
}) {
  const config = LENS_CONFIG[lens];
  if (!config) {
    return (
      <Pending label={`“${lens}” isn't a distinct collaboration metric family yet.`} />
    );
  }
  return <ModalityView scopePerson={scopePerson} config={config} />;
}

function ModalityView({
  scopePerson,
  config,
}: {
  scopePerson: string;
  config: ModalityConfig;
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

  // The whole collaboration collection is fetched once (period+peer); every
  // lens just reads different keys out of it.
  const def = metricGroups().find((d) => d.id === "collaboration");
  const gridCollection = useMemo<MetricCollectionConfig>(
    () => (def ? { metrics: def.collection.metrics } : { metrics: [] }),
    [def],
  );

  const grid = useMemberGridData(
    gridCollection.metrics.length ? gridCollection : EMPTY_COLLECTION,
    { type: "person", ids: memberIds },
    dateRange,
    period,
  );

  // Trend: the lens's summable metrics that actually have data, summed per
  // bucket over the roster. Bucket coarsens with roster size so the org-wide
  // per-member timeseries stays under the backend's projected-row limit
  // (members × metrics × buckets) instead of failing the whole request.
  const trendKeys = useMemo(
    () => config.trendKeys.filter((k) => grid.byKey.get(k)?.computation === "sum"),
    [config.trendKeys, grid.byKey],
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

  if (!def) return <Pending label="Collaboration group missing from the registry." />;
  const gate = orgScopeGate({
    viewerLoading: viewerQ.isLoading,
    viewerError: viewerQ.isError,
    membersLoading: membersQ.isLoading,
    membersError: membersQ.isError,
    memberCount: members.length,
    gridPending: grid.isPending,
    gridError: grid.isError,
    emptyLabel:
      "No team under this node — pick a manager (or the org root) to see collaboration across their team.",
    onRetry: () => {
      viewerQ.refetch();
      membersQ.refetch();
      grid.refetch();
    },
  });
  if (gate) return gate;

  // ── Trend headline: per-person representative + period-over-period delta ──
  const headline = config.headlineKeys
    .map((key) => {
      const r = grid.byKey.get(key);
      if (!r) return null;
      const now = representative(r, memberIds);
      const prev = representative(grid.previousByKey.get(key), memberIds);
      if (now == null) return null;
      return {
        key,
        label: r.short_label ?? r.label,
        r,
        now,
        prev,
        perPerson: r.computation === "sum",
        teamTotal:
          r.computation === "sum"
            ? memberIds.reduce((acc, id) => acc + (forEntity(r, id).value ?? 0), 0)
            : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  // Metrics of very different magnitude/unit (messages ~100k vs meeting hours
  // ~1k) share no scale — give the second series its own right axis so neither
  // collapses to a flat line.
  const trendSeries = trendKeys
    .map((key, i) => {
      const r = grid.byKey.get(key);
      return r
        ? {
            key,
            label: r.short_label ?? r.label,
            type: "line" as const,
            yAxisId: (i === 0 ? "left" : "right") as "left" | "right",
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  const trendHasRightAxis = trendSeries.some((s) => s.yAxisId === "right");
  const trendData = buildTrendData(
    trendSeries.map((s) => s.key),
    trend.byKey,
    memberIds,
  );

  // ── Balance: distribution of the lens's primary metric + concentration ──
  const distR = grid.byKey.get(config.distKey);
  const distValues = distR
    ? memberIds
        .map((id) => forEntity(distR, id).value)
        .filter((v): v is number => v != null && Number.isFinite(v) && v >= 0)
    : [];
  // Label bins the same way the metric formats elsewhere (percent metrics are
  // stored as 0–100 and only get a "%" suffix — no ×100); counts stay compact.
  const distFmt =
    distR?.format === "percent"
      ? (n: number) => formatMetricValue(n, "percent", null)
      : fmtCompact;
  const distRows = distribution(distValues, distFmt);

  const concentration = config.concentrationKeys
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

  const hasTrend = trendSeries.length > 0 && trendData.length > 1;
  // Honest empty state: this lens's metrics simply aren't populated for the
  // current team/period — say so rather than render an empty shell.
  if (headline.length === 0 && !hasTrend && distRows.length === 0 && concentration.length === 0) {
    return (
      <Pending
        label={`No ${config.title.toLowerCase()} data for this team and period yet — the source may not be ingested here.`}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{config.title}</h1>
        <p className="text-sm text-muted-foreground">
          {members.length} members · trend &amp; balance
        </p>
      </div>

      {/* ── Trend: per-person load with direction-aware deltas ── */}
      {headline.length > 0 ? (
        <section className="flex flex-col gap-3">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Per person · vs previous period
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
            {headline.map((h) => (
              <Card key={h.key}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-muted-foreground">{h.label}</div>
                    <Delta now={h.now} prev={h.prev} direction={h.r.direction} />
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {formatMetricValue(
                      h.perPerson ? perCapita(h.r, memberIds) : h.now,
                      h.r.format,
                      h.r.unit,
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {h.perPerson
                      ? `per active person · ${formatMetricValue(h.teamTotal ?? 0, h.r.format, h.r.unit)} team total`
                      : "median / person"}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {trendSeries.length > 0 && trendData.length > 1 ? (
        <SectionTrend
          title="Activity over time"
          description={`Team totals · per ${trendBucket}`}
          series={trendSeries}
          data={trendData}
          rightAxis={trendHasRightAxis}
          isPending={trend.isPending}
        />
      ) : trend.isError ? (
        <Note text="Activity trend couldn't be loaded for this period." />
      ) : null}

      {/* ── Balance: is the load shared or carried by a few? ── */}
      {distRows.length > 0 ? (
        <section className="flex flex-col gap-3">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {config.distTitle} · {distValues.length} people
          </p>
          <Card>
            <CardContent className="p-4">
              <p className="mb-3 text-xs text-muted-foreground">{config.distCaption}</p>
              <ChartContainer config={DIST_CONFIG} className="h-56 w-full">
                <BarChart data={distRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                          (p?.[0]?.payload as DistRow | undefined)?.range ?? ""
                        }
                      />
                    }
                  />
                  <ChartBar dataKey="count" name="People" radius={[2, 2, 0, 0]} fill="var(--chart-1)" />
                </BarChart>
              </ChartContainer>
              <p className="mt-1 text-center text-[10px] text-muted-foreground">
                {config.distUnitLabel}
              </p>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {concentration.length > 0 ? (
        <section className="flex flex-col gap-3">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Load concentration · top 10% of contributors
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-3">
            {concentration.map((c) => (
              <Card key={c.key}>
                <CardContent className="p-4">
                  <div className="text-xs font-medium text-muted-foreground">{c.label}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {Math.round(c.share * 100)}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    carried by the busiest {Math.max(1, Math.ceil(c.contributors * 0.1))} of{" "}
                    {c.contributors} · even share ≈ 10%
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Representative period value: total for sums, org median otherwise. */
function representative(
  r: NormalizedMetricResult | undefined,
  ids: readonly string[],
): number | null {
  if (!r) return null;
  const vals = ids
    .map((id) => forEntity(r, id).value)
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (!vals.length) return null;
  if (r.computation === "sum") return vals.reduce((a, b) => a + b, 0);
  return quantile([...vals].sort((a, b) => a - b), 0.5);
}

/** Per-active-person mean for a summable metric (denominator = value > 0). */
function perCapita(r: NormalizedMetricResult, ids: readonly string[]): number {
  let total = 0;
  let active = 0;
  for (const id of ids) {
    const v = forEntity(r, id).value;
    if (v != null && Number.isFinite(v) && v > 0) {
      total += v;
      active += 1;
    }
  }
  return active ? total / active : 0;
}

interface DistRow {
  /** Compact lower-edge tick, e.g. "10" or "1k". */
  label: string;
  /** Full band for the tooltip, e.g. "10–15". */
  range: string;
  count: number;
}

const DIST_CONFIG: ChartConfig = { count: { label: "People" } };

/**
 * Frequency distribution of per-person values into evenly-spaced bands, as a
 * histogram (band → people count). Bin width adapts to the data via a 1/2/5
 * ladder so the shape (right-skew, tail) is legible instead of a few coarse
 * blocks. X ticks show the lower edge; the tooltip shows the full band. Labels
 * are unit-agnostic (the caption names the unit) so this works for hours,
 * message counts, or anything else.
 */
function distribution(
  values: readonly number[],
  fmt: (n: number) => string,
): DistRow[] {
  if (values.length < 4) return [];
  const max = Math.max(...values);
  if (max <= 0) return [];
  const step = chooseStep(max, 14);
  const nBins = Math.max(1, Math.ceil(max / step));
  const counts = new Array(nBins).fill(0) as number[];
  for (const v of values) {
    counts[Math.min(nBins - 1, Math.floor(v / step))] += 1;
  }
  return counts.map((count, i) => ({
    label: fmt(i * step),
    range: `${fmt(i * step)}–${fmt((i + 1) * step)}`,
    count,
  }));
}

/**
 * Smallest whole 1/2/5·10ⁿ step whose bin count stays at or under `maxBins`.
 * Steps start at 1 so integer counters (messages, files) never get fractional
 * bands like "0.5 files"; percent metrics are 0–100 here, so integer steps
 * (e.g. 10%) cover them too.
 */
function chooseStep(max: number, maxBins: number): number {
  const mults = [1, 2, 5];
  for (let pow = 0; pow < 12; pow++) {
    for (const m of mults) {
      const step = m * Math.pow(10, pow);
      if (Math.ceil(max / step) <= maxBins) return step;
    }
  }
  return max;
}

/** Share of the total held by the busiest 10% of contributors. */
function topDecileShare(values: readonly number[]): number | null {
  if (values.length < 4) return null;
  const sorted = [...values].sort((a, b) => b - a);
  const total = sorted.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const topN = Math.max(1, Math.ceil(sorted.length * 0.1));
  const top = sorted.slice(0, topN).reduce((a, b) => a + b, 0);
  return top / total;
}

/** Compact axis number: 1500 → "1.5k", 10 → "10", 2.5 → "2.5". */
function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1000) {
    const k = n / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
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

function Note({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
      {text}
    </p>
  );
}

function Pending({ label }: { label: string }) {
  return (
    <div className="mx-auto w-full max-w-md p-8">
      <ComingSoon variant="card" state="empty" label={label} />
    </div>
  );
}
