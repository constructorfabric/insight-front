import { useMemo, useState } from "react";

import { AttentionList } from "@/components/portal/attention-list";
import { orgScopeGate } from "@/components/portal/org-scope-gate";
import { MembersGrid } from "@/components/widgets/v2/members-grid";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { usePeriod } from "@/hooks/use-period";
import { formatMetricValue } from "@/lib/format";
import {
  attentionSummary,
  computeAttentionFlags,
} from "@/lib/insight/attention-flags";
import {
  flattenSubordinates,
  findIdentityNode,
  hasIndirectReports,
  scopeRosterToDirectReports,
} from "@/lib/insight/identity-tree";
import { metricGroups } from "@/lib/insight/groups";
import {
  availableSlices,
  cohortKey,
  collectRosterAttrs,
  type SliceDim,
} from "@/lib/insight/slices";
import { quantile, withinCohortPeer } from "@/lib/insight/within-team-peer";
import {
  forEntity,
  type MetricCollectionConfig,
  type NormalizedMetricResult,
} from "@/lib/metrics/collection";
import { normalizePersonId } from "@/lib/metrics/entity";
import { usePortalSlice } from "@/lib/portal/portal-store";
import { useIcPerson } from "@/queries/ic-dashboard";
import { useTeamMembers } from "@/queries/team-view";
import { useMemberGridData } from "@/queries/v2/member-grid";

const EMPTY_COLLECTION: MetricCollectionConfig = { metrics: [] };

/**
 * Team-state dashboard — the People roster reframed for a lead: "what's the
 * overall state, and where do I look?". Peer-cohort stats aren't computed yet,
 * so signals are honest and self-contained:
 *   • outlier — a member in the worse quartile *within this team*;
 *   • decline — a member's metric materially worse than last period;
 *   • collapse — zero on an activity the team otherwise shows.
 * The AI summary is rule-based for now (a real insights endpoint would slot in).
 */
export function TeamStateView({ scopePerson }: { scopePerson: string }) {
  const { period, dateRange } = usePeriod();

  const viewerQ = useIcPerson(scopePerson);
  const tree = viewerQ.data ?? null;
  const pivot = useMemo(
    () => (tree && scopePerson.includes("@") ? findIdentityNode(tree, scopePerson) : null),
    [tree, scopePerson],
  );
  const fullRoster = useMemo(
    () => (pivot ? flattenSubordinates(pivot) : null),
    [pivot],
  );
  // With no indirect reports the toggle can't change anything — hide it.
  const canScope = hasIndirectReports(fullRoster);
  const [directOnly, setDirectOnly] = useState(true);
  const roster = useMemo(
    () => scopeRosterToDirectReports(fullRoster, canScope && directOnly),
    [fullRoster, canScope, directOnly],
  );

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

  // Active slice → each person's peer cohort (whole roster when no slice set).
  const attrByEntity = useMemo(
    () => collectRosterAttrs(pivot, normalizePersonId),
    [pivot],
  );
  const sliceDims = useMemo<SliceDim[]>(
    () => availableSlices(attrByEntity.values()),
    [attrByEntity],
  );
  const slice = usePortalSlice();
  const cohortOf = useMemo(
    () => (id: string) => cohortKey(attrByEntity.get(id), slice),
    [attrByEntity, slice],
  );
  const cohortLabel = slice
    ? (sliceDims.find((d) => d.key === slice)?.label ?? "cohort").toLowerCase()
    : "team";

  const groups = metricGroups();
  // Headline metrics only (card.preview): the set a lead scans, and — crucially —
  // small enough to stay under the API's 50-metrics-per-request cap when the full
  // metric catalog across every group would blow past it.
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

  const teamName = pivot?.display_name ?? "";

  // ── Headline: team totals (summable) / medians (everything else) ──
  const summary = useMemo(() => {
    return headlineKeys
      .map((key) => grid.byKey.get(key))
      .filter((r): r is NormalizedMetricResult => Boolean(r))
      .map((r) => {
        const vals = memberIds
          .map((id) => forEntity(r, id).value)
          .filter((v): v is number => v != null && Number.isFinite(v));
        if (vals.length === 0) return null;
        const isSum = r.computation === "sum";
        const value = isSum
          ? vals.reduce((a, b) => a + b, 0)
          : quantile([...vals].sort((a, b) => a - b), 0.5);
        return {
          key: r.metric_key,
          label: r.short_label ?? r.label,
          text: formatMetricValue(value, r.format, r.unit),
          kind: isSum ? "team total" : "team median",
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .slice(0, 6);
  }, [headlineKeys, grid.byKey, memberIds]);

  // ── Attention: shared within-cohort outliers + declines + collapses ──
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
        cohortLabel,
      }),
    [
      headlineKeys,
      grid.byKey,
      grid.previousByKey,
      memberIds,
      nameByEntity,
      emailByEntity,
      cohortOf,
      cohortLabel,
    ],
  );

  // Columns with data for at least one member (drop all-empty ones, e.g. the
  // un-ingested task metrics), and a within-team heat overlay for the grid.
  const shownKeys = useMemo(
    () =>
      headlineKeys.filter((k) => {
        const r = grid.byKey.get(k);
        return (
          !!r &&
          memberIds.some((id) => {
            const v = forEntity(r, id).value;
            return v != null && Number.isFinite(v);
          })
        );
      }),
    [headlineKeys, grid.byKey, memberIds],
  );
  const heatByKey = useMemo(() => {
    const m = new Map<string, NormalizedMetricResult>();
    for (const k of shownKeys) {
      const r = grid.byKey.get(k);
      if (r) m.set(k, withinCohortPeer(r, memberIds, cohortOf));
    }
    return m;
  }, [shownKeys, grid.byKey, memberIds, cohortOf]);

  const gate = orgScopeGate({
    viewerLoading: viewerQ.isLoading,
    viewerError: viewerQ.isError,
    membersLoading: membersQ.isLoading,
    membersError: membersQ.isError,
    memberCount: members.length,
    gridPending: grid.isPending,
    gridError: grid.isError,
    emptyLabel: "No team under this node — pick a manager or the org root.",
    onRetry: () => {
      viewerQ.refetch();
      membersQ.refetch();
      grid.refetch();
    },
  });
  if (gate) return gate;

  const flaggedPeople = new Set(flags.map((f) => f.email)).size;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {teamName ? `${teamName}'s team` : "Team"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {members.length} {directOnly && canScope ? "direct reports" : "people"} ·
            state &amp; attention
          </p>
        </div>
        {canScope && fullRoster ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground select-none">
            <Switch checked={directOnly} onCheckedChange={setDirectOnly} />
            <span>Direct reports only</span>
            <span className="text-xs text-muted-foreground">
              ({roster?.length ?? 0}/{fullRoster.length})
            </span>
          </label>
        ) : null}
      </div>

      {/* Team state at a glance */}
      {summary.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
          {summary.map((s) => (
            <Card key={s.key}>
              <CardContent className="p-4">
                <div className="text-xs font-medium text-muted-foreground">{s.label}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{s.text}</div>
                <div className="text-xs text-muted-foreground">{s.kind}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* What to look at — shared with the org Overview */}
      <AttentionList
        flags={flags}
        summary={attentionSummary(flags, flaggedPeople, members.length)}
        peopleLabel={
          flags.length > 0 ? `${flaggedPeople} of ${members.length} people` : undefined
        }
      />

      {/* Detailed scan */}
      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Members
        </p>
        <Card>
          <CardContent className="p-0">
            <MembersGrid
              members={members.map((m) => ({
                entityId: normalizePersonId(m.person_id),
                displayName: m.name,
                personId: m.person_id,
              }))}
              metricKeys={shownKeys}
              byKey={heatByKey}
              previousByKey={grid.previousByKey}
              caption={`${teamName} — members × metrics`}
              cohortLabel="team"
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

