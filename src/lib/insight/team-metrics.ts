import type { MetricGroup } from "@/lib/insight/groups";
import {
  forEntity,
  type NormalizedMetricResult,
} from "@/lib/metrics/collection";
import {
  buildPeerStoryEntries,
  toPeerStats,
  type PeerStoryEntry,
} from "@/lib/metrics/peer-story";
import {
  peerStatusVsQuartiles,
  type PeerStatusWithNeutral,
} from "@/lib/peers";
import type { Status } from "@/lib/status";

/**
 * One member's standing on one collection metric vs their OWN cohort (the
 * peer view resolves each entity against its own org unit). `null` when the
 * pair can't be scored: neutral direction, missing value, or a cohort below
 * the backend's disclosure floor (the server returns null percentiles for
 * thin pools, so `toPeerStats` collapses them to null).
 */
export function memberMetricStanding(
  metric: NormalizedMetricResult,
  entityId: string,
): PeerStatusWithNeutral | null {
  if (metric.direction === "neutral") return null;
  const data = forEntity(metric, entityId);
  if (data.value == null || !Number.isFinite(data.value)) return null;
  // A null peer target_value means the member has no observations for this
  // metric — unmeasured, not zero — so they take no standing.
  if (data.peer?.target_value == null) return null;
  const stats = toPeerStats(data.peer);
  if (!stats) return null;
  return peerStatusVsQuartiles(
    data.value,
    stats,
    metric.direction !== "lower_is_better",
  );
}

export interface TeamMetricStanding {
  metric: NormalizedMetricResult;
  top: number;
  inPack: number;
  bottom: number;
  scored: number;
  status: Status;
}

/**
 * Roster rollup per collection metric — the same plurality rule as the
 * legacy team card's `teamSectionStatusByMetric`: more members below
 * their own cohort than above → `bad`; more above → `good`; tie or on-par
 * majority → `warn`; none scorable → `neutral`.
 */
export function teamMetricStandings(
  def: MetricGroup,
  byKey: Map<string, NormalizedMetricResult>,
  memberIds: string[],
): TeamMetricStanding[] {
  return def.collection.metrics.flatMap((metricConfig) => {
    const metric = byKey.get(metricConfig.key);
    if (!metric) return [];
    let top = 0;
    let inPack = 0;
    let bottom = 0;
    for (const memberId of memberIds) {
      const standing = memberMetricStanding(metric, memberId);
      if (standing === "top") top += 1;
      else if (standing === "bottom") bottom += 1;
      else if (standing === "in_pack") inPack += 1;
    }
    const scored = top + inPack + bottom;
    const status: Status =
      scored === 0
        ? "neutral"
        : bottom > top && bottom > inPack
          ? "bad"
          : top > bottom && top > inPack
            ? "good"
            : "warn";
    return [{ metric, top, inPack, bottom, scored, status }];
  });
}

/**
 * Per-person entries across every unified-metrics group, keyed by member id —
 * the heatmap's member details sheet source for groups the legacy per-member
 * bullet fetch no longer covers. `byGroup` resolves a group id to its fetched
 * result map; groups still loading resolve undefined and contribute nothing.
 */
export function memberMetricEntries(
  defs: MetricGroup[],
  byGroup: (groupId: string) => Map<string, NormalizedMetricResult> | undefined,
  memberIds: string[],
): Map<string, PeerStoryEntry[]> {
  const out = new Map<string, PeerStoryEntry[]>();
  for (const memberId of memberIds) {
    const entries = defs.flatMap((def) => {
      const byKey = byGroup(def.id);
      return byKey
        ? buildPeerStoryEntries(def.collection, byKey, memberId)
        : [];
    });
    if (entries.length > 0) out.set(memberId, entries);
  }
  return out;
}

/**
 * Per-member bottom-quartile counts across the collection — merged into the
 * "members needing attention" tally alongside the legacy bullet counts.
 */
export function metricBelowCounts(
  def: MetricGroup,
  byKey: Map<string, NormalizedMetricResult>,
  memberIds: string[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const memberId of memberIds) {
    let below = 0;
    for (const metricConfig of def.collection.metrics) {
      const metric = byKey.get(metricConfig.key);
      if (!metric) continue;
      if (memberMetricStanding(metric, memberId) === "bottom") below += 1;
    }
    if (below > 0) out.set(memberId, below);
  }
  return out;
}
