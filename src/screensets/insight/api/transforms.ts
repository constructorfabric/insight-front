/**
 * Transform layer
 *
 * Pure functions that map raw ClickHouse aggregates (snake_case) into the
 * pre-formatted UI types consumed by components.
 *
 * Design rules:
 * - Explicit field mapping only (no generic snake->camel converter).
 * - Every function is stateless and side-effect free.
 * - Threshold defaults come from thresholdConfig.ts; backend-provided
 *   values override them when present.
 */

import { keyBy } from 'lodash';
import type {
  PeriodValue,
  ExecTeamRow,
  ExecViewConfig,
  IcKpi,
  BulletMetric,
  LocDataPoint,
  DeliveryDataPoint,
  TeamMember,
  TimeOffNotice,
  DrillData,
} from '../types';
import type {
  RawExecSummaryRow,
  RawIcAggregateRow,
  RawBulletAggregateRow,
  RawLocTrendRow,
  RawDeliveryTrendRow,
  RawTeamMemberRow,
  RawTimeOffRow,
  RawDrillRow,
} from './rawTypes';
import { BULLET_DEFS, IC_KPI_DEFS } from './thresholdConfig';
import type { IcKpiDef } from './thresholdConfig';
import { evaluateStatus } from './metricSemantics';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function pctInRange(value: number, rangeMin: number, rangeMax: number): number {
  const span = rangeMax - rangeMin;
  if (span <= 0) return 0;
  return Math.round(clamp(((value - rangeMin) / span) * 100, 0, 100));
}

function formatValue(raw: number, fmt: IcKpiDef['format']): string {
  switch (fmt) {
    case 'integer': return String(Math.round(raw));
    case 'decimal1': return raw.toFixed(1);
    case 'percent': return String(Math.round(raw));
    case 'hours': return `${raw.toFixed(1)}h`;
  }
}

function formatDelta(
  delta: number,
  def: IcKpiDef,
): string {
  const sign = delta > 0 ? '+' : '';
  switch (def.format) {
    case 'integer': return `${sign}${Math.round(delta)}`;
    case 'decimal1': return `${sign}${delta.toFixed(1)}`;
    case 'percent': return `${sign}${Math.round(delta)}%`;
    case 'hours': return `${sign}${delta.toFixed(1)}h`;
  }
}

function deltaType(
  delta: number,
  higherIsBetter: boolean,
): 'good' | 'bad' | 'neutral' {
  const threshold = 0.001;
  if (Math.abs(delta) < threshold) return 'neutral';
  if (higherIsBetter) return delta > 0 ? 'good' : 'bad';
  return delta < 0 ? 'good' : 'bad';
}

function formatDateLabel(isoDate: string, period: PeriodValue): string {
  // Parse as local-midnight so label reflects the user's timezone, not UTC.
  const [y, m, day] = isoDate.split('-').map(Number);
  const d = new Date(y, (m ?? 1) - 1, day ?? 1);
  switch (period) {
    case 'week': {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
      return days[d.getDay()] ?? isoDate;
    }
    case 'month': {
      // Week number within the month: W1, W2, ...
      const weekNum = Math.ceil(d.getDate() / 7);
      return `W${weekNum}`;
    }
    case 'quarter': {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
      return months[d.getMonth()] ?? isoDate;
    }
    case 'year': {
      const q = Math.floor(d.getMonth() / 3) + 1;
      return `Q${q}`;
    }
  }
}

function formatRangeStr(value: number, unit: string): string {
  if (unit === '%') return `${value}%`;
  if (unit === 'h' || unit === 'h/mo') return `${value}h`;
  if (unit === 'd') return `${value}d`;
  if (unit === '\u00d7') return `${value}\u00d7`;
  return String(value);
}

/**
 * Units where the displayed value should be an integer (counts, members, messages).
 * Fractional-by-nature units (%, hours, ratios, "avg" of small values) are excluded.
 */
function isCountUnit(unit: string): boolean {
  const u = unit.toLowerCase().trim();
  return (
    u === '' ||
    u === 'tasks' ||
    u === 'count' ||
    u === 'lines' ||
    u === 'replies' ||
    u === 'days' ||
    u === '/mo' ||
    u === '/day' ||
    u.startsWith('/ ')
  );
}

function formatBulletValue(raw: number | null | undefined, unit: string): string {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return '—';
  if (isCountUnit(unit)) return String(Math.round(raw));
  return String(Math.round(raw * 100) / 100); // up to 2 decimals for %, ratios, hours
}

// ---------------------------------------------------------------------------
// 1. Executive summary
// ---------------------------------------------------------------------------

export function transformExecRows(
  rows: RawExecSummaryRow[],
  thresholds?: ExecViewConfig['column_thresholds'],
): ExecTeamRow[] {
  const toInt = (v: number | null | undefined): number =>
    v == null || !Number.isFinite(v) ? 0 : Math.round(v);

  return rows.map((r) => {
    let status: 'good' | 'warn' | 'bad' = 'good';

    if (thresholds) {
      const warnings = thresholds.filter((t) => {
        const val = r[t.metric_key as keyof RawExecSummaryRow] as number | null;
        return val !== null && val < t.threshold;
      });
      if (warnings.length >= 2) status = 'bad';
      else if (warnings.length === 1) status = 'warn';
    }

    return {
      team_id: r.org_unit_id,
      team_name: r.org_unit_name,
      // Integer counters: round so UInt64 arriving as Float64 from backend displays cleanly.
      headcount: toInt(r.headcount),
      tasks_closed: toInt(r.tasks_closed),
      bugs_fixed: toInt(r.bugs_fixed),
      build_success_pct: r.build_success_pct,
      focus_time_pct: r.focus_time_pct,
      ai_adoption_pct: r.ai_adoption_pct,
      ai_loc_share_pct: r.ai_loc_share_pct,
      pr_cycle_time_h: r.pr_cycle_time_h,
      status,
    };
  });
}

// ---------------------------------------------------------------------------
// 2. IC KPIs
// ---------------------------------------------------------------------------

export function transformIcKpis(
  current: RawIcAggregateRow | null,
  previous: RawIcAggregateRow | null,
  period: PeriodValue,
): IcKpi[] {
  // Data-driven: no current row means the backend has nothing for this person
  // in the selected period — return empty so composites render ComingSoon
  // uniformly instead of forcing zeros onto the UI.
  if (current === null) return [];

  return IC_KPI_DEFS.map((def) => {
    const curVal = (current[def.raw_field] ?? 0) as number;
    const prevVal = previous ? ((previous[def.raw_field] ?? 0) as number) : null;

    const value = formatValue(curVal, def.format);
    let delta = '';
    let dt: 'good' | 'warn' | 'bad' | 'neutral' = 'neutral';

    if (prevVal !== null) {
      const diff = curVal - prevVal;
      delta = formatDelta(diff, def);
      dt = deltaType(diff, def.higher_is_better);
    }

    return {
      period,
      metric_key: def.metric_key,
      label: def.label,
      value,
      unit: def.unit,
      sublabel: def.sublabel,
      description: def.description,
      delta,
      delta_type: dt,
    };
  });
}

// ---------------------------------------------------------------------------
// 3. Bullet metrics
// ---------------------------------------------------------------------------

/**
 * @param teamSize  Headcount of the team that context applies to. Used to
 *                  rewrite unit/range_max for member-scale metrics
 *                  (`active_ai_members` etc.) so bullets show "N / 113"
 *                  instead of the old hardcoded "N / 12". When unknown
 *                  (e.g. IC Dashboard context), member-scale metrics render
 *                  as 'unavailable' — we don't invent a denominator.
 */
export function transformBulletMetrics(
  rows: RawBulletAggregateRow[],
  section: string,
  period: PeriodValue,
  teamSize?: number,
): BulletMetric[] {
  const defsByKey = keyBy(
    BULLET_DEFS.filter((d) => d.section === section),
    'metric_key',
  );

  return rows.map((r) => {
      const def = defsByKey[r.metric_key];

      if (!def) {
        // Unknown metric_key — backend surfaced something the FE doesn't know.
        // Render what we can and mark unavailable so the bar doesn't pretend
        // to reflect a distribution we can't describe.
        const unitStr = '';
        return {
          period,
          section,
          metric_key: r.metric_key,
          label: r.metric_key,
          sublabel: '',
          value: formatBulletValue(r.value, unitStr),
          unit: unitStr,
          range_min: '\u2014',
          range_max: '\u2014',
          median: '\u2014',
          median_label: '',
          bar_left_pct: 0,
          bar_width_pct: 0,
          median_left_pct: 0,
          status: 'unavailable',
          drill_id: '',
        };
      }

      // Member-scale metrics use team headcount as the denominator. Unit
      // becomes "/ N" at the team view; IC view keeps them unavailable.
      const effectiveUnit = def.isMemberScale
        ? teamSize != null
          ? `/ ${teamSize}`
          : ''
        : def.unit;

      const valueUnavailable = r.value === null || r.value === undefined || !Number.isFinite(r.value);
      const rangeAvailable = r.range_min != null && r.range_max != null;
      // For member-scale metrics, override range_max with team size when
      // known (the backend emits min/max across team members, but the chart
      // scale should run 0..teamSize so "out of N" reads correctly).
      const rangeMax = def.isMemberScale && teamSize != null
        ? teamSize
        : r.range_max;
      const rangeMin = def.isMemberScale && teamSize != null
        ? 0
        : r.range_min;

      // Distribution not provided by the backend → can't draw a meaningful
      // bullet. Show value + label; render ComingSoon in the bar slot.
      if (valueUnavailable || !rangeAvailable || rangeMin == null || rangeMax == null) {
        return {
          period,
          section,
          metric_key: r.metric_key,
          label: def.label,
          sublabel: def.sublabel,
          value: formatBulletValue(r.value, effectiveUnit),
          unit: effectiveUnit,
          range_min: '\u2014',
          range_max: '\u2014',
          median: '\u2014',
          median_label: '',
          bar_left_pct: 0,
          bar_width_pct: 0,
          median_left_pct: 0,
          status: 'unavailable',
          drill_id: def.drill_id,
        };
      }

      const median = r.median;
      return {
        period,
        section,
        metric_key: r.metric_key,
        label: def.label,
        sublabel: def.sublabel,
        // Format counters as integers (round), ratios/percents/hours as 2-decimal.
        value: formatBulletValue(r.value, effectiveUnit),
        unit: effectiveUnit,
        range_min: formatRangeStr(rangeMin, def.unit),
        range_max: formatRangeStr(rangeMax, def.unit),
        median: median != null ? formatBulletValue(median, def.unit) : '\u2014',
        median_label: median != null
          ? `Median: ${formatBulletValue(median, def.unit)}${def.unit === '%' ? '%' : def.unit === 'h' ? 'h' : ''}`
          : '',
        bar_left_pct: 0,
        bar_width_pct: pctInRange(r.value, rangeMin, rangeMax),
        median_left_pct: median != null ? pctInRange(median, rangeMin, rangeMax) : 0,
        status: evaluateStatus(r.value, def),
        drill_id: def.drill_id,
      };
    });
}

// ---------------------------------------------------------------------------
// 4. Chart transforms
// ---------------------------------------------------------------------------

export function transformLocTrend(
  rows: RawLocTrendRow[],
  period: PeriodValue,
): LocDataPoint[] {
  return rows.map((r) => ({
    label: formatDateLabel(r.date_bucket, period),
    aiLoc: r.ai_loc,
    codeLoc: r.code_loc,
    specLines: r.spec_lines,
  }));
}

export function transformDeliveryTrend(
  rows: RawDeliveryTrendRow[],
  period: PeriodValue,
): DeliveryDataPoint[] {
  return rows.map((r) => ({
    label: formatDateLabel(r.date_bucket, period),
    commits: r.commits,
    prsMerged: r.prs_merged,
    tasksDone: r.tasks_done,
  }));
}

// ---------------------------------------------------------------------------
// 5. Team members
// ---------------------------------------------------------------------------

export function transformTeamMembers(
  rows: RawTeamMemberRow[],
  period: PeriodValue,
): TeamMember[] {
  const toInt = (v: number | null | undefined): number =>
    v == null || !Number.isFinite(v) ? 0 : Math.round(v);

  return rows.map((r) => ({
    person_id: r.person_id,
    period,
    name: r.display_name,
    seniority: r.seniority,
    supervisor_email: r.supervisor_email,
    // Integer counters rounded; dev_time_h kept as float (it's hours, fractional is correct).
    tasks_closed: toInt(r.tasks_closed),
    bugs_fixed: toInt(r.bugs_fixed),
    dev_time_h: r.dev_time_h,
    prs_merged: toInt(r.prs_merged),
    build_success_pct: r.build_success_pct,
    focus_time_pct: r.focus_time_pct,
    ai_tools: r.ai_tools,
    ai_loc_share_pct: r.ai_loc_share_pct,
  }));
}

// ---------------------------------------------------------------------------
// 6. Time-off notice
// ---------------------------------------------------------------------------

export function transformTimeOff(row: RawTimeOffRow): TimeOffNotice {
  return {
    days: row.days,
    dateRange: row.date_range,
    bambooHrUrl: row.bamboo_hr_url,
  };
}

// ---------------------------------------------------------------------------
// 7. Drill data
// ---------------------------------------------------------------------------

export function transformDrill(row: RawDrillRow): DrillData {
  return {
    title: row.title,
    source: row.source,
    srcClass: row.src_class,
    value: row.value,
    filter: row.filter,
    columns: row.columns,
    rows: row.rows,
  };
}
