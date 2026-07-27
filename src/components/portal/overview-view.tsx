import { useMemo, type ReactNode } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

import { AttentionList } from "@/components/portal/attention-list";
import { CenteredSpinner } from "@/components/widgets/centered-spinner";
import { ComingSoon } from "@/components/widgets/coming-soon";
import { orgScopeGate } from "@/components/portal/org-scope-gate";
import { SectionTrend, type SectionTrendPoint } from "@/components/widgets/v2/section-trend";
import { buildTrendData } from "@/lib/portal/trend-data";
import { Card, CardContent } from "@/components/ui/card";
import { usePeriod } from "@/hooks/use-period";
import { formatMetricValue } from "@/lib/format";
import {
  attentionSummary,
  computeAttentionFlags,
} from "@/lib/insight/attention-flags";
import { flattenSubordinates, findIdentityNode } from "@/lib/insight/identity-tree";
import { metricGroups, type GroupId } from "@/lib/insight/groups";
import {
  cohortKey,
  collectRosterAttrs,
  availableSlices,
} from "@/lib/insight/slices";
import { quantile } from "@/lib/insight/within-team-peer";
import {
  forEntity,
  type MetricCollectionConfig,
  type NormalizedMetricResult,
} from "@/lib/metrics/collection";
import { normalizePersonId } from "@/lib/metrics/entity";
import { setPortalDir, setPortalZone, usePortalSlice } from "@/lib/portal/portal-store";
import { useIcPerson } from "@/queries/ic-dashboard";
import { useTeamMembers } from "@/queries/team-view";
import { useMetricCollection } from "@/queries/metric-results";
import { useMemberGridData } from "@/queries/v2/member-grid";

const EMPTY_COLLECTION: MetricCollectionConfig = { metrics: [] };

interface OverviewDirection {
  label: string;
  groups: readonly GroupId[];
  go: () => void;
}
const DIRECTIONS: readonly OverviewDirection[] = [
  {
    label: "Development",
    groups: ["git_output", "task_delivery"],
    go: () => {
      setPortalDir("dev");
      setPortalZone("directions");
    },
  },
  {
    label: "Collaboration",
    groups: ["collaboration"],
    go: () => {
      setPortalDir("collab");
      setPortalZone("directions");
    },
  },
  {
    label: "Knowledge / Wiki",
    groups: ["wiki"],
    go: () => {
      setPortalDir("wiki");
      setPortalZone("directions");
    },
  },
  { label: "AI & Cost", groups: ["ai_adoption"], go: () => setPortalZone("aicost") },
];

/** Trend + contribution headline metrics (summable counters). */
const TREND_KEYS = ["git.commits", "git.prs_merged", "collab.messages_sent"];
const CONTRIB_KEY = "git.commits";

/**
 * Overview — org-level, cross-domain rollup (whole org under the viewer). Six
 * sections, each real: totals glance, per-direction cards, org trend, org-wide
 * attention (cohort-aware), a domain-coverage radar, and a contribution
 * breakdown by the active slice. Period + slice come from the global bar.
 */
export function OverviewView({
  scopePerson,
  item,
}: {
  scopePerson: string;
  item: string | null;
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
  const nameByEntity = useMemo(
    () => new Map(members.map((m) => [normalizePersonId(m.person_id), m.name])),
    [members],
  );
  const emailByEntity = useMemo(
    () => new Map(members.map((m) => [normalizePersonId(m.person_id), m.person_id])),
    [members],
  );

  const slice = usePortalSlice();
  const attrByEntity = useMemo(
    () => collectRosterAttrs(tree, normalizePersonId),
    [tree],
  );
  const cohortOf = useMemo(
    () => (id: string) => cohortKey(attrByEntity.get(id), slice),
    [attrByEntity, slice],
  );
  const sliceLabel = slice
    ? (availableSlices(attrByEntity.values()).find((d) => d.key === slice)?.label ??
        "cohort").toLowerCase()
    : "team";

  const groups = metricGroups();
  const headlineKeys = useMemo(
    () => [...new Set(groups.flatMap((g) => g.card.preview))],
    [groups],
  );
  const gridCollection = useMemo<MetricCollectionConfig>(() => {
    const want = new Set(headlineKeys);
    const seen = new Set<string>();
    const metrics = groups
      .flatMap((g) => g.collection.metrics)
      .filter((m) => want.has(m.key) && !seen.has(m.key) && seen.add(m.key));
    return { metrics };
  }, [groups, headlineKeys]);

  const grid = useMemberGridData(
    gridCollection.metrics.length ? gridCollection : EMPTY_COLLECTION,
    { type: "person", ids: memberIds },
    dateRange,
    period,
  );

  const trendCollection = useMemo<MetricCollectionConfig>(
    () => ({
      metrics: TREND_KEYS.map((key) => ({
        key,
        views: [{ view: "timeseries" as const, bucket: "auto" as const }],
      })),
    }),
    [],
  );
  const trend = useMetricCollection(
    item === "trend" && memberIds.length ? trendCollection : EMPTY_COLLECTION,
    item === "trend" && memberIds.length
      ? { type: "person", ids: memberIds }
      : { type: "person", ids: [] },
    dateRange,
  );

  const agg = (key: string): { value: number; r: NormalizedMetricResult } | null => {
    const r = grid.byKey.get(key);
    if (!r) return null;
    const vals = memberIds
      .map((id) => forEntity(r, id).value)
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (vals.length === 0) return null;
    const value =
      r.computation === "sum"
        ? vals.reduce((a, b) => a + b, 0)
        : quantile([...vals].sort((a, b) => a - b), 0.5);
    return { value, r };
  };

  const flags = useMemo(
    () =>
      computeAttentionFlags({
        headlineKeys,
        byKey: grid.byKey,
        previousByKey: grid.previousByKey,
        memberIds,
        cohortOf,
        nameOf: (id) => nameByEntity.get(id) ?? id,
        emailOf: (id) => emailByEntity.get(id) ?? id,
        cohortLabel: sliceLabel,
      }),
    [headlineKeys, grid.byKey, grid.previousByKey, memberIds, cohortOf, nameByEntity, emailByEntity, sliceLabel],
  );

  const teamName = pivot?.display_name ?? "";

  const gate = orgScopeGate({
    viewerLoading: viewerQ.isLoading,
    viewerError: viewerQ.isError,
    membersLoading: membersQ.isLoading,
    membersError: membersQ.isError,
    memberCount: members.length,
    gridPending: grid.isPending,
    gridError: grid.isError,
    emptyLabel: "No org under this node.",
    onRetry: () => {
      viewerQ.refetch();
      membersQ.refetch();
      grid.refetch();
    },
  });
  if (gate) return gate;

  const activeAi = memberIds.filter(
    (id) => (forEntity(grid.byKey.get("ai.active_days") ?? EMPTY_R, id).value ?? 0) > 0,
  ).length;
  const flaggedPeople = new Set(flags.map((f) => f.email)).size;

  const Header = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
      <p className="text-sm text-muted-foreground">
        {teamName ? `${teamName}'s org` : "Org"} · {members.length} people · {activeAi} using AI
      </p>
    </div>
  );

  // ── Section router ──
  let body: ReactNode;
  if (item === "by-direction") {
    body = <ByDirection groups={groups} agg={agg} />;
  } else if (item === "trend") {
    body = <TrendSection trend={trend} memberIds={memberIds} byKey={grid.byKey} />;
  } else if (item === "attention") {
    body = (
      <AttentionList
        flags={flags}
        summary={attentionSummary(flags, flaggedPeople, members.length)}
        peopleLabel={`${flaggedPeople} of ${members.length} people`}
        max={30}
      />
    );
  } else if (item === "health") {
    body = <HealthRadar groups={groups} memberIds={memberIds} byKey={grid.byKey} />;
  } else if (item === "contribution") {
    body = (
      <Contribution
        byKey={grid.byKey}
        memberIds={memberIds}
        cohortOf={cohortOf}
        nameOf={(id) => nameByEntity.get(id) ?? id}
        sliceLabel={sliceLabel}
        sliced={Boolean(slice)}
      />
    );
  } else {
    // At a glance (default): totals + attention peek + direction cards.
    body = (
      <>
        <OrgHeadline agg={agg} />
        <AttentionList
          flags={flags}
          summary={attentionSummary(flags, flaggedPeople, members.length)}
          peopleLabel={`${flaggedPeople} of ${members.length} people`}
          max={5}
        />
        <ByDirection groups={groups} agg={agg} />
      </>
    );
  }

  return <div className="flex flex-col gap-6 p-4 md:p-6">{Header}{body}</div>;
}

const EMPTY_R = {
  metric_key: "",
  label: "",
  unit: null,
  computation: "sum",
  format: "number",
  direction: "neutral",
} as unknown as NormalizedMetricResult;

type Agg = (key: string) => { value: number; r: NormalizedMetricResult } | null;

function OrgHeadline({ agg }: { agg: Agg }) {
  const cards = [
    { key: "git.commits", label: "Commits" },
    { key: "git.prs_merged", label: "PRs merged" },
    { key: "collab.messages_sent", label: "Messages" },
    { key: "ai.cost", label: "AI cost" },
  ]
    .map((h) => {
      const a = agg(h.key);
      return a ? { label: h.label, text: formatMetricValue(a.value, a.r.format, a.r.unit) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (!cards.length) return null;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground">{c.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{c.text}</div>
            <div className="text-xs text-muted-foreground">org total</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ByDirection({
  groups,
  agg,
}: {
  groups: ReturnType<typeof metricGroups>;
  agg: Agg;
}) {
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        By direction
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-3">
        {DIRECTIONS.map((d) => {
          const keys = [
            ...new Set(
              groups.filter((g) => d.groups.includes(g.id)).flatMap((g) => g.card.preview),
            ),
          ];
          const rows = keys
            .map((k) => ({ k, a: agg(k) }))
            .filter((x): x is { k: string; a: NonNullable<ReturnType<Agg>> } => x.a != null);
          return (
            <button
              key={d.label}
              type="button"
              onClick={d.go}
              className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
            >
              <div className="text-sm font-semibold">{d.label}</div>
              {rows.length ? (
                <ul className="flex flex-col gap-1">
                  {rows.slice(0, 3).map(({ k, a }) => (
                    <li key={k} className="flex justify-between gap-2 text-sm">
                      <span className="truncate text-muted-foreground">
                        {a.r.short_label ?? a.r.label}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatMetricValue(a.value, a.r.format, a.r.unit)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-xs text-muted-foreground">No data this period.</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TrendSection({
  trend,
  memberIds,
  byKey,
}: {
  trend: {
    byKey: Map<string, NormalizedMetricResult>;
    isPending: boolean;
    isError: boolean;
    refetch: () => void;
  };
  memberIds: readonly string[];
  byKey: Map<string, NormalizedMetricResult>;
}) {
  const series = TREND_KEYS.map((key) => {
    const r = byKey.get(key);
    return { key, label: r?.short_label ?? r?.label ?? key, type: "line" as const };
  });
  const data = useMemo<SectionTrendPoint[]>(
    () => buildTrendData(TREND_KEYS, trend.byKey, memberIds),
    [trend.byKey, memberIds],
  );

  if (trend.isPending) return <CenteredSpinner className="min-h-64" />;
  // A real backend failure is distinct from the (expected) row-limit case — one
  // offers a retry, the other explains the org-scope limitation.
  if (trend.isError)
    return (
      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Org trend
        </p>
        <ComingSoon variant="card" state="error" onRetry={trend.refetch} />
      </section>
    );
  if (data.length === 0)
    return (
      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Org trend
        </p>
        <ComingSoon
          variant="card"
          state="empty"
          label="Org trend needs a server-side rollup — a per-member timeseries across the whole org exceeds the analytics API row limit. Scope to a team (People) for its trend today."
        />
      </section>
    );
  return (
    <SectionTrend
      title="Org trend"
      description="Org totals per period"
      series={series}
      data={data}
      isPending={trend.isPending}
    />
  );
}

function HealthRadar({
  groups,
  memberIds,
  byKey,
}: {
  groups: ReturnType<typeof metricGroups>;
  memberIds: readonly string[];
  byKey: Map<string, NormalizedMetricResult>;
}) {
  // Coverage = share of the org with any activity in each domain.
  const data = groups.map((g) => {
    const keys = g.card.preview;
    const active = memberIds.filter((id) =>
      keys.some((k) => {
        const r = byKey.get(k);
        return r && (forEntity(r, id).value ?? 0) > 0;
      }),
    ).length;
    const pct = memberIds.length ? Math.round((active / memberIds.length) * 100) : 0;
    return { domain: g.title, coverage: pct };
  });
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        Health radar
      </p>
      <Card>
        <CardContent className="p-4">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data} outerRadius="70%">
                <PolarGrid />
                <PolarAngleAxis dataKey="domain" tick={{ fontSize: 12 }} />
                <Radar
                  dataKey="coverage"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.25}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground">
            Coverage — % of the org with any activity in each domain this period.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

function Contribution({
  byKey,
  memberIds,
  cohortOf,
  nameOf,
  sliceLabel,
  sliced,
}: {
  byKey: Map<string, NormalizedMetricResult>;
  memberIds: readonly string[];
  cohortOf: (id: string) => string | null;
  nameOf: (id: string) => string;
  sliceLabel: string;
  sliced: boolean;
}) {
  const r = byKey.get(CONTRIB_KEY);
  const rows = useMemo(() => {
    if (!r) return [];
    const bucket = new Map<string, number>();
    for (const id of memberIds) {
      const v = forEntity(r, id).value ?? 0;
      if (v <= 0) continue;
      const key = sliced ? (cohortOf(id) ?? "—") : nameOf(id);
      bucket.set(key, (bucket.get(key) ?? 0) + v);
    }
    const total = [...bucket.values()].reduce((a, b) => a + b, 0) || 1;
    return [...bucket.entries()]
      .map(([label, value]) => ({ label, value, pct: Math.round((value / total) * 100) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, sliced ? 20 : 12);
  }, [r, memberIds, cohortOf, nameOf, sliced]);

  const max = rows[0]?.value || 1;
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        Contribution breakdown
      </p>
      {rows.length ? (
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
                    {formatMetricValue(row.value, r?.format ?? "integer", r?.unit ?? null)} ·{" "}
                    {row.pct}%
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <ComingSoon variant="card" state="empty" label="No contribution data this period." />
      )}
      <p className="text-xs text-muted-foreground">
        Share of commits by {sliced ? sliceLabel : "person"} — pick a slice above to
        break down by unit.
      </p>
    </section>
  );
}
