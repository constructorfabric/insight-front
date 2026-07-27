import { useMemo } from "react";

import { DomainLensView, Pending } from "@/components/portal/domain-lens-view";
import { directionMetricKeys, lensEntry } from "@/lib/portal/lens-configs";
import { DIRECTIONS } from "@/lib/portal/nav-model";

/**
 * Directions content — every direction/lens resolves through the lens-config
 * registry: a section config renders DomainLensView; a roadmap entry renders
 * its honest ComingSoon note (design D1). The grid fetch is direction-scoped
 * (union of the direction's lens keys) so switching lenses never re-spins.
 */
export function DirectionView({ dir, lens }: { dir: string; lens: string }) {
  const entry = lensEntry(dir, lens);
  const gridKeys = useMemo(() => directionMetricKeys(dir), [dir]);
  if (!entry) {
    const name = DIRECTIONS.find((d) => d.id === dir)?.name ?? "Direction";
    return <Pending label={`“${lens}” isn't a metric family in ${name} yet.`} />;
  }
  if ("comingSoon" in entry) return <Pending label={entry.comingSoon} />;
  return <DomainLensView config={entry} gridKeys={gridKeys} />;
}
