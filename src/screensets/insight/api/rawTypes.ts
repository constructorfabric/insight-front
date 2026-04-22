/**
 * Raw API response types
 *
 * TypeScript interfaces for the snake_case rows returned by ClickHouse via
 * the Analytics API.  These mirror the backend column names exactly.
 *
 * The transform layer (transforms.ts) maps these into the UI types defined
 * in ../types/index.ts.
 */

// ---------------------------------------------------------------------------
// Executive View  (POST /metrics/{EXEC_SUMMARY}/query)
// ---------------------------------------------------------------------------

export type RawExecSummaryRow = {
  org_unit_id: string;
  org_unit_name: string;
  headcount: number;
  tasks_closed: number | null;
  bugs_fixed: number | null;
  build_success_pct: number | null;
  focus_time_pct: number;
  ai_adoption_pct: number;
  ai_loc_share_pct: number;
  pr_cycle_time_h: number;
};

// ---------------------------------------------------------------------------
// IC KPIs  (POST /metrics/{IC_KPIS}/query)
// ---------------------------------------------------------------------------

export type RawIcAggregateRow = {
  person_id: string;
  loc: number;
  ai_loc_share_pct: number;
  prs_merged: number;
  pr_cycle_time_h: number;
  focus_time_pct: number;
  tasks_closed: number;
  bugs_fixed: number;
  build_success_pct: number | null;
  ai_sessions: number;
};

// ---------------------------------------------------------------------------
// Team Members  (POST /metrics/{TEAM_MEMBER}/query)
// ---------------------------------------------------------------------------

export type RawTeamMemberRow = {
  person_id: string;
  display_name: string;
  seniority: string;
  supervisor_email: string | null;
  tasks_closed: number;
  bugs_fixed: number;
  dev_time_h: number | null;         // null when focus metrics missing (no silver.class_focus_metrics row)
  prs_merged: number;
  build_success_pct: number | null;
  focus_time_pct: number | null;     // null when focus metrics missing
  ai_tools: string[];
  ai_loc_share_pct: number | null;   // null when Cursor row absent for this person
};

// ---------------------------------------------------------------------------
// Charts  (POST /metrics/{IC_CHART_LOC}/query)
// ---------------------------------------------------------------------------

export type RawLocTrendRow = {
  date_bucket: string;
  ai_loc: number;
  code_loc: number;
  spec_lines: number;
};

// ---------------------------------------------------------------------------
// Charts  (POST /metrics/{IC_CHART_DELIVERY}/query)
// ---------------------------------------------------------------------------

export type RawDeliveryTrendRow = {
  date_bucket: string;
  commits: number;
  prs_merged: number;
  tasks_done: number;
};

// ---------------------------------------------------------------------------
// Bullet Aggregates  (POST /metrics/{*_BULLET_*}/query)
// ---------------------------------------------------------------------------

export type RawBulletAggregateRow = {
  metric_key: string;
  value: number;
  median: number | null;
  range_min: number | null;
  range_max: number | null;
};

// ---------------------------------------------------------------------------
// Time Off  (POST /metrics/{IC_TIMEOFF}/query)
// ---------------------------------------------------------------------------

export type RawTimeOffRow = {
  days: number;
  date_range: string;
  bamboo_hr_url: string;
};

// ---------------------------------------------------------------------------
// Drill Detail  (POST /metrics/{IC_DRILL}/query)
// ---------------------------------------------------------------------------

export type RawDrillRow = {
  title: string;
  source: string;
  src_class: string;
  value: string;
  filter: string;
  columns: string[];
  rows: Array<Record<string, string | number>>;
};
