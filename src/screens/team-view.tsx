import { useMemo, useState } from "react";

import { AttentionNeeded } from "@/components/widgets/attention-needed";
import { DrillModal } from "@/components/widgets/drill-modal";
import { IcViewToggle } from "@/components/ic-view-toggle";
import { MembersTable } from "@/components/widgets/members-table";
import { TeamMetricsModal } from "@/components/widgets/team-metrics-modal";
import { PeriodSelectorBar } from "@/components/widgets/period-selector-bar";
import { TeamBulletSections } from "@/components/widgets/team-bullet-sections";
import { TeamHeroStrip } from "@/components/widgets/team-hero-strip";
import { ViewModeToggle } from "@/components/widgets/view-mode-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { useTeamViewConfig } from "@/api/view-configs";
import { usePeriod, useViewMode } from "@/hooks/use-period";
import {
  flattenSubordinates,
  findIdentityNode,
  hasIndirectReports,
} from "@/lib/insight/identity-tree";
import { getInitials } from "@/lib/insight/get-initials";
import { useTeamKpis } from "@/lib/insight/team-kpis";
import { useIcPerson } from "@/queries/ic-dashboard";
import {
  useTeamBulletSection,
  useTeamDrill,
  useTeamMembers,
  type TeamBulletSectionId,
  type TeamDrillTarget,
} from "@/queries/team-view";
import type { BulletMetric, TeamMember } from "@/types/insight";

export interface TeamViewScreenProps {
  /** Email of the team owner — the IR node whose subordinates form the roster. */
  teamId: string;
  /** Email of the viewer signed into the app — used to walk identity tree. */
  viewerEmail: string;
}

type BulletStatus = "loading" | "loaded" | "errored";
type BulletQ = ReturnType<typeof useTeamBulletSection>;

function bulletStatus(q: BulletQ): BulletStatus {
  if (q.isPending) return "loading";
  if (q.isError) return "errored";
  return "loaded";
}

function scopeAiBullets(
  metrics: BulletMetric[],
  members: TeamMember[],
): BulletMetric[] {
  const teamSize = members.length;
  const recompute: Record<string, number> = {
    active_ai_members: members.filter((m) => m.ai_tools.length > 0).length,
    cursor_active: members.filter((m) => m.ai_tools.includes("Cursor")).length,
    cc_active: members.filter((m) => m.ai_tools.includes("Claude Code")).length,
    codex_active: members.filter((m) => m.ai_tools.includes("Codex")).length,
  };
  return metrics.map((m) => {
    if (!(m.metric_key in recompute)) return m;
    const value = recompute[m.metric_key]!;
    const valuePct =
      teamSize > 0 ? Math.min(100, (value / teamSize) * 100) : 0;
    return {
      ...m,
      value: String(value),
      unit: `/ ${teamSize}`,
      range_min: "0",
      range_max: String(teamSize),
      median: "—",
      median_label: "",
      median_left_pct: 0,
      bar_left_pct: 0,
      bar_width_pct: valuePct,
    };
  });
}

export function TeamViewScreen({ teamId, viewerEmail }: TeamViewScreenProps) {
  const { period, customRange, dateRange, setPeriod, setCustomRange } =
    usePeriod();
  const { viewMode, setViewMode } = useViewMode();
  const [directReportsOnly, setDirectReportsOnly] = useState(true);
  const [drillTarget, setDrillTarget] = useState<TeamDrillTarget | null>(null);
  const [metricsModalOpen, setMetricsModalOpen] = useState(false);

  const viewerQ = useIcPerson(viewerEmail);
  const viewerTree = viewerQ.data ?? null;

  const pivot = useMemo(() => {
    if (!viewerTree) return null;
    if (teamId.includes("@")) return findIdentityNode(viewerTree, teamId);
    return null;
  }, [viewerTree, teamId]);

  const roster = useMemo(
    () => (pivot ? flattenSubordinates(pivot) : null),
    [pivot],
  );

  const teamName = pivot?.display_name ?? teamId;

  const membersQ = useTeamMembers(teamId, roster, period, dateRange);
  const allMembers = membersQ.data ?? [];

  const hasRoster = roster !== null;
  // Only offer the direct-reports filter when it can change the roster —
  // with no subteams every report is direct and the toggle is a no-op (#1756).
  const canFilterDirectReports = hasIndirectReports(roster);
  const directReportEmails = useMemo(() => {
    if (!roster) return null;
    return new Set(
      roster.filter((r) => r.is_direct).map((r) => r.email.toLowerCase()),
    );
  }, [roster]);
  const members =
    canFilterDirectReports && directReportsOnly && directReportEmails
      ? allMembers.filter((m) =>
          directReportEmails.has(m.person_id.toLowerCase()),
        )
      : allMembers;

  const teamViewConfig = useTeamViewConfig();
  const teamKpis = useTeamKpis(members, period);

  const teamSize = roster?.length;
  const taskQ = useTeamBulletSection(
    "task_delivery",
    teamId,
    teamSize,
    period,
    dateRange,
    { roster },
  );
  const qualityQ = useTeamBulletSection(
    "code_quality",
    teamId,
    teamSize,
    period,
    dateRange,
    { roster },
  );
  const estimationQ = useTeamBulletSection(
    "estimation",
    teamId,
    teamSize,
    period,
    dateRange,
    { roster },
  );
  const collabQ = useTeamBulletSection(
    "collaboration",
    teamId,
    teamSize,
    period,
    dateRange,
    { roster },
  );
  const aiQ = useTeamBulletSection(
    "ai_adoption",
    teamId,
    teamSize,
    period,
    dateRange,
    { roster },
  );

  const drillQ = useTeamDrill(drillTarget, dateRange);

  const scopingActive =
    canFilterDirectReports &&
    directReportsOnly &&
    members.length !== allMembers.length;

  const aiMetrics = aiQ.data
    ? scopingActive
      ? scopeAiBullets(aiQ.data, members)
      : aiQ.data
    : undefined;

  const scopedBulletNote = scopingActive
    ? `AI Adoption is scoped to direct reports (${members.length} of ${allMembers.length} members). Other sections still reflect the whole team.`
    : null;

  const handleCellDrill = (personId: string, drillId: string): void => {
    setDrillTarget({ kind: "cell", personId, drillId });
  };

  const retrySection = (sid: TeamBulletSectionId): void => {
    if (sid === "task_delivery") void taskQ.refetch();
    else if (sid === "code_quality") void qualityQ.refetch();
    else if (sid === "estimation") void estimationQ.refetch();
    else if (sid === "collaboration") void collabQ.refetch();
    else void aiQ.refetch();
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="bg-background/95 border-border/60 sticky top-0 z-20 -mx-6 -mt-6 flex flex-wrap items-center justify-between gap-3 border-b px-6 pt-6 pb-3 backdrop-blur-sm">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SidebarTrigger className="md:hidden" />
          <Avatar className="size-10 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-base font-extrabold">
              {getInitials(teamName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-foreground truncate text-lg leading-tight font-bold">
              {teamName}
            </div>
            <div className="text-muted-foreground truncate text-sm">
              {canFilterDirectReports && directReportsOnly
                ? `Direct reports of ${pivot?.display_name ?? teamName}`
                : `${pivot?.display_name ?? teamName}'s department`}
            </div>
          </div>
          <div className="shrink-0">
            <IcViewToggle person={teamId} hasReports={hasRoster} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canFilterDirectReports ? (
            <label className="text-foreground flex cursor-pointer items-center gap-2 text-sm select-none">
              <Switch
                checked={directReportsOnly}
                onCheckedChange={setDirectReportsOnly}
              />
              <span>Direct reports only</span>
              <span className="text-muted-foreground text-xs">
                ({members.length}/{allMembers.length})
              </span>
            </label>
          ) : null}
          <PeriodSelectorBar
            period={period}
            customRange={customRange}
            onPeriodChange={setPeriod}
            onRangeChange={setCustomRange}
          />
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
        </div>
      </div>

      <TeamHeroStrip teamKpis={teamKpis} />

      <AttentionNeeded
        members={members}
        alertThresholds={teamViewConfig.alert_thresholds}
      />

      <MembersTable
        members={members}
        columnThresholds={teamViewConfig.column_thresholds}
        loading={membersQ.isPending}
        onCellDrill={handleCellDrill}
        onViewAllStats={
          members.length > 0 ? () => setMetricsModalOpen(true) : undefined
        }
      />

      {scopedBulletNote ? (
        <div className="border-warning/30 bg-warning/10 text-warning rounded-md border px-3 py-2 text-xs">
          {scopedBulletNote}
        </div>
      ) : null}

      <TeamBulletSections
        sections={{
          task_delivery: taskQ.data,
          code_quality: qualityQ.data,
          estimation: estimationQ.data,
          ai_adoption: aiMetrics,
          collaboration: collabQ.data,
        }}
        status={{
          task_delivery: bulletStatus(taskQ),
          code_quality: bulletStatus(qualityQ),
          estimation: bulletStatus(estimationQ),
          ai_adoption: bulletStatus(aiQ),
          collaboration: bulletStatus(collabQ),
        }}
        viewMode={viewMode}
        onRetry={retrySection}
      />

      <DrillModal
        drill={drillQ.data ?? null}
        open={Boolean(drillTarget)}
        loading={drillQ.isPending && Boolean(drillTarget)}
        errored={drillQ.isError}
        onClose={() => setDrillTarget(null)}
        onRetry={() => drillQ.refetch()}
      />

      <TeamMetricsModal
        open={metricsModalOpen}
        onClose={() => setMetricsModalOpen(false)}
        members={members}
        range={dateRange}
      />
    </div>
  );
}
