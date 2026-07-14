import { useMemo, useState } from "react";

import { ComingSoon } from "@/components/widgets/coming-soon";
import { DashboardEmptyState } from "@/components/widgets/v2/dashboard-empty-state";
import { DashboardHeader } from "@/components/widgets/v2/dashboard-header";
import { SectionCard } from "@/components/widgets/v2/section-card";
import { GroupDrilldownSheet } from "@/components/widgets/v2/group-drilldown-sheet";
import { MembersHeatmap } from "@/components/widgets/v2/members-heatmap";
import { TeamMembersAttention } from "@/components/widgets/v2/team-members-attention";
import { TeamMetricGroupCard } from "@/components/widgets/metric-views/team-metric-group-card";
import type { TeamMemberRef } from "@/components/widgets/metric-views/team-collection-drilldown";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useCatalog } from "@/api/use-catalog";
import { usePeriod } from "@/hooks/use-period";
import {
  flattenSubordinates,
  findIdentityNode,
  hasIndirectReports,
  scopeRosterToDirectReports,
} from "@/lib/insight/identity-tree";
import {
  GROUPS,
  legacyGroups,
  metricGroups,
  type GroupId,
} from "@/lib/insight/groups";
import {
  memberMetricEntries,
  metricBelowCounts,
} from "@/lib/insight/team-metrics";
import { orderRowsForSection } from "@/lib/insight/v2/metric-order";
import { hasBulletValue } from "@/lib/insight/v2/peer-status";
import { teamSectionStatusByMetric } from "@/lib/insight/v2/team-member-status";
import { projectViews } from "@/lib/metrics/collection";
import { normalizePersonId } from "@/lib/metrics/entity";
import { useIcPerson } from "@/queries/ic-dashboard";
import { useMetricCollectionSet } from "@/queries/metric-results";
import {
  useTeamBulletSections,
  useTeamMembers,
} from "@/queries/team-view";
import {
  useDeptDistributions,
  useTeamMemberBullets,
  useTeamMemberBulletsPrevious,
} from "@/queries/v2/team-extras";
import type { BulletMetric } from "@/types/insight";

const LEGACY_GROUP_IDS = legacyGroups().map((def) => def.id);

// Team surfaces request period + peer only: a per-member timeseries over a
// large roster would exceed the backend's all-or-nothing row limit and fail
// the whole request.
const TEAM_METRIC_COLLECTIONS = metricGroups().map((def) => ({
  key: def.id,
  collection: projectViews(def.collection, ["period", "peer"]),
}));

export interface TeamViewV2ScreenProps {
  teamId: string;
  viewerEmail: string;
}

export function TeamViewV2Screen({ teamId, viewerEmail }: TeamViewV2ScreenProps) {
  const { period, dateRange, setPeriod } = usePeriod();
  const { byMetricKey } = useCatalog();
  const [openGroup, setOpenGroup] = useState<GroupId | null>(null);
  const [directReportsOnly, setDirectReportsOnly] = useState(true);

  // Close any open drilldown when the viewed team changes. Render-phase
  // reset against the previous id rather than an effect (no cascading commit).
  const [prevTeamId, setPrevTeamId] = useState(teamId);
  if (teamId !== prevTeamId) {
    setPrevTeamId(teamId);
    setOpenGroup(null);
  }

  const viewerQ = useIcPerson(viewerEmail);
  const viewerTree = viewerQ.data ?? null;

  const pivot = useMemo(() => {
    if (!viewerTree) return null;
    if (teamId.includes("@")) return findIdentityNode(viewerTree, teamId);
    return null;
  }, [viewerTree, teamId]);

  const fullRoster = useMemo(
    () => (pivot ? flattenSubordinates(pivot) : null),
    [pivot],
  );
  // With no indirect reports, direct reports == the whole team, so the
  // toggle could never change the roster — hide it (#1756).
  const canScopeToDirectReports = hasIndirectReports(fullRoster);
  // Scoping the roster scopes everything downstream — members, heatmap
  // bullets, legacy sections, and metric collections all derive from it.
  const roster = useMemo(
    () =>
      scopeRosterToDirectReports(
        fullRoster,
        canScopeToDirectReports && directReportsOnly,
      ),
    [fullRoster, canScopeToDirectReports, directReportsOnly],
  );
  const teamName = pivot?.display_name ?? teamId;
  const teamSize = roster?.length;

  const membersQ = useTeamMembers(teamId, roster, period, dateRange, {
    keepPrevious: true,
  });
  const members = membersQ.data ?? [];
  const memberIds = members.map((m) => m.person_id);
  const memberEntityIds = memberIds.map(normalizePersonId);
  const memberRefs: TeamMemberRef[] = members.map((m) => ({
    entityId: normalizePersonId(m.person_id),
    displayName: m.name,
  }));
  const bulletsQ = useTeamMemberBullets(memberIds, period, dateRange);
  const prevBulletsQ = useTeamMemberBulletsPrevious(
    memberIds,
    period,
    dateRange,
  );

  const orgUnitIds = [
    ...new Set(
      members
        .map((m) => m.org_unit_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const deptDistQ = useDeptDistributions(orgUnitIds, period, dateRange);

  const sectionsQ = useTeamBulletSections(
    LEGACY_GROUP_IDS,
    teamId,
    teamSize,
    period,
    dateRange,
    { keepPrevious: true, roster },
  );

  const metricGroupData = useMetricCollectionSet(
    TEAM_METRIC_COLLECTIONS,
    { type: "person", ids: memberEntityIds },
    dateRange,
  );

  const sectionData = sectionsQ.data;
  const legacyRowsByGroup: Record<string, BulletMetric[]> =
    Object.fromEntries(
      LEGACY_GROUP_IDS.map((id) => [
        id,
        orderRowsForSection(id, sectionData?.bySection[id] ?? []),
      ]),
    );

  const metricBelowByMember = new Map<string, number>();
  for (const def of metricGroups()) {
    const byKey = metricGroupData.get(def.id)?.byKey;
    if (!byKey) continue;
    for (const [memberId, count] of metricBelowCounts(
      def,
      byKey,
      memberEntityIds,
    )) {
      metricBelowByMember.set(
        memberId,
        (metricBelowByMember.get(memberId) ?? 0) + count,
      );
    }
  }

  // Per-person unified-path entries (git/ai) feed the heatmap's member
  // details sheet — the legacy per-member bullet fetch no longer covers
  // groups that flipped to `kind: "metrics"`.
  const metricEntriesByPerson = memberMetricEntries(
    metricGroups(),
    (id) => metricGroupData.get(id)?.byKey,
    memberEntityIds,
  );

  const sectionsPending = sectionsQ.isPending;
  const sectionsFetching = sectionsQ.isFetching;
  // Only a metric group's revalidation dims the page (replacing data already
  // shown); its first load has no prior data and shows its own card spinner.
  const isMetricsRevalidating = [...metricGroupData.values()].some(
    (result) => result.isFetching && !result.isPending,
  );
  const isFetching =
    sectionsFetching ||
    membersQ.isFetching ||
    bulletsQ.isFetching ||
    isMetricsRevalidating;
  const hasGroupData = Object.values(legacyRowsByGroup).some((rows) =>
    rows.some(hasBulletValue),
  );
  const hasMembers = members.length > 0;
  const isAllEmpty =
    !sectionsPending &&
    !membersQ.isPending &&
    !hasGroupData &&
    !hasMembers;
  const showFullSpinner =
    sectionsPending || membersQ.isPending || (isAllEmpty && isFetching);

  const memberCountLabel = `${members.length} member${members.length === 1 ? "" : "s"}`;
  const scopeLabel = directReportsOnly
    ? `Direct reports of ${teamName}`
    : `${teamName}'s department`;

  return (
    <div className="flex flex-col">
      <DashboardHeader
        title={`Team of ${teamName}`}
        subtitle={
          canScopeToDirectReports
            ? `${scopeLabel} · ${memberCountLabel}`
            : memberCountLabel
        }
        person={teamId}
        hasReports
        actions={
          canScopeToDirectReports && fullRoster ? (
            <label className="text-foreground flex cursor-pointer items-center gap-2 text-sm select-none">
              <Switch
                checked={directReportsOnly}
                onCheckedChange={setDirectReportsOnly}
              />
              <span>Direct reports only</span>
              <span className="text-muted-foreground text-xs">
                ({roster?.length ?? 0}/{fullRoster.length})
              </span>
            </label>
          ) : null
        }
      />
      <main className="flex flex-1 flex-col gap-8 p-4 md:p-6">
        {showFullSpinner ? (
          <div className="flex min-h-[70vh] items-center justify-center">
            <Spinner className="size-12 text-muted-foreground" />
          </div>
        ) : isAllEmpty ? (
          <div
            className={cn("transition-opacity", isFetching && "opacity-60")}
          >
            <DashboardEmptyState period={period} onSetPeriod={setPeriod} />
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-col gap-8 transition-opacity",
              isFetching && "opacity-60",
            )}
          >
            <TeamMembersAttention
              members={members}
              bulletsByPerson={bulletsQ.data}
              deptCohorts={deptDistQ.data}
              metricBelowByMember={metricBelowByMember}
            />

            {membersQ.isError ? (
              <ComingSoon
                state="error"
                label="Heatmap — unable to load"
                onRetry={() => membersQ.refetch()}
              />
            ) : (
              <MembersHeatmap
                members={members}
                bulletsByPerson={bulletsQ.data}
                previousBulletsByPerson={prevBulletsQ.data}
                deptCohorts={deptDistQ.data}
                metricEntriesByPerson={metricEntriesByPerson}
              />
            )}

            <section className="flex flex-col gap-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Sections
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                {GROUPS.map((def) => {
                  if (def.kind === "metrics") {
                    const result = metricGroupData.get(def.id);
                    if (!result) return null;
                    return (
                      <TeamMetricGroupCard
                        key={def.id}
                        def={def}
                        data={result}
                        memberIds={memberEntityIds}
                        onOpen={() => setOpenGroup(def.id)}
                        subtitle="vs department peers"
                      />
                    );
                  }
                  if (sectionsQ.isError || sectionData?.errors[def.id]) {
                    return (
                      <SectionCard
                        key={def.id}
                        title={def.title}
                        sectionId={def.id}
                        rows={[]}
                        onOpen={() => {}}
                        unavailable
                      />
                    );
                  }
                  return (
                    <SectionCard
                      key={def.id}
                      title={def.title}
                      sectionId={def.id}
                      rows={legacyRowsByGroup[def.id] ?? []}
                      statusByMetricKey={teamSectionStatusByMetric(
                        legacyRowsByGroup[def.id] ?? [],
                        members,
                        bulletsQ.data,
                        deptDistQ.data,
                        byMetricKey,
                      )}
                      onOpen={() => setOpenGroup(def.id)}
                      subtitle="vs department peers"
                    />
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </main>

      {GROUPS.map((def) => (
        <GroupDrilldownSheet
          key={def.id}
          open={openGroup === def.id}
          onOpenChange={(o) => setOpenGroup(o ? def.id : null)}
          def={def}
          rows={legacyRowsByGroup[def.id] ?? []}
          metricTarget={
            def.kind === "metrics"
              ? {
                  kind: "team",
                  members: memberRefs,
                  data:
                    metricGroupData.get(def.id) ??
                    ({
                      byKey: new Map(),
                      previousByKey: null,
                      isPending: true,
                      isFetching: false,
                      isError: false,
                      refetch: () => {},
                    } as const)
                }
              : undefined
          }
          cohortLabel="department"
        />
      ))}
    </div>
  );
}
