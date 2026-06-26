/**
 * Design rules:
 * - Explicit field mapping only (no generic snake->camel converter).
 * - Every function is stateless and side-effect free.
 * - All metric metadata (labels / sublabels / thresholds) comes from the
 *   wire catalog (`useCatalog()`). No compile-in metric defaults — when
 *   the catalog is unavailable the transforms emit empty arrays and
 *   consumers render skeletons or empty states (Refs #82).
 */

import type {
  PeriodValue,
  IcKpi,
  BulletMetric,
  CrmFlowPoint,
  CrmKpis,
  LocDataPoint,
  DeliveryDataPoint,
  TeamMember,
  TimeOffNotice,
  DrillData,
} from '@/types/insight';
import type {
  RawIcAggregateRow,
  RawBulletAggregateRow,
  RawCrmFlowRow,
  RawCrmKpisRow,
  RawLocTrendRow,
  RawDeliveryTrendRow,
  RawTeamMemberRow,
  RawTimeOffRow,
  RawDrillRow,
} from './raw-types';
import {
  type CatalogMetric,
  type CatalogResponse,
  prefixForBulletSection,
} from './catalog-client';
import { evaluateStatus } from './metric-semantics';
import type { PeerStats } from '@/lib/peers';
import {
  type DateRange,
  type Granularity,
  bucketGranularity,
  bucketStart,
} from './period-to-date-range';

/** Format strings the IC KPI catalog rows surface. */
type IcKpiFormat = 'integer' | 'decimal1' | 'percent' | 'hours';

function asIcKpiFormat(v: string | undefined): IcKpiFormat {
  if (v === 'integer' || v === 'decimal1' || v === 'percent' || v === 'hours') {
    return v;
  }
  // Wire row predates the `format` field — keep IC KPI rendering safe by
  // defaulting to whole-number display.
  return 'integer';
}

function keyBy<T, K extends keyof T>(items: T[], key: K): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of items) {
    out[String(item[key])] = item;
  }
  return out;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function pctInRange(value: number, rangeMin: number, rangeMax: number): number {
  const span = rangeMax - rangeMin;
  if (span <= 0) return 0;
  return Math.round(clamp(((value - rangeMin) / span) * 100, 0, 100));
}

function formatValue(raw: number, fmt: IcKpiFormat): string {
  // Whole-number display across the board. Fractional precision was noisy on
  // a dashboard that re-aggregates per period — "78.4%" jitters to "78.6%"
  // when the period nudges by a day. Integers stay readable and stable.
  switch (fmt) {
    case 'integer': return String(Math.round(raw));
    case 'decimal1': return String(Math.round(raw * 10) / 10);
    case 'percent': return String(Math.round(raw));
    case 'hours': return `${Math.round(raw)}h`;
  }
}

/**
 * Format a raw metric value with the catalog's display format — used for peer
 * medians so they round exactly like the tile value does.
 */
export function formatKpiValue(raw: number, fmt: string | undefined): string {
  return formatValue(raw, asIcKpiFormat(fmt));
}

function formatDelta(delta: number, fmt: IcKpiFormat): string {
  const sign = delta > 0 ? '+' : '';
  switch (fmt) {
    case 'integer': return `${sign}${Math.round(delta)}`;
    case 'decimal1': return `${sign}${Math.round(delta)}`;
    case 'percent': return `${sign}${Math.round(delta)}%`;
    case 'hours': return `${sign}${Math.round(delta)}h`;
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

// Cache Intl formatters — constructing them per-call is surprisingly
// expensive, and the labels only change when the locale changes (never
// during a normal session).
const WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const MONTH_FMT   = new Intl.DateTimeFormat(undefined, { month: 'short' });

function formatDateLabel(isoDate: string, g: Granularity): string {
  // Parse as local-midnight so label reflects the user's timezone, not UTC.
  const [y, m, day] = isoDate.split('-').map(Number);
  const d = new Date(y, (m ?? 1) - 1, day ?? 1);
  switch (g) {
    case 'day':
      // Short weekday label in the user's locale (e.g. "Mon", "Пн", "月").
      return WEEKDAY_FMT.format(d);
    case 'week': {
      // Month-qualified week-of-month ("May W2") so weeks stay distinct across
      // month boundaries.
      const weekNum = Math.ceil(d.getDate() / 7);
      return `${MONTH_FMT.format(d)} W${weekNum}`;
    }
    case 'month':
      // Short month label in the user's locale.
      return MONTH_FMT.format(d);
    case 'quarter': {
      const q = Math.floor(d.getMonth() / 3) + 1;
      return `Q${q}`;
    }
  }
}

function formatRangeStr(value: number, unit: string): string {
  // Range edges (min/max for the bullet scale) come from CH as raw floats \u2014
  // round here so '783637.2667' doesn't leak to the screen. Matches the
  // whole-number policy applied to the value/median in formatBulletValue.
  const v = unit === 'd' ? Math.round(value * 10) / 10 : Math.round(value);
  if (unit === '%') return `${v}%`;
  if (unit === 'h' || unit === 'h/mo') return `${v}h`;
  if (unit === 'd') return `${v}d`;
  if (unit === '\u00d7') return `${v}\u00d7`;
  return String(v);
}

function formatBulletValue(raw: number | null | undefined, unit: string): string {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return '—';
  // Day metrics keep one decimal — rounding 1.6d → 2d hides a meaningful gap.
  // Other units stay whole (see formatValue() rationale).
  if (unit === 'd') return String(Math.round(raw * 10) / 10);
  return String(Math.round(raw));
}

/**
 * Auto-convert hour-scale bullets to days when the chart would otherwise
 * display 3-digit hour values that read as "long opaque numbers". Industry
 * dashboards (Jellyfish, LinearB, Atlassian) flip to days at the same
 * threshold. The whole bullet (value/median/min/max) shares a unit, so we
 * decide once per row using the upper edge of the range.
 *
 * Returns null when no scaling needed; otherwise scaled numbers + new unit.
 */
function scaleHoursToDays(
  unit: string,
  value: number | null | undefined,
  median: number | null | undefined,
  rangeMin: number | null | undefined,
  rangeMax: number | null | undefined,
): null | {
  unit: string;
  value: number | null | undefined;
  median: number | null | undefined;
  rangeMin: number | null | undefined;
  rangeMax: number | null | undefined;
} {
  if (unit !== 'h') return null;
  if (rangeMax == null || !Number.isFinite(rangeMax) || rangeMax < 48) return null;
  const toDays = (n: number | null | undefined): number | null | undefined =>
    n == null || !Number.isFinite(n) ? n : Math.round((n / 24) * 10) / 10;
  return {
    unit: 'd',
    value:    toDays(value),
    median:   toDays(median),
    rangeMin: toDays(rangeMin),
    rangeMax: toDays(rangeMax),
  };
}

const IC_KPI_PREFIX = 'ic_kpis.';

export function transformIcKpis(
  current: RawIcAggregateRow | null,
  previous: RawIcAggregateRow | null,
  period: PeriodValue,
  catalog: CatalogResponse | undefined,
): IcKpi[] {
  // No catalog → no labels → consumers render skeletons / empty states.
  if (!catalog) return [];
  // No current row → backend has nothing for this person in the period.
  if (current === null) return [];

  // The bare `metric_key` (post-`ic_kpis.` prefix) is the column name on
  // `RawIcAggregateRow` — wire seed migration `m20260527_000001` keeps
  // the catalog key in sync with the gold table column. Catalog rows
  // whose bare key isn't an own property of the raw aggregate are
  // silently omitted (the FE doesn't know how to source their value).
  // `hasOwnProperty` (not `in`) so a malformed wire key like `__proto__`
  // or `toString` can't reach `Object.prototype` members.
  type IcRow = RawIcAggregateRow;

  const out: IcKpi[] = [];
  for (const m of catalog.metrics) {
    if (!m.metric_key || !m.metric_key.startsWith(IC_KPI_PREFIX)) continue;
    const bareKey = m.metric_key.slice(IC_KPI_PREFIX.length);
    if (!Object.prototype.hasOwnProperty.call(current, bareKey)) continue;
    const rawField = bareKey as keyof IcRow;

    // Distinguish "raw value missing" (NULL from backend → source not
    // ingested) from "raw value is zero" (real measurement).
    const rawCur = current[rawField];
    const rawPrev = previous?.[rawField];
    const curVal =
      rawCur == null || typeof rawCur !== 'number' ? null : rawCur;
    const prevVal =
      rawPrev == null || typeof rawPrev !== 'number' ? null : rawPrev;

    const format = asIcKpiFormat(m.format);
    const value = curVal === null ? null : formatValue(curVal, format);
    let delta = '';
    let dt: 'good' | 'warn' | 'bad' | 'neutral' = 'neutral';

    if (curVal !== null && prevVal !== null) {
      const diff = curVal - prevVal;
      delta = formatDelta(diff, format);
      dt = deltaType(diff, m.higher_is_better);
    }

    // Department peer median for this KPI, folded onto the same row by the
    // IC_KPIS query_ref (`<bareKey>_median` + shared `peer_n`). Raw numeric
    // — the tile formats it. NULL when the person has no department cohort.
    const medianField = `${bareKey}_median` as keyof IcRow;
    const rawMedian = Object.prototype.hasOwnProperty.call(current, medianField)
      ? current[medianField]
      : null;
    const peerMedian =
      rawMedian == null || typeof rawMedian !== 'number' ? null : rawMedian;
    const rawPeerN = current.peer_n;
    const peerN =
      rawPeerN == null || typeof rawPeerN !== 'number' ? null : rawPeerN;

    out.push({
      period,
      metric_key: bareKey,
      label: m.label,
      value,
      raw_value: curVal,
      unit: m.unit ?? '',
      sublabel: m.sublabel ?? '',
      description: m.description,
      delta,
      delta_type: dt,
      peer_median: peerMedian,
      peer_n: peerN,
    });
  }
  return out;
}

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
  teamSize: number | undefined,
  _viewKind: 'ic' | 'team',
  catalog: CatalogResponse | undefined,
): BulletMetric[] {
  // No catalog → no labels → consumers render skeletons. The screen
  // surfaces `isError` / `isLoading` directly from `useCatalog()` so
  // returning empty here is the right "no data" shape.
  if (!catalog) return [];

  const wirePrefixDot = prefixForBulletSection(section) + '.';

  // Section catalog rows, keyed by bare metric_key (the form raw aggregate
  // rows carry, e.g. `tasks_completed`). Catalog metric_keys are
  // wire-prefixed (e.g. `task_delivery_bullet_rows.tasks_completed`).
  const catalogByBareKey = new Map<string, CatalogMetric>();
  for (const m of catalog.metrics) {
    if (!m.metric_key || !m.metric_key.startsWith(wirePrefixDot)) continue;
    const bare = m.metric_key.slice(wirePrefixDot.length);
    if (!catalogByBareKey.has(bare)) catalogByBareKey.set(bare, m);
  }

  // Backfill honest-zero rows for catalog metrics the backend omitted, but
  // only when the section actually responded with at least one row. A section
  // the backend returned nothing for means "no data for this period" — never
  // fabricate a full grid of zeros that masks the empty state.
  const seenKeys = new Set(rows.map((r) => r.metric_key));
  const synthetic: RawBulletAggregateRow[] = [];
  if (rows.length > 0) {
    for (const bareKey of catalogByBareKey.keys()) {
      if (!seenKeys.has(bareKey)) {
        synthetic.push({
          metric_key: bareKey,
          value: 0,
          median: null,
          range_min: null,
          range_max: null,
          p25: null,
          p75: null,
          n: null,
        });
      }
    }
  }
  const allRows = [...rows, ...synthetic];

  const out: BulletMetric[] = [];
  for (const r of allRows) {
    const catalogRow = catalogByBareKey.get(r.metric_key);
    // Missing-id (catalog row absent for this section) → silently omit per
    // DESIGN §3.3 Catalog Consumer Contract.
    if (!catalogRow) continue;

    const label = catalogRow.label;
    const sublabel = catalogRow.sublabel ?? '';
    const baseUnit = catalogRow.unit ?? '';
    const isMemberScale = catalogRow.is_member_scale;
    const higherIsBetter = catalogRow.higher_is_better;
    const goodThr = catalogRow.thresholds.good;
    const warnThr = catalogRow.thresholds.warn;
    const isSchemaError = catalogRow.schema_status === 'error';

    // Member-scale metrics use team headcount as the denominator. Unit
    // becomes "/ N" at the team view; IC view keeps them unavailable.
    const effectiveUnit = isMemberScale
      ? teamSize != null
        ? `/ ${teamSize}`
        : ''
      : baseUnit;

    const valueUnavailable =
      r.value === null || r.value === undefined || !Number.isFinite(r.value);
    const rangeAvailable = r.range_min != null && r.range_max != null;
    const rangeMax =
      isMemberScale && teamSize != null ? teamSize : r.range_max;
    const rangeMin = isMemberScale && teamSize != null ? 0 : r.range_min;
    const memberScaleMissingSize = isMemberScale && teamSize == null;

    if (
      valueUnavailable ||
      !rangeAvailable ||
      rangeMin == null ||
      rangeMax == null ||
      memberScaleMissingSize
    ) {
      out.push({
        period,
        section,
        metric_key: r.metric_key,
        label,
        sublabel,
        value: formatBulletValue(r.value, effectiveUnit),
        unit: effectiveUnit,
        range_min: '—',
        range_max: '—',
        median: '—',
        median_label: '',
        bar_left_pct: 0,
        bar_width_pct: 0,
        median_left_pct: 0,
        status: 'unavailable',
        drill_id: '',
        source_tags: catalogRow.source_tags,
        ...(isSchemaError ? { schema_error: true } : {}),
      });
      continue;
    }

    // Auto-scale hour-bullets to days when the upper range crosses a few
    // days (industry default: 48h). Keeps display readable without changing
    // the underlying metric semantics or thresholds.
    const scaled = scaleHoursToDays(
      effectiveUnit,
      r.value,
      r.median,
      rangeMin,
      rangeMax,
    );
    const dispUnit = scaled?.unit ?? effectiveUnit;
    const dispVal = scaled?.value ?? r.value;
    const dispMin = scaled?.rangeMin ?? rangeMin;
    const dispMax = scaled?.rangeMax ?? rangeMax;
    const median = scaled?.median ?? r.median;
    const medianFormatted =
      median != null ? formatRangeStr(median, dispUnit) : '—';

    // Peer cohort for this row, in the SAME display units as the bar
    // (p25/p75 scaled like the median; min/max = the bar's range). Set only
    // when the backend returned a real cohort (n > 0 and quartiles present),
    // so coloring + the drilldown strip read the same cohort that drew the
    // bar. p50 = the (scaled) median; min/max = dispMin/dispMax.
    const peerScale = (v: number | null | undefined): number | null =>
      v == null || !Number.isFinite(v)
        ? null
        : scaled
          ? Math.round((v / 24) * 10) / 10
          : v;
    const peerP25 = peerScale(r.p25);
    const peerP75 = peerScale(r.p75);
    const peer: PeerStats | undefined =
      r.n != null &&
      r.n > 0 &&
      median != null &&
      Number.isFinite(median) &&
      peerP25 != null &&
      peerP75 != null
        ? {
            p25: peerP25,
            p50: median,
            p75: peerP75,
            min: dispMin,
            max: dispMax,
            n: r.n,
          }
        : undefined;

    out.push({
      period,
      section,
      metric_key: r.metric_key,
      label,
      sublabel,
      value: formatBulletValue(dispVal, dispUnit),
      unit: dispUnit,
      range_min: formatRangeStr(dispMin, dispUnit),
      range_max: formatRangeStr(dispMax, dispUnit),
      median: median != null ? formatBulletValue(median, dispUnit) : '—',
      median_label: median != null ? `Median: ${medianFormatted}` : '',
      bar_left_pct: 0,
      bar_width_pct: pctInRange(dispVal, dispMin, dispMax),
      median_left_pct:
        median != null ? pctInRange(median, dispMin, dispMax) : 0,
      ...(peer ? { peer } : {}),
      // schema_status='error' suppresses threshold-based coloring per DESIGN
      // §3.3: bar dimensions render normally but the row is flagged so
      // consumers can show the "Metric source unavailable" indicator.
      status: isSchemaError
        ? 'unavailable'
        : evaluateStatus(
            r.value,
            { good: goodThr, warn: warnThr },
            higherIsBetter,
          ),
      drill_id: '',
      source_tags: catalogRow.source_tags,
      ...(isSchemaError ? { schema_error: true } : {}),
    });
  }
  return out;
}


export function transformLocTrend(
  rows: RawLocTrendRow[],
  range: DateRange,
): LocDataPoint[] {
  const g = bucketGranularity(range);
  const byBucket = new Map<string, LocDataPoint>();
  for (const r of rows) {
    const key = bucketStart(r.date_bucket, g);
    let point = byBucket.get(key);
    if (!point) {
      point = { label: formatDateLabel(key, g), codeLoc: 0, specLines: 0, configLoc: 0 };
      byBucket.set(key, point);
    }
    point.codeLoc += r.code_loc;
    point.specLines += r.spec_lines;
    point.configLoc += r.config_loc;
  }
  return [...byBucket.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, point]) => point);
}

export function transformDeliveryTrend(
  rows: RawDeliveryTrendRow[],
  range: DateRange,
): DeliveryDataPoint[] {
  const g = bucketGranularity(range);
  const byBucket = new Map<string, DeliveryDataPoint>();
  for (const r of rows) {
    const key = bucketStart(r.date_bucket, g);
    let point = byBucket.get(key);
    if (!point) {
      point = { label: formatDateLabel(key, g), commits: 0, prsMerged: 0, tasksDone: 0 };
      byBucket.set(key, point);
    }
    point.commits += r.commits;
    point.prsMerged = (point.prsMerged ?? 0) + (r.prs_merged ?? 0);
    point.tasksDone += r.tasks_done;
  }
  return [...byBucket.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, point]) => point);
}

export function transformTeamMembers(
  rows: RawTeamMemberRow[],
  period: PeriodValue,
): TeamMember[] {
  // tasks_closed / bugs_fixed are non-nullable from the seed (sum over
  // jira_closed_tasks with ifNull(x, 0)), so rounding is fine. prs_merged is
  // nullable — preserve null so MembersTable renders em-dash instead of "0".
  const roundOrNull = (v: number | null | undefined): number | null =>
    v == null || !Number.isFinite(v) ? null : Math.round(v);

  return rows.map((r) => ({
    person_id: r.person_id,
    period,
    name: r.display_name,
    seniority: r.seniority,
    supervisor_email: r.supervisor_email,
    org_unit_id: r.org_unit_id ?? null,
    tasks_closed: Math.round(r.tasks_closed),
    bugs_fixed: Math.round(r.bugs_fixed),
    dev_time_h: r.dev_time_h,
    prs_merged: roundOrNull(r.prs_merged),
    build_success_pct: r.build_success_pct,
    focus_time_pct: r.focus_time_pct,
    ai_tools: r.ai_tools,
    ai_loc_share_pct: r.ai_loc_share_pct,
  }));
}

export function transformTimeOff(row: RawTimeOffRow): TimeOffNotice {
  return {
    days: row.days,
    dateRange: row.date_range,
    bambooHrUrl: row.bamboo_hr_url,
  };
}

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

// ---------------------------------------------------------------------------
// CRM (sales-rep dashboard)
// ---------------------------------------------------------------------------

function numCoerce(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function transformCrmKpis(row: RawCrmKpisRow | null): CrmKpis | null {
  if (row === null) return null;
  return {
    dealsOpened: numCoerce(row.deals_opened),
    dealsClosed: numCoerce(row.deals_closed),
    dealsWon: numCoerce(row.deals_won),
    dealsValueClosed: numCoerce(row.deals_value_closed),
    commsCount: numCoerce(row.comms_count),
    pipelineCount: numCoerce(row.pipeline_count),
    pipelineValue: numCoerce(row.pipeline_value),
  };
}

export function transformCrmFlow(rows: RawCrmFlowRow[]): CrmFlowPoint[] {
  return [...rows]
    .sort((a, b) => a.metric_date.localeCompare(b.metric_date))
    .map((r) => ({
      label: r.date_bucket,
      opened: numCoerce(r.opened),
      closed: numCoerce(r.closed),
      won: numCoerce(r.won),
    }));
}

function fmtCrm(v: number | null, unit: string): string {
  if (v === null || !Number.isFinite(v)) return '—';
  if (unit === '%') return `${v.toFixed(1)}%`;
  if (unit === 'd') return `${v.toFixed(1)}d`;
  if (unit === '$') {
    const a = Math.abs(v);
    if (a >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (a >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
    return `$${v.toFixed(0)}`;
  }
  return new Intl.NumberFormat('en-US').format(Math.round(v));
}

/** Wire prefix for all CRM bullet rows — matches the BE seed migration. */
const CRM_BULLET_PREFIX = 'crm_bullet_rows.';

/**
 * `bareKeys` is the per-section emission order — Quality and Activity
 * share the `crm_bullet_rows.*` storage table but each query emits a
 * disjoint subset, and UI layout pins the column order. The CH query
 * order is unconstrained, so the FE replays the canonical ordering
 * here.
 */
export function transformCrmBullets(
  rows: RawBulletAggregateRow[],
  period: PeriodValue,
  section: string,
  bareKeys: readonly string[],
  catalog: CatalogResponse | undefined,
): BulletMetric[] {
  // No catalog → no labels → consumers render skeletons. Mirrors
  // `transformBulletMetrics`'s contract (post-#82).
  if (!catalog) return [];

  const catalogByBareKey = new Map<string, CatalogMetric>();
  for (const m of catalog.metrics) {
    if (!m.metric_key || !m.metric_key.startsWith(CRM_BULLET_PREFIX)) continue;
    const bare = m.metric_key.slice(CRM_BULLET_PREFIX.length);
    if (!catalogByBareKey.has(bare)) catalogByBareKey.set(bare, m);
  }

  const byKey = keyBy(rows, 'metric_key');
  const out: BulletMetric[] = [];
  for (const bareKey of bareKeys) {
    const catalogRow = catalogByBareKey.get(bareKey);
    // Missing-id (catalog row absent for this bare key) → silently
    // omit per DESIGN §3.3. Shouldn't happen once the seed migration
    // is in production; defensive against pre-deploy / stale catalog.
    if (!catalogRow) continue;

    const label = catalogRow.label;
    const sublabel = catalogRow.sublabel ?? '';
    const unit = catalogRow.unit ?? '';
    const higherIsBetter = catalogRow.higher_is_better;

    const r = byKey[bareKey] as RawBulletAggregateRow | undefined;
    const value = r?.value ?? null;
    const median = r?.median ?? null;
    const rMin = r?.range_min ?? null;
    const rMax = r?.range_max ?? null;

    const distAvailable =
      value !== null && rMin !== null && rMax !== null && rMin !== rMax;
    if (!distAvailable) {
      out.push({
        period,
        section,
        metric_key: bareKey,
        label,
        sublabel,
        value: fmtCrm(value, unit),
        unit,
        range_min: '—',
        range_max: '—',
        median: '—',
        median_label: '',
        bar_left_pct: 0,
        bar_width_pct: 0,
        median_left_pct: 0,
        status: 'unavailable',
        drill_id: '',
      });
      continue;
    }

    const safeValue = value as number;
    const safeMedian = median as number | null;
    const safeMin = rMin as number;
    const safeMax = rMax as number;
    const barWidthPct = pctInRange(safeValue, safeMin, safeMax);
    const medianLeftPct =
      safeMedian !== null ? pctInRange(safeMedian, safeMin, safeMax) : 0;

    let status: 'good' | 'warn' | 'bad' = 'warn';
    if (safeMedian !== null) {
      const diff = safeValue - safeMedian;
      const tolerance = Math.abs(safeMedian) * 0.1;
      if (Math.abs(diff) <= tolerance) status = 'warn';
      else if ((diff > 0) === higherIsBetter) status = 'good';
      else status = 'bad';
    }

    out.push({
      period,
      section,
      metric_key: bareKey,
      label,
      sublabel,
      value: fmtCrm(safeValue, unit),
      unit,
      range_min: fmtCrm(safeMin, unit),
      range_max: fmtCrm(safeMax, unit),
      median: fmtCrm(safeMedian, unit),
      median_label:
        safeMedian !== null ? `Median: ${fmtCrm(safeMedian, unit)}` : '',
      bar_left_pct: 0,
      bar_width_pct: barWidthPct,
      median_left_pct: medianLeftPct,
      status,
      drill_id: '',
    });
  }
  return out;
}
