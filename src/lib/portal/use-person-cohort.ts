import { useMemo } from "react";

import { useViewer } from "@/auth";
import { collectRosterAttrs } from "@/lib/insight/slices";
import { normalizePersonId } from "@/lib/metrics/entity";
import { usePortalSlice } from "@/lib/portal/portal-store";
import { useIcPerson } from "@/queries/ic-dashboard";

/**
 * The entity ids of a person's slice cohort — everyone in the viewer's org who
 * shares that person's value for the active slice attribute. Empty when no
 * slice is active (so callers skip the cohort fetch and show the person's own
 * numbers alone). Shared by every person-scoped view so slice support is wired
 * once, not re-derived per screen.
 */
export function usePersonCohort(entityId: string): string[] {
  const slice = usePortalSlice();
  const { email } = useViewer();
  const tree = useIcPerson(email ?? "").data ?? null;
  const attrByEntity = useMemo(
    () => collectRosterAttrs(tree, normalizePersonId),
    [tree],
  );
  return useMemo(() => {
    if (!slice) return [];
    const own = attrByEntity.get(entityId)?.[slice]?.value;
    if (own == null) return [];
    return [...attrByEntity.entries()]
      .filter(([, a]) => a[slice]?.value === own)
      .map(([id]) => id);
  }, [attrByEntity, slice, entityId]);
}
