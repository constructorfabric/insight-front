import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  queryBatchWithRange,
  queryMetric,
  type BatchQueryItem,
  type BatchQueryResult,
} from "@/api/analytics-client";
import { METRIC_REGISTRY } from "@/api/metric-registry";
import { odataEscapeValue } from "@/api/odata";
import type { DateRange } from "@/api/period-to-date-range";
import type {
  RawBulletAggregateRow,
  RawDrillRow,
  RawTeamMemberRow,
} from "@/api/raw-types";
import {
  transformBulletMetrics,
  transformDrill,
  transformTeamMembers,
} from "@/api/transforms";
import { useCatalog } from "@/api/use-catalog";
import type { RosterEntry } from "@/lib/insight/identity-tree";
import type {
  BulletMetric,
  DrillData,
  PeriodValue,
  TeamMember,
} from "@/types/insight";

/** Per-person row from the V2_MEMBER_PRS metric. */
type RawMemberPrsRow = { person_id: string; prs_merged: number | null };

function buildSyntheticMember(
  entry: RosterEntry,
  period: PeriodValue,
): TeamMember {
  return {
    person_id: entry.email,
    period,
    name: entry.display_name,
    seniority: "",
    supervisor_email: entry.supervisor_email,
    org_unit_id: null,
    tasks_closed: 0,
    bugs_fixed: 0,
    dev_time_h: null,
    prs_merged: null,
    build_success_pct: null,
    focus_time_pct: null,
    ai_tools: [],
    ai_loc_share_pct: null,
  };
}

export function useTeamMembers(
  teamId: string,
  roster: RosterEntry[] | null,
  period: PeriodValue,
  range: DateRange,
  options?: { keepPrevious?: boolean },
): UseQueryResult<TeamMember[]> {
  const rosterKey = roster ? roster.map((r) => r.email).join(",") : null;
  return useQuery({
    queryKey: [
      "team",
      "members",
      teamId,
      rosterKey,
      period,
      range.from,
      range.to,
    ],
    enabled: Boolean(teamId) && Boolean(roster?.length),
    placeholderData: options?.keepPrevious ? keepPreviousData : undefined,
    queryFn: async () => {
      if (!roster?.length) return [];
      const ids = roster
        .map((r) => `'${odataEscapeValue(r.email.toLowerCase())}'`)
        .join(", ");
      const filter = `person_id in (${ids})`;
      // PRs merged isn't on the team_member row (it's a NULL placeholder there);
      // fetch it from the period-bounded weekly git silver and merge it in.
      const items: BatchQueryItem[] = [
        {
          id: "members",
          metric_id: METRIC_REGISTRY.TEAM_MEMBER,
          $filter: filter,
          $top: roster.length,
        },
        {
          id: "prs",
          metric_id: METRIC_REGISTRY.V2_MEMBER_PRS,
          $filter: filter,
          $top: roster.length,
        },
      ];
      const resp = await queryBatchWithRange<
        RawTeamMemberRow | RawMemberPrsRow
      >(range, items);
      const membersResult = resp.results.find((r) => r.id === "members");
      if (!membersResult || membersResult.status !== "ok") {
        throw new Error("Failed to load team members");
      }
      const byEmail = new Map<string, RawTeamMemberRow>();
      const prsByEmail = new Map<string, number>();
      for (const r of resp.results) {
        if (r.status !== "ok") continue;
        if (r.id === "members") {
          for (const row of r.items as RawTeamMemberRow[]) {
            byEmail.set(row.person_id.toLowerCase(), row);
          }
        } else if (r.id === "prs") {
          for (const row of r.items as RawMemberPrsRow[]) {
            const v = Number(row.prs_merged);
            if (Number.isFinite(v)) prsByEmail.set(row.person_id.toLowerCase(), v);
          }
        }
      }
      return roster.map((entry) => {
        const key = entry.email.toLowerCase();
        const row = byEmail.get(key);
        const member = row
          ? transformTeamMembers([row], period)[0]!
          : buildSyntheticMember(entry, period);
        const prs = prsByEmail.get(key);
        // The analytics row's `display_name` (BambooHR) can disagree with the
        // identity name shown in the sidebar/header (Entra) for the same
        // person (#1837). The roster IS the identity source, so the grid
        // renders the identity name it already holds; analytics supplies only
        // the metric values.
        return {
          ...member,
          name: entry.display_name,
          ...(prs != null ? { prs_merged: prs } : {}),
        };
      });
    },
  });
}

const TEAM_BULLET_SECTIONS = {
  task_delivery: METRIC_REGISTRY.TEAM_BULLET_DELIVERY,
  git_output: METRIC_REGISTRY.TEAM_BULLET_GIT,
  code_quality: METRIC_REGISTRY.TEAM_BULLET_QUALITY,
  estimation: METRIC_REGISTRY.TEAM_BULLET_DELIVERY,
  collaboration: METRIC_REGISTRY.TEAM_BULLET_COLLAB,
  ai_adoption: METRIC_REGISTRY.TEAM_BULLET_AI,
} as const;

export type TeamBulletSectionId = keyof typeof TEAM_BULLET_SECTIONS;

export function isTeamBulletSectionId(id: string): id is TeamBulletSectionId {
  return id in TEAM_BULLET_SECTIONS;
}

/**
 * Scope a team bullet aggregate to the members actually shown — the
 * identity-tree subtree the screen renders (transitive + active) — by
 * `person_id in (...)`, so the section aggregates over exactly the same
 * people as the heatmap. Callers must gate the query on a non-empty roster.
 */
function teamScopeFilter(roster: readonly RosterEntry[]): string {
  const ids = roster
    .map((r) => `'${odataEscapeValue(r.email.toLowerCase())}'`)
    .join(", ");
  return `person_id in (${ids})`;
}

function teamScopeKey(
  teamId: string,
  roster: readonly RosterEntry[] | null | undefined,
): string {
  if (roster && roster.length > 0) {
    return roster.map((r) => r.email.toLowerCase()).join(",");
  }
  return teamId.includes("@") ? teamId.toLowerCase() : teamId;
}

export function useTeamBulletSection(
  sectionId: TeamBulletSectionId,
  teamId: string,
  teamSize: number | undefined,
  period: PeriodValue,
  range: DateRange,
  options?: { keepPrevious?: boolean; roster?: readonly RosterEntry[] | null },
): UseQueryResult<BulletMetric[]> {
  const metricId = TEAM_BULLET_SECTIONS[sectionId];
  const scopeKey = teamScopeKey(teamId, options?.roster);
  const { data: catalog } = useCatalog();
  const catalogKey = catalog?.generated_at ?? null;
  return useQuery({
    queryKey: [
      "team",
      "bullet",
      sectionId,
      scopeKey,
      teamSize,
      period,
      range.from,
      range.to,
      catalogKey,
    ],
    enabled: Boolean(teamId) && Boolean(options?.roster?.length) && Boolean(catalog),
    placeholderData: options?.keepPrevious ? keepPreviousData : undefined,
    queryFn: async () => {
      const roster = options?.roster;
      if (!roster?.length) return [];
      const resp = await queryMetric<RawBulletAggregateRow>(metricId, range, {
        $filter: teamScopeFilter(roster),
      });
      return transformBulletMetrics(
        resp.items,
        sectionId,
        period,
        teamSize,
        "team",
        catalog,
      );
    },
  });
}

export interface TeamBulletSectionsData {
  bySection: Record<string, BulletMetric[]>;
  errors: Record<string, boolean>;
}

export function useTeamBulletSections(
  sectionIds: readonly TeamBulletSectionId[],
  teamId: string,
  teamSize: number | undefined,
  period: PeriodValue,
  range: DateRange,
  options?: { keepPrevious?: boolean; roster?: readonly RosterEntry[] | null },
): UseQueryResult<TeamBulletSectionsData> {
  const scopeKey = teamScopeKey(teamId, options?.roster);
  const { data: catalog } = useCatalog();
  const catalogKey = catalog?.generated_at ?? null;
  return useQuery({
    queryKey: [
      "team",
      "bullet-batch",
      sectionIds.join(","),
      scopeKey,
      teamSize,
      period,
      range.from,
      range.to,
      catalogKey,
    ],
    enabled:
      sectionIds.length > 0 &&
      Boolean(teamId) &&
      Boolean(options?.roster?.length) &&
      Boolean(catalog),
    placeholderData: options?.keepPrevious ? keepPreviousData : undefined,
    queryFn: async () => {
      const roster = options?.roster;
      if (!roster?.length) return { bySection: {}, errors: {} };
      const filter = teamScopeFilter(roster);
      const items: BatchQueryItem[] = sectionIds.map((id) => ({
        id,
        metric_id: TEAM_BULLET_SECTIONS[id],
        $filter: filter,
      }));
      const resp = await queryBatchWithRange<RawBulletAggregateRow>(
        range,
        items,
      );
      const byId = new Map<string, BatchQueryResult<RawBulletAggregateRow>>();
      for (const r of resp.results) {
        if (r.id) byId.set(r.id, r);
      }
      const bySection: Record<string, BulletMetric[]> = {};
      const errors: Record<string, boolean> = {};
      for (const id of sectionIds) {
        const r = byId.get(id);
        if (r && r.status === "ok") {
          errors[id] = false;
          bySection[id] = transformBulletMetrics(
            r.items,
            id,
            period,
            teamSize,
            "team",
            catalog,
          );
        } else {
          errors[id] = true;
          bySection[id] = [];
        }
      }
      return { bySection, errors };
    },
  });
}

export type TeamDrillTarget = {
  kind: "cell";
  personId: string;
  drillId: string;
};

export function useTeamDrill(
  target: TeamDrillTarget | null,
  range: DateRange,
): UseQueryResult<DrillData | null> {
  const key =
    target == null ? null : `cell:${target.personId}:${target.drillId}`;
  return useQuery({
    queryKey: ["team", "drill", key, range.from, range.to],
    enabled: Boolean(target),
    queryFn: async () => {
      if (!target) return null;
      const filter = `person_id eq '${odataEscapeValue(target.personId.toLowerCase())}' and drill_id eq '${odataEscapeValue(target.drillId)}'`;
      const resp = await queryMetric<RawDrillRow>(
        METRIC_REGISTRY.IC_DRILL,
        range,
        { $filter: filter },
      );
      return resp.items[0] ? transformDrill(resp.items[0]) : null;
    },
  });
}
