/**
 * Mock Data Factories
 *
 * Generates raw backend data matching the exact ClickHouse response format.
 * Every factory returns data typed as the raw type EXACTLY.
 * No external dependencies -- just pure functions with built-in defaults.
 */

import type {
  RawExecSummaryRow,
  RawTeamMemberRow,
  RawIcAggregateRow,
  RawLocTrendRow,
  RawDeliveryTrendRow,
  RawBulletAggregateRow,
} from '../rawTypes';
import { BULLET_DEFS } from '../thresholdConfig';

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Deterministic pseudo-random variation based on index */
function vary(base: number, index: number, spread: number): number {
  const hash = Math.sin(index * 9301 + 49297) * 49297;
  const factor = (hash - Math.floor(hash)) * 2 - 1; // -1 to 1
  return Math.round((base + factor * spread) * 10) / 10;
}

/** ISO date string for N weeks ago from today */
function isoDate(weeksAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - weeksAgo * 7);
  return d.toISOString().split('T')[0];
}

/** Simple hash of a string to a number (deterministic) */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ---------------------------------------------------------------------------
// Data pools
// ---------------------------------------------------------------------------

import { TEAMS, PEOPLE, teamMembers, teamHeadcount } from './registry';
export { TEAMS, PEOPLE, teamMembers, teamHeadcount };

// ---------------------------------------------------------------------------
// IC bullet metric definitions (no BULLET_DEFS entries for these)
// ---------------------------------------------------------------------------

type IcBulletDef = {
  metric_key: string;
  section: string;
  label: string;
  sublabel: string;
  unit: string;
  range_min: string;
  range_max: string;
  median: number;
  median_label: string;
  bar_width_pct: number;
  median_left_pct: number;
  status: string;
  drill_id: string;
  defaultValue: number;
};

const IC_BULLET_DEFS: IcBulletDef[] = [
  // task_delivery
  { metric_key: 'tasks_completed', section: 'task_delivery', label: 'Tasks Completed', sublabel: 'Jira \u00b7 closed issues in sprint', unit: 'count', range_min: '0', range_max: '15', median: 7, median_label: 'Median: 7', bar_width_pct: 80, median_left_pct: 47, status: 'good', drill_id: 'tasks-completed', defaultValue: 12 },
  { metric_key: 'task_dev_time', section: 'task_delivery', label: 'Task Development Time', sublabel: 'Jira \u00b7 time in In Progress state \u00b7 lower = better', unit: 'h', range_min: '8h', range_max: '31h', median: 15, median_label: 'Median: 15h', bar_width_pct: 43, median_left_pct: 48, status: 'good', drill_id: 'cycle-time', defaultValue: 14 },
  { metric_key: 'estimation_accuracy', section: 'task_delivery', label: 'Estimation Accuracy', sublabel: 'Jira \u00b7 tasks within \u00b120% of original estimate', unit: '\u00d7', range_min: '0\u00d7', range_max: '3\u00d7', median: 0, median_label: 'Target 0.9\u20131.3\u00d7', bar_width_pct: 22, median_left_pct: 33, status: 'good', drill_id: '', defaultValue: 1.1 },
  { metric_key: 'task_reopen_rate', section: 'task_delivery', label: 'Task Reopen Rate', sublabel: 'Jira \u00b7 closed then reopened within 14 days \u00b7 lower = better', unit: '%', range_min: '0%', range_max: '15%', median: 5, median_label: 'Median: 5%', bar_width_pct: 27, median_left_pct: 33, status: 'good', drill_id: 'task-reopen', defaultValue: 4 },
  { metric_key: 'due_date_compliance', section: 'task_delivery', label: 'Due Date Compliance', sublabel: 'Jira \u00b7 tasks closed by due date', unit: '%', range_min: '40%', range_max: '100%', median: 72, median_label: 'Median: 72%', bar_width_pct: 87, median_left_pct: 53, status: 'good', drill_id: '', defaultValue: 92 },
  // git_output
  { metric_key: 'commits', section: 'git_output', label: 'Commits Created', sublabel: 'Bitbucket \u00b7 commits authored', unit: 'count', range_min: '8', range_max: '55', median: 22, median_label: 'Median: 22', bar_width_pct: 55, median_left_pct: 30, status: 'good', drill_id: 'commits', defaultValue: 34 },
  { metric_key: 'prs_created', section: 'git_output', label: 'Pull Requests Created', sublabel: 'Bitbucket \u00b7 PRs authored', unit: 'count', range_min: '2', range_max: '14', median: 6, median_label: 'Median: 6', bar_width_pct: 75, median_left_pct: 33, status: 'good', drill_id: 'pull-requests', defaultValue: 11 },
  { metric_key: 'prs_merged', section: 'git_output', label: 'Pull Requests Merged', sublabel: 'Bitbucket \u00b7 authored and merged', unit: 'count', range_min: '0', range_max: '20', median: 6, median_label: 'Median: 6', bar_width_pct: 45, median_left_pct: 38, status: 'good', drill_id: '', defaultValue: 9 },
  { metric_key: 'clean_loc', section: 'git_output', label: 'Clean LOC', sublabel: 'Bitbucket \u00b7 lines added \u00b7 excl. spec/config', unit: 'count', range_min: '1k', range_max: '18k', median: 7000, median_label: 'Median: 7k', bar_width_pct: 65, median_left_pct: 35, status: 'good', drill_id: '', defaultValue: 12000 },
  // code_quality
  { metric_key: 'reviews_given', section: 'code_quality', label: 'Reviews Given', sublabel: 'Bitbucket \u00b7 PRs reviewed', unit: 'count', range_min: '0', range_max: '20', median: 8, median_label: 'Median: 8', bar_width_pct: 70, median_left_pct: 40, status: 'good', drill_id: 'reviews', defaultValue: 14 },
  { metric_key: 'rework_ratio', section: 'code_quality', label: 'Rework Ratio', sublabel: 'Bitbucket \u00b7 lines changed in follow-up commits \u00b7 lower = better', unit: '%', range_min: '0%', range_max: '50%', median: 0, median_label: 'Target <20%', bar_width_pct: 12, median_left_pct: 20, status: 'good', drill_id: '', defaultValue: 12 },
  { metric_key: 'build_success', section: 'code_quality', label: 'Build Success Rate', sublabel: 'CI \u00b7 passed \u00f7 total runs \u00b7 target \u226590%', unit: '%', range_min: '0%', range_max: '100%', median: 87, median_label: 'Target \u226590% \u00b7 Median: 87%', bar_width_pct: 94, median_left_pct: 83, status: 'good', drill_id: 'builds', defaultValue: 94 },
  { metric_key: 'pr_cycle_time', section: 'code_quality', label: 'Pull Request Cycle Time', sublabel: 'Bitbucket \u00b7 PR opened \u2192 merged \u00b7 lower = better', unit: 'h', range_min: '0h', range_max: '72h', median: 24, median_label: 'Median: 24h', bar_width_pct: 36, median_left_pct: 35, status: 'good', drill_id: 'pull-requests', defaultValue: 18 },
  { metric_key: 'pickup_time', section: 'code_quality', label: 'Pickup Time', sublabel: 'Bitbucket \u00b7 PR opened \u2192 first review \u00b7 lower = better', unit: 'h', range_min: '0h', range_max: '48h', median: 0, median_label: 'Target <24h', bar_width_pct: 17, median_left_pct: 24, status: 'good', drill_id: '', defaultValue: 4.2 },
  { metric_key: 'bugs_fixed', section: 'code_quality', label: 'Bugs Fixed', sublabel: 'Jira \u00b7 bug-type issues closed', unit: 'count', range_min: '0', range_max: '30', median: 9, median_label: 'Median: 9', bar_width_pct: 77, median_left_pct: 30, status: 'good', drill_id: 'bugs-fixed', defaultValue: 23 },
  { metric_key: 'bug_reopen_rate', section: 'code_quality', label: 'Bug Reopen Rate', sublabel: 'Jira \u00b7 bugs reopened \u00b7 lower = better', unit: '%', range_min: '0%', range_max: '30%', median: 14, median_label: 'Median: 14% \u00b7 Target <15%', bar_width_pct: 30, median_left_pct: 47, status: 'good', drill_id: '', defaultValue: 9 },
  // ai_tools
  { metric_key: 'cursor_completions', section: 'ai_tools', label: 'Cursor Completions', sublabel: 'Cursor \u00b7 completions suggested this month', unit: 'count', range_min: '200', range_max: '5k', median: 800, median_label: 'Median: 800', bar_width_pct: 24, median_left_pct: 16, status: 'good', drill_id: '', defaultValue: 1200 },
  { metric_key: 'cursor_agents', section: 'ai_tools', label: 'Cursor Agent Sessions', sublabel: 'Cursor \u00b7 agentic sessions started', unit: 'count', range_min: '2', range_max: '40', median: 10, median_label: 'Median: 10', bar_width_pct: 45, median_left_pct: 25, status: 'good', drill_id: '', defaultValue: 18 },
  { metric_key: 'cursor_lines', section: 'ai_tools', label: 'Lines Accepted', sublabel: 'Cursor \u00b7 lines of code accepted', unit: 'count', range_min: '0', range_max: '5k', median: 1800, median_label: 'Median: 1.8k', bar_width_pct: 64, median_left_pct: 36, status: 'good', drill_id: '', defaultValue: 3200 },
  { metric_key: 'cc_sessions', section: 'ai_tools', label: 'Claude Code Sessions', sublabel: 'Anthropic Enterprise API \u00b7 sessions this month', unit: 'count', range_min: '0', range_max: '60', median: 12, median_label: 'Median: 12', bar_width_pct: 40, median_left_pct: 20, status: 'good', drill_id: '', defaultValue: 24 },
  { metric_key: 'cc_tool_accept', section: 'ai_tools', label: 'Tool Acceptance Rate', sublabel: 'Anthropic Enterprise API \u00b7 accepted \u00f7 offered', unit: '%', range_min: '0%', range_max: '100%', median: 64, median_label: 'Median: 64%', bar_width_pct: 76, median_left_pct: 64, status: 'good', drill_id: '', defaultValue: 76 },
  { metric_key: 'cc_lines', section: 'ai_tools', label: 'Lines Added (Claude Code)', sublabel: 'Anthropic Enterprise API \u00b7 lines added by Claude Code', unit: 'count', range_min: '0', range_max: '3k', median: 600, median_label: 'Median: 600', bar_width_pct: 37, median_left_pct: 20, status: 'good', drill_id: '', defaultValue: 1100 },
  { metric_key: 'ai_loc_share2', section: 'ai_tools', label: 'AI LOC Share', sublabel: 'Cursor + Claude Code \u00b7 accepted lines \u00f7 clean LOC', unit: '%', range_min: '0%', range_max: '34%', median: 18, median_label: 'Median: 18%', bar_width_pct: 79, median_left_pct: 53, status: 'good', drill_id: '', defaultValue: 27 },
  { metric_key: 'claude_web', section: 'ai_tools', label: 'Claude Web Usage', sublabel: 'Claude Web \u00b7 conversations this month', unit: 'count', range_min: '0', range_max: '80', median: 18, median_label: 'Median: 18', bar_width_pct: 40, median_left_pct: 23, status: 'good', drill_id: '', defaultValue: 32 },
  { metric_key: 'chatgpt', section: 'ai_tools', label: 'ChatGPT Usage', sublabel: 'ChatGPT \u00b7 conversations this month', unit: 'count', range_min: '0', range_max: '40', median: 12, median_label: 'Median: 12', bar_width_pct: 20, median_left_pct: 30, status: 'good', drill_id: '', defaultValue: 8 },
  // collab
  { metric_key: 'slack_thread_participation', section: 'collab', label: 'Thread Participation', sublabel: 'Slack \u00b7 replies to others\' threads', unit: 'replies', range_min: '0', range_max: '80', median: 29, median_label: 'Median: 29', bar_width_pct: 43, median_left_pct: 36, status: 'good', drill_id: '', defaultValue: 34 },
  { metric_key: 'slack_message_engagement', section: 'collab', label: 'Message Engagement', sublabel: 'Slack \u00b7 avg replies per thread', unit: 'avg', range_min: '0', range_max: '5', median: 1.8, median_label: 'Median: 1.8', bar_width_pct: 42, median_left_pct: 36, status: 'good', drill_id: '', defaultValue: 2.1 },
  { metric_key: 'slack_dm_ratio', section: 'collab', label: 'DM Ratio', sublabel: 'Slack \u00b7 DMs \u00f7 all messages \u00b7 lower = more open', unit: '%', range_min: '0%', range_max: '100%', median: 28, median_label: 'Median: 28% \u00b7 lower = more open', bar_width_pct: 24, median_left_pct: 28, status: 'good', drill_id: '', defaultValue: 24 },
  { metric_key: 'm365_teams_messages', section: 'collab', label: 'Teams Messages', sublabel: 'Microsoft Teams \u00b7 all channels sent', unit: '/mo', range_min: '0', range_max: '400', median: 148, median_label: 'Median: 148', bar_width_pct: 42, median_left_pct: 37, status: 'good', drill_id: '', defaultValue: 168 },
  { metric_key: 'm365_emails_sent', section: 'collab', label: 'Emails Sent', sublabel: 'M365 \u00b7 avg per member \u00b7 lower = better', unit: '/mo', range_min: '0', range_max: '120', median: 35, median_label: 'Median: 35 \u00b7 lower = better', bar_width_pct: 26, median_left_pct: 29, status: 'good', drill_id: '', defaultValue: 31 },
  { metric_key: 'm365_files_shared', section: 'collab', label: 'Files Shared', sublabel: 'M365 \u00b7 avg per member', unit: '/mo', range_min: '0', range_max: '30', median: 8, median_label: 'Median: 8', bar_width_pct: 30, median_left_pct: 27, status: 'good', drill_id: '', defaultValue: 9 },
  { metric_key: 'meeting_hours', section: 'collab', label: 'Meeting Hours', sublabel: 'Zoom \u00b7 meeting duration + M365 audioDuration \u00b7 lower = more focus time', unit: 'h/mo', range_min: '4h', range_max: '28h', median: 16, median_label: 'Median: 16h', bar_width_pct: 33, median_left_pct: 50, status: 'good', drill_id: '', defaultValue: 12 },
  { metric_key: 'zoom_calls', section: 'collab', label: 'Zoom Calls', sublabel: 'Zoom API \u00b7 avg calls attended per member', unit: '/mo', range_min: '0', range_max: '20', median: 9, median_label: 'Median: 9', bar_width_pct: 55, median_left_pct: 45, status: 'good', drill_id: '', defaultValue: 11 },
  { metric_key: 'meeting_free', section: 'collab', label: 'Meeting-Free Days', sublabel: 'Zoom \u00b7 days with no meetings + M365 \u00b7 avg \u00b7 higher = better', unit: 'days', range_min: '0', range_max: '10', median: 4, median_label: 'Median: 4', bar_width_pct: 50, median_left_pct: 40, status: 'good', drill_id: '', defaultValue: 5 },
];

// IC sections -> metric keys mapping
const IC_SECTIONS: Record<string, string[]> = {
  task_delivery: ['tasks_completed', 'task_dev_time', 'estimation_accuracy', 'task_reopen_rate', 'due_date_compliance'],
  git_output: ['commits', 'prs_created', 'prs_merged', 'clean_loc'],
  code_quality: ['reviews_given', 'rework_ratio', 'build_success', 'pr_cycle_time', 'pickup_time', 'bugs_fixed', 'bug_reopen_rate'],
  ai_tools: ['cursor_completions', 'cursor_agents', 'cursor_lines', 'cc_sessions', 'cc_tool_accept', 'cc_lines', 'ai_loc_share2', 'claude_web', 'chatgpt'],
  collab: ['slack_thread_participation', 'slack_message_engagement', 'slack_dm_ratio', 'm365_teams_messages', 'm365_emails_sent', 'm365_files_shared', 'meeting_hours', 'zoom_calls', 'meeting_free'],
};

// ---------------------------------------------------------------------------
// Single row factories
// ---------------------------------------------------------------------------

export function mockExecRow(overrides?: Partial<RawExecSummaryRow>): RawExecSummaryRow {
  return {
    org_unit_id: 'platform',
    org_unit_name: 'Platform',
    headcount: 12,
    tasks_closed: 48,
    bugs_fixed: 18,
    build_success_pct: 94,
    focus_time_pct: 72,
    ai_adoption_pct: 68,
    ai_loc_share_pct: 22,
    pr_cycle_time_h: 18,
    ...overrides,
  };
}

export function mockTeamMemberRow(overrides?: Partial<RawTeamMemberRow>): RawTeamMemberRow {
  return {
    person_id: 'p1',
    display_name: 'Alice Kim',
    seniority: 'Senior',
    supervisor_email: null,
    tasks_closed: 12,
    bugs_fixed: 5,
    dev_time_h: 14,
    prs_merged: 11,
    build_success_pct: 96,
    focus_time_pct: 72,
    ai_tools: ['Cursor', 'Claude Code'],
    ai_loc_share_pct: 27,
    ...overrides,
  };
}

export function mockIcAggregateRow(overrides?: Partial<RawIcAggregateRow>): RawIcAggregateRow {
  return {
    person_id: 'p1',
    loc: 12000,
    ai_loc_share_pct: 27,
    prs_merged: 9,
    pr_cycle_time_h: 18,
    focus_time_pct: 72,
    tasks_closed: 12,
    bugs_fixed: 23,
    build_success_pct: 96,
    ai_sessions: 42,
    ...overrides,
  };
}

export function mockLocTrendRow(overrides?: Partial<RawLocTrendRow>): RawLocTrendRow {
  return {
    date_bucket: isoDate(1),
    ai_loc: 920,
    code_loc: 2800,
    spec_lines: 210,
    ...overrides,
  };
}

export function mockDeliveryTrendRow(overrides?: Partial<RawDeliveryTrendRow>): RawDeliveryTrendRow {
  return {
    date_bucket: isoDate(1),
    commits: 9,
    prs_merged: 3,
    tasks_done: 3,
    ...overrides,
  };
}

export function mockBulletRow(overrides?: Partial<RawBulletAggregateRow>): RawBulletAggregateRow {
  return {
    metric_key: 'tasks_completed',
    value: 5.3,
    median: 5.8,
    range_min: null,
    range_max: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Batch generators
// ---------------------------------------------------------------------------

export function mockExecRows(count = TEAMS.length): RawExecSummaryRow[] {
  return Array.from({ length: count }, (_, i) => {
    const t = TEAMS[i % TEAMS.length];
    return mockExecRow({
      org_unit_id: t.id,
      org_unit_name: t.name,
      headcount: teamHeadcount(t.id),
      tasks_closed: Math.round(vary(35, i, 15)),
      bugs_fixed: Math.round(vary(12, i, 7)),
      build_success_pct: Math.min(100, Math.max(70, Math.round(vary(90, i, 8)))),
      focus_time_pct: Math.min(100, Math.max(30, Math.round(vary(63, i, 15)))),
      ai_adoption_pct: Math.min(100, Math.max(10, Math.round(vary(58, i, 20)))),
      ai_loc_share_pct: Math.min(50, Math.max(0, Math.round(vary(20, i, 12)))),
      pr_cycle_time_h: Math.max(5, Math.round(vary(22, i, 8))),
    });
  });
}

export function mockTeamMemberRows(count = PEOPLE.length): RawTeamMemberRow[] {
  return PEOPLE.slice(0, count).map((p, i) => {
    const hasAi = p.ai_tools.length > 0;
    return mockTeamMemberRow({
      person_id: p.person_id,
      display_name: p.name,
      seniority: p.seniority,
      ai_tools: p.ai_tools,
      tasks_closed: Math.max(1, Math.round(vary(7, i, 5))),
      bugs_fixed: Math.max(0, Math.round(vary(3, i, 2))),
      dev_time_h: Math.max(8, Math.round(vary(16, i, 7))),
      prs_merged: Math.max(1, Math.round(vary(6, i, 4))),
      build_success_pct: Math.min(100, Math.max(70, Math.round(vary(90, i, 8)))),
      focus_time_pct: Math.min(100, Math.max(30, Math.round(vary(63, i, 15)))),
      ai_loc_share_pct: hasAi ? Math.min(40, Math.max(5, Math.round(vary(18, i, 10)))) : 0,
    });
  });
}

/** Get team member rows for a specific team */
export function mockTeamMemberRowsForTeam(teamId: string): RawTeamMemberRow[] {
  const members = teamMembers(teamId);
  return members.map((p, i) => {
    const hasAi = p.ai_tools.length > 0;
    return mockTeamMemberRow({
      person_id: p.person_id,
      display_name: p.name,
      seniority: p.seniority,
      ai_tools: p.ai_tools,
      tasks_closed: Math.max(1, Math.round(vary(7, i, 5))),
      bugs_fixed: Math.max(0, Math.round(vary(3, i, 2))),
      dev_time_h: Math.max(8, Math.round(vary(16, i, 7))),
      prs_merged: Math.max(1, Math.round(vary(6, i, 4))),
      build_success_pct: Math.min(100, Math.max(70, Math.round(vary(90, i, 8)))),
      focus_time_pct: Math.min(100, Math.max(30, Math.round(vary(63, i, 15)))),
      ai_loc_share_pct: hasAi ? Math.min(40, Math.max(5, Math.round(vary(18, i, 10)))) : 0,
    });
  });
}

export function mockLocTrendSeries(weeks = 8): RawLocTrendRow[] {
  return Array.from({ length: weeks }, (_, i) => ({
    date_bucket: isoDate(weeks - i),
    ai_loc: Math.max(0, Math.round(vary(850, i, 300))),
    code_loc: Math.max(0, Math.round(vary(2700, i, 800))),
    spec_lines: Math.max(0, Math.round(vary(200, i, 80))),
  }));
}

export function mockDeliveryTrendSeries(weeks = 8): RawDeliveryTrendRow[] {
  return Array.from({ length: weeks }, (_, i) => ({
    date_bucket: isoDate(weeks - i),
    commits: Math.max(0, Math.round(vary(28, i, 12))),
    prs_merged: Math.max(0, Math.round(vary(8, i, 4))),
    tasks_done: Math.max(0, Math.round(vary(9, i, 4))),
  }));
}

// ---------------------------------------------------------------------------
// Team bullet sections
// ---------------------------------------------------------------------------

/**
 * Team bullet section -- uses BULLET_DEFS from thresholdConfig for the list
 * of metrics, and a local synthetic distribution table (MOCK_BULLET_DIST)
 * for the median/range values. Production config no longer carries
 * distribution defaults — only the backend supplies real numbers — so this
 * seed data is mock-only and lives here.
 */
const MOCK_BULLET_DIST: Record<string, { median: number; range_min: number; range_max: number }> = {
  tasks_completed:            { median: 5.8,   range_min: 0,  range_max: 15 },
  task_dev_time:              { median: 15,    range_min: 8,  range_max: 31 },
  task_reopen_rate:           { median: 5,     range_min: 0,  range_max: 15 },
  due_date_compliance:        { median: 72,    range_min: 40, range_max: 100 },
  estimation_accuracy:        { median: 58,    range_min: 0,  range_max: 100 },
  commits:                    { median: 50,    range_min: 0,  range_max: 1000 },
  prs_per_dev:                { median: 6,     range_min: 0,  range_max: 20 },
  build_success:              { median: 89,    range_min: 78, range_max: 97 },
  pr_cycle_time:              { median: 22,    range_min: 10, range_max: 35 },
  bugs_fixed:                 { median: 3,     range_min: 1,  range_max: 8 },
  overrun_ratio:              { median: 1.5,   range_min: 1,  range_max: 3 },
  scope_completion:           { median: 79,    range_min: 0,  range_max: 100 },
  scope_creep:                { median: 19,    range_min: 0,  range_max: 50 },
  on_time_delivery:           { median: 71,    range_min: 0,  range_max: 100 },
  avg_slip:                   { median: 3.1,   range_min: 0,  range_max: 6 },
  active_ai_members:          { median: 7,     range_min: 0,  range_max: 12 },
  cursor_active:              { median: 6,     range_min: 0,  range_max: 12 },
  cc_active:                  { median: 3,     range_min: 0,  range_max: 12 },
  codex_active:               { median: 2,     range_min: 0,  range_max: 12 },
  team_ai_loc:                { median: 1186,  range_min: 0,  range_max: 50000 },
  cursor_acceptance:          { median: 58,    range_min: 0,  range_max: 100 },
  cc_tool_acceptance:         { median: 64,    range_min: 0,  range_max: 100 },
  cc_tool_accept:             { median: 64,    range_min: 0,  range_max: 100 },
  cursor_lines:               { median: 200,   range_min: 0,  range_max: 1000 },
  cursor_agents:              { median: 10,    range_min: 0,  range_max: 100 },
  cursor_completions:         { median: 40,    range_min: 0,  range_max: 200 },
  cc_lines:                   { median: 80,    range_min: 0,  range_max: 500 },
  cc_sessions:                { median: 6,     range_min: 0,  range_max: 40 },
  chatgpt:                    { median: 0,     range_min: 0,  range_max: 100 },
  claude_web:                 { median: 0,     range_min: 0,  range_max: 100 },
  ai_loc_share2:              { median: 14,    range_min: 0,  range_max: 50 },
  slack_thread_participation: { median: 29,    range_min: 0,  range_max: 80 },
  slack_message_engagement:   { median: 1.8,   range_min: 0,  range_max: 5 },
  slack_dm_ratio:             { median: 28,    range_min: 0,  range_max: 100 },
  m365_teams_messages:        { median: 148,   range_min: 0,  range_max: 400 },
  m365_emails_sent:           { median: 35,    range_min: 0,  range_max: 120 },
  m365_files_shared:          { median: 8,     range_min: 0,  range_max: 30 },
  meeting_hours:              { median: 103,   range_min: 0,  range_max: 300 },
  zoom_calls:                 { median: 169,   range_min: 0,  range_max: 1200 },
  meeting_free:               { median: 4,     range_min: 0,  range_max: 30 },
};

export function mockTeamBulletSection(section: string, seed = 0): RawBulletAggregateRow[] {
  return BULLET_DEFS
    .filter((d) => d.section === section)
    .map((d, i) => {
      const dist = MOCK_BULLET_DIST[d.metric_key] ?? { median: 0, range_min: 0, range_max: 100 };
      return {
        metric_key: d.metric_key,
        value: Math.round(vary(dist.median, i + seed, Math.max(1, dist.median * 0.3)) * 10) / 10,
        median: dist.median,
        range_min: dist.range_min,
        range_max: dist.range_max,
      };
    });
}

// ---------------------------------------------------------------------------
// IC bullet sections (with passthrough display fields)
// ---------------------------------------------------------------------------

/**
 * IC bullet section -- uses IC_BULLET_DEFS (no BULLET_DEFS entries).
 * Returns RawBulletAggregateRow with passthrough display fields that
 * transforms.ts reads via `Record<string,unknown>` cast.
 */
export function mockIcBulletSection(section: string, seed = 0): RawBulletAggregateRow[] {
  const keys = IC_SECTIONS[section];
  if (!keys) return [];

  return keys.map((key, i) => {
    const def = IC_BULLET_DEFS.find((d) => d.metric_key === key);
    if (!def) {
      return {
        metric_key: key,
        value: 0,
        median: null,
        range_min: null,
        range_max: null,
      };
    }

    const value = Math.round(vary(def.defaultValue, i + seed, def.defaultValue * 0.2) * 10) / 10;

    // Build the base raw row
    const row: RawBulletAggregateRow = {
      metric_key: def.metric_key,
      value,
      median: def.median ?? null,
      range_min: null,
      range_max: null,
    };

    // Attach passthrough display fields that transforms.ts reads
    // when no BULLET_DEFS match is found (the IC-level path)
    const ext = row as unknown as Record<string, unknown>;
    ext['section'] = def.section;
    ext['label'] = def.label;
    ext['sublabel'] = def.sublabel;
    ext['unit'] = def.unit;
    ext['range_min'] = def.range_min;
    ext['range_max'] = def.range_max;
    ext['median_label'] = def.median_label;
    ext['bar_left_pct'] = 0;
    ext['bar_width_pct'] = def.bar_width_pct;
    ext['median_left_pct'] = def.median_left_pct;
    ext['status'] = def.status;
    ext['drill_id'] = def.drill_id;

    return row;
  });
}

// ---------------------------------------------------------------------------
// Complete scenario factories
// ---------------------------------------------------------------------------

export function mockExecScenario(): { teams: RawExecSummaryRow[] } {
  return { teams: mockExecRows(6) };
}

export function mockTeamScenario(teamId = 'backend'): {
  members: RawTeamMemberRow[];
  bullets: Record<string, RawBulletAggregateRow[]>;
} {
  const teamSeed = hashStr(teamId);
  const members = mockTeamMemberRowsForTeam(teamId);

  const bulletSections = ['task_delivery', 'code_quality', 'estimation', 'ai_adoption', 'collaboration'];
  const bullets: Record<string, RawBulletAggregateRow[]> = {};
  for (const section of bulletSections) {
    bullets[section] = mockTeamBulletSection(section, teamSeed);
  }

  return { members, bullets };
}

export function mockIcScenario(personId = 'p1'): {
  kpiAggregate: RawIcAggregateRow;
  prevKpiAggregate: RawIcAggregateRow;
  bullets: Record<string, RawBulletAggregateRow[]>;
  locTrend: RawLocTrendRow[];
  deliveryTrend: RawDeliveryTrendRow[];
} {
  const personSeed = hashStr(personId);

  const kpiAggregate = mockIcAggregateRow({
    person_id: personId,
    loc: Math.round(vary(12000, personSeed, 5000)),
    ai_loc_share_pct: Math.round(vary(25, personSeed, 10)),
    prs_merged: Math.round(vary(9, personSeed, 4)),
    pr_cycle_time_h: Math.round(vary(18, personSeed, 8)),
    focus_time_pct: Math.round(vary(68, personSeed, 12)),
    tasks_closed: Math.round(vary(12, personSeed, 5)),
    bugs_fixed: Math.round(vary(5, personSeed, 3)),
    build_success_pct: Math.min(100, Math.max(70, Math.round(vary(94, personSeed, 6)))),
    ai_sessions: Math.round(vary(42, personSeed, 15)),
  });

  // Previous period aggregate for delta computation (slightly lower values)
  const prevKpiAggregate = mockIcAggregateRow({
    person_id: personId,
    loc: Math.round(kpiAggregate.loc * 0.9),
    ai_loc_share_pct: Math.round(kpiAggregate.ai_loc_share_pct * 0.85),
    prs_merged: Math.max(1, kpiAggregate.prs_merged - 2),
    pr_cycle_time_h: Math.round(kpiAggregate.pr_cycle_time_h * 1.1),
    focus_time_pct: Math.max(30, kpiAggregate.focus_time_pct - 5),
    tasks_closed: Math.max(1, kpiAggregate.tasks_closed - 3),
    bugs_fixed: Math.max(0, kpiAggregate.bugs_fixed - 2),
    build_success_pct: kpiAggregate.build_success_pct !== null
      ? Math.max(70, kpiAggregate.build_success_pct - 2)
      : null,
    ai_sessions: Math.max(0, kpiAggregate.ai_sessions - 8),
  });

  const icSections = ['task_delivery', 'git_output', 'code_quality', 'ai_tools', 'collab'];
  const bullets: Record<string, RawBulletAggregateRow[]> = {};
  for (const section of icSections) {
    bullets[section] = mockIcBulletSection(section, personSeed);
  }

  return {
    kpiAggregate,
    prevKpiAggregate,
    bullets,
    locTrend: mockLocTrendSeries(8),
    deliveryTrend: mockDeliveryTrendSeries(8),
  };
}
