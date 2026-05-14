/**
 * Team View Actions
 *
 * Post-migration: the screen reads server data through TanStack React Query
 * (`queries/team.ts`). This module keeps only the drill flow (imperative
 * from cell-click handlers) and the synchronous KPI derivation used by the
 * screen to compose the hero strip.
 *
 * Spec: analytics-views-api.md §4.2
 */

import { eventBus, apiRegistry } from '@hai3/react';
import { TeamViewEvents } from '../events/teamViewEvents';
import { InsightApiService } from '../api/insightApiService';
import { METRIC_REGISTRY } from '../api/metricRegistry';
import { odataEscapeValue, type DateRange } from '../utils/periodToDateRange';
import { transformDrill } from '../api/transforms';
import type { PeriodValue, TeamMember, DrillData } from '../types';
import type { RawDrillRow } from '../api/rawTypes';
import { TEAM_KPIS_BY_PERIOD, TEAM_VIEW_CONFIG } from '../api/viewConfigs';
import { teamHealthStatus } from '../api/metricSemantics';

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
      const value = devTimeMedian === null ? '—' : `${Math.round(devTimeMedian)}h`;
      // chipLabel: undefined — TeamHeroStrip uses `kpi.chipLabel ?? kpi.status`
      // for the badge, so empty string would render an empty badge; undefined
      // correctly falls back to status.
      return { ...k, value, sublabel: `Team median · ${total} member${total !== 1 ? 's' : ''}`, chipLabel: undefined };
    }
    return k;
  });
}

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
export const openTeamDrill = (filter: TeamDrillFilter, range: DateRange): void => {
  const $filter =
    filter.kind === 'team'
      ? `org_unit_id eq '${odataEscapeValue(filter.teamId)}' and drill_id eq '${odataEscapeValue(filter.drillId)}'`
      : `person_id eq '${odataEscapeValue(filter.personId.toLowerCase())}' and drill_id eq '${odataEscapeValue(filter.drillId)}'`;

  void apiRegistry
    .getService(InsightApiService)
    .queryMetric<RawDrillRow>(METRIC_REGISTRY.IC_DRILL, range, { $filter })
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
