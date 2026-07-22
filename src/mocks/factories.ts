import type {
  RawBulletAggregateRow,
  RawCrmFlowRow,
  RawCrmKpisRow,
  RawCrmPipelineRow,
  RawDeliveryTrendRow,
  RawIcAggregateRow,
  RawLocTrendRow,
  RawTeamMemberRow,
} from "@/api/raw-types";
import { prefixForBulletSection } from "@/api/catalog-client";
import catalogSnapshot from "./catalog-snapshot.json";

type SnapshotMetric = { metric_key?: string; unit?: string };

// Bare metric keys per bullet section, sourced from the frozen wire
// catalog snapshot (`catalog-snapshot.json`) — keeps mocks aligned with
// the live wire shape without re-introducing compile-in metric metadata
// (Refs #82).
const BULLET_KEYS_BY_SECTION: Map<string, Array<{ metric_key: string; unit: string }>> = (() => {
  const out = new Map<string, Array<{ metric_key: string; unit: string }>>();
  const metrics = (catalogSnapshot as { metrics?: SnapshotMetric[] }).metrics ?? [];
  for (const section of ["task_delivery", "git_output", "code_quality", "ai_adoption", "collaboration"]) {
    const prefixDot = `${prefixForBulletSection(section)}.`;
    const rows: Array<{ metric_key: string; unit: string }> = [];
    for (const m of metrics) {
      if (m.metric_key && m.metric_key.startsWith(prefixDot)) {
        rows.push({
          metric_key: m.metric_key.slice(prefixDot.length),
          unit: m.unit ?? "",
        });
      }
    }
    out.set(section, rows);
  }
  return out;
})();

function vary(base: number, index: number, spread: number): number {
  const hash = Math.sin(index * 9301 + 49297) * 49297;
  const factor = (hash - Math.floor(hash)) * 2 - 1; // -1 to 1
  return Math.round((base + factor * spread) * 10) / 10;
}

function isoDate(weeksAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - weeksAgo * 7);
  return d.toISOString().split('T')[0];
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

import { PEOPLE, teamMembers } from "./registry";
export { PEOPLE, teamMembers };

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

const IC_BULLET_MOCKS: IcBulletDef[] = [
  // task_delivery
  { metric_key: 'tasks_completed', section: 'task_delivery', label: 'Tasks Completed', sublabel: 'Jira \u00b7 closed issues in sprint', unit: 'count', range_min: '0', range_max: '15', median: 7, median_label: 'Median: 7', bar_width_pct: 80, median_left_pct: 47, status: 'good', drill_id: 'tasks-completed', defaultValue: 12 },
  { metric_key: 'task_dev_time', section: 'task_delivery', label: 'Task Development Time', sublabel: 'Jira \u00b7 time in In Progress state \u00b7 lower = better', unit: 'h', range_min: '8h', range_max: '31h', median: 15, median_label: 'Median: 15h', bar_width_pct: 43, median_left_pct: 48, status: 'good', drill_id: 'cycle-time', defaultValue: 14 },
  { metric_key: 'estimation_accuracy', section: 'task_delivery', label: 'Estimation Accuracy', sublabel: 'Jira \u00b7 tasks within \u00b120% of original estimate', unit: '\u00d7', range_min: '0\u00d7', range_max: '3\u00d7', median: 0, median_label: 'Target 0.9\u20131.3\u00d7', bar_width_pct: 22, median_left_pct: 33, status: 'good', drill_id: '', defaultValue: 1.1 },
  { metric_key: 'task_reopen_rate', section: 'task_delivery', label: 'Task Reopen Rate', sublabel: 'Jira \u00b7 closed then reopened within 14 days \u00b7 lower = better', unit: '%', range_min: '0%', range_max: '15%', median: 5, median_label: 'Median: 5%', bar_width_pct: 27, median_left_pct: 33, status: 'good', drill_id: 'task-reopen', defaultValue: 4 },
  { metric_key: 'due_date_compliance', section: 'task_delivery', label: 'Due Date Compliance', sublabel: 'Jira \u00b7 tasks closed by due date', unit: '%', range_min: '40%', range_max: '100%', median: 72, median_label: 'Median: 72%', bar_width_pct: 87, median_left_pct: 53, status: 'good', drill_id: '', defaultValue: 92 },
  { metric_key: 'worklog_logging_accuracy', section: 'task_delivery', label: 'Worklog Logging Accuracy', sublabel: 'Jira \u00b7 worklog logged \u00f7 time in In Progress \u00b7 100 = on target', unit: '%', range_min: '10%', range_max: '120%', median: 65, median_label: 'Median: 65%', bar_width_pct: 60, median_left_pct: 50, status: 'good', drill_id: '', defaultValue: 78 },
  { metric_key: 'bugs_to_task_ratio', section: 'task_delivery', label: 'Bugs / Tasks Closed', sublabel: 'Jira \u00b7 bug-type issues \u00f7 total closed \u00b7 lower = better', unit: '%', range_min: '0%', range_max: '60%', median: 22, median_label: 'Median: 22%', bar_width_pct: 30, median_left_pct: 35, status: 'good', drill_id: '', defaultValue: 18 },
  { metric_key: 'mean_time_to_resolution', section: 'task_delivery', label: 'Mean Time to Resolution', sublabel: 'Jira \u00b7 close \u2212 create \u00b7 lower = better', unit: 'd', range_min: '1d', range_max: '60d', median: 12, median_label: 'Median: 12d', bar_width_pct: 25, median_left_pct: 20, status: 'good', drill_id: '', defaultValue: 9 },
  { metric_key: 'stale_in_progress', section: 'task_delivery', label: 'Stale In-Progress', sublabel: 'Jira \u00b7 In-Progress issues untouched > 14 days', unit: 'tasks', drill_id: '', range_min: '0', range_max: '25', median: 3, median_label: 'Median: 3', bar_width_pct: 12, median_left_pct: 12, status: 'good', defaultValue: 2 },
  // git_output
  { metric_key: 'commits', section: 'git_output', label: 'Commits Created', sublabel: 'Bitbucket \u00b7 commits authored', unit: 'count', range_min: '8', range_max: '55', median: 22, median_label: 'Median: 22', bar_width_pct: 55, median_left_pct: 30, status: 'good', drill_id: 'commits', defaultValue: 34 },
  { metric_key: 'prs_created', section: 'git_output', label: 'Pull Requests Created', sublabel: 'Bitbucket \u00b7 PRs authored', unit: 'count', range_min: '2', range_max: '14', median: 6, median_label: 'Median: 6', bar_width_pct: 75, median_left_pct: 33, status: 'good', drill_id: 'pull-requests', defaultValue: 11 },
  { metric_key: 'prs_merged', section: 'git_output', label: 'Pull Requests Merged', sublabel: 'Bitbucket \u00b7 authored and merged', unit: 'count', range_min: '0', range_max: '20', median: 6, median_label: 'Median: 6', bar_width_pct: 45, median_left_pct: 38, status: 'good', drill_id: '', defaultValue: 9 },
  { metric_key: 'clean_loc', section: 'git_output', label: 'Clean LOC', sublabel: 'Bitbucket \u00b7 lines added \u00b7 excl. spec/config', unit: 'count', range_min: '1k', range_max: '18k', median: 7000, median_label: 'Median: 7k', bar_width_pct: 65, median_left_pct: 35, status: 'good', drill_id: '', defaultValue: 12000 },
  // Per-PR distribution metrics (medians over period) and counter-derived
  // ratios. Visual variety on the dashboard: different units, statuses, bar fills.
  // pr_cycle_time_h is opened \u2192 merged. Real "opened \u2192 first review" requires
  // author\u2194reviewer identity-resolution (reviewer namespace mismatch in silver).
  { metric_key: 'pr_cycle_time_h', section: 'git_output', label: 'Pull Request Cycle Time', sublabel: 'Bitbucket \u00b7 PR opened \u2192 merged \u00b7 per-PR median \u00b7 lower = better', unit: 'h', range_min: '4h', range_max: '72h', median: 22, median_label: 'Target <24h', bar_width_pct: 41, median_left_pct: 26, status: 'warn', drill_id: 'pull-requests', defaultValue: 28 },
  { metric_key: 'pr_size', section: 'git_output', label: 'PR Size', sublabel: 'Bitbucket \u00b7 lines changed per PR \u00b7 per-PR median \u00b7 smaller = reviewable', unit: 'count', range_min: '20', range_max: '800', median: 180, median_label: 'Target <200', bar_width_pct: 30, median_left_pct: 22, status: 'good', drill_id: '', defaultValue: 220 },
  { metric_key: 'merge_rate', section: 'git_output', label: 'PR Merge Rate', sublabel: 'Bitbucket \u00b7 \u03a3 merged \u00f7 \u03a3 created over period \u00b7 higher = better', unit: '%', range_min: '30%', range_max: '100%', median: 78, median_label: 'Median: 78%', bar_width_pct: 84, median_left_pct: 69, status: 'good', drill_id: '', defaultValue: 88 },
  { metric_key: 'lines_per_commit', section: 'git_output', label: 'Lines / Commit', sublabel: 'Bitbucket \u00b7 \u03a3 LOC \u00f7 \u03a3 commits \u00b7 lower = reviewable', unit: 'count', range_min: '20', range_max: '300', median: 85, median_label: 'Target <100', bar_width_pct: 23, median_left_pct: 23, status: 'good', drill_id: '', defaultValue: 62 },
  { metric_key: 'commits_per_active_day', section: 'git_output', label: 'Commits / Active Day', sublabel: 'Bitbucket \u00b7 \u03a3 commits \u00f7 days with any commit \u00b7 cadence', unit: 'count', range_min: '0.5', range_max: '8', median: 3.2, median_label: 'Median: 3.2', bar_width_pct: 56, median_left_pct: 36, status: 'good', drill_id: '', defaultValue: 4.5 },
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
  { metric_key: 'ai_loc_share2', section: 'ai_tools', label: 'AI Code Acceptance', sublabel: 'Cursor + Claude Code \u00b7 accepted lines \u00f7 clean LOC', unit: '%', range_min: '0%', range_max: '34%', median: 18, median_label: 'Median: 18%', bar_width_pct: 79, median_left_pct: 53, status: 'good', drill_id: '', defaultValue: 27 },
  { metric_key: 'claude_web', section: 'ai_tools', label: 'Claude Web Usage', sublabel: 'Claude Web \u00b7 conversations this month', unit: 'count', range_min: '0', range_max: '80', median: 18, median_label: 'Median: 18', bar_width_pct: 40, median_left_pct: 23, status: 'good', drill_id: '', defaultValue: 32 },
  { metric_key: 'chatgpt', section: 'ai_tools', label: 'ChatGPT Usage', sublabel: 'ChatGPT \u00b7 conversations this month', unit: 'count', range_min: '0', range_max: '40', median: 12, median_label: 'Median: 12', bar_width_pct: 20, median_left_pct: 30, status: 'good', drill_id: '', defaultValue: 8 },
  // collab
  { metric_key: 'slack_messages_sent', section: 'collab', label: 'Messages Sent', sublabel: 'Slack \u00b7 messages sent \u00b7 avg per person \u00b7 period total', unit: 'messages', range_min: '0', range_max: '400', median: 120, median_label: 'Median: 120', bar_width_pct: 35, median_left_pct: 30, status: 'good', drill_id: '', defaultValue: 140 },
  { metric_key: 'slack_channel_posts', section: 'collab', label: 'Channel Posts', sublabel: 'Slack \u00b7 posts in public channels \u00b7 avg per person \u00b7 period total', unit: 'messages', range_min: '0', range_max: '80', median: 29, median_label: 'Median: 29', bar_width_pct: 43, median_left_pct: 36, status: 'good', drill_id: '', defaultValue: 34 },
  { metric_key: 'slack_active_days', section: 'collab', label: 'Active Days', sublabel: 'Slack \u00b7 days with any messages \u00b7 avg per person \u00b7 period total', unit: 'days', range_min: '0', range_max: '22', median: 14, median_label: 'Median: 14', bar_width_pct: 64, median_left_pct: 64, status: 'good', drill_id: '', defaultValue: 16 },
  { metric_key: 'slack_msgs_per_active_day', section: 'collab', label: 'Messages per Active Day', sublabel: 'Slack \u00b7 messages \u00f7 active days \u00b7 avg per person \u00b7 daily avg', unit: 'messages/day', range_min: '0', range_max: '40', median: 8, median_label: 'Median: 8', bar_width_pct: 25, median_left_pct: 20, status: 'good', drill_id: '', defaultValue: 9 },
  { metric_key: 'slack_dm_ratio', section: 'collab', label: 'DM Ratio', sublabel: 'Slack \u00b7 DMs \u00f7 all messages \u00b7 avg per person \u00b7 daily avg \u00b7 lower = more open', unit: '%', range_min: '0%', range_max: '100%', median: 28, median_label: 'Median: 28% \u00b7 lower = more open', bar_width_pct: 24, median_left_pct: 28, status: 'good', drill_id: '', defaultValue: 24 },
  { metric_key: 'm365_active_days', section: 'collab', label: 'Active Days', sublabel: 'M365 \u00b7 days with any sent / chat / file activity \u00b7 avg per person \u00b7 period total', unit: 'days', range_min: '0', range_max: '22', median: 18, median_label: 'Median: 18', bar_width_pct: 80, median_left_pct: 80, status: 'good', drill_id: '', defaultValue: 19 },
  { metric_key: 'm365_emails_sent', section: 'collab', label: 'Emails Sent', sublabel: 'M365 \u00b7 emails sent \u00b7 avg per person \u00b7 period total', unit: 'emails', range_min: '0', range_max: '120', median: 35, median_label: 'Median: 35', bar_width_pct: 26, median_left_pct: 29, status: 'good', drill_id: '', defaultValue: 31 },
  { metric_key: 'm365_emails_received', section: 'collab', label: 'Emails Received', sublabel: 'M365 \u00b7 inbox volume \u00b7 avg per person \u00b7 period total', unit: 'emails', range_min: '0', range_max: '500', median: 150, median_label: 'Median: 150', bar_width_pct: 30, median_left_pct: 30, status: 'good', drill_id: '', defaultValue: 180 },
  { metric_key: 'm365_emails_read', section: 'collab', label: 'Emails Read', sublabel: 'M365 \u00b7 emails read \u00b7 avg per person \u00b7 period total', unit: 'emails', range_min: '0', range_max: '800', median: 250, median_label: 'Median: 250', bar_width_pct: 35, median_left_pct: 31, status: 'good', drill_id: '', defaultValue: 280 },
  { metric_key: 'm365_teams_chats', section: 'collab', label: 'Teams Chats', sublabel: 'Microsoft Teams \u00b7 DMs and group chats \u00b7 avg per person \u00b7 period total', unit: 'messages', range_min: '0', range_max: '400', median: 148, median_label: 'Median: 148', bar_width_pct: 42, median_left_pct: 37, status: 'good', drill_id: '', defaultValue: 168 },
  { metric_key: 'm365_files_engaged', section: 'collab', label: 'Files Engaged', sublabel: 'M365 \u00b7 files viewed or edited \u00b7 avg per person \u00b7 period total', unit: 'files', range_min: '0', range_max: '200', median: 60, median_label: 'Median: 60', bar_width_pct: 30, median_left_pct: 30, status: 'good', drill_id: '', defaultValue: 70 },
  { metric_key: 'm365_files_shared_internal', section: 'collab', label: 'Files Shared (Internal)', sublabel: 'M365 \u00b7 files shared inside org \u00b7 avg per person \u00b7 period total', unit: 'files', range_min: '0', range_max: '30', median: 8, median_label: 'Median: 8', bar_width_pct: 30, median_left_pct: 27, status: 'good', drill_id: '', defaultValue: 9 },
  { metric_key: 'm365_files_shared_external', section: 'collab', label: 'Files Shared (External)', sublabel: 'M365 \u00b7 files shared outside org \u00b7 avg per person \u00b7 period total \u00b7 governance signal', unit: 'files', range_min: '0', range_max: '10', median: 1, median_label: 'Median: 1', bar_width_pct: 10, median_left_pct: 10, status: 'good', drill_id: '', defaultValue: 0 },
  { metric_key: 'meeting_hours', section: 'collab', label: 'Meeting Hours', sublabel: 'Teams + Zoom \u00b7 longest modality per meeting \u00b7 avg per person \u00b7 period total', unit: 'h', range_min: '0', range_max: '60', median: 20, median_label: 'Median: 20h', bar_width_pct: 33, median_left_pct: 33, status: 'good', drill_id: '', defaultValue: 24 },
  { metric_key: 'meetings_count', section: 'collab', label: 'Meetings Attended', sublabel: 'Teams + Zoom \u00b7 distinct meetings joined \u00b7 avg per person \u00b7 period total', unit: 'meetings', range_min: '0', range_max: '120', median: 40, median_label: 'Median: 40', bar_width_pct: 33, median_left_pct: 33, status: 'good', drill_id: '', defaultValue: 50 },
  { metric_key: 'teams_meeting_hours', section: 'collab', label: 'Teams Meeting Hours', sublabel: 'Microsoft Teams \u00b7 longest modality per meeting \u00b7 avg per person \u00b7 period total', unit: 'h', range_min: '0', range_max: '50', median: 14, median_label: 'Median: 14h', bar_width_pct: 28, median_left_pct: 28, status: 'good', drill_id: '', defaultValue: 18 },
  { metric_key: 'zoom_meeting_hours', section: 'collab', label: 'Zoom Meeting Hours', sublabel: 'Zoom \u00b7 longest modality per meeting \u00b7 avg per person \u00b7 period total', unit: 'h', range_min: '0', range_max: '30', median: 6, median_label: 'Median: 6h', bar_width_pct: 20, median_left_pct: 20, status: 'good', drill_id: '', defaultValue: 8 },
  { metric_key: 'teams_meetings', section: 'collab', label: 'Teams Meetings Attended', sublabel: 'Microsoft Teams \u00b7 distinct meetings joined \u00b7 avg per person \u00b7 period total', unit: 'meetings', range_min: '0', range_max: '80', median: 28, median_label: 'Median: 28', bar_width_pct: 35, median_left_pct: 35, status: 'good', drill_id: '', defaultValue: 32 },
  { metric_key: 'zoom_meetings', section: 'collab', label: 'Zoom Meetings Attended', sublabel: 'Zoom \u00b7 distinct meetings joined \u00b7 avg per person \u00b7 period total', unit: 'meetings', range_min: '0', range_max: '40', median: 9, median_label: 'Median: 9', bar_width_pct: 25, median_left_pct: 22, status: 'good', drill_id: '', defaultValue: 11 },
  { metric_key: 'meeting_free', section: 'collab', label: 'Meeting-Free Days', sublabel: 'Teams + Zoom \u00b7 days with any record but no meeting time \u00b7 avg per person \u00b7 period total', unit: 'days', range_min: '0', range_max: '15', median: 5, median_label: 'Median: 5', bar_width_pct: 33, median_left_pct: 33, status: 'good', drill_id: '', defaultValue: 6 },
];

// IC sections -> metric keys mapping
const IC_SECTIONS: Record<string, string[]> = {
  task_delivery: ['tasks_completed', 'task_dev_time', 'estimation_accuracy', 'task_reopen_rate', 'due_date_compliance', 'worklog_logging_accuracy', 'bugs_to_task_ratio', 'mean_time_to_resolution', 'stale_in_progress'],
  git_output: ['commits', 'prs_created', 'prs_merged', 'clean_loc', 'pr_cycle_time_h', 'pr_size', 'merge_rate', 'lines_per_commit', 'commits_per_active_day'],
  code_quality: ['reviews_given', 'rework_ratio', 'build_success', 'pr_cycle_time', 'pickup_time', 'bugs_fixed', 'bug_reopen_rate'],
  ai_tools: ['cursor_completions', 'cursor_agents', 'cursor_lines', 'cc_sessions', 'cc_tool_accept', 'cc_lines', 'ai_loc_share2', 'claude_web', 'chatgpt'],
  collab: ['slack_messages_sent', 'slack_channel_posts', 'slack_active_days', 'slack_msgs_per_active_day', 'slack_dm_ratio', 'm365_active_days', 'm365_emails_sent', 'm365_emails_received', 'm365_emails_read', 'm365_teams_chats', 'm365_files_engaged', 'm365_files_shared_internal', 'm365_files_shared_external', 'meeting_free', 'meeting_hours', 'meetings_count', 'teams_meeting_hours', 'zoom_meeting_hours', 'teams_meetings', 'zoom_meetings'],
};

export function mockTeamMemberRow(overrides?: Partial<RawTeamMemberRow>): RawTeamMemberRow {
  return {
    person_id: 'p1',
    display_name: 'Alice Kim',
    seniority: 'Senior',
    supervisor_email: null,
    org_unit_id: 'Engineering',
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
    loc_median: 9000,
    ai_loc_share_pct_median: 20,
    prs_merged_median: 6,
    pr_cycle_time_h_median: 24,
    focus_time_pct_median: 65,
    tasks_closed_median: 8,
    bugs_fixed_median: 14,
    build_success_pct_median: 90,
    ai_sessions_median: 30,
    peer_n: 8,
    ...overrides,
  };
}

export function mockLocTrendRow(overrides?: Partial<RawLocTrendRow>): RawLocTrendRow {
  return {
    date_bucket: isoDate(1),
    code_loc: 2800,
    spec_lines: 210,
    config_loc: 140,
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

export function mockTeamMemberRows(count = PEOPLE.length): RawTeamMemberRow[] {
  return PEOPLE.slice(0, count).map((p, i) => {
    const hasAi = p.ai_tools.length > 0;
    return mockTeamMemberRow({
      person_id: p.person_id,
      display_name: p.name,
      seniority: p.seniority,
      org_unit_id: p.department,
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

export function mockTeamMemberRowsForTeam(teamId: string): RawTeamMemberRow[] {
  const members = teamMembers(teamId);
  return members.map((p, i) => {
    const hasAi = p.ai_tools.length > 0;
    return mockTeamMemberRow({
      person_id: p.person_id,
      display_name: p.name,
      seniority: p.seniority,
      org_unit_id: p.department,
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
    code_loc: Math.max(0, Math.round(vary(2700, i, 800))),
    spec_lines: Math.max(0, Math.round(vary(200, i, 80))),
    config_loc: Math.max(0, Math.round(vary(150, i, 60))),
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

// Production config no longer carries distribution defaults — only the
// backend supplies real numbers — so this seed data is mock-only.
type MockBulletDist = { median: number; range_min: number; range_max: number };

// Partial so unknown keys are typed as `undefined` — the caller's missing-entry
// guard + fallback below is then visible to the type checker (codacy flagged
// them as dead code under `Record<string, T>` which always resolves to `T`).
const MOCK_BULLET_DIST: Partial<Record<string, MockBulletDist>> = {
  tasks_completed:            { median: 5.8,   range_min: 0,  range_max: 15 },
  task_dev_time:              { median: 15,    range_min: 8,  range_max: 31 },
  task_reopen_rate:           { median: 5,     range_min: 0,  range_max: 15 },
  due_date_compliance:        { median: 72,    range_min: 40, range_max: 100 },
  estimation_accuracy:        { median: 58,    range_min: 0,  range_max: 100 },
  worklog_logging_accuracy:   { median: 65,    range_min: 10, range_max: 120 },
  bugs_to_task_ratio:         { median: 22,    range_min: 0,  range_max: 60 },
  mean_time_to_resolution:    { median: 12,    range_min: 1,  range_max: 60 },
  stale_in_progress:          { median: 3,     range_min: 0,  range_max: 25 },
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
  team_ai_loc:                { median: 1186,  range_min: 0,  range_max: 5000 },
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
  slack_messages_sent:        { median: 120,   range_min: 0,  range_max: 400 },
  slack_channel_posts:        { median: 29,    range_min: 0,  range_max: 80 },
  slack_active_days:          { median: 14,    range_min: 0,  range_max: 22 },
  slack_msgs_per_active_day:  { median: 8,     range_min: 0,  range_max: 40 },
  slack_dm_ratio:             { median: 28,    range_min: 0,  range_max: 100 },
  m365_active_days:           { median: 18,    range_min: 0,  range_max: 22 },
  m365_emails_sent:           { median: 35,    range_min: 0,  range_max: 120 },
  m365_emails_received:       { median: 150,   range_min: 0,  range_max: 500 },
  m365_emails_read:           { median: 250,   range_min: 0,  range_max: 800 },
  m365_teams_chats:           { median: 148,   range_min: 0,  range_max: 400 },
  m365_files_engaged:         { median: 60,    range_min: 0,  range_max: 200 },
  m365_files_shared_internal: { median: 8,     range_min: 0,  range_max: 30 },
  m365_files_shared_external: { median: 1,     range_min: 0,  range_max: 10 },
  meeting_hours:              { median: 20,    range_min: 0,  range_max: 60 },
  meetings_count:             { median: 40,    range_min: 0,  range_max: 120 },
  teams_meeting_hours:        { median: 14,    range_min: 0,  range_max: 50 },
  zoom_meeting_hours:         { median: 6,     range_min: 0,  range_max: 30 },
  teams_meetings:             { median: 28,    range_min: 0,  range_max: 80 },
  zoom_meetings:              { median: 9,     range_min: 0,  range_max: 40 },
  meeting_free:               { median: 5,     range_min: 0,  range_max: 15 },
};

export function mockTeamBulletSection(
  section: string,
  seed = 0,
  periodDays = 30,
): RawBulletAggregateRow[] {
  const scale = periodDays / 30;
  const keys = BULLET_KEYS_BY_SECTION.get(section) ?? [];
  return keys.map((d, i) => {
    const dist = MOCK_BULLET_DIST[d.metric_key];
    if (!dist && import.meta.env.DEV) {
      console.warn(
        `[insight/mocks] MOCK_BULLET_DIST missing entry for "${d.metric_key}" ` +
        `(section=${section}) — falling back to zero distribution. ` +
        `Add the key to MOCK_BULLET_DIST in factories.ts.`,
      );
    }
    const d0 = dist ?? { median: 0, range_min: 0, range_max: 100 };
    const baseValue =
      Math.round(vary(d0.median, i + seed, Math.max(1, d0.median * 0.3)) * 10) / 10;
    const distScale = shouldScaleMetric(d.metric_key, d.unit) ? scale : 1;
    const value = shouldScaleMetric(d.metric_key, d.unit)
      ? Math.round(baseValue * scale * 10) / 10
      : baseValue;
    const scaleDist = (n: number) => Math.round(n * distScale * 10) / 10;
    const median = scaleDist(d0.median);
    const rangeMin = scaleDist(d0.range_min);
    const rangeMax = scaleDist(d0.range_max);
    return {
      metric_key: d.metric_key,
      value,
      median,
      range_min: rangeMin,
      range_max: rangeMax,
      p25: rangeMin + (median - rangeMin) * 0.5,
      p75: median + (rangeMax - median) * 0.5,
      n: 10,
    };
  });
}

// Returns rows with passthrough display fields that transforms.ts reads
// via a `Record<string,unknown>` cast.
const NON_SCALING_UNITS = new Set<string>(["%", "h", "d", "×", "lines"]);
const NON_SCALING_KEYS = new Set<string>([
  "build_success",
  "focus_time_pct",
  "ai_loc_share",
  "ai_loc_share2",
  "merge_rate",
  "due_date_compliance",
  "task_reopen_rate",
  "estimation_accuracy",
  "bugs_to_task_ratio",
  "flow_efficiency",
  "worklog_logging_accuracy",
  "cursor_acceptance",
  "cc_tool_acceptance",
  "slack_dm_ratio",
]);

function shouldScaleMetric(metricKey: string, unit: string): boolean {
  if (NON_SCALING_KEYS.has(metricKey)) return false;
  if (NON_SCALING_UNITS.has(unit)) return false;
  return true;
}

export function mockIcBulletSection(
  section: string,
  seed = 0,
  periodDays = 30,
): RawBulletAggregateRow[] {
  const keys = IC_SECTIONS[section];
  if (!keys) return [];
  const scale = periodDays / 30;

  return keys.map((key, i) => {
    const def = IC_BULLET_MOCKS.find((d) => d.metric_key === key);
    if (!def) {
      return {
        metric_key: key,
        value: 0,
        median: null,
        range_min: null,
        range_max: null,
      };
    }

    const baseValue = Math.round(vary(def.defaultValue, i + seed, def.defaultValue * 0.2) * 10) / 10;
    const value = shouldScaleMetric(def.metric_key, def.unit)
      ? Math.round(baseValue * scale * 10) / 10
      : baseValue;

    // Build the base raw row
    const row: RawBulletAggregateRow = {
      metric_key: def.metric_key,
      value,
      median: def.median ?? null,
      range_min: null,
      range_max: null,
    };

    // Attach passthrough display fields that transforms.ts reads
    // when no team-bullet entry is found (the IC-level path).
    // range_min/range_max in IC_BULLET_MOCKS are human-friendly strings like
    // '0%' / '15%' / '1k' / '18k' / '500h'. transforms.ts later runs them
    // through formatRangeStr which appends the unit again, so we have to
    // strip the unit characters here. But magnitude suffixes (`k`, `m`)
    // carry actual scale and **must** be honored — turning '18k' into 18
    // gives bullets a 1000× wrong range and a broken bar geometry.
    const numeric = (s: string): number => {
      const stripped = s.trim().toLowerCase().replace(/[%×hd\s]/g, '');
      const match = /^(-?\d+(?:\.\d+)?)([km])?$/.exec(stripped);
      if (!match) return 0;
      const base = Number(match[1]);
      if (!Number.isFinite(base)) return 0;
      const mult = match[2] === 'k' ? 1_000 : match[2] === 'm' ? 1_000_000 : 1;
      return base * mult;
    };
    row.range_min = numeric(def.range_min);
    row.range_max = numeric(def.range_max);
    const ext = row as unknown as Record<string, unknown>;
    ext['section'] = def.section;
    ext['label'] = def.label;
    ext['sublabel'] = def.sublabel;
    ext['unit'] = def.unit;
    ext['median_label'] = def.median_label;
    ext['bar_left_pct'] = 0;
    ext['bar_width_pct'] = def.bar_width_pct;
    ext['median_left_pct'] = def.median_left_pct;
    ext['status'] = def.status;
    ext['drill_id'] = def.drill_id;

    return row;
  });
}

export function mockTeamScenario(teamId = 'bob.park@example.com'): {
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

  // Previous period aggregate for delta computation (slightly lower values).
  // RawIcAggregateRow made loc/prs_merged/pr_cycle_time_h nullable to match
  // the backend; the mock always seeds them non-null above, so propagate
  // null through in the rare case a caller overrides with null.
  const scalePrev = (v: number | null, f: number): number | null =>
    v === null ? null : Math.round(v * f);
  const subPrev = (v: number | null, min: number, d: number): number | null =>
    v === null ? null : Math.max(min, v - d);
  const prevKpiAggregate = mockIcAggregateRow({
    person_id: personId,
    loc: scalePrev(kpiAggregate.loc, 0.9),
    ai_loc_share_pct: Math.round(kpiAggregate.ai_loc_share_pct * 0.85),
    prs_merged: subPrev(kpiAggregate.prs_merged, 1, 2),
    pr_cycle_time_h: scalePrev(kpiAggregate.pr_cycle_time_h, 1.1),
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

// ---------------------------------------------------------------------------
// CRM (sales-rep dashboard) factories
// ---------------------------------------------------------------------------

export function mockCrmKpis(
  personId: string,
  scale = 1,
): RawCrmKpisRow {
  const seed = hashStr(personId);
  const opened = Math.max(8, Math.round((20 + (seed % 25)) * scale));
  const closed = Math.max(4, Math.round((12 + (seed % 18)) * scale));
  const won = Math.min(closed, Math.max(1, Math.round(closed * (0.55 + ((seed >> 4) % 30) / 100))));
  const avgDealSize = 25_000 + ((seed >> 2) % 40_000);
  const valueClosed = won * avgDealSize;
  return {
    person_id: personId,
    deals_opened: opened,
    deals_closed: closed,
    deals_won: won,
    deals_value_closed: valueClosed,
    comms_count: 80 + (seed % 220),
  };
}

/**
 * `CRM_PIPELINE_NOW` (…0028) — date-less open-deal snapshot. A separate
 * metric from `mockCrmKpis`: matches the real wire contract where
 * `pipeline_*` come from their own query, not the KPIs row.
 */
export function mockCrmPipeline(personId: string): RawCrmPipelineRow {
  const seed = hashStr(personId);
  const avgDealSize = 25_000 + ((seed >> 2) % 40_000);
  const pipelineCount = 14 + (seed % 18);
  const pipelineValue = pipelineCount * (avgDealSize * 0.9);
  return {
    person_id: personId,
    pipeline_count: pipelineCount,
    pipeline_value: Math.round(pipelineValue),
  };
}

export function mockCrmFlowSeries(weeks = 8, personId = "anon"): RawCrmFlowRow[] {
  const seed = hashStr(personId);
  const out: RawCrmFlowRow[] = [];
  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  for (let w = weeks - 1; w >= 0; w--) {
    const d = new Date();
    d.setDate(d.getDate() - w * 7);
    const iso = d.toISOString().split("T")[0]!;
    const opened = 4 + ((seed + w * 7) % 9);
    const closed = 2 + ((seed + w * 5) % 6);
    const won = Math.min(closed, 1 + ((seed + w * 3) % 4));
    out.push({
      date_bucket: monthFmt.format(d),
      metric_date: iso,
      opened,
      closed,
      won,
    });
  }
  return out;
}

interface CrmBulletSpec {
  metric_key: string;
  value: number;
  median: number;
  range_min: number;
  range_max: number;
}

const CRM_BULLET_QUALITY_SPEC: CrmBulletSpec[] = [
  { metric_key: "win_rate",      value: 62, median: 55, range_min: 30, range_max: 85 },
  { metric_key: "avg_deal_size", value: 42_000, median: 38_000, range_min: 15_000, range_max: 80_000 },
  { metric_key: "cycle_days",    value: 34, median: 42, range_min: 18, range_max: 75 },
  { metric_key: "deals_opened",  value: 28, median: 22, range_min: 8, range_max: 50 },
];

const CRM_BULLET_ACTIVITY_SPEC: CrmBulletSpec[] = [
  { metric_key: "calls",         value: 84, median: 62, range_min: 20, range_max: 140 },
  { metric_key: "emails",        value: 220, median: 180, range_min: 60, range_max: 360 },
  { metric_key: "meetings",      value: 18, median: 14, range_min: 4, range_max: 32 },
  { metric_key: "comms_per_won", value: 24, median: 32, range_min: 12, range_max: 60 },
];

export function mockCrmBulletSection(
  kind: "quality" | "activity",
  personId: string,
): RawBulletAggregateRow[] {
  const seed = hashStr(personId);
  const spec = kind === "quality" ? CRM_BULLET_QUALITY_SPEC : CRM_BULLET_ACTIVITY_SPEC;
  return spec.map((s, i) => ({
    metric_key: s.metric_key,
    value: vary(s.value, seed + i, s.value * 0.15),
    median: s.median,
    range_min: s.range_min,
    range_max: s.range_max,
  }));
}
