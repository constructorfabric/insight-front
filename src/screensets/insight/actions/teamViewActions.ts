/**
 * Team View Actions
 *
 * Queries the Analytics API for team member rows and bullet section metrics,
 * then assembles TeamViewData from the responses.
 * Also fetches data_availability via ConnectorManagerService.
 *
 * Spec: analytics-views-api.md §4.2
 */

import { eventBus, apiRegistry } from '@hai3/react';
import { TeamViewEvents } from '../events/teamViewEvents';
import { InsightApiService } from '../api/insightApiService';
import { ConnectorManagerService } from '../api/connectorManagerService';
import { METRIC_REGISTRY } from '../api/metricRegistry';
import { odataDateFilter, odataEscapeValue, type DateRange } from '../utils/periodToDateRange';
import { transformTeamMembers, transformBulletMetrics, transformDrill } from '../api/transforms';
import type {
  PeriodValue,
  TeamMember,
  TeamViewData,
  DrillData,
  ODataResponse,
} from '../types';
import type { RawTeamMemberRow, RawBulletAggregateRow, RawDrillRow } from '../api/rawTypes';
import {
  TEAM_KPIS_BY_PERIOD,
  TEAM_VIEW_CONFIG,
} from '../api/viewConfigs';
import { teamHealthStatus } from '../api/metricSemantics';
import { settled, emptyOdata } from '../utils/settledResult';

// ---------------------------------------------------------------------------
// Team KPI derivation (§4.2 — frontend-computed from member rows)
// ---------------------------------------------------------------------------

function median(values: number[]): number | null {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export function deriveTeamKpis(members: TeamMember[], period: PeriodValue) {
  // Data-driven: no members means the backend has nothing for this team in
  // the selected period — return empty so TeamHeroStrip renders ComingSoon
  // uniformly instead of forcing zero counters onto the UI.
  if (members.length === 0) return [];

  const total      = members.length;
  const focusTrigger = TEAM_VIEW_CONFIG.alert_thresholds
    .find((t) => t.metric_key === 'focus_time_pct')?.trigger ?? 60;

  // Skip null metrics — missing connector data reads as `null`, and
  // `null < trigger` coerces to `true`, inflating atRisk with phantom members.
  const atRisk = members.filter((m) =>
    TEAM_VIEW_CONFIG.alert_thresholds.some((t) => {
      const v = m[t.metric_key as keyof TeamMember];
      return typeof v === 'number' && Number.isFinite(v) && v < t.trigger;
    }),
  ).length;
  // `focus_time_pct` is nullable when the person has no upstream focus row.
  // Skip nulls so they don't count against belowFocus (otherwise every member
  // without a focus source looks "below target").
  const membersWithFocus = members.filter((m): m is TeamMember & { focus_time_pct: number } => m.focus_time_pct !== null);
  const focusCount  = membersWithFocus.filter((m) => m.focus_time_pct >= focusTrigger).length;
  const belowFocus  = membersWithFocus.length - focusCount;
  const noAiCount   = members.filter((m) => m.ai_tools.length === 0).length;

  // Median dev_time_h across members — skip nulls (missing focus source).
  const devTimeMedian = median(
    members.map((m) => m.dev_time_h).filter((v): v is number => v !== null),
  );

  // Statuses scale with team size (TEAM_HEALTH_THRESHOLDS) — "2 problematic"
  // is a crisis in a 5-person team and a rounding error in a 100-person one.
  const atRiskStatus = teamHealthStatus(atRisk, total);
  const focusStatus  = teamHealthStatus(belowFocus, total);
  const noAiStatus   = teamHealthStatus(noAiCount, total);

  return (TEAM_KPIS_BY_PERIOD[period] ?? TEAM_KPIS_BY_PERIOD['month']).map((k) => {
    if (k.metric_key === 'at_risk_count') return { ...k, value: String(atRisk),  status: atRiskStatus };
    if (k.metric_key === 'focus_gte_60')  return { ...k, value: `${focusCount} / ${total}`, sublabel: `${belowFocus} member${belowFocus !== 1 ? 's' : ''} below target`, status: focusStatus };
    if (k.metric_key === 'not_using_ai')  return { ...k, value: String(noAiCount), status: noAiStatus };
    if (k.metric_key === 'team_dev_time') {
      const value = devTimeMedian === null ? '—' : `${devTimeMedian.toFixed(1)}h`;
      // chipLabel: undefined — TeamHeroStrip uses `kpi.chipLabel ?? kpi.status`
      // for the badge, so empty string would render an empty badge; undefined
      // correctly falls back to status.
      return { ...k, value, sublabel: `Team median \u00b7 ${total} member${total !== 1 ? 's' : ''}`, chipLabel: undefined };
    }
    return k;
  });
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

/**
 * Roster entry passed in from the screen — derived from the IR subtree so the
 * team-view shows the same people the sidebar menu does. When `null`, the
 * action falls back to the legacy org_unit_id flow (executive viewing a
 * department-string `org_unit_name` for which no IR subtree is loaded).
 */
export interface TeamRosterEntry {
  email: string;
  display_name: string;
  supervisor_email: string | null;
}

const buildSyntheticMember = (entry: TeamRosterEntry, period: PeriodValue): TeamMember => ({
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

export const loadTeamView = (
  teamId: string,
  period: PeriodValue,
  range: DateRange,
  roster: TeamRosterEntry[] | null,
  pivotDisplayName: string | null,
): void => {
  eventBus.emit(TeamViewEvents.TeamViewLoadStarted);

  const api        = apiRegistry.getService(InsightApiService);
  const connectors = apiRegistry.getService(ConnectorManagerService);

  // Bullet metrics still aggregate at org_unit level — known residual: when
  // pivot is an email (executive drilldown), these will return empty until
  // bullets are migrated to the IR-roster path.
  const dateFilter = odataDateFilter(range);
  const bulletScope = teamId.includes('@') ? teamId.toLowerCase() : teamId;
  const bulletFilter = `org_unit_id eq '${odataEscapeValue(bulletScope)}' and ${dateFilter}`;

  // Roster mode: fetch metrics per person from the IR-derived list. Missing
  // analytics rows render as synthetic empties so headcount stays accurate.
  // Fallback (roster=null): legacy org_unit_id query — only path remaining is
  // an executive viewing a department-string org_unit.
  const memberQueries: Promise<ODataResponse<RawTeamMemberRow>>[] = roster
    ? roster.map((r) =>
        api.queryMetric<RawTeamMemberRow>(METRIC_REGISTRY.TEAM_MEMBER, {
          $filter: `person_id eq '${odataEscapeValue(r.email.toLowerCase())}' and ${dateFilter}`,
          $top:    1,
        }),
      )
    : [
        api.queryMetric<RawTeamMemberRow>(METRIC_REGISTRY.TEAM_MEMBER, {
          $filter:  bulletFilter,
          $orderby: 'display_name asc',
          $top:     200,
        }),
      ];

  void Promise.allSettled([
    Promise.allSettled(memberQueries),
    api.queryMetric<RawBulletAggregateRow>(METRIC_REGISTRY.TEAM_BULLET_DELIVERY, { $filter: bulletFilter }),
    api.queryMetric<RawBulletAggregateRow>(METRIC_REGISTRY.TEAM_BULLET_QUALITY,  { $filter: bulletFilter }),
    api.queryMetric<RawBulletAggregateRow>(METRIC_REGISTRY.TEAM_BULLET_COLLAB,   { $filter: bulletFilter }),
    api.queryMetric<RawBulletAggregateRow>(METRIC_REGISTRY.TEAM_BULLET_AI,       { $filter: bulletFilter }),
    connectors.getDataAvailability(),
  ])
    .then(([memberResultsSettled, deliveryResult, qualityResult, collabResult, aiResult, availResult]) => {
      const memberResults = memberResultsSettled.status === 'fulfilled'
        ? memberResultsSettled.value
        : [];
      const deliveryResp = settled(deliveryResult,  emptyOdata<RawBulletAggregateRow>(),   'TEAM_BULLET_DELIVERY');
      const qualityResp  = settled(qualityResult,   emptyOdata<RawBulletAggregateRow>(),   'TEAM_BULLET_QUALITY');
      const collabResp   = settled(collabResult,    emptyOdata<RawBulletAggregateRow>(),   'TEAM_BULLET_COLLAB');
      const aiResp       = settled(aiResult,        emptyOdata<RawBulletAggregateRow>(),   'TEAM_BULLET_AI');

      // Collect all returned analytics rows by lowercase person_id.
      const rowByEmail = new Map<string, RawTeamMemberRow>();
      let hasNext = false;
      for (const r of memberResults) {
        const resp = settled(r, emptyOdata<RawTeamMemberRow>(), 'TEAM_MEMBER');
        if (resp.page_info.has_next) hasNext = true;
        for (const row of resp.items) {
          rowByEmail.set(row.person_id.toLowerCase(), row);
        }
      }

      let members: TeamMember[];
      if (roster) {
        // Preserve roster order (IR DFS) so the table matches the sidebar
        // tree the viewer just navigated through.
        members = roster.map((entry) => {
          const row = rowByEmail.get(entry.email.toLowerCase());
          if (row) return transformTeamMembers([row], period)[0]!;
          return buildSyntheticMember(entry, period);
        });
      } else {
        members = transformTeamMembers(Array.from(rowByEmail.values()), period);
        members.sort((a, b) => a.name.localeCompare(b.name));
      }

      // Headcount drives member-scale AI bullets. In roster mode the count is
      // authoritative (IR truth); in fallback mode `has_next` means the org
      // exceeded $top: 200 and we cannot trust the visible count.
      const teamSize = roster
        ? (members.length || undefined)
        : (hasNext ? undefined : (members.length || undefined));

      const bulletSections = [
        { id: 'task_delivery',  title: 'Task Delivery',  metrics: transformBulletMetrics(deliveryResp.items, 'task_delivery', period, undefined, 'team') },
        { id: 'code_quality',   title: 'Code & Quality', metrics: transformBulletMetrics(qualityResp.items,  'code_quality',  period, undefined, 'team') },
        { id: 'collaboration',  title: 'Collaboration',  metrics: transformBulletMetrics(collabResp.items,   'collaboration', period, undefined, 'team') },
        { id: 'ai_adoption',    title: 'AI Adoption',    metrics: transformBulletMetrics(aiResp.items,       'ai_adoption',   period, teamSize, 'team') },
      ].filter((s) => s.metrics.length > 0);

      const teamName = pivotDisplayName ?? (teamId.charAt(0).toUpperCase() + teamId.slice(1));

      const data: TeamViewData = {
        teamName,
        teamKpis:      deriveTeamKpis(members, period),
        members,
        bulletSections,
        config:        TEAM_VIEW_CONFIG,
      };

      eventBus.emit(TeamViewEvents.TeamViewLoaded, data);

      const availability = settled(
        availResult,
        { git: 'no-connector', tasks: 'no-connector', ci: 'no-connector', comms: 'no-connector', hr: 'no-connector', ai: 'no-connector' } as const,
        'CONNECTORS',
      );
      eventBus.emit(TeamViewEvents.TeamViewAvailabilityLoaded, availability);
    })
    .catch((err: unknown) => {
      // Promise.allSettled never rejects, but guard against unexpected
      // errors in the transform/emit logic above.
      eventBus.emit(TeamViewEvents.TeamViewLoadFailed, String(err));
    });
};

// ---------------------------------------------------------------------------
// Drill — redux-managed (team / member / cell)
// ---------------------------------------------------------------------------

type TeamDrillFilter =
  | { kind: 'team'; teamId: string; drillId: string }
  | { kind: 'cell'; personId: string; drillId: string };

/**
 * Open a drill modal for the team view. The filter shape determines which
 * OData filter is sent to the backend. Emits DrillOpened on success.
 */
export const openTeamDrill = (filter: TeamDrillFilter): void => {
  const $filter =
    filter.kind === 'team'
      ? `org_unit_id eq '${odataEscapeValue(filter.teamId)}' and drill_id eq '${odataEscapeValue(filter.drillId)}'`
      : `person_id eq '${odataEscapeValue(filter.personId.toLowerCase())}' and drill_id eq '${odataEscapeValue(filter.drillId)}'`;

  void apiRegistry
    .getService(InsightApiService)
    .queryMetric<RawDrillRow>(METRIC_REGISTRY.IC_DRILL, { $filter })
    .then((resp) => {
      const row = resp.items[0];
      if (!row) return;
      const drillData: DrillData = transformDrill(row);
      eventBus.emit(TeamViewEvents.DrillOpened, { drillId: filter.drillId, drillData });
    })
    .catch(() => {
      // Drill fetch failure: keep modal closed; data-driven UI will show
      // ComingSoon if opened without rows. Explicit error surfacing happens
      // in Phase 3 (identity / API error-state work).
    });
};

export const closeTeamDrill = (): void => {
  eventBus.emit(TeamViewEvents.DrillClosed);
};
