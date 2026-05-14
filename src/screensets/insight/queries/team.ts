/**
 * Team View server data — query factories + consumer-facing hooks.
 *
 * Public API for the screen is the **hooks** (`useTeamMembers`,
 * `useTeamBullets`). The screen does not import `@tanstack/react-query`
 * directly. This mirrors the RTK Query consumer ergonomic: the component
 * asks for data and gets data, never touching cache or query mechanics.
 *
 * `queryOptions(...)` factories underneath the hooks let any other module
 * call `queryClient.{prefetch,fetch,invalidate}Queries(...)` against the
 * same keys without re-deriving the shape.
 *
 * Cache semantics — `staleTime: Infinity, gcTime: 0`:
 *   - While the screen is mounted, all observers of the same queryKey share
 *     one in-flight request. Re-renders no longer fire duplicate HTTPs,
 *     which was the root cause of the burst that overran the gateway's
 *     `in_flight: 32` limit (incident: 2026-05-12).
 *   - As soon as the last observer unmounts (user navigates away), data is
 *     dropped. Returning to the screen refetches from scratch.
 *
 * The "drop on navigation" behavior is deliberate for this migration —
 * keeps the PR scope narrow and avoids any risk of stale data being shown
 * across screens. The app-wide queryClient default (`staleTime: 5 min`) is
 * a better fit once Team View has more usage; that can land separately.
 */

import { useMemo } from 'react';
import { queryOptions, keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { toLower } from 'lodash';
import { apiRegistry } from '@hai3/react';
import { InsightApiService } from '../api/insightApiService';
import { ConnectorManagerService } from '../api/connectorManagerService';
import { METRIC_REGISTRY } from '../api/metricRegistry';
import { odataEscapeValue, type DateRange } from '../utils/periodToDateRange';
import { teamKeys } from './keys';
import { transformTeamMembers, transformBulletMetrics } from '../api/transforms';
import type { RawTeamMemberRow, RawBulletAggregateRow } from '../api/rawTypes';
import type { RosterEntry } from '../utils/identityTree';
import type { BulletSection, ODataResponse, PeriodValue, TeamMember } from '../types';

const api        = () => apiRegistry.getService(InsightApiService);
const connectors = () => apiRegistry.getService(ConnectorManagerService);

/** Bullet section ID → metric registry UUID. */
const BULLET_UUID = {
  task_delivery: METRIC_REGISTRY.TEAM_BULLET_DELIVERY,
  code_quality:  METRIC_REGISTRY.TEAM_BULLET_QUALITY,
  collaboration: METRIC_REGISTRY.TEAM_BULLET_COLLAB,
  ai_adoption:   METRIC_REGISTRY.TEAM_BULLET_AI,
} as const;

export type TeamBulletSectionId = keyof typeof BULLET_UUID;

export const TEAM_BULLET_SECTIONS: readonly TeamBulletSectionId[] = [
  'task_delivery',
  'code_quality',
  'collaboration',
  'ai_adoption',
] as const;

/** Per-section status surfaced to the UI for skeleton / retry rendering. */
export type SectionStatus = 'loading' | 'revalidating' | 'loaded' | 'errored';

/** Per-query cache config — see file header for rationale. */
const teamCacheDefaults = {
  staleTime: Infinity,
  gcTime: 0,
  placeholderData: keepPreviousData,
} as const;

// ---------------------------------------------------------------------------
// Query-options factories
// ---------------------------------------------------------------------------

const teamQueries = {
  /**
   * Per-person row, filtered by `person_id`. Used in roster mode, where the
   * screen iterates the IR-derived team list and fans out one query per
   * person. React Query's in-flight dedup makes this safe under re-render —
   * the actual HTTP only fires once per (email, range) tuple.
   */
  member: (email: string, range: DateRange) => queryOptions({
    queryKey: teamKeys.member(email, range),
    queryFn:  () => api().queryMetric<RawTeamMemberRow>(
      METRIC_REGISTRY.TEAM_MEMBER,
      range,
      {
        $filter: `person_id eq '${odataEscapeValue(toLower(email))}'`,
        $top:    1,
      },
    ),
    ...teamCacheDefaults,
  }),

  /**
   * Fallback bulk query for the rare path where no IR roster is available
   * (executive viewing a department-string org_unit_name). Mirrors the
   * pre-migration single-query shape.
   */
  memberBulk: (orgScope: string, range: DateRange) => queryOptions({
    queryKey: teamKeys.memberBulk(orgScope, range),
    queryFn:  () => api().queryMetric<RawTeamMemberRow>(
      METRIC_REGISTRY.TEAM_MEMBER,
      range,
      {
        $filter:  `org_unit_id eq '${odataEscapeValue(orgScope)}'`,
        $orderby: 'display_name asc',
        $top:     200,
      },
    ),
    ...teamCacheDefaults,
  }),

  /** Bullet section aggregate. `orgScope` is the team / org_unit_id filter. */
  bullet: (sectionId: TeamBulletSectionId, orgScope: string, range: DateRange) => queryOptions({
    queryKey: teamKeys.bullet(sectionId, orgScope, range),
    queryFn:  () => api().queryMetric<RawBulletAggregateRow>(
      BULLET_UUID[sectionId],
      range,
      { $filter: `org_unit_id eq '${odataEscapeValue(orgScope)}'` },
    ),
    ...teamCacheDefaults,
  }),

  /** Connector availability — informational, no period dependency. */
  availability: () => queryOptions({
    queryKey: teamKeys.availability(),
    queryFn:  () => connectors().getDataAvailability(),
    ...teamCacheDefaults,
  }),
};

// ---------------------------------------------------------------------------
// Hooks — the screen calls these and gets ready-to-render data + a status
// enum. No `useQuery` / `useQueries` leak into the consumer.
// ---------------------------------------------------------------------------

/** Synthetic empty row for roster entries the analytics-api returns no row
 * for — keeps the headcount accurate so bullet denominators line up with
 * the IR roster the sidebar shows. */
const buildSyntheticMember = (entry: RosterEntry, period: PeriodValue): TeamMember => ({
  person_id: entry.email,
  period,
  name: entry.display_name,
  seniority: '',
  supervisor_email: entry.supervisor_email,
  tasks_closed: 0,
  bugs_fixed: 0,
  dev_time_h: null,
  prs_merged: null,
  build_success_pct: null,
  focus_time_pct: null,
  ai_tools: [],
  ai_loc_share_pct: null,
});

type QueryRowResult = {
  data: ODataResponse<RawTeamMemberRow> | undefined;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
};

/** Aggregate a homogeneous slice of `useQuery` results into one section status. */
function aggregateStatus(results: ReadonlyArray<{
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
}>): SectionStatus | undefined {
  if (results.length === 0) return undefined;
  if (results.every((q) => q.isError))   return 'errored';
  if (results.some((q) => q.isPending))  return 'loading';
  if (results.some((q) => q.isFetching)) return 'revalidating';
  return 'loaded';
}

export interface UseTeamMembersResult {
  members: TeamMember[];
  status: SectionStatus | undefined;
}

/**
 * Fetch the team's member rows.
 *
 *   - **Roster mode** (when `roster` is non-null): fans out one
 *     `useQuery(teamQueries.member(...))` per person. React Query collapses
 *     identical concurrent fires for the same (email, range) so a re-render
 *     storm produces ≤1 HTTP per person.
 *   - **Fallback mode** (`roster === null`): single `useQuery` against
 *     `teamQueries.memberBulk(...)`. Only reached when no IR subtree is
 *     available (executive viewing a department string).
 *
 * Synthetic empty rows fill in for roster entries the analytics-api had no
 * data for — same UX as before the migration.
 */
export function useTeamMembers(
  roster: RosterEntry[] | null,
  teamId: string,
  range: DateRange,
  period: PeriodValue,
): UseTeamMembersResult {
  const perPersonQueries = useMemo(
    () => (roster && teamId ? roster.map((r) => teamQueries.member(r.email, range)) : []),
    [roster, teamId, range],
  );
  const perPersonResults = useQueries({ queries: perPersonQueries }) as QueryRowResult[];

  const bulkScope = teamId.includes('@') ? toLower(teamId) : teamId;
  const bulkResult = useQuery({
    ...teamQueries.memberBulk(bulkScope, range),
    enabled: !roster && !!teamId,
  }) as QueryRowResult;

  const results: QueryRowResult[] = useMemo(
    () => (roster ? perPersonResults : [bulkResult]),
    [roster, perPersonResults, bulkResult],
  );

  const status = useMemo(() => aggregateStatus(results), [results]);

  const members = useMemo<TeamMember[]>(() => {
    const rowByEmail = new Map<string, RawTeamMemberRow>();
    for (const q of results) {
      if (!q.data) continue;
      for (const row of q.data.items) {
        rowByEmail.set(toLower(row.person_id), row);
      }
    }
    if (roster) {
      // Preserve roster order (IR DFS) so the table matches the sidebar.
      return roster.map((entry) => {
        const row = rowByEmail.get(toLower(entry.email));
        if (row) return transformTeamMembers([row], period)[0]!;
        return buildSyntheticMember(entry, period);
      });
    }
    const out = transformTeamMembers(Array.from(rowByEmail.values()), period);
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [results, roster, period]);

  return { members, status };
}

type BulletQueryResult = {
  data: ODataResponse<RawBulletAggregateRow> | undefined;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
};

export interface UseTeamBulletsResult {
  sections: BulletSection[];
  status:   Record<TeamBulletSectionId, SectionStatus | undefined>;
  errors:   Record<TeamBulletSectionId, string | undefined>;
}

/**
 * Fetch the 4 bullet sections (task_delivery, code_quality, collaboration,
 * ai_adoption) and return ready-to-render BulletSection[] + per-section
 * status / error maps for skeleton / retry rendering.
 *
 * `teamSize` flows into `transformBulletMetrics` so member-scale AI metrics
 * (active_ai_members, cursor_active, ...) render as "N / teamSize" instead
 * of the legacy hardcoded `/ 12`.
 */
export function useTeamBullets(
  teamId: string,
  range: DateRange,
  period: PeriodValue,
  teamSize: number | undefined,
): UseTeamBulletsResult {
  const orgScope = teamId.includes('@') ? toLower(teamId) : teamId;
  const queriesArr = useMemo(
    () => (teamId
      ? TEAM_BULLET_SECTIONS.map((s) => teamQueries.bullet(s, orgScope, range))
      : []),
    [teamId, orgScope, range],
  );
  const results = useQueries({ queries: queriesArr }) as BulletQueryResult[];

  const sections = useMemo<BulletSection[]>(() => {
    return TEAM_BULLET_SECTIONS.map((sectionId, idx) => {
      const q = results[idx];
      const items = q?.data?.items ?? [];
      const metrics = q?.data
        ? transformBulletMetrics(items, sectionId, period, teamSize, 'team')
        : [];
      return { id: sectionId, title: sectionId, metrics };
    }).filter((s) => s.metrics.length > 0);
  }, [results, period, teamSize]);

  const status = useMemo(() => {
    const out = {} as Record<TeamBulletSectionId, SectionStatus | undefined>;
    TEAM_BULLET_SECTIONS.forEach((sectionId, idx) => {
      const q = results[idx];
      if (!q) { out[sectionId] = undefined; return; }
      if (q.isError)         out[sectionId] = 'errored';
      else if (q.isPending)  out[sectionId] = 'loading';
      else if (q.isFetching) out[sectionId] = 'revalidating';
      else                   out[sectionId] = 'loaded';
    });
    return out;
  }, [results]);

  const errors = useMemo(() => {
    const out = {} as Record<TeamBulletSectionId, string | undefined>;
    TEAM_BULLET_SECTIONS.forEach((sectionId, idx) => {
      const q = results[idx];
      if (q?.isError) {
        out[sectionId] = q.error instanceof Error ? q.error.message : 'Failed to load';
      }
    });
    return out;
  }, [results]);

  return { sections, status, errors };
}
