import { metricGroups } from "@/lib/insight/groups";
import { sectionMetricKeys, type LensConfig } from "@/lib/portal/lens-configs";

/**
 * The Overview zone registry: each pane item (nav-model ZONE_SECTIONS.overview)
 * maps to a LensConfig rendered by DomainLensView — same pattern as
 * DIRECTION_LENSES (design DESIGN-2026-07-27-overview §3/§5). Item ids must
 * match nav-model verbatim (pinned by overview-configs.test.ts).
 */

/** Attention scans the cross-domain headline set — every group's card preview. */
const ATTENTION_KEYS: readonly string[] = [
  ...new Set(metricGroups().flatMap((g) => g.card.preview)),
];

export const OVERVIEW_ITEMS: Record<string, LensConfig> = {
  "at-a-glance": {
    title: "Overview",
    tagline: "cross-functional org rollup",
    sections: [
      {
        kind: "headline",
        metrics: ["git.commits", "git.prs_merged", "collab.messages_sent", "ai.cost"],
      },
      // The old header's "N using AI" stat, now an honest participation card
      // (count + share + delta). No trend section here → card renders chartless.
      {
        kind: "participation",
        metrics: ["ai.active_days"],
        title: "AI adoption",
        noun: "People using AI",
      },
      { kind: "attention", metrics: ATTENTION_KEYS, max: 8 },
      { kind: "direction-cards", variant: "compact" },
    ],
  },
  "by-direction": {
    title: "Overview · By direction",
    tagline: "where to look next",
    sections: [{ kind: "direction-cards", variant: "full" }],
  },
  trend: {
    title: "Overview · Trend",
    tagline: "org totals over time",
    sections: [
      { kind: "trend", metrics: ["git.commits", "git.prs_merged", "collab.messages_sent"] },
    ],
  },
  attention: {
    title: "Overview · Attention needed",
    tagline: "who to look at",
    sections: [{ kind: "attention", metrics: ATTENTION_KEYS, max: 30 }],
  },
  health: {
    title: "Overview · Health radar",
    tagline: "domain coverage",
    sections: [{ kind: "coverage-radar" }],
  },
  contribution: {
    title: "Overview · Contribution breakdown",
    tagline: "who carries the output — shape, not leaderboard",
    sections: [
      { kind: "concentration", metrics: ["git.commits"], framing: "bus-factor" },
      {
        kind: "distribution",
        metric: "git.commits",
        title: "Commit-volume distribution",
        caption:
          "How many people fall in each commit-count band — a long right tail means a few people produce most of the commits.",
        unitLabel: "commits per person",
      },
    ],
  },
};

/**
 * Union of metric keys across every Overview item — one stable grid query for
 * the whole zone, so switching pane items never re-spins (mirror of
 * directionMetricKeys).
 */
export function overviewMetricKeys(): string[] {
  const keys = new Set<string>();
  for (const config of Object.values(OVERVIEW_ITEMS)) {
    for (const k of sectionMetricKeys(config)) keys.add(k);
  }
  return [...keys];
}
