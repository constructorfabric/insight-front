/**
 * The Directions registry: every direction × lens maps to either a LensConfig
 * (rendered by DomainLensView from typed sections) or an honest ComingSoon
 * note naming what would enable it (design D1, rule 9).
 *
 * Metric MEANING stays server-owned; configs carry keys + section composition
 * only. No named individuals anywhere (design D4/rule 10).
 */

export type ConcentrationFraming = "bus-factor" | "load-balance";

export type SectionSpec =
  | { kind: "headline"; metrics: readonly string[] }
  | { kind: "stat-tiles"; title: string; metrics: readonly string[] }
  | { kind: "trend"; metrics: readonly string[] }
  | { kind: "distribution"; metric: string; title: string; caption: string; unitLabel: string }
  | { kind: "concentration"; metrics: readonly string[]; framing: ConcentrationFraming }
  | { kind: "composition"; metric: string; dimension: string; title: string }
  // P3 sections — types land now so configs can be staged; renderer arrives in P3.
  | { kind: "event-histogram"; metric: string; title: string }
  | { kind: "participation"; metrics: readonly string[]; title: string; noun: string };

export interface LensConfig {
  title: string;
  /** Subtitle tail after "N members · " (defaults to "trend & balance"). */
  tagline?: string;
  sections: readonly SectionSpec[];
  /** Whole-tab message when no metric of the lens is observed (rule 6). */
  notIngested?: string;
}

export type LensEntry = LensConfig | { comingSoon: string };

export function lensEntry(dir: string, lens: string): LensEntry | undefined {
  return DIRECTION_LENSES[dir]?.[lens];
}

/** Unique metric keys a config needs in its period+peer grid. */
export function sectionMetricKeys(config: LensConfig): string[] {
  const keys = new Set<string>();
  for (const s of config.sections) {
    switch (s.kind) {
      case "headline":
      case "stat-tiles":
      case "trend":
      case "concentration":
      case "participation":
        for (const k of s.metrics) keys.add(k);
        break;
      case "distribution":
      case "composition":
      case "event-histogram":
        keys.add(s.metric);
        break;
      default: {
        const _exhaustive: never = s;
        throw new Error(`Unhandled section kind: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }
  return [...keys];
}

/* ── Development ─────────────────────────────────────────────────────── */

const DEV_BULLET_NOTE = (what: string) =>
  `${what} — not in the semantic layer yet. This tab lights up when its metric family ships.`;

const DEV: Record<string, LensEntry> = {
  Overview: {
    title: "Development",
    tagline: "output, flow & balance",
    sections: [
      { kind: "headline", metrics: ["git.commits", "git.prs_merged", "git.lines_added"] },
      {
        kind: "stat-tiles",
        title: "Flow health · median",
        metrics: ["git.pr_cycle_time_h", "git.pr_size", "git.merge_rate"],
      },
      { kind: "trend", metrics: ["git.commits", "git.prs_merged"] },
      { kind: "concentration", metrics: ["git.commits"], framing: "bus-factor" },
      {
        kind: "composition",
        metric: "git.lines_added",
        dimension: "category",
        title: "Lines by category",
      },
    ],
  },
  "Git output": {
    title: "Development · Git output",
    sections: [
      {
        kind: "headline",
        metrics: ["git.commits", "git.prs_created", "git.prs_merged", "git.code_lines"],
      },
      { kind: "trend", metrics: ["git.commits", "git.prs_merged"] },
      {
        kind: "distribution",
        metric: "git.commits",
        title: "Commit-volume distribution",
        caption:
          "How many people fall in each commit-count band — a long right tail means a few people produce most of the commits.",
        unitLabel: "commits per person",
      },
      { kind: "concentration", metrics: ["git.commits"], framing: "bus-factor" },
      {
        kind: "composition",
        metric: "git.lines_added",
        dimension: "repository",
        title: "Lines by repository",
      },
    ],
  },
  Flow: {
    // P3 adds { kind: "event-histogram", metric: "git.pr_cycle_time_h", ... }.
    title: "Development · Flow",
    tagline: "how smoothly work moves",
    sections: [
      {
        kind: "stat-tiles",
        title: "Flow health · median",
        metrics: [
          "git.pr_cycle_time_h",
          "git.pr_size",
          "git.commit_size",
          "git.merge_rate",
          "git.commits_per_active_day",
        ],
      },
    ],
  },
  Delivery: {
    title: "Development · Delivery",
    notIngested: "Task source (Jira) isn't ingested for this org yet.",
    sections: [
      { kind: "headline", metrics: ["tasks.closed", "tasks.bugs_fixed"] },
      {
        kind: "stat-tiles",
        title: "Delivery health · median",
        metrics: ["tasks.resolution_time", "tasks.pickup_time", "tasks.dev_time"],
      },
      { kind: "trend", metrics: ["tasks.closed", "tasks.bugs_fixed"] },
      {
        kind: "distribution",
        metric: "tasks.closed",
        title: "Task-throughput distribution",
        caption: "How many people fall in each tasks-closed band.",
        unitLabel: "tasks closed per person",
      },
    ],
  },
  Activity: { comingSoon: DEV_BULLET_NOTE("Per-person activity-day metrics") },
  Quality: { comingSoon: DEV_BULLET_NOTE("Review / reopen quality metrics") },
  Continuity: { comingSoon: DEV_BULLET_NOTE("Longitudinal continuity metrics") },
  Repositories: { comingSoon: DEV_BULLET_NOTE("Repository-level rollups") },
  Elements: { comingSoon: DEV_BULLET_NOTE("Element-level (file/module) analytics") },
};

/* ── Collaboration (ported unchanged from ModalityView configs) ──────── */

const COLLAB: Record<string, LensEntry> = {
  Overview: {
    title: "Collaboration",
    sections: [
      {
        kind: "headline",
        metrics: ["collab.messages_sent", "collab.meeting_hours", "collab.focus_time_pct"],
      },
      { kind: "trend", metrics: ["collab.messages_sent", "collab.meeting_hours"] },
      {
        kind: "distribution",
        metric: "collab.meeting_hours",
        title: "Meeting-load distribution",
        caption:
          "How many people fall in each meeting-hours band — a long right tail means a few people carry an outsized meeting load.",
        unitLabel: "meeting hours per person",
      },
      {
        kind: "concentration",
        metrics: ["collab.meeting_hours", "collab.messages_sent"],
        framing: "load-balance",
      },
    ],
  },
  Messaging: {
    title: "Messaging",
    sections: [
      {
        kind: "headline",
        metrics: ["collab.messages_sent", "collab.msgs_per_active_day", "collab.active_days"],
      },
      { kind: "trend", metrics: ["collab.messages_sent"] },
      {
        kind: "distribution",
        metric: "collab.messages_sent",
        title: "Messaging-load distribution",
        caption:
          "How many people fall in each message-volume band — a long right tail means a few people account for most of the chatter.",
        unitLabel: "messages per person",
      },
      { kind: "concentration", metrics: ["collab.messages_sent"], framing: "load-balance" },
    ],
  },
  Meetings: {
    title: "Meetings",
    sections: [
      {
        kind: "headline",
        metrics: ["collab.meeting_hours", "collab.meetings_count", "collab.meeting_free_days"],
      },
      { kind: "trend", metrics: ["collab.meeting_hours"] },
      {
        kind: "distribution",
        metric: "collab.meeting_hours",
        title: "Meeting-load distribution",
        caption:
          "How many people fall in each meeting-hours band — a long right tail means a few people carry an outsized meeting load.",
        unitLabel: "meeting hours per person",
      },
      { kind: "concentration", metrics: ["collab.meeting_hours"], framing: "load-balance" },
    ],
  },
  // emails_received deliberately omitted: distribution-list/CI noise (see git history).
  Email: {
    title: "Email",
    sections: [
      { kind: "headline", metrics: ["collab.emails_sent", "collab.emails_read"] },
      { kind: "trend", metrics: ["collab.emails_sent"] },
      {
        kind: "distribution",
        metric: "collab.emails_sent",
        title: "Email-volume distribution",
        caption:
          "How many people fall in each sent-email band — a long right tail means a few people send most of the email.",
        unitLabel: "emails sent per person",
      },
      { kind: "concentration", metrics: ["collab.emails_sent"], framing: "load-balance" },
    ],
  },
  "Focus time": {
    title: "Focus time",
    sections: [
      { kind: "headline", metrics: ["collab.focus_time_pct", "collab.meeting_free_days"] },
      {
        kind: "distribution",
        metric: "collab.focus_time_pct",
        title: "Focus-time distribution",
        caption:
          "How many people fall in each focus-time band — a cluster on the left means many people have little uninterrupted focus time.",
        unitLabel: "focus time (share of working time) per person",
      },
    ],
  },
  "Files & sharing": {
    title: "Files & sharing",
    sections: [
      {
        kind: "headline",
        metrics: ["collab.files_shared", "collab.files_engaged", "collab.files_shared_external"],
      },
      { kind: "trend", metrics: ["collab.files_shared"] },
      {
        kind: "distribution",
        metric: "collab.files_shared",
        title: "File-sharing distribution",
        caption:
          "How many people fall in each files-shared band — a long right tail means a few people do most of the sharing.",
        unitLabel: "files shared per person",
      },
      { kind: "concentration", metrics: ["collab.files_shared"], framing: "load-balance" },
    ],
  },
};

/* ── Knowledge / Wiki ────────────────────────────────────────────────── */

const WIKI: Record<string, LensEntry> = {
  Overview: {
    title: "Knowledge / Wiki",
    sections: [
      { kind: "headline", metrics: ["wiki.pages_created", "wiki.edits", "wiki.comments"] },
      { kind: "trend", metrics: ["wiki.pages_created", "wiki.edits"] },
      {
        kind: "distribution",
        metric: "wiki.edits",
        title: "Edit-volume distribution",
        caption:
          "How many people fall in each wiki-edits band — a long right tail means knowledge writing is concentrated in a few hands.",
        unitLabel: "wiki edits per person",
      },
      { kind: "concentration", metrics: ["wiki.edits"], framing: "bus-factor" },
    ],
  },
  Authoring: {
    title: "Wiki · Authoring",
    sections: [
      { kind: "headline", metrics: ["wiki.pages_created", "wiki.pages_edited"] },
      {
        kind: "distribution",
        metric: "wiki.pages_created",
        title: "Authoring distribution",
        caption: "How many people fall in each pages-created band.",
        unitLabel: "pages created per person",
      },
      { kind: "concentration", metrics: ["wiki.pages_created"], framing: "bus-factor" },
    ],
  },
  "Edits & comments": {
    title: "Wiki · Edits & comments",
    sections: [
      { kind: "headline", metrics: ["wiki.edits", "wiki.comments"] },
      { kind: "trend", metrics: ["wiki.edits", "wiki.comments"] },
      {
        kind: "distribution",
        metric: "wiki.edits",
        title: "Edit-volume distribution",
        caption: "How many people fall in each wiki-edits band.",
        unitLabel: "wiki edits per person",
      },
    ],
  },
  // Becomes a real participation view in P3.
  "Active authors": { comingSoon: "Active-author participation view lands with the flow-depth phase." },
};

/* ── Sales / Support (bullet-only directions) ────────────────────────── */

const SALES_NOTE = "HubSpot isn't in the semantic layer yet — bullet-only direction.";
const SUPPORT_NOTE = "Zendesk isn't in the semantic layer yet — bullet-only direction.";

const SALES: Record<string, LensEntry> = Object.fromEntries(
  ["Pipeline", "Deal flow", "Activity", "Velocity & quality"].map((l) => [
    l,
    { comingSoon: SALES_NOTE },
  ]),
);
const SUPPORT: Record<string, LensEntry> = Object.fromEntries(
  ["Tickets", "CSAT", "Knowledge base", "Comments & updates"].map((l) => [
    l,
    { comingSoon: SUPPORT_NOTE },
  ]),
);

export const DIRECTION_LENSES: Record<string, Record<string, LensEntry>> = {
  dev: DEV,
  collab: COLLAB,
  wiki: WIKI,
  sales: SALES,
  support: SUPPORT,
};

/** Union of metric keys across every configured lens of a direction — one
 * stable grid collection per direction so switching lenses never changes the
 * query key (no spinner). ComingSoon entries contribute nothing. */
export function directionMetricKeys(dir: string): string[] {
  const keys = new Set<string>();
  for (const entry of Object.values(DIRECTION_LENSES[dir] ?? {})) {
    if ("comingSoon" in entry) continue;
    for (const k of sectionMetricKeys(entry)) keys.add(k);
  }
  return [...keys];
}
