/**
 * insight Types
 * Shared type definitions for this screenset
 */

// ---------------------------------------------------------------------------
// Metric Key Catalog
// Single source of truth for metric labels, units, and data source annotations.
// ---------------------------------------------------------------------------

export type MetricV1Status = 'available' | 'pending' | 'missing';

export interface MetricKeyDef {
  key:       string;
  label:     string;
  unit:      string;
  sourceTag: string;   // human-readable data source, e.g. "GitHub / Bitbucket"
  v1Status:  MetricV1Status;
}

export const METRIC_KEYS = {
  // --- delivery ---
  tasks_closed:      { key: 'tasks_closed',      label: 'Tasks Closed',        unit: '',   sourceTag: 'Jira',                  v1Status: 'pending'   },
  bugs_fixed:        { key: 'bugs_fixed',         label: 'Bugs Fixed',          unit: '',   sourceTag: 'Jira',                  v1Status: 'pending'   },
  tasks_per_sprint:  { key: 'tasks_per_sprint',   label: 'Tasks per Sprint',    unit: '',   sourceTag: 'Jira',                  v1Status: 'pending'   },
  // --- git ---
  prs_merged:        { key: 'prs_merged',         label: 'PRs Merged',          unit: '',   sourceTag: 'GitHub / Bitbucket',    v1Status: 'available' },
  pr_cycle_time_h:   { key: 'pr_cycle_time_h',    label: 'PR Cycle Time',       unit: 'h',  sourceTag: 'GitHub / Bitbucket',    v1Status: 'available' },
  pr_review_time_h:  { key: 'pr_review_time_h',   label: 'PR Review Time',      unit: 'h',  sourceTag: 'GitHub / Bitbucket',    v1Status: 'available' },
  loc_per_day:       { key: 'loc_per_day',         label: 'LOC per Day',         unit: '',   sourceTag: 'GitHub / Bitbucket',    v1Status: 'available' },
  loc:               { key: 'loc',                 label: 'Clean LOC',           unit: '',   sourceTag: 'GitHub / Bitbucket',    v1Status: 'available' },
  // --- CI ---
  build_success_pct: { key: 'build_success_pct',  label: 'Build Success Rate',  unit: '%',  sourceTag: 'CI',                    v1Status: 'available' },
  // --- focus / comms ---
  focus_time_pct:    { key: 'focus_time_pct',      label: 'Focus Time',          unit: '%',  sourceTag: 'Calendar / M365',       v1Status: 'available' },
  dev_time_h:        { key: 'dev_time_h',           label: 'Dev Time',            unit: 'h',  sourceTag: 'Calendar / M365',       v1Status: 'available' },
  // --- collab / Slack ---
  slack_thread_participation: { key: 'slack_thread_participation', label: 'Thread Participation', unit: 'msgs', sourceTag: 'Slack',               v1Status: 'pending' },
  slack_message_engagement:   { key: 'slack_message_engagement',   label: 'Message Engagement',   unit: 'avg replies', sourceTag: 'Slack',          v1Status: 'pending' },
  slack_dm_ratio:             { key: 'slack_dm_ratio',             label: 'DM Ratio',             unit: '%',   sourceTag: 'Slack',               v1Status: 'pending' },
  // --- collab / M365 ---
  m365_teams_messages: { key: 'm365_teams_messages', label: 'Teams Messages', unit: 'msgs',   sourceTag: 'Microsoft Teams',   v1Status: 'pending' },
  m365_emails_sent:    { key: 'm365_emails_sent',    label: 'Emails Sent',    unit: 'emails', sourceTag: 'M365',              v1Status: 'pending' },
  m365_files_shared:   { key: 'm365_files_shared',   label: 'Files Shared',   unit: 'files',  sourceTag: 'M365',              v1Status: 'pending' },
  // --- collab / meetings ---
  meeting_hours: { key: 'meeting_hours', label: 'Meeting Hours',      unit: 'h',    sourceTag: 'Zoom / M365',       v1Status: 'pending' },
  zoom_calls:    { key: 'zoom_calls',    label: 'Zoom Calls',         unit: 'calls',sourceTag: 'Zoom',              v1Status: 'pending' },
  meeting_free:  { key: 'meeting_free',  label: 'Meeting-Free Days',  unit: 'days', sourceTag: 'Zoom / M365',       v1Status: 'pending' },
  // --- AI ---
  ai_loc_share_pct:  { key: 'ai_loc_share_pct',    label: 'AI LOC Share',        unit: '%',  sourceTag: 'Cursor + Claude Code',  v1Status: 'available' },
  ai_adoption_pct:   { key: 'ai_adoption_pct',     label: 'AI Adoption',         unit: '%',  sourceTag: 'Cursor + Claude Code',  v1Status: 'available' },
  ai_sessions:       { key: 'ai_sessions',          label: 'AI Sessions',         unit: '',   sourceTag: 'Cursor + Claude Code',  v1Status: 'available' },
  // --- AI tools / Cursor ---
  cursor_completions: { key: 'cursor_completions', label: 'Cursor Completions',        unit: '',   sourceTag: 'Cursor',                      v1Status: 'pending' },
  cursor_agents:      { key: 'cursor_agents',      label: 'Cursor Agent Sessions',     unit: '',   sourceTag: 'Cursor',                      v1Status: 'pending' },
  cursor_lines:       { key: 'cursor_lines',       label: 'Lines Accepted',            unit: '',   sourceTag: 'Cursor',                      v1Status: 'pending' },
  // --- AI tools / Claude Code ---
  cc_sessions:    { key: 'cc_sessions',    label: 'Claude Code Sessions',    unit: '',   sourceTag: 'Anthropic Enterprise API',    v1Status: 'pending' },
  cc_tool_accept: { key: 'cc_tool_accept', label: 'Tool Acceptance Rate',    unit: '%',  sourceTag: 'Anthropic Enterprise API',    v1Status: 'pending' },
  cc_lines:       { key: 'cc_lines',       label: 'Lines Added (Claude Code)', unit: '', sourceTag: 'Anthropic Enterprise API',    v1Status: 'pending' },
  ai_loc_share2:  { key: 'ai_loc_share2',  label: 'AI LOC Share',            unit: '%',  sourceTag: 'Cursor + Claude Code',        v1Status: 'pending' },
  // --- AI tools / web ---
  claude_web: { key: 'claude_web', label: 'Claude Web Usage', unit: '',  sourceTag: 'Claude Web',  v1Status: 'pending' },
  chatgpt:    { key: 'chatgpt',    label: 'ChatGPT Usage',    unit: '',  sourceTag: 'ChatGPT',     v1Status: 'pending' },
  // --- computed ---
  at_risk_count:     { key: 'at_risk_count',        label: 'Members at Risk',     unit: '',   sourceTag: 'computed',              v1Status: 'available' },
  focus_gte_60:      { key: 'focus_gte_60',         label: 'Focus ≥ 60%',         unit: '',   sourceTag: 'computed',              v1Status: 'available' },
  not_using_ai:      { key: 'not_using_ai',         label: 'Not Using AI',        unit: '',   sourceTag: 'computed',              v1Status: 'available' },
  avg_pr_cycle:      { key: 'avg_pr_cycle',         label: 'Avg PR Cycle',        unit: 'h',  sourceTag: 'GitHub / Bitbucket',    v1Status: 'available' },
  total_loc:         { key: 'total_loc',            label: 'Total LOC',           unit: '',   sourceTag: 'GitHub / Bitbucket',    v1Status: 'available' },
} as const satisfies Record<string, MetricKeyDef>;

export type MetricKeyName = keyof typeof METRIC_KEYS;

// ---------------------------------------------------------------------------
// Analytics API — OData query contract
// ---------------------------------------------------------------------------

/** OData parameters sent in the POST body to /api/analytics/v1/metrics/{id}/query */
export interface ODataParams {
  $filter?:  string;
  $orderby?: string;
  $top?:     number;
  $select?:  string;
  $skip?:    string;
}

/** Standard paginated response envelope from Analytics API */
export interface ODataResponse<T> {
  items:     T[];
  page_info: { has_next: boolean; cursor: string | null };
}

/** Per-field threshold evaluation attached to each query response row by the backend */
export type ThresholdLevel = 'good' | 'warning' | 'critical';
export type Thresholds = Record<string, ThresholdLevel>;

// ---------------------------------------------------------------------------
// Connector Manager — data availability
// ---------------------------------------------------------------------------

export type ConnectorAvailability = 'available' | 'no-connector' | 'syncing';

/** Raw response from GET /api/connectors/v1/connections/{id}/status */
export interface ConnectorStatus {
  id:     string;
  name:   string;
  status: ConnectorAvailability;
}

export type UserRole = 'executive' | 'team_lead' | 'ic';

export interface CurrentUser {
  personId: string;
  name: string;
  role: UserRole;
  teamId: string;
  /** Identity Resolution data — attached when loaded from real service */
  _identity?: import('@/app/types/identity').IdentityPerson;
}

export type ChartDataPoint = {
  date: string;
  aiLoc: number;
  commitLoc: number;
};

export type StatCard = {
  key: string;
  value: string;
  sub: string;
};

export type BottomMetric = {
  key: string;
  value: string;
};

export type PeriodSplit = {
  label: string;
  value: number;
};

export type DashboardData = {
  stats: StatCard[];
  chartData: ChartDataPoint[];
  bottomMetrics: BottomMetric[];
  periodSplits: PeriodSplit[];
  periodDelta: number;
};


export type SpeedData = {
  value: number;
  min: number;
  max: number;
  unit: string;
  label: string;
};

// Period
export type PeriodValue = 'week' | 'month' | 'quarter' | 'year';
export type CustomRange = { from: string; to: string };
export type ViewMode = 'chart' | 'tile';
export interface PeriodState {
  period: PeriodValue;
  customRange: CustomRange | null;
  scale: number;
}

// Executive View Config
export interface ExecColumnThreshold {
  metric_key: string;
  threshold: number;
}
export interface ExecViewConfig {
  column_thresholds: ExecColumnThreshold[];
}

// Executive View
export type DataAvailability = {
  git:   'available' | 'no-connector' | 'syncing';
  tasks: 'available' | 'no-connector' | 'syncing';
  ci:    'available' | 'no-connector' | 'syncing';
  comms: 'available' | 'no-connector' | 'syncing';
  hr:    'available' | 'no-connector' | 'syncing';
  ai:    'available' | 'no-connector' | 'syncing';
};

export interface ExecTeamRow {
  team_id: string;
  team_name: string;
  headcount: number;
  tasks_closed: number | null;   // null when [tasks] connector not configured
  bugs_fixed: number | null;     // null when [tasks] connector not configured
  build_success_pct: number | null; // null when [ci] connector not configured
  focus_time_pct: number;
  ai_adoption_pct: number;
  ai_loc_share_pct: number;
  pr_cycle_time_h: number;
  status: 'good' | 'warn' | 'bad';
}
export interface OrgKpis {
  avgBuildSuccess:    number | null;  // null when [ci] not configured
  avgAiAdoption:      number | null;  // null when no team data
  avgFocus:           number | null;  // null when no team data
  bugResolutionScore: number | null;  // null when [tasks] not configured
  prCycleScore:       number | null;  // null when no team data
}
export interface ExecViewData {
  teams: ExecTeamRow[];
  orgKpis: OrgKpis;
  config: ExecViewConfig;
  // data_availability loaded separately via ConnectorManagerService
}

// Team View
export interface TeamKpi {
  metric_key: string;
  label: string;
  value: string;
  unit: string;
  sublabel?: string;
  chipLabel?: string;
  description?: string;
  status: 'good' | 'warn' | 'bad';
  section: string;
}
export interface TeamMember {
  person_id: string;
  period: PeriodValue;
  name: string;
  seniority: string;
  supervisor_email: string | null;
  tasks_closed: number;
  bugs_fixed: number;
  dev_time_h: number;
  prs_merged: number;
  build_success_pct: number | null; // null when [ci] connector not configured
  focus_time_pct: number;
  ai_tools: string[];
  ai_loc_share_pct: number;
  // trend_label dropped — frontend derives trend from multi-period delta (see FE-08)
}
export interface BulletMetric {
  period: PeriodValue;
  section: string;
  metric_key: string;
  label: string;
  sublabel?: string;
  value: string;
  unit: string;
  range_min: string;
  range_max: string;
  median: string;
  median_label: string;
  bar_left_pct: number;
  bar_width_pct: number;
  median_left_pct: number;
  status: 'good' | 'warn' | 'bad';
  drill_id: string;
}
export interface BulletSection {
  id: string;
  title: string;
  metrics: BulletMetric[];
}
export interface AlertThreshold {
  metric_key: string;
  trigger: number;
  bad: number;
  reason: string;
}
export interface ColumnThreshold {
  metric_key: string;
  good: number;
  warn: number;
  higher_is_better: boolean;
}
export interface TeamViewConfig {
  alert_thresholds: AlertThreshold[];
  column_thresholds: ColumnThreshold[];
}
export interface TeamViewData {
  teamName: string;
  teamKpis: TeamKpi[];
  members: TeamMember[];
  bulletSections: BulletSection[];
  config: TeamViewConfig;
  // data_availability loaded separately via ConnectorManagerService
}

// IC Dashboard
export interface PersonData {
  person_id: string;
  name: string;
  role: string;
  seniority: string;
}
export interface IcKpi {
  period: PeriodValue;
  metric_key: string;
  label: string;
  /**
   * Formatted value, or `null` when the backend returned NULL (source not
   * ingested yet). Rendered as a ComingSoon chip in KpiStrip instead of a
   * fake zero.
   */
  value: string | null;
  unit: string;
  sublabel: string;
  description?: string;
  delta: string;
  delta_type: 'good' | 'warn' | 'bad' | 'neutral';
}
export interface TimeOffNotice {
  days: number;
  dateRange: string;
  bambooHrUrl: string;
}
export interface LocDataPoint {
  label: string;
  aiLoc: number;
  codeLoc: number;
  specLines: number;
}
export interface DeliveryDataPoint {
  label: string;
  commits: number;
  prsMerged: number;
  tasksDone: number;
}
export interface IcChartsData {
  locTrend: LocDataPoint[];
  deliveryTrend: DeliveryDataPoint[];
}
export interface DrillRow {
  [key: string]: string | number;
}
export interface DrillData {
  title: string;
  source: string;
  srcClass: string;
  value: string;
  filter: string;
  columns: string[];
  rows: DrillRow[];
}
export interface IcDashboardData {
  // person loaded separately via IdentityApiService
  kpis: IcKpi[];
  bulletMetrics: BulletMetric[];
  charts: IcChartsData;
  timeOffNotice: TimeOffNotice | null;
  drills: Record<string, DrillData>;
  // data_availability loaded separately via ConnectorManagerService
}
