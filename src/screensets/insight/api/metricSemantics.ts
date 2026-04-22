/**
 * Metric Semantics — single source of truth for metric thresholds and
 * directionality across Executive, Team, and IC views.
 *
 * Previously, the same metric was defined with divergent good/warn/alert
 * thresholds in three places (EXEC_VIEW_CONFIG.column_thresholds,
 * TEAM_VIEW_CONFIG.alert_thresholds, TEAM_VIEW_CONFIG.column_thresholds),
 * which meant the same value could show "warn" on one screen and "good" on
 * another. This module consolidates them.
 *
 * Status rules:
 *   higher_is_better=true  → value >= good: good; >= warn: warn; else bad.
 *   higher_is_better=false → value <= good: good; <= warn: warn; else bad.
 *
 * Alert rules (for Team View AttentionNeeded):
 *   An alert fires when value is worse than the `alert.trigger` level, and
 *   becomes severe below `alert.bad`. Omit `alert` for metrics that do not
 *   participate in team-level alerts.
 *
 * NOTE — operational thresholds below are sensible FE defaults, NOT
 * tenant-specific policy. A 90% build-success target may be aggressive for
 * one org and lax for another. Longer term these should come from a
 * tenant-scoped config endpoint on the backend (per-tenant overrides with
 * these as fallbacks). Until that API exists, treat the values here as the
 * single editable place — keep them in sync with whatever product docs
 * promise the customer.
 */

export type MetricSemantics = {
  metric_key: string;
  unit: string;
  higher_is_better: boolean;
  /** Status threshold — values from here onwards are "good". */
  good: number;
  /** Status threshold — below "good" but not yet "bad". */
  warn: number;
  /** Team-view AttentionNeeded alert config, when applicable. */
  alert?: {
    trigger: number;
    bad: number;
    reason: string;
  };
};

export const METRIC_SEMANTICS = {
  build_success_pct: {
    metric_key: 'build_success_pct',
    unit: '%',
    higher_is_better: true,
    good: 90,
    warn: 80,
    alert: { trigger: 90, bad: 80, reason: 'Build success rate below 90% target' },
  },
  focus_time_pct: {
    metric_key: 'focus_time_pct',
    unit: '%',
    higher_is_better: true,
    good: 60,
    warn: 50,
    alert: { trigger: 60, bad: 48, reason: 'Focus time below 60% target' },
  },
  ai_adoption_pct: {
    metric_key: 'ai_adoption_pct',
    unit: '%',
    higher_is_better: true,
    good: 60,
    warn: 40,
  },
  ai_loc_share_pct: {
    metric_key: 'ai_loc_share_pct',
    unit: '%',
    higher_is_better: true,
    good: 20,
    warn: 10,
    alert: { trigger: 10, bad: 8, reason: 'Low AI tool adoption' },
  },
  dev_time_h: {
    metric_key: 'dev_time_h',
    unit: 'h',
    higher_is_better: false,
    good: 14,
    warn: 20,
  },
  bugs_fixed: {
    metric_key: 'bugs_fixed',
    unit: '',
    higher_is_better: true,
    good: 15,
    warn: 8,
  },
} as const satisfies Record<string, MetricSemantics>;

export type MetricSemanticsKey = keyof typeof METRIC_SEMANTICS;

/**
 * Team-health thresholds for deriveTeamKpis chips (At Risk / Focus / Not
 * Using AI). Values are fractions of headcount, so the chip status scales
 * with team size instead of using a fixed absolute "≤ 2 → warn" rule that
 * collapses for teams larger than a few people.
 *
 * Same tenant-config caveat as METRIC_SEMANTICS above.
 */
export const TEAM_HEALTH_THRESHOLDS = {
  /** Strictly below this fraction → status is 'warn'. Below zero means "any". */
  warnPct: 0.10,
  /** From this fraction onward → status is 'bad'. */
  badPct: 0.25,
} as const;

/**
 * Translate a count of affected members into a status chip, scaled against
 * team size. `count===0` is always 'good' so an all-healthy team still reads
 * 'good' regardless of how small the team is.
 */
export function teamHealthStatus(
  count: number,
  teamSize: number,
): 'good' | 'warn' | 'bad' {
  if (count <= 0 || teamSize <= 0) return 'good';
  const pct = count / teamSize;
  if (pct >= TEAM_HEALTH_THRESHOLDS.badPct) return 'bad';
  if (pct >= TEAM_HEALTH_THRESHOLDS.warnPct) return 'warn';
  return 'good';
}

/** Shared status evaluator — same rule on every screen. */
export function evaluateStatus(
  value: number,
  sem: Pick<MetricSemantics, 'good' | 'warn' | 'higher_is_better'>,
): 'good' | 'warn' | 'bad' {
  if (sem.higher_is_better) {
    if (value >= sem.good) return 'good';
    if (value >= sem.warn) return 'warn';
    return 'bad';
  }
  if (value <= sem.good) return 'good';
  if (value <= sem.warn) return 'warn';
  return 'bad';
}
